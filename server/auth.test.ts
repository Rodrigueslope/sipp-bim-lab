import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock do módulo db
vi.mock("./db", () => ({
  emailExists: vi.fn(),
  registerUser: vi.fn(),
  authenticateUser: vi.fn(),
  logAccess: vi.fn(),
  getUserById: vi.fn(),
  updateUserProfile: vi.fn(),
  updateUserPassword: vi.fn(),
  getUserAccessLogs: vi.fn(),
  getAllUsers: vi.fn(),
  getUserStats: vi.fn(),
  getRegistrationsByDay: vi.fn(),
  getDb: vi.fn(),
}));

// Mock do módulo notification
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

type CookieCall = {
  name: string;
  value?: string;
  options: Record<string, unknown>;
};

function createMockContext(): { ctx: TrpcContext; cookies: CookieCall[]; clearedCookies: CookieCall[] } {
  const cookies: CookieCall[] = [];
  const clearedCookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, cookies, clearedCookies };
}

describe("auth.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register a new user successfully", async () => {
    const { ctx, cookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const mockUser = {
      id: 1,
      email: "test@example.com",
      name: "Test User",
      phone: "11999999999",
      region: "São Paulo",
      role: "user" as const,
      openId: null,
      passwordHash: "hashed",
      loginMethod: "email",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    vi.mocked(db.emailExists).mockResolvedValue(false);
    vi.mocked(db.registerUser).mockResolvedValue(mockUser);

    const result = await caller.auth.register({
      email: "test@example.com",
      password: "password123",
      name: "Test User",
      phone: "11999999999",
      region: "São Paulo",
    });

    expect(result.success).toBe(true);
    expect(result.user.email).toBe("test@example.com");
    expect(result.user.name).toBe("Test User");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("should reject registration with existing email", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    vi.mocked(db.emailExists).mockResolvedValue(true);

    await expect(
      caller.auth.register({
        email: "existing@example.com",
        password: "password123",
        name: "Test User",
      })
    ).rejects.toThrow("Este email já está cadastrado");
  });
});

describe("auth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should login successfully with valid credentials", async () => {
    const { ctx, cookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const mockUser = {
      id: 1,
      email: "test@example.com",
      name: "Test User",
      phone: null,
      region: null,
      role: "user" as const,
      openId: null,
      passwordHash: "hashed",
      loginMethod: "email",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    vi.mocked(db.authenticateUser).mockResolvedValue(mockUser);

    const result = await caller.auth.login({
      email: "test@example.com",
      password: "password123",
    });

    expect(result.success).toBe(true);
    expect(result.user.email).toBe("test@example.com");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
    expect(db.logAccess).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      action: "login",
    }));
  });

  it("should reject login with invalid credentials", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    vi.mocked(db.authenticateUser).mockResolvedValue(null);

    await expect(
      caller.auth.login({
        email: "test@example.com",
        password: "wrongpassword",
      })
    ).rejects.toThrow("Email ou senha incorretos");
  });
});

describe("auth.logout", () => {
  it("should clear session cookie on logout", async () => {
    const { ctx, clearedCookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
    });
  });
});

describe("input validation", () => {
  it("should reject registration with invalid email", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        email: "invalid-email",
        password: "password123",
        name: "Test User",
      })
    ).rejects.toThrow();
  });

  it("should reject registration with short password", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        email: "test@example.com",
        password: "12345",
        name: "Test User",
      })
    ).rejects.toThrow();
  });

  it("should reject registration with short name", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        email: "test@example.com",
        password: "password123",
        name: "A",
      })
    ).rejects.toThrow();
  });
});
