import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { constantTimeEqual, createPkceAttempt, signPayload, verifyPayload } from "./crypto.js";
import { GraphError, type GraphService } from "./graph.js";
import type { AlbumStore } from "./store.js";
import type { AccessGrant, AdminSession, GuestIdentity, MediaScope, OAuthAttempt } from "./types.js";
import { createStoredName, sanitizeOriginalName } from "./filename.js";
import { acceptedMediaExtensions, acceptedMediaTypes, genericMediaTypes, isAcceptedMedia, mediaTypeExtensions, normalizedMediaType, parallelUploadFiles, uploadChunkBytes } from "./media-policy.js";

export type AppDependencies = {
  config: AppConfig;
  store: AlbumStore;
  graph: GraphService;
  frontendPath?: string;
};

const ADMIN_COOKIE = "album_admin";
const OAUTH_COOKIE = "album_oauth";
const ACCESS_COOKIE = "album_access";
const GUEST_COOKIE = "album_guest";

function cookieOptions(config: AppConfig, maxAge: number) {
  return { httpOnly: true, secure: config.nodeEnv === "production", sameSite: "lax" as const, path: "/", maxAge };
}

function limiter(max: number, windowMs = 15 * 60_000) {
  return rateLimit({ windowMs, limit: max, standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera unos minutos." } } });
}

function normalizeDisplayName(value: string) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function parseDisplayName(body: unknown) {
  const parsed = z.object({ displayName: z.string().max(256) }).safeParse(body);
  const displayName = parsed.success ? normalizeDisplayName(parsed.data.displayName) : "";
  const hasVisibleCharacter = /[^\p{C}\p{Z}]/u.test(displayName);
  const hasControlCharacter = /\p{C}/u.test(displayName);
  return hasVisibleCharacter && !hasControlCharacter && Array.from(displayName).length <= 80 ? displayName : null;
}

function clearCookie(res: Response, name: string, config: AppConfig) {
  res.clearCookie(name, { ...cookieOptions(config, 0), maxAge: undefined });
}

export function createApp({ config, store, graph, frontendPath = path.resolve(process.cwd(), "dist") }: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.1drv.com", "https://*.sharepoint.com", "https://*.microsoftpersonalcontent.com"],
        mediaSrc: ["'self'", "blob:", "https://*.1drv.com", "https://*.sharepoint.com", "https://*.microsoftpersonalcontent.com"],
        frameSrc: ["'self'", "https://*.1drv.com", "https://*.sharepoint.com", "https://*.microsoftpersonalcontent.com"],
        connectSrc: ["'self'", "https://*.up.1drv.com", "https://*.1drv.com", "https://*.sharepoint.com"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        workerSrc: ["'none'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: config.nodeEnv === "production" ? [] : null,
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  }));
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use(cookieParser());

  const publicOrigin = new URL(config.publicAppUrl).origin;
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      const fetchSite = req.get("sec-fetch-site");
      if ((origin && origin !== publicOrigin) || fetchSite === "cross-site") {
        return res.status(403).json({ error: { code: "ORIGIN_REJECTED", message: "El origen de la solicitud no está permitido." } });
      }
    }
    next();
  });

  app.use((req, res, next) => {
    if (req.path === "/album" || req.path.startsWith("/album/")) res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    next();
  });

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const value = verifyPayload<AdminSession>(req.cookies?.[ADMIN_COOKIE], config.cookieSecret);
    if (!value?.admin || value.exp <= Date.now()) return res.status(401).json({ error: { code: "ADMIN_REQUIRED", message: "Sesión de administración requerida." } });
    next();
  };

  const readAccess = (req: Request) => {
    const value = verifyPayload<AccessGrant>(req.cookies?.[ACCESS_COOKIE], config.cookieSecret);
    return value?.granted && value.exp > Date.now() ? value : null;
  };

  const readGuest = (req: Request) => {
    const value = verifyPayload<GuestIdentity>(req.cookies?.[GUEST_COOKIE], config.cookieSecret);
    return value?.guestId && value.displayName && value.exp > Date.now() ? value : null;
  };

  const requireAccess = (req: Request, res: Response, next: NextFunction) => {
    if (!readAccess(req)) return res.status(401).json({ error: { code: "ACCESS_REQUIRED", message: "Enlace de acceso no válido o caducado." } });
    next();
  };

  const requireGuest = (req: Request, res: Response, next: NextFunction) => {
    if (!readAccess(req)) return res.status(401).json({ error: { code: "ACCESS_REQUIRED", message: "Enlace de acceso no válido o caducado." } });
    if (!readGuest(req)) return res.status(401).json({ error: { code: "GUEST_REQUIRED", message: "Identidad de invitado requerida." } });
    next();
  };

  app.get("/api/health", (_req, res) => res.json({ ok: true, storage: config.mysql ? "mysql" : "memory" }));

  app.post("/api/album/access", limiter(10), (req, res) => {
    const parsed = z.object({ accessToken: z.string().min(1).max(1024) }).safeParse(req.body);
    if (!parsed.success || !config.albumAccessToken || !constantTimeEqual(parsed.data.accessToken, config.albumAccessToken)) {
      return res.status(401).json({ error: { code: "ACCESS_INVALID", message: "El enlace de acceso no es válido." } });
    }
    const maxAge = 30 * 24 * 60 * 60_000;
    const grant: AccessGrant = { granted: true, exp: Date.now() + maxAge };
    res.cookie(ACCESS_COOKIE, signPayload(grant, config.cookieSecret), cookieOptions(config, maxAge));
    res.status(204).end();
  });

  app.get("/api/album/session", (req, res) => {
    const hasAccess = Boolean(readAccess(req));
    const guest = hasAccess ? readGuest(req) : null;
    res.json({ hasAccess, guest: guest ? { guestId: guest.guestId, displayName: guest.displayName } : null });
  });

  app.post("/api/album/guest", requireAccess, limiter(20), (req, res) => {
    const displayName = parseDisplayName(req.body);
    if (!displayName) {
      return res.status(400).json({ error: { code: "GUEST_NAME_INVALID", message: "Escribe un nombre de entre 1 y 80 caracteres." } });
    }
    const maxAge = 180 * 24 * 60 * 60_000;
    const existingGuest = readGuest(req);
    const guest: GuestIdentity = { guestId: existingGuest?.guestId ?? randomUUID(), displayName, exp: Date.now() + maxAge };
    res.cookie(GUEST_COOKIE, signPayload(guest, config.cookieSecret), cookieOptions(config, maxAge));
    res.status(201).json({ guest: { guestId: guest.guestId, displayName: guest.displayName } });
  });

  app.patch("/api/album/guest", requireGuest, limiter(20), (req, res) => {
    const displayName = parseDisplayName(req.body);
    if (!displayName) {
      return res.status(400).json({ error: { code: "GUEST_NAME_INVALID", message: "Escribe un nombre de entre 1 y 80 caracteres." } });
    }
    const currentGuest = readGuest(req)!;
    const maxAge = 180 * 24 * 60 * 60_000;
    const guest: GuestIdentity = { guestId: currentGuest.guestId, displayName, exp: Date.now() + maxAge };
    res.cookie(GUEST_COOKIE, signPayload(guest, config.cookieSecret), cookieOptions(config, maxAge));
    res.json({ guest: { guestId: guest.guestId, displayName: guest.displayName } });
  });

  app.delete("/api/album/guest", requireAccess, (_req, res) => {
    clearCookie(res, GUEST_COOKIE, config);
    res.status(204).end();
  });

  app.get("/api/album/media", requireGuest, limiter(120, 60_000), async (req, res, next) => {
    const parsed = z.object({
      cursor: z.string().max(2048).optional(),
      order: z.enum(["newest", "oldest"]).default("newest"),
      scope: z.enum(["all", "mine"]).default("all"),
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: { code: "CURSOR_INVALID", message: "La página solicitada no es válida." } });
    try {
      const guest = readGuest(req)!;
      const scope: MediaScope = parsed.data.scope;
      const page = await store.listVisibleMedia(20, parsed.data.cursor, parsed.data.order, scope === "mine" ? guest.guestId : undefined);
      const itemIds = page.items.flatMap(item => item.onedriveItemId ? [item.onedriveItemId] : []);
      const thumbnails = itemIds.length ? await graph.getThumbnails(itemIds) : new Map<string, string>();
      res.json({
        items: page.items.map(item => ({
          id: item.id,
          guestName: item.guestName,
          originalName: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          createdAt: item.createdAt,
          isOwner: item.guestId === guest.guestId,
          thumbnailUrl: item.onedriveItemId ? thumbnails.get(item.onedriveItemId) ?? null : null,
        })),
        nextCursor: page.nextCursor,
      });
    } catch (error) { next(error); }
  });

  app.get("/api/album/media/:mediaId/source", requireGuest, limiter(120, 60_000), async (req, res, next) => {
    const parsed = z.object({ mediaId: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: { code: "MEDIA_INVALID", message: "El recuerdo solicitado no es válido." } });
    try {
      const media = await store.getMedia(parsed.data.mediaId);
      if (!media || media.status !== "visible" || !media.onedriveItemId) return res.status(404).json({ error: { code: "MEDIA_NOT_FOUND", message: "No se encontró el recuerdo." } });
      const url = await graph.getDownloadUrl(media.onedriveItemId);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ url, filename: media.originalName, mimeType: media.mimeType });
    } catch (error) { next(error); }
  });

  app.delete("/api/album/media/:mediaId", requireGuest, limiter(30, 60_000), async (req, res, next) => {
    const parsed = z.object({ mediaId: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: { code: "MEDIA_INVALID", message: "El recuerdo solicitado no es válido." } });
    try {
      const guest = readGuest(req)!;
      const media = await store.getMedia(parsed.data.mediaId);
      if (!media || media.guestId !== guest.guestId) return res.status(404).json({ error: { code: "MEDIA_NOT_FOUND", message: "No se encontró el recuerdo." } });
      if (media.status === "deleted") return res.status(204).end();
      if (media.status !== "visible" || !media.onedriveItemId) return res.status(404).json({ error: { code: "MEDIA_NOT_FOUND", message: "No se encontró el recuerdo." } });
      await graph.deleteItem(media.onedriveItemId);
      await store.updateMedia(media.id, { status: "deleted", updatedAt: new Date().toISOString() });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get("/api/album/uploads/policy", requireGuest, (_req, res) => {
    res.json({
      maxFileBytes: config.maxFileBytes,
      maxBatchFiles: config.maxBatchFiles,
      chunkBytes: uploadChunkBytes,
      parallelFiles: parallelUploadFiles,
      acceptedTypes: acceptedMediaTypes,
      acceptedExtensions: acceptedMediaExtensions,
      genericTypes: genericMediaTypes,
      typeExtensions: mediaTypeExtensions,
    });
  });

  app.post("/api/album/uploads/session", requireGuest, limiter(60, 60_000), async (req, res, next) => {
    const parsed = z.object({
      originalName: z.string().min(1).max(512),
      mimeType: z.string().max(127),
      size: z.number().int().positive(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "UPLOAD_INVALID", message: "Los datos del archivo no son válidos." } });
    const { originalName, mimeType, size } = parsed.data;
    if (size > config.maxFileBytes) return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "El archivo supera el tamaño máximo permitido." } });
    if (!isAcceptedMedia(originalName, mimeType)) return res.status(415).json({ error: { code: "MEDIA_TYPE_UNSUPPORTED", message: "Solo se admiten fotografías y vídeos compatibles." } });
    const guest = readGuest(req)!;
    const mediaId = randomUUID();
    const safeOriginalName = sanitizeOriginalName(originalName);
    const storedName = createStoredName(mediaId, safeOriginalName);
    const now = new Date().toISOString();
    try {
      if (!(await graph.hasUploadCapacity(size))) return res.status(507).json({ error: { code: "ONEDRIVE_CAPACITY_RESERVED", message: "El álbum no tiene espacio disponible para este archivo." } });
      await store.createMedia({
        id: mediaId,
        guestId: guest.guestId,
        guestName: guest.displayName,
        originalName: safeOriginalName,
        storedName,
        mimeType: normalizedMediaType(originalName, mimeType),
        size,
        onedriveItemId: null,
        status: "uploading",
        createdAt: now,
        updatedAt: now,
      });
      try {
        const session = await graph.createUploadSession(storedName, size);
        return res.status(201).json({ mediaId, storedName, ...session });
      } catch (error) {
        await store.updateMedia(mediaId, { status: "failed", updatedAt: new Date().toISOString() });
        throw error;
      }
    } catch (error) { next(error); }
  });

  app.post("/api/album/uploads/:mediaId/complete", requireGuest, limiter(120, 60_000), async (req, res, next) => {
    const params = z.object({ mediaId: z.string().uuid() }).safeParse(req.params);
    const body = z.object({ itemId: z.string().min(1).max(255) }).safeParse(req.body);
    if (!params.success || !body.success) return res.status(400).json({ error: { code: "UPLOAD_COMPLETION_INVALID", message: "No se pudo validar la subida." } });
    try {
      const guest = readGuest(req)!;
      const media = await store.getMedia(params.data.mediaId);
      if (!media || media.guestId !== guest.guestId) return res.status(404).json({ error: { code: "MEDIA_NOT_FOUND", message: "No se encontró la subida." } });
      if (media.status === "visible") return res.json({ mediaId: media.id, status: media.status });
      if (media.status !== "uploading") return res.status(409).json({ error: { code: "UPLOAD_NOT_ACTIVE", message: "La subida ya no está activa." } });
      await graph.validateCompletedItem(body.data.itemId, media.storedName, media.size);
      await store.updateMedia(media.id, { onedriveItemId: body.data.itemId, status: "visible", updatedAt: new Date().toISOString() });
      res.json({ mediaId: media.id, status: "visible" });
    } catch (error) { next(error); }
  });

  app.post("/api/album/uploads/:mediaId/fail", requireGuest, limiter(120, 60_000), async (req, res, next) => {
    const parsed = z.object({ mediaId: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: { code: "UPLOAD_INVALID", message: "La subida no es válida." } });
    try {
      const guest = readGuest(req)!;
      const media = await store.getMedia(parsed.data.mediaId);
      if (!media || media.guestId !== guest.guestId) return res.status(404).json({ error: { code: "MEDIA_NOT_FOUND", message: "No se encontró la subida." } });
      if (media.status === "uploading") await store.updateMedia(media.id, { status: "failed", updatedAt: new Date().toISOString() });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.post("/api/admin/session", limiter(5), (req, res) => {
    const parsed = z.object({ adminKey: z.string().min(1).max(512) }).safeParse(req.body);
    if (!parsed.success || !config.adminKey || !constantTimeEqual(parsed.data.adminKey, config.adminKey)) {
      return res.status(401).json({ error: { code: "ADMIN_INVALID", message: "Clave de administración incorrecta." } });
    }
    const session: AdminSession = { admin: true, exp: Date.now() + 15 * 60_000 };
    res.cookie(ADMIN_COOKIE, signPayload(session, config.cookieSecret), cookieOptions(config, 15 * 60_000));
    res.status(204).end();
  });

  app.delete("/api/admin/session", (_req, res) => {
    clearCookie(res, ADMIN_COOKIE, config);
    res.status(204).end();
  });

  app.get("/api/admin/microsoft/status", requireAdmin, async (_req, res, next) => {
    try { res.json({ connected: await graph.isConnected() }); } catch (error) { next(error); }
  });

  app.get("/api/admin/microsoft/connect", requireAdmin, (req, res, next) => {
    try {
      const pkce = createPkceAttempt();
      const attempt: OAuthAttempt = { state: pkce.state, codeVerifier: pkce.codeVerifier, exp: Date.now() + 10 * 60_000 };
      res.cookie(OAUTH_COOKIE, signPayload(attempt, config.cookieSecret), cookieOptions(config, 10 * 60_000));
      res.redirect(graph.buildAuthorizeUrl(pkce.state, pkce.codeChallenge));
    } catch (error) { next(error); }
  });

  app.get("/api/admin/microsoft/callback", async (req, res, next) => {
    try {
      const attempt = verifyPayload<OAuthAttempt>(req.cookies?.[OAUTH_COOKIE], config.cookieSecret);
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!attempt || attempt.exp <= Date.now() || !code || !state || !constantTimeEqual(state, attempt.state)) {
        return res.status(400).send("La conexión con OneDrive no se pudo validar. Vuelve al panel e inténtalo de nuevo.");
      }
      await graph.exchangeAuthorizationCode(code, attempt.codeVerifier);
      clearCookie(res, OAUTH_COOKIE, config);
      res.redirect(`${config.publicAppUrl}/album/admin?connected=1`);
    } catch (error) { next(error); }
  });

  app.post("/api/admin/microsoft/test", requireAdmin, limiter(10, 60_000), async (_req, res, next) => {
    try { res.json(await graph.testConnection()); } catch (error) { next(error); }
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "La ruta solicitada no existe." } }));

  if (config.nodeEnv === "production" && existsSync(path.join(frontendPath, "index.html"))) {
    app.use(express.static(frontendPath, { index: false, maxAge: "1y", immutable: true }));
    app.get(["/", "/album", "/album/", "/album/admin", "/album/admin/"], (_req, res, next) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(frontendPath, "index.html"), error => { if (error) next(error); });
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof GraphError) {
      const status = error.status === 401 || error.status === 403 ? 503 : Math.min(Math.max(error.status, 400), 599);
      const message = error.code === "ONEDRIVE_DISCONNECTED" ? "OneDrive no está conectado." : "No se pudo completar la operación con OneDrive.";
      return res.status(status).json({ error: { code: error.code, message } });
    }
    if (error instanceof SyntaxError) return res.status(400).json({ error: { code: "INVALID_JSON", message: "La solicitud no es válida." } });
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Ha ocurrido un error inesperado." } });
  });

  return app;
}
