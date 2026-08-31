export type AlbumGuest = { guestId: string; displayName: string };
export type AlbumSession = { hasAccess: boolean; guest: AlbumGuest | null };
export type UploadPolicy = {
  maxFileBytes: number;
  maxBatchFiles: number;
  chunkBytes: number;
  parallelFiles: number;
  acceptedTypes: string[];
  acceptedExtensions: string[];
  genericTypes: string[];
  typeExtensions: Record<string, string[]>;
};
export type DirectUploadSession = { mediaId: string; storedName: string; uploadUrl: string; expiresAt: string };
export type AlbumMedia = {
  id: string;
  guestName: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  thumbnailUrl: string | null;
};
export type AlbumMediaPage = { items: AlbumMedia[]; nextCursor: string | null };

export class AlbumApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new AlbumApiError(payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "No se pudo completar la operación.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const albumApi = {
  session: () => request<AlbumSession>("/api/album/session"),
  exchangeAccess: (accessToken: string) => request<void>("/api/album/access", { method: "POST", body: JSON.stringify({ accessToken }) }),
  createGuest: (displayName: string) => request<{ guest: AlbumGuest }>("/api/album/guest", { method: "POST", body: JSON.stringify({ displayName }) }),
  clearGuest: () => request<void>("/api/album/guest", { method: "DELETE" }),
  uploadPolicy: () => request<UploadPolicy>("/api/album/uploads/policy"),
  createUploadSession: (file: Pick<File, "name" | "type" | "size">) => request<DirectUploadSession>("/api/album/uploads/session", {
    method: "POST",
    body: JSON.stringify({ originalName: file.name, mimeType: file.type, size: file.size }),
  }),
  completeUpload: (mediaId: string, itemId: string) => request<{ mediaId: string; status: "visible" }>(`/api/album/uploads/${encodeURIComponent(mediaId)}/complete`, {
    method: "POST",
    body: JSON.stringify({ itemId }),
  }),
  failUpload: (mediaId: string) => request<void>(`/api/album/uploads/${encodeURIComponent(mediaId)}/fail`, { method: "POST" }),
  media: (cursor?: string) => request<AlbumMediaPage>(`/api/album/media${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  mediaSource: (mediaId: string) => request<{ url: string; filename: string; mimeType: string }>(`/api/album/media/${encodeURIComponent(mediaId)}/source`),
  createAdminSession: (adminKey: string) => request<void>("/api/admin/session", { method: "POST", body: JSON.stringify({ adminKey }) }),
  adminStatus: () => request<{ connected: boolean }>("/api/admin/microsoft/status"),
  testOneDrive: () => request<{ ok: boolean; itemName: string }>("/api/admin/microsoft/test", { method: "POST" }),
};
