import type { AppConfig } from "./config.js";
import { decryptToken, encryptToken } from "./crypto.js";
import type { AlbumStore } from "./store.js";

type Fetcher = typeof fetch;
type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };
type DriveItem = { id: string; name: string; size?: number; parentReference?: { id?: string }; folder?: object };

export class GraphError extends Error {
  constructor(public readonly status: number, public readonly code: string, message = "Microsoft Graph request failed") {
    super(message);
  }
}

export interface GraphService {
  isConnected(): Promise<boolean>;
  buildAuthorizeUrl(state: string, codeChallenge: string): string;
  exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<void>;
  testConnection(): Promise<{ ok: true; itemName: string }>;
  createUploadSession(storedName: string, size: number): Promise<{ uploadUrl: string; expiresAt: string }>;
  validateCompletedItem(itemId: string, storedName: string, expectedSize: number): Promise<void>;
  getThumbnails(itemIds: string[]): Promise<Map<string, string>>;
  getDownloadUrl(itemId: string): Promise<string>;
  deleteItem(itemId: string): Promise<void>;
  hasUploadCapacity(fileSize: number): Promise<boolean>;
}

export class MicrosoftGraphService implements GraphService {
  private accessTokenCache: { value: string; expiresAt: number } | null = null;
  private folderCache: { id: string; expiresAt: number } | null = null;
  private quotaCache: { remaining: number; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfig, private readonly store: AlbumStore, private readonly fetcher: Fetcher = fetch) {}

  async isConnected() { return Boolean(await this.store.getOAuthToken()); }

