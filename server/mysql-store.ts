import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { AppConfig } from "./config.js";
import type { AlbumStore } from "./store.js";
import { decodeCursor, encodeCursor } from "./store.js";
import type { MediaPage, MediaRecord, StoredOAuthToken } from "./types.js";

type MediaRow = RowDataPacket & {
  id: string; guest_id: string; guest_name: string; original_name: string; stored_name: string;
  mime_type: string; size: number; onedrive_item_id: string | null; status: MediaRecord["status"];
  created_at: Date; updated_at: Date;
};

function toMedia(row: MediaRow): MediaRecord {
  return {
    id: row.id, guestId: row.guest_id, guestName: row.guest_name, originalName: row.original_name,
    storedName: row.stored_name, mimeType: row.mime_type, size: Number(row.size), onedriveItemId: row.onedrive_item_id,
    status: row.status, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

export class MysqlStore implements AlbumStore {
  private readonly pool: Pool;
  private readonly database: string;
  constructor(config: NonNullable<AppConfig["mysql"]>) {
    this.database = config.database;
    this.pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 5, charset: "utf8mb4", timezone: "Z" });
  }
  async init() {
    await this.pool.execute(`CREATE TABLE IF NOT EXISTS media (
      id VARCHAR(36) PRIMARY KEY,
      guest_id VARCHAR(36) NOT NULL,
      guest_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL UNIQUE,
      mime_type VARCHAR(127) NOT NULL,
      size BIGINT UNSIGNED NOT NULL,
      onedrive_item_id VARCHAR(255) NULL,
      status ENUM('uploading','visible','failed') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_media_status_created (status, created_at DESC),
      INDEX idx_media_created (created_at DESC),
      INDEX idx_media_status_created_id (status, created_at DESC, id DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await this.pool.execute(`CREATE TABLE IF NOT EXISTS oauth_tokens (
      id VARCHAR(32) PRIMARY KEY,
      encrypted_refresh_token TEXT NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const [paginationIndexes] = await this.pool.execute<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name='media' AND index_name='idx_media_status_created_id' LIMIT 1",
      [this.database],
    );
    if (!paginationIndexes.length) {
      await this.pool.execute("ALTER TABLE media ADD INDEX idx_media_status_created_id (status, created_at DESC, id DESC)");
    }
  }
  async close() { await this.pool.end(); }
  async saveOAuthToken(token: StoredOAuthToken) {
    await this.pool.execute("INSERT INTO oauth_tokens (id, encrypted_refresh_token, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE encrypted_refresh_token=VALUES(encrypted_refresh_token), updated_at=VALUES(updated_at)", [token.id, token.encryptedRefreshToken, new Date(token.updatedAt)]);
  }
  async getOAuthToken() {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT id, encrypted_refresh_token, updated_at FROM oauth_tokens WHERE id='microsoft' LIMIT 1");
    if (!rows.length) return null;
    const row = rows[0] as RowDataPacket & { id: "microsoft"; encrypted_refresh_token: string; updated_at: Date };
    return { id: row.id, encryptedRefreshToken: row.encrypted_refresh_token, updatedAt: row.updated_at.toISOString() };
  }
  async createMedia(media: MediaRecord) {
    await this.pool.execute("INSERT INTO media (id,guest_id,guest_name,original_name,stored_name,mime_type,size,onedrive_item_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [media.id, media.guestId, media.guestName, media.originalName, media.storedName, media.mimeType, media.size, media.onedriveItemId, media.status, new Date(media.createdAt), new Date(media.updatedAt)]);
  }
  async updateMedia(id: string, patch: Partial<Pick<MediaRecord, "onedriveItemId" | "status" | "updatedAt">>) {
    const fields: string[] = []; const values: Array<string | Date | null> = [];
    if (patch.onedriveItemId !== undefined) { fields.push("onedrive_item_id=?"); values.push(patch.onedriveItemId); }
    if (patch.status !== undefined) { fields.push("status=?"); values.push(patch.status); }
    if (patch.updatedAt !== undefined) { fields.push("updated_at=?"); values.push(new Date(patch.updatedAt)); }
    if (fields.length) { values.push(id); await this.pool.execute(`UPDATE media SET ${fields.join(",")} WHERE id=?`, values); }
    return this.getMedia(id);
  }
  async getMedia(id: string) {
    const [rows] = await this.pool.execute<MediaRow[]>("SELECT * FROM media WHERE id=? LIMIT 1", [id]);
    return rows.length ? toMedia(rows[0]) : null;
  }
  async listVisibleMedia(limit: number, cursor?: string): Promise<MediaPage> {
    const decoded = decodeCursor(cursor);
    const params: unknown[] = [];
    let where = "status='visible'";
    if (decoded) { where += " AND (created_at < ? OR (created_at = ? AND id < ?))"; params.push(new Date(decoded.createdAt), new Date(decoded.createdAt), decoded.id); }
    params.push(limit + 1);
    const [rows] = await this.pool.query<MediaRow[]>(`SELECT * FROM media WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, params);
    const hasMore = rows.length > limit; const pageRows = rows.slice(0, limit); const items = pageRows.map(toMedia);
    return { items, nextCursor: hasMore && items.length ? encodeCursor(items.at(-1)!) : null };
  }
}
