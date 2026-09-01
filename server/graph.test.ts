import { encryptToken } from "./crypto.js";
import { MicrosoftGraphService } from "./graph.js";
import { MemoryStore } from "./store.js";
import { testConfig } from "./test-helpers.js";

describe("MicrosoftGraphService", () => {
  async function thumbnails(responses: Array<{ id: string; status: number; body?: unknown }>, itemIds = ["item-1"]) {
    const config = testConfig();
    const store = new MemoryStore();
    await store.saveOAuthToken({ id: "microsoft", encryptedRefreshToken: encryptToken("refresh-token", config.tokenEncryptionKey), updatedAt: new Date().toISOString() });
    let batchBody: { requests: Array<{ id: string; method: string; url: string }> } | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "access-token", expires_in: 3600 });
      if (url.endsWith("/$batch")) {
        batchBody = JSON.parse(String(init?.body));
        return Response.json({ responses });
      }
      throw new Error(`Unexpected mock request: ${url}`);
    }) as typeof fetch;
    const result = await new MicrosoftGraphService(config, store, fetcher).getThumbnails(itemIds);
    return { result, batchBody };
  }

  it("refreshes securely, creates the target folder and validates the test upload", async () => {
    const config = testConfig();
    const store = new MemoryStore();
    await store.init();
    await store.saveOAuthToken({ id: "microsoft", encryptedRefreshToken: encryptToken("refresh-token", config.tokenEncryptionKey), updatedAt: new Date().toISOString() });

    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push(`${init?.method || "GET"} ${url}`);
      if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "access-token", expires_in: 3600 });
      if (url.endsWith("/me/drive/root:/Originales")) return Response.json({ error: { code: "itemNotFound" } }, { status: 404 });
      if (url.endsWith("/me/drive/root/children")) return Response.json({ id: "folder-id", name: "Originales", folder: {} }, { status: 201 });
      if (url.includes("codex-onedrive-test.txt:/content")) {
        const size = Buffer.isBuffer(init?.body) ? init.body.length : 0;
        return Response.json({ id: "test-item", name: "codex-onedrive-test.txt", size }, { status: 201 });
      }
      throw new Error(`Unexpected mock request: ${url}`);
    }) as typeof fetch;

    const graph = new MicrosoftGraphService(config, store, fetcher);
    await expect(graph.testConnection()).resolves.toEqual({ ok: true, itemName: "codex-onedrive-test.txt" });
    expect(calls.some(call => call.includes("/consumers/oauth2/v2.0/token"))).toBe(true);
    expect(calls.some(call => call.includes("/me/drive/root/children"))).toBe(true);
    expect(calls.some(call => call.startsWith("PUT ") && call.includes("codex-onedrive-test.txt"))).toBe(true);
  });

  it("stores the refresh token encrypted after authorization", async () => {
    const config = testConfig();
    const store = new MemoryStore();
    const fetcher = vi.fn(async () => Response.json({ access_token: "access", refresh_token: "rotating-refresh", expires_in: 3600 })) as typeof fetch;
    const graph = new MicrosoftGraphService(config, store, fetcher);
    await graph.exchangeAuthorizationCode("code", "verifier");
    const stored = await store.getOAuthToken();
    expect(stored?.encryptedRefreshToken).not.toContain("rotating-refresh");
  });

  it("uses the root path upload-session form compatible with personal OneDrive", async () => {
    const config = testConfig();
    const store = new MemoryStore();
    await store.saveOAuthToken({ id: "microsoft", encryptedRefreshToken: encryptToken("refresh-token", config.tokenEncryptionKey), updatedAt: new Date().toISOString() });
    let sessionRequest: { url: string; body: BodyInit | null | undefined } | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "access-token", expires_in: 3600 });
      if (url.endsWith("/me/drive/root:/Originales")) return Response.json({ id: "folder-id", name: "Originales", folder: {} });
      if (url.includes(":/createUploadSession")) {
        sessionRequest = { url, body: init?.body };
        return Response.json({ uploadUrl: "https://upload.example/session", expirationDateTime: "2030-01-01T00:00:00Z" });
      }
      throw new Error(`Unexpected mock request: ${url}`);
    }) as typeof fetch;

    await expect(new MicrosoftGraphService(config, store, fetcher).createUploadSession("stored-photo.jpg", 3_472_341)).resolves.toEqual({
      uploadUrl: "https://upload.example/session",
      expiresAt: "2030-01-01T00:00:00Z",
    });
    expect(sessionRequest).toEqual({
      url: "https://graph.microsoft.com/v1.0/me/drive/root:/Originales/stored-photo.jpg:/createUploadSession",
      body: undefined,
    });
  });

  it("returns Graph photo.takenDateTime while validating a completed image", async () => {
    const config = testConfig();
    const store = new MemoryStore();
    await store.saveOAuthToken({ id: "microsoft", encryptedRefreshToken: encryptToken("refresh-token", config.tokenEncryptionKey), updatedAt: new Date().toISOString() });
    let itemRequest = "";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "access-token", expires_in: 3600 });
      if (url.endsWith("/me/drive/root:/Originales")) return Response.json({ id: "folder-id", name: "Originales", folder: {} });
      if (url.includes("/me/drive/items/item-photo")) {
        itemRequest = url;
        return Response.json({ id: "item-photo", name: "stored.jpg", size: 123, parentReference: { id: "folder-id" }, photo: { takenDateTime: "2025-08-25T12:34:56Z" } });
      }
      throw new Error(`Unexpected mock request: ${url}`);
    }) as typeof fetch;

    await expect(new MicrosoftGraphService(config, store, fetcher).validateCompletedItem("item-photo", "stored.jpg", 123)).resolves.toEqual({ capturedAt: "2025-08-25T12:34:56.000Z" });
    expect(itemRequest).toContain("$select=id,name,size,parentReference,photo");
  });

  it("gets the temporary original URL from the Graph content redirect", async () => {
    const config = testConfig();
    const store = new MemoryStore();
    await store.saveOAuthToken({ id: "microsoft", encryptedRefreshToken: encryptToken("refresh-token", config.tokenEncryptionKey), updatedAt: new Date().toISOString() });
    let contentRequest: { url: string; redirect: RequestRedirect | undefined } | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "access-token", expires_in: 3600 });
      if (url.endsWith("/me/drive/items/item-1/content")) {
        contentRequest = { url, redirect: init?.redirect };
        return new Response(null, { status: 302, headers: { location: "https://download.example/original" } });
      }
      throw new Error(`Unexpected mock request: ${url}`);
    }) as typeof fetch;

    await expect(new MicrosoftGraphService(config, store, fetcher).getDownloadUrl("item-1")).resolves.toBe("https://download.example/original");
    expect(contentRequest).toEqual({
      url: "https://graph.microsoft.com/v1.0/me/drive/items/item-1/content",
      redirect: "manual",
    });
  });

  it("moves an item to the OneDrive recycle bin and treats an already missing item as deleted", async () => {
    const config = testConfig();
    const store = new MemoryStore();
    await store.saveOAuthToken({ id: "microsoft", encryptedRefreshToken: encryptToken("refresh-token", config.tokenEncryptionKey), updatedAt: new Date().toISOString() });
    let deleteCalls = 0;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "access-token", expires_in: 3600 });
      if (url.endsWith("/me/drive/items/item-to-delete") && init?.method === "DELETE") {
        deleteCalls += 1;
        return deleteCalls === 1 ? new Response(null, { status: 204 }) : Response.json({ error: { code: "itemNotFound" } }, { status: 404 });
      }
      throw new Error(`Unexpected mock request: ${url}`);
    }) as typeof fetch;
    const graph = new MicrosoftGraphService(config, store, fetcher);

    await expect(graph.deleteItem("item-to-delete")).resolves.toBeUndefined();
    await expect(graph.deleteItem("item-to-delete")).resolves.toBeUndefined();
    expect(deleteCalls).toBe(2);
  });

  it("uses the Graph thumbnail collection and selects large", async () => {
    const { result, batchBody } = await thumbnails([{ id: "0", status: 200, body: { value: [{ large: { url: "https://thumb/large" }, medium: { url: "https://thumb/medium" } }] } }]);
    expect(result.get("item-1")).toBe("https://thumb/large");
    expect(batchBody?.requests[0]).toEqual({ id: "0", method: "GET", url: "/me/drive/items/item-1/thumbnails" });
  });

  it("falls back to medium when large is absent", async () => {
    const { result } = await thumbnails([{ id: "0", status: 200, body: { value: [{ medium: { url: "https://thumb/medium" }, small: { url: "https://thumb/small" } }] } }]);
    expect(result.get("item-1")).toBe("https://thumb/medium");
  });

  it("falls back to small when it is the only available size", async () => {
    const { result } = await thumbnails([{ id: "0", status: 200, body: { value: [{ small: { url: "https://thumb/small" } }] } }]);
    expect(result.get("item-1")).toBe("https://thumb/small");
  });

  it("keeps an item without thumbnails out of the result map", async () => {
    const { result } = await thumbnails([{ id: "0", status: 200, body: { value: [] } }]);
    expect(result.has("item-1")).toBe(false);
  });

  it("treats a failed batch item as a missing non-fatal thumbnail", async () => {
    const { result } = await thumbnails([
      { id: "0", status: 429, body: { error: { code: "throttledRequest" } } },
      { id: "1", status: 200, body: { value: [{ large: { url: "https://thumb/second" } }] } },
    ], ["item-1", "item-2"]);
    expect(result.has("item-1")).toBe(false);
    expect(result.get("item-2")).toBe("https://thumb/second");
  });

  it("maps multiple batch thumbnail responses to their drive items", async () => {
    const { result } = await thumbnails([
      { id: "1", status: 200, body: { value: [{ medium: { url: "https://thumb/two" } }] } },
      { id: "0", status: 200, body: { value: [{ large: { url: "https://thumb/one" } }] } },
    ], ["item-1", "item-2"]);
    expect(Object.fromEntries(result)).toEqual({ "item-1": "https://thumb/one", "item-2": "https://thumb/two" });
  });
});
