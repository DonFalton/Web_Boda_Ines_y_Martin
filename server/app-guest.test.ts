import request from "supertest";
import { createApp } from "./app.js";
import { MemoryStore } from "./store.js";
import { testConfig } from "./test-helpers.js";
import type { GraphService } from "./graph.js";

const graph = {
  isConnected: async () => false,
} as GraphService;

function cookies(response: request.Response) {
  const header = response.headers["set-cookie"];
  return Array.isArray(header) ? header : header ? [header] : [];
}

describe("album guest access", () => {
  const app = createApp({ config: testConfig(), store: new MemoryStore(), graph });

  it("exchanges the fragment token for an HttpOnly access cookie", async () => {
    await request(app).post("/api/album/access").send({ accessToken: "wrong" }).expect(401);
    const response = await request(app).post("/api/album/access").send({ accessToken: "test-album-token" }).expect(204);
    expect(cookies(response).join(";")).toContain("album_access=");
    expect(cookies(response).join(";")).toContain("HttpOnly");
    expect(cookies(response).join(";")).toContain("SameSite=Lax");
  });

  it("creates independent identities even when display names match", async () => {
    const access = await request(app).post("/api/album/access").send({ accessToken: "test-album-token" });
    const accessCookie = cookies(access)[0].split(";")[0];
    const first = await request(app).post("/api/album/guest").set("Cookie", accessCookie).send({ displayName: "  María   José  " }).expect(201);
    const second = await request(app).post("/api/album/guest").set("Cookie", accessCookie).send({ displayName: "María José" }).expect(201);
    expect(first.body.guest.displayName).toBe("María José");
    expect(first.body.guest.guestId).not.toBe(second.body.guest.guestId);
  });

  it("updates the display name without changing the stable owner identity", async () => {
    const agent = request.agent(app);
    await agent.post("/api/album/access").send({ accessToken: "test-album-token" }).expect(204);
    const created = await agent.post("/api/album/guest").send({ displayName: "Nombre inicial" }).expect(201);
    const updated = await agent.patch("/api/album/guest").send({ displayName: "  Nombre   nuevo  " }).expect(200);
    expect(updated.body.guest).toEqual({ guestId: created.body.guest.guestId, displayName: "Nombre nuevo" });
    expect((await agent.get("/api/album/session").expect(200)).body.guest).toEqual(updated.body.guest);
  });

  it("rejects empty, control-only and overlong names", async () => {
    const access = await request(app).post("/api/album/access").send({ accessToken: "test-album-token" });
    const accessCookie = cookies(access)[0].split(";")[0];
    await request(app).post("/api/album/guest").set("Cookie", accessCookie).send({ displayName: "   " }).expect(400);
    await request(app).post("/api/album/guest").set("Cookie", accessCookie).send({ displayName: "\u0000\u0001" }).expect(400);
    await request(app).post("/api/album/guest").set("Cookie", accessCookie).send({ displayName: "Nombre\u202Etxt" }).expect(400);
    await request(app).post("/api/album/guest").set("Cookie", accessCookie).send({ displayName: "á".repeat(81) }).expect(400);
  });

  it("reports and clears the guest session without clearing access", async () => {
    const agent = request.agent(app);
    await agent.post("/api/album/access").send({ accessToken: "test-album-token" }).expect(204);
    await agent.post("/api/album/guest").send({ displayName: "Invitado 🎉" }).expect(201);
    const active = await agent.get("/api/album/session").expect(200);
    expect(active.body).toMatchObject({ hasAccess: true, guest: { displayName: "Invitado 🎉" } });
    await agent.delete("/api/album/guest").expect(204);
    const cleared = await agent.get("/api/album/session").expect(200);
    expect(cleared.body).toEqual({ hasAccess: true, guest: null });
  });
});
