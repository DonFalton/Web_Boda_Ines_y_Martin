import { constantTimeEqual, createPkceAttempt, decryptToken, encryptToken, parseEncryptionKey, signPayload, verifyPayload } from "./crypto.js";

describe("album crypto", () => {
  const key = "01".repeat(32);

  it("accepts a 64-character hexadecimal encryption key", () => {
    const parsed = parseEncryptionKey("ab".repeat(32));
    expect(parsed).toBeInstanceOf(Buffer);
    expect(parsed).toHaveLength(32);
  });

  it("accepts Base64 that represents exactly 32 bytes", () => {
    expect(parseEncryptionKey(Buffer.alloc(32, 7).toString("base64"))).toHaveLength(32);
  });

  it.each([
    ["62 hexadecimal characters", "ab".repeat(31)],
    ["66 hexadecimal characters", "ab".repeat(33)],
    ["64 non-hexadecimal characters", `${"ab".repeat(31)}ag`],
    ["Base64 representing 31 bytes", Buffer.alloc(31, 7).toString("base64")],
    ["Base64 representing 33 bytes", Buffer.alloc(33, 7).toString("base64")],
    ["invalid Base64", "not+valid/base64!"],
    ["arbitrary text", "01234567890123456789012345678901"],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseEncryptionKey(raw)).toThrow("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  });

  it("compares secrets without leaking length", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("short", "a-much-longer-value")).toBe(false);
  });

  it("rejects a modified signed cookie", () => {
    const signed = signPayload({ guestId: "guest-1" }, "cookie-secret");
    expect(verifyPayload<{ guestId: string }>(signed, "cookie-secret")?.guestId).toBe("guest-1");
    expect(verifyPayload(`${signed}x`, "cookie-secret")).toBeNull();
  });

  it("encrypts refresh tokens with AES-256-GCM", () => {
    const encrypted = encryptToken("refresh-token-value", key);
    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptToken(encrypted, key)).toBe("refresh-token-value");
    const [version, iv, tag, ciphertext] = encrypted.split(".");
    const modifiedTag = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;
    expect(() => decryptToken([version, iv, modifiedTag, ciphertext].join("."), key)).toThrow();
  });

  it("creates an S256-compatible PKCE attempt", () => {
    const attempt = createPkceAttempt();
    expect(attempt.state.length).toBeGreaterThan(30);
    expect(attempt.codeVerifier.length).toBeGreaterThan(43);
    expect(attempt.codeChallenge).not.toBe(attempt.codeVerifier);
  });
});
