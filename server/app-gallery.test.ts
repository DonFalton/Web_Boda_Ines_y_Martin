import request from "supertest";
import { createApp } from "./app.js";
import { MemoryStore } from "./store.js";
import { testConfig } from "./test-helpers.js";
import type { GraphService } from "./graph.js";

describe("album gallery", () => {
  it("returns only visible media in stable pages of twenty with temporary thumbnails", async () => {
    const store = new MemoryStore();
    for (let index = 0; index < 22; index += 1) {
      const date = new Date(Date.UTC(2026, 7, 30, 12, 0, index)).toISOString();
      await store.createMedia({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        guestId: "guest",
        guestName: `Invitado ${index}`,
        originalName: `foto-${index}.jpg`,
        storedName: `stored-${index}.jpg`,
        mimeType: "image/jpeg",
        size: 100 + index,
        onedriveItemId: `drive-${index}`,
        status: index === 0 ? "failed" : "visible",
        createdAt: date,
        updatedAt: date,
      });
    }
    const graph = {
      getThumbnails: vi.fn(async (ids: string[]) => new Map(ids.map(id => [id, `https://thumb.example/${id}`]))),
      getDownloadUrl: vi.fn(async (id: string) => `https://download.example/${id}`),
    } as unknown as GraphService;
    const app = createApp({ config: testConfig(), store, graph });
    const agent = request.agent(app);
    await agent.post("/api/album/access").send({ accessToken: "test-album-token" });
    await agent.post("/api/album/guest").send({ displayName: "Visor" });

    const first = await agent.get("/api/album/media").expect(200);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.nextCursor).toBeTypeOf("string");
    expect(first.body.items[0]).toMatchObject({ guestName: "Invitado 21", thumbnailUrl: "https://thumb.example/drive-21" });
    expect(first.body.items[0]).not.toHaveProperty("onedriveItemId");

    const second = await agent.get(`/api/album/media?cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();

    const source = await agent.get(`/api/album/media/${first.body.items[0].id}/source`).expect(200);
    expect(source.body).toMatchObject({ url: "https://download.example/drive-21", filename: "foto-21.jpg", mimeType: "image/jpeg" });
    expect(source.headers["cache-control"]).toContain("no-store");
  });
});
