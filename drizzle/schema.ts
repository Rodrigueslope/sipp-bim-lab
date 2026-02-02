import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint } from "drizzle-orm/mysql-core";

/**
 * Tabela de usuários do sistema SIPP-BIM LAB
 * Suporta autenticação via email/senha com campos personalizados
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) - pode ser nulo para usuários locais */
  openId: varchar("openId", { length: 64 }).unique(),
  /** Email do usuário - usado para login */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Hash da senha (bcrypt) */
  passwordHash: varchar("passwordHash", { length: 255 }),
  /** Nome completo do usuário */
  name: text("name").notNull(),
  /** Telefone do usuário (opcional) */
  phone: varchar("phone", { length: 20 }),
  /** Região/Estado do usuário */
  region: varchar("region", { length: 100 }),
  /** Método de login utilizado */
  loginMethod: varchar("loginMethod", { length: 64 }).default("email"),
  /** Papel do usuário no sistema */
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Data de criação da conta */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Data da última atualização */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  /** Data do último login */
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * Tabela de logs de acesso para rastreamento
 */
export const accessLogs = mysqlTable("access_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** ID do usuário que fez o acesso */
  userId: int("userId").notNull(),
  /** Tipo de ação (login, logout, page_view, etc) */
  action: varchar("action", { length: 50 }).notNull(),
  /** IP do usuário (opcional) */
  ipAddress: varchar("ipAddress", { length: 45 }),
  /** User Agent do navegador */
  userAgent: text("userAgent"),
  /** Data/hora do acesso */
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AccessLog = typeof accessLogs.$inferSelect;
export type InsertAccessLog = typeof accessLogs.$inferInsert;
