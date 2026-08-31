import type { MediaOrder, MediaPage, MediaRecord, StoredOAuthToken } from "./types.js";

export interface AlbumStore {
  init(): Promise<void>;
  close(): Promise<void>;
  saveOAuthToken(token: StoredOAuthToken): Promise<void>;
  getOAuthToken(): Promise<StoredOAuthToken | null>;
  createMedia(media: MediaRecord): Promise<void>;
  updateMedia(id: string, patch: Partial<Pick<MediaRecord, "onedriveItemId" | "status" | "updatedAt">>): Promise<MediaRecord | null>;
  getMedia(id: string): Promise<MediaRecord | null>;
  listVisibleMedia(limit: number, cursor?: string, order?: MediaOrder): Promise<MediaPage>;
}

function encodeCursor(media: MediaRecord, order: MediaOrder = "newest") {
  return Buffer.from(JSON.stringify({ createdAt: media.createdAt, id: media.id, order })).toString("base64url");
}

function decodeCursor(cursor?: string, expectedOrder: MediaOrder = "newest"): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as { createdAt?: unknown; id?: unknown; order?: unknown };
    if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) || typeof value.id !== "string" || !value.id) return null;
    if ((value.order ?? "newest") !== expectedOrder) return null;
    return { createdAt: value.createdAt, id: value.id };
  }
  catch { return null; }
}

export class MemoryStore implements AlbumStore {
  private token: StoredOAuthToken | null = null;
  private readonly media = new Map<string, MediaRecord>();
  async init() {}
  async close() {}
  async saveOAuthToken(token: StoredOAuthToken) { this.token = { ...token }; }
  async getOAuthToken() { return this.token ? { ...this.token } : null; }
  async createMedia(media: MediaRecord) { this.media.set(media.id, { ...media }); }
  async updateMedia(id: string, patch: Partial<Pick<MediaRecord, "onedriveItemId" | "status" | "updatedAt">>) {
    const current = this.media.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.media.set(id, next);
    return { ...next };
  }
  async getMedia(id: string) { const value = this.media.get(id); return value ? { ...value } : null; }
  async listVisibleMedia(limit: number, cursor?: string, order: MediaOrder = "newest"): Promise<MediaPage> {
    const decoded = decodeCursor(cursor, order);
    const direction = order === "newest" ? -1 : 1;
    const sorted = [...this.media.values()].filter(item => item.status === "visible").sort((a, b) => direction * (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
    const filtered = decoded
      ? sorted.filter(item => order === "newest"
        ? item.createdAt < decoded.createdAt || (item.createdAt === decoded.createdAt && item.id < decoded.id)
        : item.createdAt > decoded.createdAt || (item.createdAt === decoded.createdAt && item.id > decoded.id))
      : sorted;
    const page = filtered.slice(0, limit);
    return { items: page.map(item => ({ ...item })), nextCursor: filtered.length > limit && page.length ? encodeCursor(page.at(-1)!, order) : null };
  }
}

export { encodeCursor, decodeCursor };
