import { extractMediaCaptureMetadata } from "./media-capture-date";

function box(type: string, payload: Uint8Array) {
  const result = new Uint8Array(8 + payload.length);
  new DataView(result.buffer).setUint32(0, result.length, false);
  result.set(new TextEncoder().encode(type), 4);
  result.set(payload, 8);
  return result;
}

function jpegWithExif(date: string) {
  const dateBytes = new TextEncoder().encode(`${date}\0`);
  const tiff = new Uint8Array(56 + dateBytes.length);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8769, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 26, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 0x9003, true);
  view.setUint16(30, 2, true);
  view.setUint32(32, dateBytes.length, true);
  view.setUint32(36, 56, true);
  view.setUint32(40, 0, true);
  tiff.set(dateBytes, 56);
  const exif = new Uint8Array(6 + tiff.length);
  exif.set(new TextEncoder().encode("Exif"), 0);
  exif.set(tiff, 6);
  const jpeg = new Uint8Array(2 + 2 + 2 + exif.length + 2);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1], 0);
  new DataView(jpeg.buffer).setUint16(4, exif.length + 2, false);
  jpeg.set(exif, 6);
  jpeg.set([0xff, 0xd9], 6 + exif.length);
  return jpeg;
}

describe("media capture date", () => {
  it("reads DateTimeOriginal from JPEG EXIF", async () => {
    const file = new File([jpegWithExif("2025:08:25 12:34:56")], "photo.jpg", { type: "image/jpeg", lastModified: Date.UTC(2026, 0, 1) });
    await expect(extractMediaCaptureMetadata(file)).resolves.toEqual({ capturedAt: "2025-08-25T12:34:56.000Z", captureSource: "embedded" });
  });

  it("reads the QuickTime creation time from MP4 and MOV containers", async () => {
    const expected = Date.UTC(2025, 7, 25, 12, 34, 56);
    const mvhdPayload = new Uint8Array(20);
    new DataView(mvhdPayload.buffer).setUint32(4, Math.floor(expected / 1000) + 2_082_844_800, false);
    const file = new File([box("moov", box("mvhd", mvhdPayload))], "clip.MOV", { type: "video/quicktime", lastModified: Date.UTC(2026, 0, 1) });
    await expect(extractMediaCaptureMetadata(file)).resolves.toEqual({ capturedAt: "2025-08-25T12:34:56.000Z", captureSource: "embedded" });
  });

  it("falls back to lastModified when the format has no readable embedded date", async () => {
    const modified = Date.UTC(2025, 7, 26, 8, 0, 0);
    const file = new File([new Uint8Array([1, 2, 3])], "photo.webp", { type: "image/webp", lastModified: modified });
    await expect(extractMediaCaptureMetadata(file)).resolves.toEqual({ capturedAt: new Date(modified).toISOString(), captureSource: "file_modified" });
  });
});