  buildAuthorizeUrl(state: string, codeChallenge: string) {
    if (!this.config.microsoftClientId) throw new GraphError(503, "MICROSOFT_NOT_CONFIGURED");
    const params = new URLSearchParams({
      client_id: this.config.microsoftClientId,
      response_type: "code",
      redirect_uri: this.config.microsoftRedirectUri,
      response_mode: "query",
      scope: "offline_access https://graph.microsoft.com/Files.ReadWrite",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeAuthorizationCode(code: string, codeVerifier: string) {
    const token = await this.requestToken({
      client_id: this.config.microsoftClientId,
      client_secret: this.config.microsoftClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.microsoftRedirectUri,
      code_verifier: codeVerifier,
      scope: "offline_access https://graph.microsoft.com/Files.ReadWrite",
    });
    if (!token.refresh_token) throw new GraphError(502, "MICROSOFT_REFRESH_TOKEN_MISSING");
    await this.store.saveOAuthToken({
      id: "microsoft",
      encryptedRefreshToken: encryptToken(token.refresh_token, this.config.tokenEncryptionKey),
      updatedAt: new Date().toISOString(),
    });
    this.cacheAccessToken(token);
  }

  private async requestToken(values: Record<string, string>) {
    if (!this.config.microsoftClientId || !this.config.microsoftClientSecret || !this.config.tokenEncryptionKey) {
      throw new GraphError(503, "MICROSOFT_NOT_CONFIGURED");
    }
    const response = await this.fetcher("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json() as TokenResponse;
    if (!response.ok || !body.access_token) throw new GraphError(502, body.error || "MICROSOFT_TOKEN_FAILED");
    return body;
  }

  private cacheAccessToken(token: TokenResponse) {
    this.accessTokenCache = { value: token.access_token, expiresAt: Date.now() + Math.max(60, (token.expires_in || 3600) - 120) * 1000 };
  }

  private async accessToken() {
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > Date.now()) return this.accessTokenCache.value;
    const stored = await this.store.getOAuthToken();
    if (!stored) throw new GraphError(503, "ONEDRIVE_DISCONNECTED");
    const refreshToken = decryptToken(stored.encryptedRefreshToken, this.config.tokenEncryptionKey);
    const token = await this.requestToken({
      client_id: this.config.microsoftClientId,
      client_secret: this.config.microsoftClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "offline_access https://graph.microsoft.com/Files.ReadWrite",
    });
    if (token.refresh_token && token.refresh_token !== refreshToken) {
      await this.store.saveOAuthToken({ id: "microsoft", encryptedRefreshToken: encryptToken(token.refresh_token, this.config.tokenEncryptionKey), updatedAt: new Date().toISOString() });
    }
    this.cacheAccessToken(token);
    return token.access_token;
  }

  private async graph<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      let code = "GRAPH_REQUEST_FAILED";
      try { code = ((await response.json()) as { error?: { code?: string } }).error?.code || code; } catch { /* redacted */ }
      throw new GraphError(response.status, code);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private folderPath() { return this.config.oneDriveFolder.split("/").map(part => part.trim()).filter(Boolean); }

  private async getItemByPath(parts: string[]) {
    const encoded = parts.map(encodeURIComponent).join("/");
    return this.graph<DriveItem>(`/me/drive/root:/${encoded}`);
  }

  private async ensureFolder() {
    if (this.folderCache && this.folderCache.expiresAt > Date.now()) return this.folderCache.id;
    const parts = this.folderPath();
    let parentId = "root";
    const built: string[] = [];
    for (const name of parts) {
      built.push(name);
      try {
        parentId = (await this.getItemByPath(built)).id;
      } catch (error) {
        if (!(error instanceof GraphError) || error.status !== 404) throw error;
        const endpoint = parentId === "root" ? "/me/drive/root/children" : `/me/drive/items/${encodeURIComponent(parentId)}/children`;
        try {
          parentId = (await this.graph<DriveItem>(endpoint, { method: "POST", body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) })).id;
        } catch (createError) {
          if (!(createError instanceof GraphError) || createError.status !== 409) throw createError;
          parentId = (await this.getItemByPath(built)).id;
        }
      }
    }
    this.folderCache = { id: parentId, expiresAt: Date.now() + 60_000 };
    return parentId;
  }

  async testConnection() {
    const folderId = await this.ensureFolder();
    const filename = "codex-onedrive-test.txt";
    const content = Buffer.from("Conexión OneDrive del álbum verificada.\n", "utf8");
    const response = await this.fetcher(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}:/${filename}:/content`, {
      method: "PUT",
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "text/plain; charset=utf-8" },
      body: content,
    });
    if (!response.ok) throw new GraphError(response.status, "ONEDRIVE_TEST_UPLOAD_FAILED");
    const item = await response.json() as DriveItem;
    if (!item.id || item.name !== filename || Number(item.size) !== content.length) throw new GraphError(502, "ONEDRIVE_TEST_VALIDATION_FAILED");
    return { ok: true as const, itemName: filename };
  }

  async createUploadSession(storedName: string, _size: number) {
    await this.ensureFolder();
    const itemPath = [...this.folderPath(), storedName].map(encodeURIComponent).join("/");
    const result = await this.graph<{ uploadUrl: string; expirationDateTime: string }>(`/me/drive/root:/${itemPath}:/createUploadSession`, {
      method: "POST",
    });
    if (!result.uploadUrl) throw new GraphError(502, "UPLOAD_SESSION_MISSING_URL");
    return { uploadUrl: result.uploadUrl, expiresAt: result.expirationDateTime };
  }

  async validateCompletedItem(itemId: string, storedName: string, expectedSize: number) {
    const [folderId, item] = await Promise.all([
      this.ensureFolder(),
      this.graph<DriveItem>(`/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,size,parentReference`),
    ]);
    if (item.name !== storedName || Number(item.size) !== expectedSize || item.parentReference?.id !== folderId) {
      throw new GraphError(409, "UPLOAD_COMPLETION_MISMATCH");
    }
  }

  async getThumbnails(itemIds: string[]) {
    const map = new Map<string, string>();
    for (let offset = 0; offset < itemIds.length; offset += 20) {
      const chunk = itemIds.slice(offset, offset + 20);
      const result = await this.graph<{ responses: Array<{ id: string; status: number; body?: { value?: Array<{ large?: { url?: string }; medium?: { url?: string }; small?: { url?: string } }> } }> }>("/$batch", {
        method: "POST",
        body: JSON.stringify({ requests: chunk.map((itemId, index) => ({ id: String(index), method: "GET", url: `/me/drive/items/${encodeURIComponent(itemId)}/thumbnails` })) }),
      });
      for (const response of result.responses || []) {
        const itemId = chunk[Number(response.id)];
        const set = response.body?.value?.[0];
        const thumb = set?.large?.url || set?.medium?.url || set?.small?.url;
        if (itemId && response.status >= 200 && response.status < 300 && thumb) map.set(itemId, thumb);
      }
    }
    return map;
  }

  async getDownloadUrl(itemId: string) {
    const response = await this.fetcher(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}/content`, {
      headers: { authorization: `Bearer ${await this.accessToken()}` },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new GraphError(502, "DOWNLOAD_URL_UNAVAILABLE");
      let url: URL;
      try { url = new URL(location); } catch { throw new GraphError(502, "DOWNLOAD_URL_INVALID"); }
      if (url.protocol !== "https:") throw new GraphError(502, "DOWNLOAD_URL_INVALID");
      return url.toString();
    }
    let code = "DOWNLOAD_URL_UNAVAILABLE";
    try { code = ((await response.json()) as { error?: { code?: string } }).error?.code || code; } catch { /* redacted */ }
    throw new GraphError(response.status || 502, code);
  }

  async deleteItem(itemId: string) {
    try {
      await this.graph<void>(`/me/drive/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    }
    catch (error) {
      if (error instanceof GraphError && error.status === 404) return;
      throw error;
    }
  }

  async hasUploadCapacity(fileSize: number) {
    if (!this.quotaCache || this.quotaCache.expiresAt <= Date.now()) {
      const drive = await this.graph<{ quota?: { remaining?: number } }>("/me/drive?$select=quota");
      this.quotaCache = { remaining: Number(drive.quota?.remaining ?? 0), expiresAt: Date.now() + 60_000 };
    }
    if (this.quotaCache.remaining - fileSize < 20 * 1024 ** 3) return false;
    this.quotaCache.remaining -= fileSize;
    return true;
  }
}
