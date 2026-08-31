import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { albumApi } from "./album-api";
import { UploadChunkError, uploadChunkWithRetry, useUploadQueue, validateSelectedFiles } from "./upload-queue";
import type { UploadPolicy } from "./album-api";

const policy: UploadPolicy = {
  maxFileBytes: 1_000,
  maxBatchFiles: 2,
  chunkBytes: 10 * 1024 * 1024,
  parallelFiles: 2,
  acceptedTypes: ["image/jpeg", "video/mp4"],
  acceptedExtensions: ["jpg", "jpeg", "heic", "heif", "mov", "mp4"],
  genericTypes: ["", "application/octet-stream"],
  typeExtensions: {
    "image/jpeg": ["jpg", "jpeg"],
    "image/heic": ["heic"],
    "image/heif": ["heif"],
    "video/quicktime": ["mov"],
    "video/mp4": ["mp4"],
  },
};

describe("upload file validation", () => {
  it("accepts supported media within the size limit", () => {
    const photo = new File([new Uint8Array(100)], "foto.jpg", { type: "image/jpeg" });
    const video = new File([new Uint8Array(500)], "video.mp4", { type: "video/mp4" });
    expect(validateSelectedFiles([photo, video], policy)).toEqual({ accepted: [photo, video], errors: [] });
  });

  it("reports unsupported, oversized and excessive selections", () => {
    const pdf = new File(["pdf"], "documento.pdf", { type: "application/pdf" });
    const large = new File([new Uint8Array(1_001)], "grande.jpg", { type: "image/jpeg" });
    const extra = new File(["x"], "extra.jpg", { type: "image/jpeg" });
    const result = validateSelectedFiles([pdf, large, extra], policy);
    expect(result.accepted).toEqual([]);
    expect(result.errors).toHaveLength(3);
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
    const file = new File(["x"], filename, { type: mimeType });
    expect(validateSelectedFiles([file], policy).accepted).toHaveLength(expected ? 1 : 0);
  });
});

describe("chunk retries", () => {
  const completed = { status: 201, body: { id: "drive-item" } };
  const noWait = vi.fn(async (_milliseconds: number) => undefined);

  beforeEach(() => noWait.mockClear());

  it("retries a network error and succeeds on the second attempt", async () => {
    const put = vi.fn()
      .mockRejectedValueOnce(new UploadChunkError(null))
      .mockResolvedValueOnce(completed);
    await expect(uploadChunkWithRetry({ start: 0, put, inspect: async () => 0, sleep: noWait, random: () => 0 })).resolves.toEqual(completed);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("retries HTTP 500 after checking the upload session", async () => {
    const inspect = vi.fn(async () => 0);
    const put = vi.fn().mockRejectedValueOnce(new UploadChunkError(500)).mockResolvedValueOnce(completed);
    await uploadChunkWithRetry({ start: 0, put, inspect, sleep: noWait, random: () => 0 });
    expect(inspect).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("respects Retry-After on HTTP 429 before retrying", async () => {
    const put = vi.fn().mockRejectedValueOnce(new UploadChunkError(429, 5_000)).mockResolvedValueOnce(completed);
    await uploadChunkWithRetry({ start: 0, put, inspect: async () => 0, sleep: noWait, random: () => 0 });
    expect(noWait).toHaveBeenCalledWith(5_000);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("does not retry HTTP 400", async () => {
    const put = vi.fn().mockRejectedValue(new UploadChunkError(400));
    const inspect = vi.fn(async () => 0);
    await expect(uploadChunkWithRetry({ start: 0, put, inspect, sleep: noWait })).rejects.toThrow("UPLOAD_CHUNK_400");
    expect(put).toHaveBeenCalledOnce();
    expect(inspect).not.toHaveBeenCalled();
  });

  it("stops after three automatic retries", async () => {
    const put = vi.fn().mockRejectedValue(new UploadChunkError(503));
    const inspect = vi.fn(async () => 0);
    await expect(uploadChunkWithRetry({ start: 0, put, inspect, sleep: noWait, random: () => 0 })).rejects.toThrow("UPLOAD_RETRY_EXHAUSTED");
    expect(put).toHaveBeenCalledTimes(4);
    expect(inspect).toHaveBeenCalledTimes(3);
    expect(noWait.mock.calls.map(([delay]) => delay)).toEqual([1_000, 2_000, 4_000]);
  });

  it("uses nextExpectedRanges instead of resending an ambiguously completed chunk", async () => {
    const put = vi.fn().mockRejectedValueOnce(new UploadChunkError(null));
    await expect(uploadChunkWithRetry({ start: 10, put, inspect: async () => 20, sleep: noWait, random: () => 0 })).resolves.toEqual({
      status: 202,
      body: { nextExpectedRanges: ["20-"] },
    });
    expect(put).toHaveBeenCalledOnce();
  });
});

describe("upload cancellation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("cancels Graph and marks the media failed exactly once while keeping canceled state", async () => {
    class PendingUploadRequest {
      static instances: PendingUploadRequest[] = [];
      upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onload: (() => void) | null = null;
      status = 0;
      responseText = "";
      constructor() { PendingUploadRequest.instances.push(this); }
      open() {}
      setRequestHeader() {}
      getResponseHeader() { return null; }
      send() {}
      abort() { this.onabort?.(); }
    }

    vi.stubGlobal("XMLHttpRequest", PendingUploadRequest as unknown as typeof XMLHttpRequest);
    const deleteSession = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", deleteSession);
    vi.spyOn(albumApi, "createUploadSession").mockResolvedValue({
      mediaId: "00000000-0000-4000-8000-000000000001",
      storedName: "stored.jpg",
      uploadUrl: "https://upload.example/session",
      expiresAt: "2030-01-01T00:00:00Z",
    });
    const failUpload = vi.spyOn(albumApi, "failUpload").mockResolvedValue(undefined);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useUploadQueue(policy, queryClient));

    act(() => result.current.addFiles([new File(["photo"], "photo.jpg", { type: "image/jpeg" })]));
    await waitFor(() => expect(result.current.tasks[0]?.session).toBeDefined());
    await waitFor(() => expect(PendingUploadRequest.instances).toHaveLength(1));

    act(() => result.current.cancel(result.current.tasks[0].id));

    await waitFor(() => expect(result.current.tasks[0]?.status).toBe("canceled"));
    await waitFor(() => expect(deleteSession).toHaveBeenCalledOnce());
    expect(deleteSession).toHaveBeenCalledWith("https://upload.example/session", { method: "DELETE" });
    expect(failUpload).toHaveBeenCalledOnce();
    expect(result.current.tasks[0]?.error).toBeUndefined();
  });
});
