export type CaptureSource = "embedded" | "file_modified" | "unknown";

export type CaptureMetadata = {
  capturedAt: string | null;
  captureSource: CaptureSource;
};

const cache = new WeakMap<File, Promise<CaptureMetadata>>();
const QUICKTIME_UNIX_EPOCH_SECONDS = 2_082_844_800;
const MAX_JPEG_METADATA_BYTES = 1024 * 1024;

function readBlob(blob: Blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

function normalizedDate(value: Date) {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) return null;
  const year = value.getUTCFullYear();
  if (year < 1970 || milliseconds > Date.now() + 24 * 60 * 60_000) return null;
  return value.toISOString();
}

function parseExifDate(value: string | null, offset: string | null) {
  const match = value?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const suffix = offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "Z";
  return normalizedDate(new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${suffix}`));
}

function jpegExifDate(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let markerOffset = 2;
  while (markerOffset + 4 <= bytes.length) {
    if (bytes[markerOffset] !== 0xff) break;
    const marker = bytes[markerOffset + 1];
    markerOffset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (markerOffset + 2 > bytes.length) break;
    const segmentLength = view.getUint16(markerOffset, false);
    if (segmentLength < 2 || markerOffset + segmentLength > bytes.length) break;
    const segmentStart = markerOffset + 2;
    if (marker === 0xe1
      && segmentLength >= 8
      && String.fromCharCode(...bytes.slice(segmentStart, segmentStart + 4)) === "Exif"
      && bytes[segmentStart + 4] === 0
      && bytes[segmentStart + 5] === 0) {
      const tiffStart = segmentStart + 6;
      if (tiffStart + 8 > bytes.length) return null;
      const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
      const littleEndian = byteOrder === "II";
      if (!littleEndian && byteOrder !== "MM") return null;
      if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null;

      const readAscii = (entryOffset: number) => {
        const count = view.getUint32(entryOffset + 4, littleEndian);
        const valueOffset = count <= 4 ? entryOffset + 8 : tiffStart + view.getUint32(entryOffset + 8, littleEndian);
        if (!count || valueOffset < 0 || valueOffset + count > bytes.length) return null;
        return new TextDecoder("ascii").decode(bytes.slice(valueOffset, valueOffset + count)).replace(/\0.*$/s, "").trim() || null;
      };
      const readIfd = (relativeOffset: number) => {
        const result = new Map<number, string | number>();
        const ifdOffset = tiffStart + relativeOffset;
        if (ifdOffset + 2 > bytes.length) return result;
        const entries = view.getUint16(ifdOffset, littleEndian);
        for (let index = 0; index < entries; index += 1) {
          const entryOffset = ifdOffset + 2 + index * 12;
          if (entryOffset + 12 > bytes.length) break;
          const tag = view.getUint16(entryOffset, littleEndian);
          const type = view.getUint16(entryOffset + 2, littleEndian);
          if (type === 2) result.set(tag, readAscii(entryOffset) ?? "");
          else if (type === 4 && view.getUint32(entryOffset + 4, littleEndian) === 1) result.set(tag, view.getUint32(entryOffset + 8, littleEndian));
        }
        return result;
      };

      const firstIfd = readIfd(view.getUint32(tiffStart + 4, littleEndian));
      const exifOffset = firstIfd.get(0x8769);
      const exifIfd = typeof exifOffset === "number" ? readIfd(exifOffset) : new Map<number, string | number>();
      const original = String(exifIfd.get(0x9003) || exifIfd.get(0x9004) || firstIfd.get(0x0132) || "") || null;
      const timezone = String(exifIfd.get(0x9011) || exifIfd.get(0x9012) || exifIfd.get(0x9010) || "") || null;
      return parseExifDate(original, timezone);
    }
    markerOffset += segmentLength;
  }
  return null;
}

type IsoBox = { type: string; start: number; end: number; headerBytes: number };

async function readIsoBox(file: File, start: number, parentEnd: number): Promise<IsoBox | null> {
  if (start + 8 > parentEnd) return null;
  const header = await readBlob(file.slice(start, Math.min(start + 16, parentEnd)));
  if (header.byteLength < 8) return null;
  const view = new DataView(header);
  let size = view.getUint32(0, false);
  let headerBytes = 8;
  if (size === 1) {
    if (header.byteLength < 16) return null;
    const extended = view.getBigUint64(8, false);
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(extended);
    headerBytes = 16;
  } else if (size === 0) {
    size = parentEnd - start;
  }
  if (size < headerBytes || start + size > parentEnd) return null;
  const type = new TextDecoder("ascii").decode(new Uint8Array(header, 4, 4));
  return { type, start, end: start + size, headerBytes };
}

async function findIsoBox(file: File, start: number, end: number, type: string) {
  let offset = start;
  for (let count = 0; offset + 8 <= end && count < 10_000; count += 1) {
    const box = await readIsoBox(file, offset, end);
    if (!box) return null;
    if (box.type === type) return box;
    offset = box.end;
  }
  return null;
}

async function videoContainerDate(file: File) {
  const moov = await findIsoBox(file, 0, file.size, "moov");
  if (!moov) return null;
  const mvhd = await findIsoBox(file, moov.start + moov.headerBytes, moov.end, "mvhd");
  if (!mvhd) return null;
  const payload = await readBlob(file.slice(mvhd.start + mvhd.headerBytes, Math.min(mvhd.start + mvhd.headerBytes + 32, mvhd.end)));
  if (payload.byteLength < 8) return null;
  const view = new DataView(payload);
  const seconds = view.getUint8(0) === 1
    ? (payload.byteLength >= 12 ? view.getBigUint64(4, false) : 0n)
    : BigInt(view.getUint32(4, false));
  if (seconds <= BigInt(QUICKTIME_UNIX_EPOCH_SECONDS)) return null;
  const unixMilliseconds = Number(seconds - BigInt(QUICKTIME_UNIX_EPOCH_SECONDS)) * 1000;
  return normalizedDate(new Date(unixMilliseconds));
}

async function extract(file: File): Promise<CaptureMetadata> {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  let embedded: string | null = null;
  try {
    if (file.type === "image/jpeg" || extension === "jpg" || extension === "jpeg") {
      embedded = jpegExifDate(await readBlob(file.slice(0, Math.min(file.size, MAX_JPEG_METADATA_BYTES))));
    } else if (file.type === "video/mp4" || file.type === "video/quicktime" || file.type === "video/x-m4v" || ["mp4", "mov", "m4v"].includes(extension)) {
      embedded = await videoContainerDate(file);
    }
  } catch {
    embedded = null;
  }
  if (embedded) return { capturedAt: embedded, captureSource: "embedded" };
  const modified = file.lastModified ? normalizedDate(new Date(file.lastModified)) : null;
  return modified
    ? { capturedAt: modified, captureSource: "file_modified" }
    : { capturedAt: null, captureSource: "unknown" };
}

export function extractMediaCaptureMetadata(file: File) {
  const existing = cache.get(file);
  if (existing) return existing;
  const pending = extract(file);
  cache.set(file, pending);
  return pending;
}
