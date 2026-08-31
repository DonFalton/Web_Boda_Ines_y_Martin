import { isAcceptedMedia, normalizedMediaType, uploadChunkBytes } from "./media-policy.js";

describe("album media policy", () => {
  it("uses OneDrive-compatible 10 MiB chunks", () => {
    expect(uploadChunkBytes).toBe(10 * 1024 * 1024);
    expect(uploadChunkBytes % (320 * 1024)).toBe(0);
  });

  it.each([
    ["IMG_1234.HEIC", "", true],
    ["IMG_1234.HEIC", "image/heic", true],
    ["IMG_1234.HEIF", "image/heif", true],
    ["MOV_1234.MOV", "", true],
    ["MOV_1234.MOV", "video/quicktime", true],
    ["video.MP4", "video/mp4", true],
    ["malware.exe", "", false],
    ["malware.exe", "image/jpeg", false],
    ["photo.jpg", "application/octet-stream", true],
    ["photo.jpg", "video/mp4", false],
  ])("validates %s with MIME %s", (filename, mimeType, expected) => {
    expect(isAcceptedMedia(filename, mimeType)).toBe(expected);
  });

  it("infers a stable media type when mobile browsers send a generic MIME", () => {
    expect(normalizedMediaType("IMG_1234.HEIC", "")).toBe("image/heic");
    expect(normalizedMediaType("MOV_1234.MOV", "application/octet-stream")).toBe("video/quicktime");
  });
});
