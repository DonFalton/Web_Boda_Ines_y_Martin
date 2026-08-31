import path from "node:path";
import request from "supertest";
import { createApp } from "./app.js";
import type { GraphService } from "./graph.js";
import { MemoryStore } from "./store.js";
import { testConfig } from "./test-helpers.js";

describe("production SPA routing", () => {
  const app = createApp({
    config: testConfig({ nodeEnv: "production" }),
    store: new MemoryStore(),
    graph: {} as GraphService,
    frontendPath: path.resolve(process.cwd(), "server/test-spa"),
  });

  it.each(["/", "/album", "/album/admin"])("serves the SPA on direct refresh of %s", async route => {
    const response = await request(app).get(route).expect(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain("SPA test shell");
  });

  it("never sends the SPA fallback for an unknown API route", async () => {
    const response = await request(app).get("/api/does-not-exist").expect(404);
    expect(response.type).toBe("application/json");
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "La ruta solicitada no existe." } });
    expect(response.text).not.toContain("SPA test shell");
  });
});
