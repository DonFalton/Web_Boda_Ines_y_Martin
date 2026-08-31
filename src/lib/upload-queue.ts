import { useCallback, useEffect, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { AlbumApiError, albumApi, type DirectUploadSession, type UploadPolicy } from "./album-api";

export type UploadStatus = "queued" | "uploading" | "retrying" | "done" | "failed" | "canceled";
export type UploadTask = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  session?: DirectUploadSession;
  uploadedItemId?: string;
};

type UploadResponse = { nextExpectedRanges?: string[]; id?: string };
type ChunkResult = { status: number; body: UploadResponse };

export class UploadChunkError extends Error {
  constructor(public readonly status: number | null, public readonly retryAfterMs: number | null = null) {
    super(status === null ? "UPLOAD_NETWORK_ERROR" : `UPLOAD_CHUNK_${status}`);
  }
}

class UploadRetryExhaustedError extends Error {
  constructor() { super("UPLOAD_RETRY_EXHAUSTED"); }
}

function nextOffset(payload: UploadResponse) {
  const range = payload.nextExpectedRanges?.[0];
  if (!range) return null;
  const parsed = Number(range.split("-")[0]);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function inspectSession(uploadUrl: string) {
  const response = await fetch(uploadUrl, { method: "GET" });
  if (!response.ok) throw new Error("UPLOAD_SESSION_EXPIRED");
  const offset = nextOffset(await response.json() as UploadResponse);
  if (offset === null) throw new Error("UPLOAD_SESSION_STATE_INVALID");
  return offset;
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function putChunk(uploadUrl: string, chunk: Blob, start: number, total: number, onProgress: (loaded: number) => void, register: (xhr: XMLHttpRequest) => void) {
  return new Promise<{ status: number; body: UploadResponse }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${start + chunk.size - 1}/${total}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onerror = () => reject(new UploadChunkError(null));
    xhr.onabort = () => reject(new DOMException("Upload canceled", "AbortError"));
    xhr.onload = () => {
      let body: UploadResponse = {};
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) as UploadResponse : {}; } catch { /* safe empty response */ }
      if (xhr.status === 200 || xhr.status === 201 || xhr.status === 202) resolve({ status: xhr.status, body });
      else reject(new UploadChunkError(xhr.status, retryAfterMilliseconds(xhr.getResponseHeader("Retry-After"))));
    };
    xhr.send(chunk);
  });
}

const retryableChunkStatuses = new Set([429, 500, 502, 503, 504]);

function isRetryableChunkError(error: unknown): error is UploadChunkError {
  return error instanceof UploadChunkError && (error.status === null || retryableChunkStatuses.has(error.status));
}

export async function uploadChunkWithRetry({
  start,
  put,
  inspect,
  sleep = (milliseconds: number) => new Promise<void>(resolve => window.setTimeout(resolve, milliseconds)),
  random = Math.random,
  onRetry = () => undefined,
  onAttempt = () => undefined,
  shouldStop = () => false,
  maxRetries = 3,
}: {
  start: number;
  put: () => Promise<ChunkResult>;
  inspect: () => Promise<number>;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  onRetry?: (retry: number, delayMs: number) => void;
  onAttempt?: () => void;
  shouldStop?: () => boolean;
  maxRetries?: number;
}) {
  let retries = 0;
  while (true) {
    if (shouldStop()) throw new DOMException("Upload canceled", "AbortError");
    onAttempt();
    try {
      return await put();
    } catch (error) {
      if (!isRetryableChunkError(error)) throw error;
      if (retries >= maxRetries) throw new UploadRetryExhaustedError();
      const retry = retries + 1;
      const backoff = 1000 * 2 ** retries;
      const delayMs = Math.max(backoff, error.retryAfterMs ?? 0) + Math.floor(random() * 250);
      retries = retry;
      onRetry(retry, delayMs);
      await sleep(delayMs);
      if (shouldStop()) throw new DOMException("Upload canceled", "AbortError");
      const reportedOffset = await inspect();
      if (reportedOffset < start) throw new Error("UPLOAD_SESSION_STATE_INVALID");
      if (reportedOffset > start) {
        return { status: 202, body: { nextExpectedRanges: [`${reportedOffset}-`] } };
      }
    }
  }
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof AlbumApiError) return error.message;
  if (error instanceof Error && error.message === "UPLOAD_SESSION_EXPIRED") return "La sesión de subida ha caducado. Pulsa reintentar.";
  if (error instanceof UploadRetryExhaustedError) return "No se pudo continuar la subida.";
  return "La subida se ha interrumpido. Puedes reintentarlo sin volver a elegir el archivo.";
}

