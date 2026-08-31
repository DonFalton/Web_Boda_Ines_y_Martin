import path from "node:path";

const invalidOneDriveCharacters = new Set('"*:<>?\\/|');
const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeOriginalName(input: string) {
  const basename = path.basename(input.normalize("NFC"));
  const replaced = Array.from(basename, character => invalidOneDriveCharacters.has(character) || character.charCodeAt(0) <= 31 ? "-" : character).join("");
  const base = replaced.replace(/\s+/g, " ").trim();
  const withoutTrailingDots = base.replace(/[. ]+$/g, "");
  const safe = reservedWindowsNames.test(withoutTrailingDots) ? `file-${withoutTrailingDots}` : withoutTrailingDots;
  return (safe || "archivo").slice(0, 180);
}

export function createStoredName(mediaId: string, originalName: string, now = Date.now()) {
  const safe = sanitizeOriginalName(originalName);
  const shortId = mediaId.replaceAll("-", "").slice(0, 12);
  return `${now}-${shortId}-${safe}`;
}
