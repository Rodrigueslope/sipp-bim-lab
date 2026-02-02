import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { notifyOwner } from "./_core/notification";
import * as jose from "jose";
import { ENV } from "./_core/env";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Helper para criar token de sessão para usuários locais
async function createLocalSessionToken(userId: number, email: string): Promise<string> {
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const token = await new jose.SignJWT({ 
    sub: `local:${userId}`,
    email,
    type: "local"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(secret);
  return token;
}

// Helper para verificar token local
async function verifyLocalToken(token: string): Promise<{ userId: number; email: string } | null> {
  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jose.jwtVerify(token, secret);
    if (payload.type === "local" && typeof payload.sub === "string" && payload.sub.startsWith("local:")) {
      const userId = parseInt(payload.sub.replace("local:", ""), 10);
      return { userId, email: payload.email as string };
    }
    return null;
  } catch {
    return null;
  }
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      // Primeiro tenta autenticação OAuth padrão
      if (ctx.user) {
        return ctx.user;
      }
      
      // Tenta autenticação local via cookie
      const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
      if (sessionCookie) {
        const localAuth = await verifyLocalToken(sessionCookie);
        if (localAuth) {
          const user = await db.getUserById(localAuth.userId);
          return user;
        }
      }
      
      return null;
    }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Registro de novo usuário
    register: publicProcedure
      .input(z.object({
        email: z.string().email("Email inválido"),
        password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
        name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
        phone: z.string().optional(),
        region: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verifica se email já existe
        const exists = await db.emailExists(input.email);
        if (exists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este email já está cadastrado",
          });
        }

        // Registra usuário
        const user = await db.registerUser({
          email: input.email,
          password: input.password,
          name: input.name,
          phone: input.phone,
          region: input.region,
        });

        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao criar conta",
          });
        }

        // Registra log de acesso
        await db.logAccess({
          userId: user.id,
          action: "register",
          ipAddress: ctx.req.ip || ctx.req.headers["x-forwarded-for"] as string,
          userAgent: ctx.req.headers["user-agent"],
        });

        // Notifica administrador sobre novo cadastro
        try {
          await notifyOwner({
            title: "🆕 Novo usuário cadastrado no SIPP-BIM",
            content: `Um novo usuário se cadastrou no sistema:\n\n**Nome:** ${user.name}\n**Email:** ${user.email}\n**Telefone:** ${user.phone || "Não informado"}\n**Região:** ${user.region || "Não informada"}\n**Data:** ${new Date().toLocaleString("pt-BR")}`,
          });
        } catch (e) {
          console.error("[Notification] Failed to notify owner:", e);
        }

        // Cria sessão
        const token = await createLocalSessionToken(user.id, user.email);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        };
      }),

    // Login com email e senha
    login: publicProcedure
      .input(z.object({
        email: z.string().email("Email inválido"),
        password: z.string().min(1, "Senha é obrigatória"),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.authenticateUser(input.email, input.password);

        if (!user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Email ou senha incorretos",
          });
        }

        // Registra log de acesso
        await db.logAccess({
          userId: user.id,
          action: "login",
          ipAddress: ctx.req.ip || ctx.req.headers["x-forwarded-for"] as string,
          userAgent: ctx.req.headers["user-agent"],
        });

        // Cria sessão
        const token = await createLocalSessionToken(user.id, user.email);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        };
      }),
  }),

  // Rotas de perfil do usuário
  profile: router({
    get: publicProcedure.query(async ({ ctx }) => {
      // Tenta autenticação local
      const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
      if (!sessionCookie) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const localAuth = await verifyLocalToken(sessionCookie);
      if (!localAuth) {
        // Pode ser OAuth
        if (ctx.user) {
          return ctx.user;
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const user = await db.getUserById(localAuth.userId);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      }

      return user;
    }),

    update: publicProcedure
      .input(z.object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        region: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
        if (!sessionCookie) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        const localAuth = await verifyLocalToken(sessionCookie);
        if (!localAuth) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        const user = await db.updateUserProfile(localAuth.userId, input);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao atualizar perfil" });
        }

        return { success: true, user };
      }),

    changePassword: publicProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
        if (!sessionCookie) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        const localAuth = await verifyLocalToken(sessionCookie);
        if (!localAuth) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        // Verifica senha atual
        const user = await db.authenticateUser(localAuth.email, input.currentPassword);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta" });
        }

        // Atualiza senha
        const success = await db.updateUserPassword(localAuth.userId, input.newPassword);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao atualizar senha" });
        }

        return { success: true };
      }),

    accessLogs: publicProcedure.query(async ({ ctx }) => {
      const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
      if (!sessionCookie) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const localAuth = await verifyLocalToken(sessionCookie);
      if (!localAuth) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return db.getUserAccessLogs(localAuth.userId);
    }),
  }),

  // Rotas administrativas
  admin: router({
    // Lista todos os usuários
    users: publicProcedure.query(async ({ ctx }) => {
      const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
      if (!sessionCookie) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const localAuth = await verifyLocalToken(sessionCookie);
      let userId: number;
      
      if (localAuth) {
        userId = localAuth.userId;
      } else if (ctx.user) {
        userId = ctx.user.id;
      } else {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const user = await db.getUserById(userId);
      if (!user || user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }

      return db.getAllUsers();
    }),

    // Estatísticas
    stats: publicProcedure.query(async ({ ctx }) => {
      const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
      if (!sessionCookie) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const localAuth = await verifyLocalToken(sessionCookie);
      let userId: number;
      
      if (localAuth) {
        userId = localAuth.userId;
      } else if (ctx.user) {
        userId = ctx.user.id;
      } else {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const user = await db.getUserById(userId);
      if (!user || user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }

      return db.getUserStats();
    }),

    // Cadastros por dia
    registrationsByDay: publicProcedure
      .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
      .query(async ({ input, ctx }) => {
        const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
        if (!sessionCookie) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        const localAuth = await verifyLocalToken(sessionCookie);
        let userId: number;
        
        if (localAuth) {
          userId = localAuth.userId;
        } else if (ctx.user) {
          userId = ctx.user.id;
        } else {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        const user = await db.getUserById(userId);
        if (!user || user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }

        return db.getRegistrationsByDay(input?.days || 30);
      }),

    // Exportar dados para CSV
    exportUsers: publicProcedure.query(async ({ ctx }) => {
      const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
      if (!sessionCookie) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const localAuth = await verifyLocalToken(sessionCookie);
      let userId: number;
      
      if (localAuth) {
        userId = localAuth.userId;
      } else if (ctx.user) {
        userId = ctx.user.id;
      } else {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const user = await db.getUserById(userId);
      if (!user || user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }

      const users = await db.getAllUsers();
      
      // Gera CSV
      const headers = ["ID", "Nome", "Email", "Telefone", "Região", "Papel", "Criado em", "Último acesso"];
      const rows = users.map(u => [
        u.id,
        u.name || "",
        u.email,
        u.phone || "",
        u.region || "",
        u.role,
        u.createdAt.toISOString(),
        u.lastSignedIn.toISOString(),
      ]);

      const csv = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      return { csv, filename: `usuarios_sipp_${new Date().toISOString().split("T")[0]}.csv` };
    }),

    // Promover usuário a admin
    promoteToAdmin: publicProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const sessionCookie = ctx.req.cookies?.[COOKIE_NAME];
        if (!sessionCookie) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        const localAuth = await verifyLocalToken(sessionCookie);
        let currentUserId: number;
        
        if (localAuth) {
          currentUserId = localAuth.userId;
        } else if (ctx.user) {
          currentUserId = ctx.user.id;
        } else {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
        }

        const currentUser = await db.getUserById(currentUserId);
        if (!currentUser || currentUser.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }

        const targetUser = await db.getUserById(input.userId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
        }

        // Atualiza role diretamente no banco
        const dbInstance = await db.getDb();
        if (!dbInstance) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro de banco de dados" });
        }

        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await dbInstance.update(users).set({ role: "admin" }).where(eq(users.id, input.userId));

        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
