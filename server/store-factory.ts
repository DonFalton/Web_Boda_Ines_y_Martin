import type { AppConfig } from "./config.js";
import { MysqlStore } from "./mysql-store.js";
import { MemoryStore, type AlbumStore } from "./store.js";

export function createAlbumStore(config: AppConfig, warn: (message: string) => void = console.warn): AlbumStore {
  if (config.mysql) return new MysqlStore(config.mysql);
  if (config.nodeEnv === "production") {
    throw new Error("[album] MySQL configuration is required in production. Refusing to start with volatile MemoryStore.");
  }
  warn("[album] Running with volatile development storage");
  return new MemoryStore();
}
