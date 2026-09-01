import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { decryptToken, encryptToken } from "./crypto.js";
import { resolveMysqlConfig } from "./config.js";
import { MysqlStore } from "./mysql-store.js";
import type { MediaRecord } from "./types.js";

const baseMysql = resolveMysqlConfig(process.env);
const testDatabase = process.env.MYSQL_TEST_DATABASE?.trim();
const mysqlConfig = baseMysql && testDatabase ? { ...baseMysql, database: testDatabase } : null;
const describeMysql = mysqlConfig ? describe.sequential : describe.skip;

const mediaIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
] as const;
const encryptionKey = "11".repeat(32);

function media(id: string, overrides: Partial<MediaRecord> = {}): MediaRecord {
  const now = "2026-08-31T10:00:00.123Z";
  return {
    id,
    guestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    guestName: "MySQL Test 🥂 · Inés · Martín · José María · Álvaro",
    originalName: "mysql-persistence-test.jpg",
    storedName: `${id}-mysql-persistence-test.jpg`,
    mimeType: "image/jpeg",
    size: 15 * 1024 ** 3,
    capturedAt: "2026-08-30T09:00:00.000Z",
    captureSource: "embedded",
    onedriveItemId: null,
    status: "uploading",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describeMysql("MysqlStore real integration", () => {
  let cleanupPool: Pool;

  async function cleanFixtures() {
    await cleanupPool.execute(
      `DELETE FROM media WHERE id IN (${mediaIds.map(() => "?").join(",")})`,
      [...mediaIds],
    );
    await cleanupPool.execute("DELETE FROM oauth_tokens WHERE id=?", ["microsoft"]);
  }

  beforeAll(async () => {
    cleanupPool = mysql.createPool({
      ...mysqlConfig!,
      waitForConnections: true,
      connectionLimit: 1,
      charset: "utf8mb4",
      timezone: "Z",
    });
    const store = new MysqlStore(mysqlConfig!);
    await store.init();
    await store.close();
    await cleanFixtures();
  });

  afterEach(cleanFixtures);
  afterAll(async () => cleanupPool.end());

  it("bootstraps the schema and pagination index idempotently with utf8mb4", async () => {
    const first = new MysqlStore(mysqlConfig!);
    await first.init();
    await first.init();
    await first.close();

    const second = new MysqlStore(mysqlConfig!);
    await second.init();
    await second.close();

    const [tables] = await cleanupPool.execute<RowDataPacket[]>(
      "SELECT table_name AS tableName, table_collation AS tableCollation FROM information_schema.tables WHERE table_schema=? AND table_name IN ('media','oauth_tokens') ORDER BY table_name",
      [testDatabase],
    );
    expect(tables).toEqual([
      expect.objectContaining({ tableName: "media", tableCollation: "utf8mb4_unicode_ci" }),
      expect.objectContaining({ tableName: "oauth_tokens", tableCollation: "utf8mb4_unicode_ci" }),
    ]);

    const [indexRows] = await cleanupPool.execute<RowDataPacket[]>(
      "SELECT column_name AS columnName FROM information_schema.statistics WHERE table_schema=? AND table_name='media' AND index_name='idx_media_status_created_id' ORDER BY seq_in_index",
      [testDatabase],
    );
    expect(indexRows.map(row => row.columnName)).toEqual(["status", "created_at", "id"]);
    const [ownerIndexRows] = await cleanupPool.execute<RowDataPacket[]>(
      "SELECT column_name AS columnName FROM information_schema.statistics WHERE table_schema=? AND table_name='media' AND index_name='idx_media_guest_status_created_id' ORDER BY seq_in_index",
      [testDatabase],
    );
    expect(ownerIndexRows.map(row => row.columnName)).toEqual(["guest_id", "status", "created_at", "id"]);
    const [statusRows] = await cleanupPool.execute<RowDataPacket[]>(
      "SELECT column_type AS columnType FROM information_schema.columns WHERE table_schema=? AND table_name='media' AND column_name='status'",
      [testDatabase],
    );
    expect(String(statusRows[0].columnType ?? statusRows[0].COLUMN_TYPE)).toContain("'deleted'");
    const [captureRows] = await cleanupPool.execute<RowDataPacket[]>(
      "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=? AND table_name='media' AND column_name IN ('captured_at','capture_source') ORDER BY column_name",
      [testDatabase],
    );
    expect(captureRows.map(row => row.columnName)).toEqual(["capture_source", "captured_at"]);
    const [captureIndexRows] = await cleanupPool.execute<RowDataPacket[]>(
      "SELECT column_name AS columnName FROM information_schema.statistics WHERE table_schema=? AND table_name='media' AND index_name='idx_media_status_captured_created_id' ORDER BY seq_in_index",
      [testDatabase],
    );
    expect(captureIndexRows.map(row => row.columnName)).toEqual(["status", "captured_at", "created_at", "id"]);
  });

  it("persists Unicode media, 15 GiB size and status across pool recreation", async () => {
    const original = media(mediaIds[0]);
    const first = new MysqlStore(mysqlConfig!);
    await first.init();
    await first.createMedia(original);
    await first.close();

    const second = new MysqlStore(mysqlConfig!);
    await second.init();
    expect(await second.getMedia(original.id)).toEqual(original);
    await second.updateMedia(original.id, {
      onedriveItemId: "dummy-onedrive-item",
      status: "visible",
      updatedAt: "2026-08-31T10:01:00.456Z",
    });
    await second.close();

    const third = new MysqlStore(mysqlConfig!);
    await third.init();
    expect(await third.getMedia(original.id)).toEqual({
      ...original,
      onedriveItemId: "dummy-onedrive-item",
      status: "visible",
      updatedAt: "2026-08-31T10:01:00.456Z",
    });
    await third.close();
  });

  it("persists only an encrypted refresh token across pool recreation", async () => {
    const dummyRefreshToken = "dummy-refresh-token-for-mysql-test";
    const encryptedRefreshToken = encryptToken(dummyRefreshToken, encryptionKey);
    const first = new MysqlStore(mysqlConfig!);
    await first.init();
    await first.saveOAuthToken({
      id: "microsoft",
      encryptedRefreshToken,
      updatedAt: "2026-08-31T10:02:00.789Z",
    });
    await first.close();

    const second = new MysqlStore(mysqlConfig!);
    await second.init();
    const stored = await second.getOAuthToken();
    await second.close();

    expect(stored?.encryptedRefreshToken).toBe(encryptedRefreshToken);
    expect(stored?.encryptedRefreshToken).not.toContain(dummyRefreshToken);
    expect(decryptToken(stored!.encryptedRefreshToken, encryptionKey)).toBe(dummyRefreshToken);
  });

  it("paginates equal timestamps without gaps and treats SQL-like input as data", async () => {
    const createdAt = "2026-08-31T10:03:00.000Z";
    const records = [
      media(mediaIds[1], { status: "visible", createdAt, updatedAt: createdAt, capturedAt: "2026-08-30T10:00:00.000Z" }),
      media(mediaIds[2], { status: "visible", createdAt, updatedAt: createdAt, capturedAt: "2026-08-30T09:00:00.000Z", guestName: "Robert'); DROP TABLE media;--", mimeType: "video/mp4" }),
      media(mediaIds[3], { status: "visible", createdAt, updatedAt: createdAt, capturedAt: null, captureSource: "unknown" }),
    ];
    const first = new MysqlStore(mysqlConfig!);
    await first.init();
    for (const record of records) await first.createMedia(record);
    await first.close();

    const second = new MysqlStore(mysqlConfig!);
    await second.init();
    const pageOne = await second.listVisibleMedia(2);
    const pageTwo = await second.listVisibleMedia(2, pageOne.nextCursor!);
    expect([...pageOne.items, ...pageTwo.items].map(item => item.id)).toEqual([
      mediaIds[3],
      mediaIds[2],
      mediaIds[1],
    ]);
    expect(new Set([...pageOne.items, ...pageTwo.items].map(item => item.id)).size).toBe(3);

    const oldestPageOne = await second.listVisibleMedia(2, undefined, { direction: "asc" });
    const oldestPageTwo = await second.listVisibleMedia(2, oldestPageOne.nextCursor!, { direction: "asc" });
    expect([...oldestPageOne.items, ...oldestPageTwo.items].map(item => item.id)).toEqual([
      mediaIds[1],
      mediaIds[2],
      mediaIds[3],
    ]);
    expect(new Set([...oldestPageOne.items, ...oldestPageTwo.items].map(item => item.id)).size).toBe(3);
    const capturedPageOne = await second.listVisibleMedia(2, undefined, { sort: "captured", direction: "asc" });
    const capturedPageTwo = await second.listVisibleMedia(2, capturedPageOne.nextCursor!, { sort: "captured", direction: "asc" });
    expect([...capturedPageOne.items, ...capturedPageTwo.items].map(item => item.id)).toEqual([mediaIds[2], mediaIds[1], mediaIds[3]]);
    expect((await second.listVisibleMedia(10, undefined, { kind: "image" })).items.map(item => item.id)).toEqual([mediaIds[3], mediaIds[1]]);
    expect((await second.listVisibleMedia(10, undefined, { sort: "type", direction: "asc" })).items.map(item => item.mimeType.startsWith("image/"))).toEqual([true, true, false]);
    expect((await second.getMedia(mediaIds[2]))?.guestName).toBe("Robert'); DROP TABLE media;--");
    expect(await second.getMedia(mediaIds[1])).not.toBeNull();
    const mine = await second.listVisibleMedia(10, undefined, { ownerGuestId: records[0].guestId });
    expect(mine.items).toHaveLength(3);
    await second.updateMedia(mediaIds[1], { status: "deleted", updatedAt: "2026-08-31T10:04:00.000Z" });
    expect((await second.listVisibleMedia(10, undefined, { ownerGuestId: records[0].guestId })).items.map(item => item.id)).not.toContain(mediaIds[1]);
    await second.close();
  });
});
