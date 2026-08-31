const imageExtensions = ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif"] as const;
const videoExtensions = ["mp4", "mov", "m4v"] as const;

export const mediaTypeExtensions: Record<string, readonly string[]> = {
  "image/jpeg": imageExtensions,
  "image/png": imageExtensions,
  "image/heic": imageExtensions,
  "image/heif": imageExtensions,
  "image/webp": imageExtensions,
  "image/gif": imageExtensions,
  "video/mp4": videoExtensions,
  "video/quicktime": videoExtensions,
  "video/x-m4v": videoExtensions,
};

const inferredMediaTypes: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif",
  webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v",
};

export const genericMediaTypes = ["", "application/octet-stream", "binary/octet-stream", "application/binary"];
export const acceptedMediaTypes = Object.keys(mediaTypeExtensions);
export const acceptedMediaExtensions = [...new Set(Object.values(mediaTypeExtensions).flat())];
export const uploadChunkBytes = 10 * 1024 * 1024;
export const parallelUploadFiles = 2;

export function isAcceptedMedia(originalName: string, mimeType: string) {
  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();
  const extension = originalName.toLowerCase().split(".").pop() || "";
  if (!acceptedMediaExtensions.includes(extension)) return false;
  if (genericMediaTypes.includes(normalizedMime)) return true;
  return mediaTypeExtensions[normalizedMime]?.includes(extension) ?? false;
}

export function normalizedMediaType(originalName: string, mimeType: string) {
  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();
  const extension = originalName.toLowerCase().split(".").pop() || "";
  return genericMediaTypes.includes(normalizedMime) ? inferredMediaTypes[extension] : normalizedMime;
}
