import request from "supertest";
import { createApp } from "./app.js";
import { MemoryStore } from "./store.js";
import { testConfig } from "./test-helpers.js";
import type { GraphService } from "./graph.js";

describe("album upload sessions", () => {
  const store = new MemoryStore();
  const graph = {
    hasUploadCapacity: vi.fn(async () => true),
    createUploadSession: vi.fn(async () => ({ uploadUrl: "https://upload.example/session", expiresAt: "2030-01-01T00:00:00Z" })),
    validateCompletedItem: vi.fn(async () => undefined),
  } as unknown as GraphService;
  const app = createApp({ config: testConfig(), store, graph });

  async function authenticatedAgent() {
    const agent = request.agent(app);
    await agent.post("/api/album/access").send({ accessToken: "test-album-token" });
    await agent.post("/api/album/guest").send({ displayName: "Invitada" });
    return agent;
  }

  it("requires a guest and rejects unsupported media", async () => {
    await request(app).post("/api/album/uploads/session").send({ originalName: "foto.jpg", mimeType: "image/jpeg", size: 10 }).expect(401);
    const agent = await authenticatedAgent();
    await agent.post("/api/album/uploads/session").send({ originalName: "documento.pdf", mimeType: "application/pdf", size: 10 }).expect(415);
  });

  it("creates a direct session and only publishes after Graph validation", async () => {
    const agent = await authenticatedAgent();
    const created = await agent.post("/api/album/uploads/session").send({ originalName: "foto verano?.jpg", mimeType: "image/jpeg", size: 1_000, capturedAt: "2026-08-20T10:30:00.000Z", captureSource: "embedded" }).expect(201);
    expect(created.body.uploadUrl).toBe("https://upload.example/session");
    expect(created.body.storedName).not.toContain("?");
    expect((await store.getMedia(created.body.mediaId))?.status).toBe("uploading");
    await agent.post(`/api/album/uploads/${created.body.mediaId}/complete`).send({ itemId: "onedrive-item" }).expect(200);
    const media = await store.getMedia(created.body.mediaId);
    expect(graph.validateCompletedItem).toHaveBeenCalledWith("onedrive-item", media?.storedName, 1_000);
    expect(media?.status).toBe("visible");
    expect(media).toMatchObject({ capturedAt: "2026-08-20T10:30:00.000Z", captureSource: "embedded" });
  });

  it("rejects inconsistent or future capture metadata", async () => {
    const agent = await authenticatedAgent();
    await agent.post("/api/album/uploads/session").send({ originalName: "foto.jpg", mimeType: "image/jpeg", size: 10, capturedAt: "2026-08-20T10:30:00.000Z", captureSource: "unknown" }).expect(400);
    await agent.post("/api/album/uploads/session").send({ originalName: "foto.jpg", mimeType: "image/jpeg", size: 10, capturedAt: "2999-08-20T10:30:00.000Z", captureSource: "embedded" }).expect(400);
  });

  it("accepts an empty mobile MIME and stores the type inferred from the extension", async () => {
    const agent = await authenticatedAgent();
    const created = await agent.post("/api/album/uploads/session").send({ originalName: "IMG_1234.HEIC", mimeType: "", size: 500 }).expect(201);
    expect((await store.getMedia(created.body.mediaId))?.mimeType).toBe("image/heic");
  });

  it("does not allow another guest to complete the upload", async () => {
    const owner = await authenticatedAgent();
    const created = await owner.post("/api/album/uploads/session").send({ originalName: "video.mp4", mimeType: "video/mp4", size: 2_000 }).expect(201);
    const other = await authenticatedAgent();
    await other.post(`/api/album/uploads/${created.body.mediaId}/complete`).send({ itemId: "onedrive-item" }).expect(404);
  });
});
