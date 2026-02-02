import { eq, desc, sql, and, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, accessLogs, InsertAccessLog, User } from "../drizzle/schema";
import { ENV } from './_core/env';
import bcrypt from "bcryptjs";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== AUTENTICAÇÃO LOCAL ====================

/**
 * Registra um novo usuário com email e senha
 */
export async function registerUser(data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  region?: string;
}): Promise<User | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot register user: database not available");
    return null;
  }

  try {
    // Hash da senha com bcrypt
    const passwordHash = await bcrypt.hash(data.password, 12);

    const values: InsertUser = {
      email: data.email,
      passwordHash,
      name: data.name,
      phone: data.phone || null,
      region: data.region || null,
      loginMethod: "email",
      role: "user",
    };

    await db.insert(users).values(values);
    
    // Retorna o usuário criado
    const [newUser] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
    return newUser || null;
  } catch (error) {
    console.error("[Database] Failed to register user:", error);
    throw error;
  }
}

/**
 * Autentica um usuário por email e senha
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot authenticate: database not available");
    return null;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user || !user.passwordHash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    // Atualiza último login
    await db.update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.id, user.id));

    return user;
  } catch (error) {
    console.error("[Database] Failed to authenticate user:", error);
    return null;
  }
}

/**
 * Verifica se um email já está cadastrado
 */
export async function emailExists(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return !!user;
}

/**
 * Busca usuário por ID
 */
export async function getUserById(id: number): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

/**
 * Atualiza perfil do usuário
 */
export async function updateUserProfile(id: number, data: {
  name?: string;
  phone?: string;
  region?: string;
}): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const updateData: Partial<InsertUser> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.region !== undefined) updateData.region = data.region;

    await db.update(users).set(updateData).where(eq(users.id, id));
    return getUserById(id);
  } catch (error) {
    console.error("[Database] Failed to update profile:", error);
    return null;
  }
}

/**
 * Atualiza senha do usuário
 */
export async function updateUserPassword(id: number, newPassword: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update password:", error);
    return false;
  }
}

// ==================== LOGS DE ACESSO ====================

/**
 * Registra um log de acesso
 */
export async function logAccess(data: {
  userId: number;
  action: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(accessLogs).values({
      userId: data.userId,
      action: data.action,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    });
  } catch (error) {
    console.error("[Database] Failed to log access:", error);
  }
}

/**
 * Busca logs de acesso de um usuário
 */
export async function getUserAccessLogs(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(accessLogs)
    .where(eq(accessLogs.userId, userId))
    .orderBy(desc(accessLogs.timestamp))
    .limit(limit);
}

// ==================== ADMIN: LISTAGEM E ESTATÍSTICAS ====================

/**
 * Lista todos os usuários (para admin)
 */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    phone: users.phone,
    region: users.region,
    role: users.role,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
}

/**
 * Estatísticas de usuários
 */
export async function getUserStats() {
  const db = await getDb();
  if (!db) return null;

  try {
    // Total de usuários
    const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const total = totalResult?.count || 0;

    // Novos usuários nos últimos 7 dias
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [newUsersResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo));
    const newUsersLast7Days = newUsersResult?.count || 0;

    // Novos usuários nos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [newUsers30Result] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, thirtyDaysAgo));
    const newUsersLast30Days = newUsers30Result?.count || 0;

    // Usuários ativos (login nos últimos 7 dias)
    const [activeResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.lastSignedIn, sevenDaysAgo));
    const activeUsersLast7Days = activeResult?.count || 0;

    // Total de logins nos últimos 7 dias
    const [loginsResult] = await db.select({ count: sql<number>`count(*)` })
      .from(accessLogs)
      .where(and(
        eq(accessLogs.action, "login"),
        gte(accessLogs.timestamp, sevenDaysAgo)
      ));
    const totalLoginsLast7Days = loginsResult?.count || 0;

    return {
      total,
      newUsersLast7Days,
      newUsersLast30Days,
      activeUsersLast7Days,
      totalLoginsLast7Days,
    };
  } catch (error) {
    console.error("[Database] Failed to get stats:", error);
    return null;
  }
}

/**
 * Cadastros por dia nos últimos N dias
 */
export async function getRegistrationsByDay(days = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const result = await db.select({
      date: sql<string>`DATE(createdAt)`,
      count: sql<number>`count(*)`,
    })
      .from(users)
      .where(gte(users.createdAt, startDate))
      .groupBy(sql`DATE(createdAt)`)
      .orderBy(sql`DATE(createdAt)`);

    return result;
  } catch (error) {
    console.error("[Database] Failed to get registrations by day:", error);
    return [];
  }
}

// ==================== OAUTH UPSERT (mantido para compatibilidade) ====================

export async function upsertUser(user: Partial<InsertUser> & { openId: string }): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    // Verifica se o usuário já existe
    const [existing] = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
    
    if (existing) {
      // Atualiza usuário existente
      const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
      if (user.name) updateSet.name = user.name;
      if (user.email) updateSet.email = user.email;
      
      await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
    } else {
      // Cria novo usuário OAuth
      const values: InsertUser = {
        openId: user.openId,
        email: user.email || `${user.openId}@oauth.local`,
        name: user.name || "Usuário OAuth",
        loginMethod: user.loginMethod || "oauth",
        role: user.openId === ENV.ownerOpenId ? "admin" : "user",
      };
      
      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
