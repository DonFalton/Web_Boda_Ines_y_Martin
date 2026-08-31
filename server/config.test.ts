import { assertProductionConfig, loadConfig, resolveMysqlConfig } from "./config.js";
import { MysqlStore } from "./mysql-store.js";
import { MemoryStore } from "./store.js";
import { createAlbumStore } from "./store-factory.js";
import { testConfig } from "./test-helpers.js";

const mysql = {
  host: "127.0.0.1",
  port: 3306,
  database: "album",
  user: "album_user",
  password: "secret",
};

function productionConfig() {
  return testConfig({
    nodeEnv: "production",
    publicAppUrl: "https://album.example",
    microsoftRedirectUri: "https://album.example/api/admin/microsoft/callback",
    cookieSecret: "c".repeat(32),
    adminKey: "a".repeat(16),
    albumAccessToken: "t".repeat(16),
    mysql,
  });
}

describe("album storage configuration", () => {
  it("refuses development startup when TOKEN_ENCRYPTION_KEY is absent or invalid", () => {
    expect(() => loadConfig({ nodeEnv: "development", tokenEncryptionKey: "" })).toThrow("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    expect(() => loadConfig({ nodeEnv: "development", tokenEncryptionKey: "not-a-supported-key" })).toThrow("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  });

  it("uses MemoryStore in development and emits the volatile storage warning", () => {
    const warn = vi.fn();
    const store = createAlbumStore(testConfig({ nodeEnv: "development", mysql: null }), warn);
    expect(store).toBeInstanceOf(MemoryStore);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[album] Running with volatile development storage");
  });

  it("refuses production startup without MySQL", () => {
    const config = { ...productionConfig(), mysql: null };
    expect(() => assertProductionConfig(config)).toThrow("MySQL configuration is required in production");
    expect(() => createAlbumStore(config)).toThrow("Refusing to start with volatile MemoryStore");
  });

  it("uses MysqlStore in production with complete configuration", () => {
    const config = productionConfig();
    expect(() => assertProductionConfig(config)).not.toThrow();
    expect(createAlbumStore(config)).toBeInstanceOf(MysqlStore);
  });

  it("fails startup instead of falling back when configured MySQL is unreachable", async () => {
    const config = productionConfig();
    config.mysql = { ...mysql, host: "127.0.0.1", port: 1 };
    const store = createAlbumStore(config);
    await expect(store.init()).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await store.close();
  });

  it("rejects partial MySQL configuration instead of falling back silently", () => {
    expect(() => resolveMysqlConfig({ MYSQL_HOST: "127.0.0.1", MYSQL_PORT: "3306" })).toThrow(/Incomplete MySQL configuration.*MYSQL_DATABASE.*MYSQL_USER.*MYSQL_PASSWORD/);
  });

  it("recognizes all five required MySQL variables", () => {
    expect(resolveMysqlConfig({
      MYSQL_HOST: "127.0.0.1",
      MYSQL_PORT: "3306",
      MYSQL_DATABASE: "album",
      MYSQL_USER: "album_user",
      MYSQL_PASSWORD: "secret",
    })).toEqual(mysql);
  });
});
