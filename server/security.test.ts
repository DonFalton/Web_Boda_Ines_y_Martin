import request from "supertest";
import { createApp } from "./app.js";
import { assertProductionConfig } from "./config.js";
import { MemoryStore } from "./store.js";
import { testConfig } from "./test-helpers.js";
import type { GraphService } from "./graph.js";

describe("album security boundaries", () => {
  const mysql = { host: "127.0.0.1", port: 3306, database: "album", user: "album", password: "secret" };
  const app = createApp({ config: testConfig(), store: new MemoryStore(), graph: {} as GraphService });

  it("rejects cross-site mutations and marks API responses private", async () => {
    await request(app).post("/api/album/access").set("Origin", "https://attacker.example").send({ accessToken: "test-album-token" }).expect(403);
    const response = await request(app).get("/api/album/session").expect(200);
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("sets browser hardening and noindex headers", async () => {
    const hardened = await request(app).get("/api/health").expect(200);
    const csp = String(hardened.headers["content-security-policy"]);
    const sources = (directive: string) => csp.split(";").find(value => value.startsWith(`${directive} `))?.split(/\s+/u).slice(1) ?? [];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(sources("img-src")).toContain("https://*.microsoftpersonalcontent.com");
    expect(sources("media-src")).toContain("https://*.microsoftpersonalcontent.com");
    expect(sources("connect-src")).toContain("https://*.up.1drv.com");
    expect(sources("connect-src")).not.toContain("https://graph.microsoft.com");
    expect(sources("connect-src")).not.toContain("https://*.microsoftpersonalcontent.com");
    expect(csp).not.toContain("https://my.microsoftpersonalcontent.com");
    for (const directive of ["connect-src", "img-src", "media-src"]) {
      expect(sources(directive)).not.toContain("*");
      expect(sources(directive)).not.toContain("https:");
      expect(sources(directive)).not.toContain("https://*.microsoft.com");
    }
    expect(hardened.headers["x-content-type-options"]).toBe("nosniff");
    const album = await request(app).get("/album").expect(404);
    expect(album.headers["x-robots-tag"]).toContain("noindex");
  });

  it("rejects weak production secrets and non-HTTPS public URLs", () => {
    expect(() => assertProductionConfig(testConfig({ nodeEnv: "production", mysql, cookieSecret: "short" }))).toThrow(/COOKIE_SECRET/);
    expect(() => assertProductionConfig(testConfig({
      nodeEnv: "production",
      mysql,
      cookieSecret: "c".repeat(32),
      adminKey: "a".repeat(16),
      albumAccessToken: "t".repeat(16),
      publicAppUrl: "http://example.test",
      microsoftRedirectUri: "https://example.test/api/admin/microsoft/callback",
    }))).toThrow(/HTTPS/);
  });
});
