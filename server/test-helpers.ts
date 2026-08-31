import type { AppConfig } from "./config.js";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    port: 3001,
    publicAppUrl: "http://localhost:5173",
    cookieSecret: "test-cookie-secret-that-is-long-enough",
    adminKey: "test-admin-key",
    albumAccessToken: "test-album-token",
    tokenEncryptionKey: "00".repeat(32),
    microsoftClientId: "client-id",
    microsoftClientSecret: "new-client-secret",
    microsoftRedirectUri: "http://localhost:3001/api/admin/microsoft/callback",
    oneDriveFolder: "Originales",
    maxFileBytes: 16_106_127_360,
    maxBatchFiles: 50,
    mysql: null,
    ...overrides,
  };
}
