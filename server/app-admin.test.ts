import request from "supertest";
import { createApp } from "./app.js";
import type { GraphService } from "./graph.js";
import { MemoryStore } from "./store.js";
import { testConfig } from "./test-helpers.js";

function graphMock(): GraphService {
  return {
    isConnected: vi.fn(async () => false),
    buildAuthorizeUrl: vi.fn((state: string) => `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?state=${state}`),
    exchangeAuthorizationCode: vi.fn(async () => undefined),
    testConnection: vi.fn(async () => ({ ok: true as const, itemName: "album-onedrive-test.txt" })),
    createUploadSession: vi.fn(),
    validateCompletedItem: vi.fn(),
    getThumbnails: vi.fn(async () => new Map()),
    getDownloadUrl: vi.fn(),
    hasUploadCapacity: vi.fn(async () => true),
  };
}

describe("admin and OAuth routes", () => {
  it("rejects an invalid key and creates a short HttpOnly admin session", async () => {
    const app = createApp({ config: testConfig(), store: new MemoryStore(), graph: graphMock() });
    await request(app).post("/api/admin/session").send({ adminKey: "wrong" }).expect(401);
    const response = await request(app).post("/api/admin/session").send({ adminKey: "test-admin-key" }).expect(204);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
  });

  it("protects OneDrive status and test endpoints", async () => {
    const graph = graphMock();
    const app = createApp({ config: testConfig(), store: new MemoryStore(), graph });
    await request(app).get("/api/admin/microsoft/status").expect(401);
    const agent = request.agent(app);
    await agent.post("/api/admin/session").send({ adminKey: "test-admin-key" }).expect(204);
    await agent.get("/api/admin/microsoft/status").expect(200, { connected: false });
    await agent.post("/api/admin/microsoft/test").expect(200, { ok: true, itemName: "album-onedrive-test.txt" });
  });

  it("uses state and PKCE for the OAuth callback", async () => {
    const graph = graphMock();
    const app = createApp({ config: testConfig(), store: new MemoryStore(), graph });
    const agent = request.agent(app);
    await agent.post("/api/admin/session").send({ adminKey: "test-admin-key" }).expect(204);
    const connect = await agent.get("/api/admin/microsoft/connect").expect(302);
    const state = new URL(connect.headers.location).searchParams.get("state");
    expect(state).toBeTruthy();
    await agent.get(`/api/admin/microsoft/callback?code=code&state=${encodeURIComponent(state!)}`).expect(302, "Found. Redirecting to http://localhost:5173/album/admin?connected=1");
    expect(graph.exchangeAuthorizationCode).toHaveBeenCalledWith("code", expect.any(String));
    await agent.get("/api/admin/microsoft/callback?code=code&state=wrong").expect(400);
  });
});
