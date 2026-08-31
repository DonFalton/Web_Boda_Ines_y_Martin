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
    expect(first.body.items[0]).toMatchObject({ guestName: "Invitado 21", isOwner: false, thumbnailUrl: "https://thumb.example/drive-21" });
    expect(first.body.items[0]).not.toHaveProperty("onedriveItemId");

    const second = await agent.get(`/api/album/media?cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();

    const oldestFirst = await agent.get("/api/album/media?order=oldest").expect(200);
    expect(oldestFirst.body.items).toHaveLength(20);
    expect(oldestFirst.body.items[0]).toMatchObject({ guestName: "Invitado 1" });
    const oldestSecond = await agent.get(`/api/album/media?order=oldest&cursor=${encodeURIComponent(oldestFirst.body.nextCursor)}`).expect(200);
    expect(oldestSecond.body.items).toHaveLength(1);
    expect(oldestSecond.body.items[0]).toMatchObject({ guestName: "Invitado 21" });

    await agent.get("/api/album/media?order=unsupported").expect(400);

    const source = await agent.get(`/api/album/media/${first.body.items[0].id}/source`).expect(200);
    expect(source.body).toMatchObject({ url: "https://download.example/drive-21", filename: "foto-21.jpg", mimeType: "image/jpeg" });
    expect(source.headers["cache-control"]).toContain("no-store");
  });

  it("filters owned memories and only lets their owner move them to the OneDrive recycle bin", async () => {
    const store = new MemoryStore();
    const graph = {
      getThumbnails: vi.fn(async () => new Map<string, string>()),
      deleteItem: vi.fn(async () => undefined),
    } as unknown as GraphService;
    const app = createApp({ config: testConfig(), store, graph });
    const owner = request.agent(app);
    const other = request.agent(app);
    for (const agent of [owner, other]) await agent.post("/api/album/access").send({ accessToken: "test-album-token" }).expect(204);
    const ownerGuest = (await owner.post("/api/album/guest").send({ displayName: "Propietaria" }).expect(201)).body.guest;
    await other.post("/api/album/guest").send({ displayName: "Otra persona" }).expect(201);
    const now = new Date().toISOString();
    const ownedId = "10000000-0000-4000-8000-000000000001";
    const foreignId = "10000000-0000-4000-8000-000000000002";
    await store.createMedia({ id: ownedId, guestId: ownerGuest.guestId, guestName: "Propietaria", originalName: "mia.jpg", storedName: "mia.jpg", mimeType: "image/jpeg", size: 10, onedriveItemId: "drive-owned", status: "visible", createdAt: now, updatedAt: now });
    await store.createMedia({ id: foreignId, guestId: "foreign-guest", guestName: "Otra persona", originalName: "otra.jpg", storedName: "otra.jpg", mimeType: "image/jpeg", size: 10, onedriveItemId: "drive-foreign", status: "visible", createdAt: now, updatedAt: now });

    const mine = await owner.get("/api/album/media?scope=mine").expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ id: ownedId, isOwner: true });
    await owner.delete(`/api/album/media/${foreignId}`).expect(404);
    expect(graph.deleteItem).not.toHaveBeenCalled();

    await owner.delete(`/api/album/media/${ownedId}`).expect(204);
    expect(graph.deleteItem).toHaveBeenCalledOnce();
    expect(graph.deleteItem).toHaveBeenCalledWith("drive-owned");
    expect((await store.getMedia(ownedId))?.status).toBe("deleted");
    await owner.delete(`/api/album/media/${ownedId}`).expect(204);
    expect(graph.deleteItem).toHaveBeenCalledOnce();
    expect((await owner.get("/api/album/media?scope=mine").expect(200)).body.items).toEqual([]);
  });

  it("keeps owned media visible when OneDrive refuses the recycle-bin operation", async () => {
    const store = new MemoryStore();
    const graph = {
      deleteItem: vi.fn(async () => { throw new Error("simulated Graph failure"); }),
    } as unknown as GraphService;
    const app = createApp({ config: testConfig(), store, graph });
    const owner = request.agent(app);
    await owner.post("/api/album/access").send({ accessToken: "test-album-token" }).expect(204);
    const guest = (await owner.post("/api/album/guest").send({ displayName: "Propietaria" }).expect(201)).body.guest;
    const mediaId = "10000000-0000-4000-8000-000000000003";
    const now = new Date().toISOString();
    await store.createMedia({ id: mediaId, guestId: guest.guestId, guestName: guest.displayName, originalName: "mia.jpg", storedName: "mia.jpg", mimeType: "image/jpeg", size: 10, onedriveItemId: "drive-owned", status: "visible", createdAt: now, updatedAt: now });

    await owner.delete(`/api/album/media/${mediaId}`).expect(500);
    expect((await store.getMedia(mediaId))?.status).toBe("visible");
  });
});
