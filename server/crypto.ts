import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function constantTimeEqual(actual: string, expected: string) {
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function signPayload<T>(payload: T, secret: string) {
  if (!secret) throw new Error("Cookie secret is not configured");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyPayload<T>(value: string | undefined, secret: string): T | null {
  if (!value || !secret) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const body = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function parseEncryptionKey(raw: string) {
  const invalid = () => new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw invalid();
  const key = Buffer.from(raw, "base64");
  const canonical = key.toString("base64");
  if (raw !== canonical && raw !== canonical.replace(/=+$/u, "")) throw invalid();
  if (key.length !== 32) throw invalid();
  return key;
}

export function encryptToken(plainText: string, rawKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseEncryptionKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptToken(value: string, rawKey: string) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Encrypted token has an invalid format");
  const decipher = createDecipheriv("aes-256-gcm", parseEncryptionKey(rawKey), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function createPkceAttempt() {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { state, codeVerifier, codeChallenge };
}
