import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { AppConfig } from "./config.js";
import type { AlbumStore } from "./store.js";
import { decodeCursor, encodeCursor, normalizeListOptions } from "./store.js";
import type { MediaListOptions, MediaPage, MediaRecord, StoredOAuthToken } from "./types.js";

type MediaRow = RowDataPacket & {
  id: string; guest_id: string; guest_name: string; original_name: string; stored_name: string;
  mime_type: string; size: number; onedrive_item_id: string | null; status: MediaRecord["status"];
  captured_at: Date | null; capture_source: MediaRecord["captureSource"];
  created_at: Date; updated_at: Date;
};

function toMedia(row: MediaRow): MediaRecord {
  return {
    id: row.id, guestId: row.guest_id, guestName: row.guest_name, originalName: row.original_name,
    storedName: row.stored_name, mimeType: row.mime_type, size: Number(row.size),
    capturedAt: row.captured_at?.toISOString() ?? null, captureSource: row.capture_source,
    onedriveItemId: row.onedrive_item_id,
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
      captured_at DATETIME(3) NULL,
      capture_source ENUM('embedded','file_modified','unknown') NOT NULL DEFAULT 'unknown',
      onedrive_item_id VARCHAR(255) NULL,
      status ENUM('uploading','visible','failed','deleted') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_media_status_created (status, created_at DESC),
      INDEX idx_media_created (created_at DESC),
      INDEX idx_media_status_created_id (status, created_at DESC, id DESC),
      INDEX idx_media_status_captured_created_id (status, captured_at DESC, created_at DESC, id DESC),
      INDEX idx_media_status_guest_name_created_id (status, guest_name, created_at DESC, id DESC),
      INDEX idx_media_status_mime_created_id (status, mime_type, created_at DESC, id DESC),
      INDEX idx_media_guest_status_created_id (guest_id, status, created_at DESC, id DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const [statusColumns] = await this.pool.execute<RowDataPacket[]>(
      "SELECT column_type AS columnType FROM information_schema.columns WHERE table_schema=? AND table_name='media' AND column_name='status' LIMIT 1",
      [this.database],
    );
    const statusColumn = statusColumns[0] as (RowDataPacket & { columnType?: string; COLUMN_TYPE?: string }) | undefined;
    const statusType = statusColumn?.columnType ?? statusColumn?.COLUMN_TYPE ?? "";
    if (!statusType.includes("'deleted'")) {
      await this.pool.execute("ALTER TABLE media MODIFY status ENUM('uploading','visible','failed','deleted') NOT NULL");
    }
    const [captureColumns] = await this.pool.execute<RowDataPacket[]>(
      "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=? AND table_name='media' AND column_name IN ('captured_at','capture_source')",
      [this.database],
    );
    const captureColumnNames = new Set(captureColumns.map(row => String(row.columnName ?? row.COLUMN_NAME)));
    if (!captureColumnNames.has("captured_at")) {
      await this.pool.execute("ALTER TABLE media ADD COLUMN captured_at DATETIME(3) NULL AFTER size");
    }
    if (!captureColumnNames.has("capture_source")) {
      await this.pool.execute("ALTER TABLE media ADD COLUMN capture_source ENUM('embedded','file_modified','unknown') NOT NULL DEFAULT 'unknown' AFTER captured_at");
    }
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
    const [ownerIndexes] = await this.pool.execute<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name='media' AND index_name='idx_media_guest_status_created_id' LIMIT 1",
      [this.database],
    );
    if (!ownerIndexes.length) {
      await this.pool.execute("ALTER TABLE media ADD INDEX idx_media_guest_status_created_id (guest_id, status, created_at DESC, id DESC)");
    }
    const [captureIndexes] = await this.pool.execute<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name='media' AND index_name='idx_media_status_captured_created_id' LIMIT 1",
      [this.database],
    );
    if (!captureIndexes.length) {
      await this.pool.execute("ALTER TABLE media ADD INDEX idx_media_status_captured_created_id (status, captured_at DESC, created_at DESC, id DESC)");
    }
    const secondaryIndexes = [
      { name: "idx_media_status_guest_name_created_id", definition: "(status, guest_name, created_at DESC, id DESC)" },
      { name: "idx_media_status_mime_created_id", definition: "(status, mime_type, created_at DESC, id DESC)" },
    ] as const;
    for (const index of secondaryIndexes) {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        "SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name='media' AND index_name=? LIMIT 1",
        [this.database, index.name],
      );
      if (!rows.length) await this.pool.execute(`ALTER TABLE media ADD INDEX ${index.name} ${index.definition}`);
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
    await this.pool.execute("INSERT INTO media (id,guest_id,guest_name,original_name,stored_name,mime_type,size,captured_at,capture_source,onedrive_item_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [media.id, media.guestId, media.guestName, media.originalName, media.storedName, media.mimeType, media.size, media.capturedAt ? new Date(media.capturedAt) : null, media.captureSource, media.onedriveItemId, media.status, new Date(media.createdAt), new Date(media.updatedAt)]);
  }
  async updateMedia(id: string, patch: Partial<Pick<MediaRecord, "capturedAt" | "captureSource" | "onedriveItemId" | "status" | "updatedAt">>) {
    const fields: string[] = []; const values: Array<string | Date | null> = [];
    if (patch.capturedAt !== undefined) { fields.push("captured_at=?"); values.push(patch.capturedAt ? new Date(patch.capturedAt) : null); }
    if (patch.captureSource !== undefined) { fields.push("capture_source=?"); values.push(patch.captureSource); }
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
  async listVisibleMedia(limit: number, cursor?: string, partialOptions: Partial<MediaListOptions> = {}): Promise<MediaPage> {
    const options = normalizeListOptions(partialOptions);
    const decoded = decodeCursor(cursor, options);
    const params: unknown[] = [];
    let where = "status='visible'";
    if (options.ownerGuestId) { where += " AND guest_id=?"; params.push(options.ownerGuestId); }
    if (options.kind !== "all") { where += " AND mime_type LIKE ?"; params.push(`${options.kind}/%`); }
    const comparison = options.direction === "desc" ? "<" : ">";
    const sqlDirection = options.direction === "desc" ? "DESC" : "ASC";
    const sortExpression = options.sort === "captured"
      ? `COALESCE(captured_at, CAST('${options.direction === "asc" ? "9999-12-31 23:59:59.999" : "1000-01-01 00:00:00.000"}' AS DATETIME(3)))`
      : options.sort === "type"
        ? "CASE WHEN mime_type LIKE 'video/%' THEN 'video' ELSE 'image' END"
        : options.sort === "guest" ? "guest_name" : "created_at";
    if (decoded) {
      const cursorSortValue = options.sort === "uploaded" || options.sort === "captured" ? new Date(decoded.sortValue) : decoded.sortValue;
      where += ` AND (${sortExpression} ${comparison} ? OR (${sortExpression} = ? AND (created_at ${comparison} ? OR (created_at = ? AND id ${comparison} ?))))`;
      params.push(cursorSortValue, cursorSortValue, new Date(decoded.createdAt), new Date(decoded.createdAt), decoded.id);
    }
    params.push(limit + 1);
    const [rows] = await this.pool.query<MediaRow[]>(`SELECT * FROM media WHERE ${where} ORDER BY ${sortExpression} ${sqlDirection}, created_at ${sqlDirection}, id ${sqlDirection} LIMIT ?`, params);
    const hasMore = rows.length > limit; const pageRows = rows.slice(0, limit); const items = pageRows.map(toMedia);
    return { items, nextCursor: hasMore && items.length ? encodeCursor(items.at(-1)!, options) : null };
  }
}