export function validateSelectedFiles(files: File[], policy: UploadPolicy) {
  const accepted: File[] = [];
  const errors: string[] = [];
  if (files.length > policy.maxBatchFiles) errors.push(`Puedes seleccionar hasta ${policy.maxBatchFiles} archivos cada vez.`);
  for (const file of files.slice(0, policy.maxBatchFiles)) {
    const mimeType = file.type.toLowerCase().split(";")[0].trim();
    const extension = file.name.toLowerCase().split(".").pop() || "";
    const extensionAllowed = policy.acceptedExtensions.includes(extension);
    const typeAllowed = policy.genericTypes.includes(mimeType)
      ? extensionAllowed
      : policy.typeExtensions[mimeType]?.includes(extension) ?? false;
    if (!typeAllowed) errors.push(`${file.name}: formato no compatible.`);
    else if (file.size > policy.maxFileBytes) errors.push(`${file.name}: supera el tamaño máximo permitido.`);
    else accepted.push(file);
  }
  return { accepted, errors };
}

export function useUploadQueue(policy: UploadPolicy | undefined, queryClient: QueryClient) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [selectionErrors, setSelectionErrors] = useState<string[]>([]);
  const tasksRef = useRef(tasks);
  const running = useRef(new Set<string>());
  const canceled = useRef(new Set<string>());
  const cleanupDone = useRef(new Set<string>());
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const retryWaits = useRef(new Map<string, { finish: () => void }>());
  tasksRef.current = tasks;

  const patchTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks(current => current.map(task => task.id === id ? { ...task, ...patch } : task));
  }, []);

  const cleanupCanceledUpload = useCallback((id: string, session: DirectUploadSession | undefined) => {
    if (!session || cleanupDone.current.has(id)) return;
    cleanupDone.current.add(id);
    void Promise.allSettled([
      fetch(session.uploadUrl, { method: "DELETE" }),
      albumApi.failUpload(session.mediaId),
    ]);
  }, []);

  const waitForRetry = useCallback((id: string, milliseconds: number) => new Promise<void>(resolve => {
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      retryWaits.current.delete(id);
      resolve();
    };
    timer = window.setTimeout(finish, milliseconds);
    retryWaits.current.set(id, { finish });
  }), []);

  const createReplacementSession = useCallback(async (task: UploadTask) => {
    if (task.session) await albumApi.failUpload(task.session.mediaId).catch(() => undefined);
    const session = await albumApi.createUploadSession(task.file);
    patchTask(task.id, { session, uploadedItemId: undefined, progress: 0 });
    return session;
  }, [patchTask]);

  const runTask = useCallback(async (initialTask: UploadTask) => {
    const taskId = initialTask.id;
    let activeSession = initialTask.session;
    try {
      let current = tasksRef.current.find(task => task.id === taskId) || initialTask;
      if (current.uploadedItemId && current.session) {
        await albumApi.completeUpload(current.session.mediaId, current.uploadedItemId);
      } else {
        let session = current.session;
        let offset = 0;
        if (session) {
          try { offset = await inspectSession(session.uploadUrl); }
          catch { session = await createReplacementSession(current); }
        } else {
          session = await albumApi.createUploadSession(current.file);
          patchTask(taskId, { session });
        }
        activeSession = session;
        while (offset < current.file.size) {
          if (canceled.current.has(taskId)) throw new DOMException("Upload canceled", "AbortError");
          const end = Math.min(offset + (policy?.chunkBytes ?? 10 * 1024 * 1024), current.file.size);
          const result = await uploadChunkWithRetry({
            start: offset,
            put: () => putChunk(session.uploadUrl, current.file.slice(offset, end), offset, current.file.size, loaded => {
              patchTask(taskId, { progress: Math.min(99, Math.round(((offset + loaded) / current.file.size) * 100)) });
            }, xhr => requests.current.set(taskId, xhr)),
            inspect: () => inspectSession(session.uploadUrl),
            sleep: milliseconds => waitForRetry(taskId, milliseconds),
            onRetry: () => patchTask(taskId, { status: "retrying", error: undefined }),
            onAttempt: () => patchTask(taskId, { status: "uploading", error: undefined }),
            shouldStop: () => canceled.current.has(taskId),
          });
          requests.current.delete(taskId);
          if (result.status === 200 || result.status === 201) {
            if (!result.body.id) throw new Error("UPLOAD_ITEM_MISSING");
            patchTask(taskId, { uploadedItemId: result.body.id, progress: 99 });
            await albumApi.completeUpload(session.mediaId, result.body.id);
            offset = current.file.size;
          } else {
            let reported = nextOffset(result.body);
            if (reported === null || reported <= offset) reported = await inspectSession(session.uploadUrl);
            if (reported <= offset) throw new Error("UPLOAD_SESSION_STATE_INVALID");
            offset = reported;
          }
          current = tasksRef.current.find(task => task.id === taskId) || current;
        }
      }
      patchTask(taskId, { status: "done", progress: 100, error: undefined });
      await queryClient.invalidateQueries({ queryKey: ["album-media"] });
    } catch (error) {
      if (canceled.current.has(taskId)) {
        cleanupCanceledUpload(taskId, activeSession);
      } else {
        patchTask(taskId, { status: "failed", error: uploadErrorMessage(error) });
      }
    } finally {
      requests.current.delete(taskId);
      running.current.delete(taskId);
      setTasks(current => [...current]);
    }
  }, [cleanupCanceledUpload, createReplacementSession, patchTask, policy?.chunkBytes, queryClient, waitForRetry]);

  useEffect(() => {
    const available = Math.max(0, (policy?.parallelFiles ?? 2) - running.current.size);
    if (!available) return;
    const queued = tasks.filter(task => task.status === "queued" && !running.current.has(task.id)).slice(0, available);
    if (!queued.length) return;
    queued.forEach(task => running.current.add(task.id));
    setTasks(current => current.map(task => queued.some(item => item.id === task.id) ? { ...task, status: "uploading" } : task));
    queued.forEach(task => void runTask(task));
  }, [policy?.parallelFiles, runTask, tasks]);

  useEffect(() => () => {
    requests.current.forEach(xhr => xhr.abort());
    retryWaits.current.forEach(wait => wait.finish());
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    if (!policy) return;
    const result = validateSelectedFiles(Array.from(fileList), policy);
    setSelectionErrors(result.errors);
    setTasks(current => [...current, ...result.accepted.map(file => ({ id: crypto.randomUUID(), file, status: "queued" as const, progress: 0 }))]);
  }, [policy]);

  const cancel = useCallback((id: string) => {
    canceled.current.add(id);
    requests.current.get(id)?.abort();
    retryWaits.current.get(id)?.finish();
    const task = tasksRef.current.find(item => item.id === id);
    patchTask(id, { status: "canceled", error: undefined, session: undefined, uploadedItemId: undefined });
    cleanupCanceledUpload(id, task?.session);
  }, [cleanupCanceledUpload, patchTask]);

  const retry = useCallback((id: string) => {
    canceled.current.delete(id);
    cleanupDone.current.delete(id);
    setTasks(current => current.map(task => task.id === id ? { ...task, status: "queued", error: undefined, progress: task.session ? task.progress : 0 } : task));
  }, []);

  return { tasks, selectionErrors, addFiles, cancel, retry };
}
