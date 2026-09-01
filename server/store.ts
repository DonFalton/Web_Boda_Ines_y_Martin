import type { MediaDirection, MediaListOptions, MediaPage, MediaRecord, MediaScope, MediaSort, StoredOAuthToken } from "./types.js";

export interface AlbumStore {
  init(): Promise<void>;
  close(): Promise<void>;
  saveOAuthToken(token: StoredOAuthToken): Promise<void>;
  getOAuthToken(): Promise<StoredOAuthToken | null>;
  createMedia(media: MediaRecord): Promise<void>;
  updateMedia(id: string, patch: Partial<Pick<MediaRecord, "capturedAt" | "captureSource" | "onedriveItemId" | "status" | "updatedAt">>): Promise<MediaRecord | null>;
  getMedia(id: string): Promise<MediaRecord | null>;
  listVisibleMedia(limit: number, cursor?: string, options?: Partial<MediaListOptions>): Promise<MediaPage>;
}

const defaultListOptions: MediaListOptions = { sort: "uploaded", direction: "desc", kind: "all" };

function normalizeListOptions(options: Partial<MediaListOptions> = {}): MediaListOptions {
  return { ...defaultListOptions, ...options };
}

function mediaKind(media: MediaRecord) {
  return media.mimeType.startsWith("video/") ? "video" : "image";
}

function capturedSortValue(media: MediaRecord, direction: MediaDirection) {
  return media.capturedAt ?? (direction === "asc" ? "9999-12-31T23:59:59.999Z" : "1000-01-01T00:00:00.000Z");
}

function sortValue(media: MediaRecord, sort: MediaSort, direction: MediaDirection) {
  if (sort === "captured") return capturedSortValue(media, direction);
  if (sort === "type") return mediaKind(media);
  if (sort === "guest") return media.guestName;
  return media.createdAt;
}

function encodeCursor(media: MediaRecord, options: MediaListOptions) {
  const scope: MediaScope = options.ownerGuestId ? "mine" : "all";
  return Buffer.from(JSON.stringify({
    sortValue: sortValue(media, options.sort, options.direction),
    createdAt: media.createdAt,
    id: media.id,
    sort: options.sort,
    direction: options.direction,
    kind: options.kind,
    scope,
  })).toString("base64url");
}

type DecodedCursor = { sortValue: string; createdAt: string; id: string };

function decodeCursor(cursor: string | undefined, expected: MediaListOptions): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.sortValue !== "string" || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) || typeof value.id !== "string" || !value.id) return null;
    const scope: MediaScope = expected.ownerGuestId ? "mine" : "all";
    if (value.sort !== expected.sort || value.direction !== expected.direction || value.kind !== expected.kind || value.scope !== scope) return null;
    return { sortValue: value.sortValue, createdAt: value.createdAt, id: value.id };
  }
  catch { return null; }
}

function compareText(a: string, b: string, sort: MediaSort) {
  return sort === "guest" ? a.localeCompare(b, "es", { sensitivity: "base" }) : a.localeCompare(b);
}

function compareTuple(a: DecodedCursor, b: DecodedCursor, sort: MediaSort, direction: MediaDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  return multiplier * (compareText(a.sortValue, b.sortValue, sort) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export class MemoryStore implements AlbumStore {
  private token: StoredOAuthToken | null = null;
  private readonly media = new Map<string, MediaRecord>();
  async init() {}
  async close() {}
  async saveOAuthToken(token: StoredOAuthToken) { this.token = { ...token }; }
  async getOAuthToken() { return this.token ? { ...this.token } : null; }
  async createMedia(media: MediaRecord) { this.media.set(media.id, { ...media }); }
  async updateMedia(id: string, patch: Partial<Pick<MediaRecord, "capturedAt" | "captureSource" | "onedriveItemId" | "status" | "updatedAt">>) {
    const current = this.media.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.media.set(id, next);
    return { ...next };
  }
  async getMedia(id: string) { const value = this.media.get(id); return value ? { ...value } : null; }
  async listVisibleMedia(limit: number, cursor?: string, partialOptions: Partial<MediaListOptions> = {}): Promise<MediaPage> {
    const options = normalizeListOptions(partialOptions);
    const decoded = decodeCursor(cursor, options);
    const sorted = [...this.media.values()]
      .filter(item => item.status === "visible"
        && (!options.ownerGuestId || item.guestId === options.ownerGuestId)
        && (options.kind === "all" || mediaKind(item) === options.kind))
      .sort((a, b) => compareTuple(
        { sortValue: sortValue(a, options.sort, options.direction), createdAt: a.createdAt, id: a.id },
        { sortValue: sortValue(b, options.sort, options.direction), createdAt: b.createdAt, id: b.id },
        options.sort,
        options.direction,
      ));
    const filtered = decoded
      ? sorted.filter(item => compareTuple(
        { sortValue: sortValue(item, options.sort, options.direction), createdAt: item.createdAt, id: item.id },
        decoded,
        options.sort,
        options.direction,
      ) > 0)
      : sorted;
    const page = filtered.slice(0, limit);
    return { items: page.map(item => ({ ...item })), nextCursor: filtered.length > limit && page.length ? encodeCursor(page.at(-1)!, options) : null };
  }
}

export { decodeCursor, encodeCursor, mediaKind, normalizeListOptions, sortValue };
