import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { parseEncryptionKey } from "./crypto.js";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  publicAppUrl: string;
  cookieSecret: string;
  adminKey: string;
  albumAccessToken: string;
  tokenEncryptionKey: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  microsoftRedirectUri: string;
  oneDriveFolder: string;
  maxFileBytes: number;
  maxBatchFiles: number;
  mysql: null | {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
};

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`[album] ${name} must be a positive integer`);
  }
  return parsed;
}

export function resolveMysqlConfig(environment: Record<string, string | undefined>): AppConfig["mysql"] {
  const names = ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"] as const;
  const configured = names.filter(name => Boolean(environment[name]));
  if (configured.length === 0) return null;
  const missing = names.filter(name => !environment[name]);
  if (missing.length) throw new Error(`[album] Incomplete MySQL configuration. Missing: ${missing.join(", ")}`);
  const port = Number(environment.MYSQL_PORT);
  if (!Number.isSafeInteger(port) || port <= 0) throw new Error("[album] MYSQL_PORT must be a positive integer");
  return {
    host: environment.MYSQL_HOST!,
    port,
    database: environment.MYSQL_DATABASE!,
    user: environment.MYSQL_USER!,
    password: environment.MYSQL_PASSWORD!,
  };
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as AppConfig["nodeEnv"];
  const config: AppConfig = {
    nodeEnv,
    port: positiveInteger("PORT", 3001),
    publicAppUrl: process.env.PUBLIC_APP_URL || "http://localhost:5173",
    cookieSecret: process.env.COOKIE_SECRET || (nodeEnv === "production" ? "" : "development-cookie-secret-change-me"),
    adminKey: process.env.ADMIN_KEY || "",
    albumAccessToken: process.env.ALBUM_ACCESS_TOKEN || "",
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || "",
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID || "",
    microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI || "http://localhost:3001/api/admin/microsoft/callback",
    oneDriveFolder: process.env.ONEDRIVE_FOLDER || "Boda/Album/Originales",
    maxFileBytes: positiveInteger("MAX_FILE_BYTES", 16_106_127_360),
    maxBatchFiles: positiveInteger("MAX_BATCH_FILES", 50),
    mysql: resolveMysqlConfig(process.env),
    ...overrides,
  };
  parseEncryptionKey(config.tokenEncryptionKey);
  return config;
}

export function assertProductionConfig(config: AppConfig) {
  if (config.nodeEnv !== "production") return;
  if (!config.mysql) {
    throw new Error("[album] MySQL configuration is required in production. Refusing to start with volatile MemoryStore.");
  }
  const missing = [
    ["COOKIE_SECRET", config.cookieSecret],
    ["ADMIN_KEY", config.adminKey],
    ["ALBUM_ACCESS_TOKEN", config.albumAccessToken],
    ["TOKEN_ENCRYPTION_KEY", config.tokenEncryptionKey],
    ["MICROSOFT_CLIENT_ID", config.microsoftClientId],
    ["MICROSOFT_CLIENT_SECRET", config.microsoftClientSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`[album] Missing production configuration: ${missing.join(", ")}`);
  if (config.cookieSecret.length < 32) throw new Error("[album] COOKIE_SECRET must contain at least 32 characters");
  if (config.adminKey.length < 16) throw new Error("[album] ADMIN_KEY must contain at least 16 characters");
  if (config.albumAccessToken.length < 16) throw new Error("[album] ALBUM_ACCESS_TOKEN must contain at least 16 characters");
  parseEncryptionKey(config.tokenEncryptionKey);
  for (const [name, value] of [["PUBLIC_APP_URL", config.publicAppUrl], ["MICROSOFT_REDIRECT_URI", config.microsoftRedirectUri]] as const) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`[album] ${name} must be a valid URL`); }
    if (url.protocol !== "https:") throw new Error(`[album] ${name} must use HTTPS in production`);
  }
}
