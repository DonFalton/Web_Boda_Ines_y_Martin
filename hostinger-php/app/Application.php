<?php

declare(strict_types=1);

namespace Album\Hostinger;

final class Application
{
    private const ADMIN_COOKIE = 'album_admin';
    private const OAUTH_COOKIE = 'album_oauth';
    private const ACCESS_COOKIE = 'album_access';
    private const GUEST_COOKIE = 'album_guest';

    public function __construct(
        private readonly Config $config,
        private readonly Store $store,
        private readonly Graph $graph,
        private readonly RateLimiter $limiter,
    ) {
    }

    public function run(Request $request): never
    {
        Response::securityHeaders(str_starts_with($request->path, '/album'));
        try {
            if ($request->invalidJson) {
                Response::error(400, 'INVALID_JSON', 'La solicitud no es válida.');
            }
            $this->enforceOrigin($request);
            $method = $request->method;
            $path = rtrim($request->path, '/') ?: '/';

            if ($method === 'GET' && $path === '/api/health') {
                Response::json(200, ['ok' => true, 'storage' => 'mysql']);
            }
            if ($method === 'POST' && $path === '/api/album/access') {
                $this->rate($request, 'access', 10, 900);
                $this->exchangeAccess($request);
            }
            if ($method === 'GET' && $path === '/api/album/session') {
                $this->session($request);
            }
            if ($method === 'POST' && $path === '/api/album/guest') {
                $this->requireAccess($request);
                $this->rate($request, 'guest-create', 20, 900);
                $this->createGuest($request);
            }
            if ($method === 'PATCH' && $path === '/api/album/guest') {
                $guest = $this->requireGuest($request);
                $this->rate($request, 'guest-update', 20, 900);
                $this->updateGuest($request, $guest);
            }
            if ($method === 'DELETE' && $path === '/api/album/guest') {
                $this->requireAccess($request);
                Response::clearCookie(self::GUEST_COOKIE);
                Response::noContent();
            }
            if ($method === 'GET' && $path === '/api/album/media') {
                $guest = $this->requireGuest($request);
                $this->rate($request, 'gallery', 120, 60);
                $this->gallery($request, $guest);
            }
            if ($method === 'GET' && preg_match('#^/api/album/media/([^/]+)/source$#', $path, $matches)) {
                $this->requireGuest($request);
                $this->rate($request, 'source', 120, 60);
                $this->mediaSource($matches[1]);
            }
            if ($method === 'DELETE' && preg_match('#^/api/album/media/([^/]+)$#', $path, $matches)) {
                $guest = $this->requireGuest($request);
                $this->rate($request, 'media-delete', 30, 60);
                $this->deleteMedia($matches[1], $guest);
            }
            if ($method === 'GET' && $path === '/api/album/uploads/policy') {
                $this->requireGuest($request);
                $this->uploadPolicy();
            }
            if ($method === 'POST' && $path === '/api/album/uploads/session') {
                $guest = $this->requireGuest($request);
                $this->rate($request, 'upload-session', 60, 60);
                $this->createUploadSession($request, $guest);
            }
            if ($method === 'POST' && preg_match('#^/api/album/uploads/([^/]+)/complete$#', $path, $matches)) {
                $guest = $this->requireGuest($request);
                $this->rate($request, 'upload-complete', 120, 60);
                $this->completeUpload($request, $matches[1], $guest);
            }
            if ($method === 'POST' && preg_match('#^/api/album/uploads/([^/]+)/fail$#', $path, $matches)) {
                $guest = $this->requireGuest($request);
                $this->rate($request, 'upload-fail', 120, 60);
                $this->failUpload($matches[1], $guest);
            }
            if ($method === 'POST' && $path === '/api/admin/session') {
                $this->rate($request, 'admin-session', 5, 900);
                $this->createAdminSession($request);
            }
            if ($method === 'DELETE' && $path === '/api/admin/session') {
                Response::clearCookie(self::ADMIN_COOKIE);
                Response::noContent();
            }
            if ($method === 'GET' && $path === '/api/admin/microsoft/status') {
                $this->requireAdmin($request);
                Response::json(200, ['connected' => $this->graph->isConnected()]);
            }
            if ($method === 'GET' && $path === '/api/admin/microsoft/connect') {
                $this->requireAdmin($request);
                $this->connectMicrosoft();
            }
            if ($method === 'GET' && $path === '/api/admin/microsoft/callback') {
                $this->microsoftCallback($request);
            }
            if ($method === 'POST' && $path === '/api/admin/microsoft/test') {
                $this->requireAdmin($request);
                $this->rate($request, 'admin-test', 10, 60);
                Response::json(200, $this->graph->testConnection());
            }
            Response::error(404, 'NOT_FOUND', 'La ruta solicitada no existe.');
        } catch (GraphException $error) {
            $status = in_array($error->status, [401, 403], true) ? 503 : min(max($error->status, 400), 599);
            $message = $error->graphCode === 'ONEDRIVE_DISCONNECTED'
                ? 'OneDrive no está conectado.'
                : 'No se pudo completar la operación con OneDrive.';
            Response::error($status, $error->graphCode, $message);
        } catch (\InvalidArgumentException) {
            Response::error(400, 'CURSOR_INVALID', 'La página solicitada no es válida.');
        } catch (\Throwable $error) {
            error_log('[album] ' . $error::class . ': operation failed');
            Response::error(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado.');
        }
    }

    private function exchangeAccess(Request $request): never
    {
        $token = is_array($request->json) ? ($request->json['accessToken'] ?? null) : null;
        if (!is_string($token) || strlen($token) > 1024 || !Crypto::constantTimeEqual($token, $this->config->required('ALBUM_ACCESS_TOKEN'))) {
            Response::error(401, 'ACCESS_INVALID', 'El enlace de acceso no es válido.');
        }
        $seconds = 30 * 24 * 60 * 60;
        Response::signedCookie(self::ACCESS_COOKIE, ['granted' => true, 'exp' => self::nowMs() + $seconds * 1000], $this->config, $seconds);
        Response::noContent();
    }

    private function session(Request $request): never
    {
        $access = $this->readAccess($request);
        $guest = $access !== null ? $this->readGuest($request) : null;
        Response::json(200, [
            'hasAccess' => $access !== null,
            'guest' => $guest !== null ? ['guestId' => $guest['guestId'], 'displayName' => $guest['displayName']] : null,
        ]);
    }

    private function createGuest(Request $request): never
    {
        $name = Media::normalizeDisplayName(is_array($request->json) ? ($request->json['displayName'] ?? null) : null);
        if ($name === null) {
            Response::error(400, 'GUEST_NAME_INVALID', 'Escribe un nombre de entre 1 y 80 caracteres.');
        }
        $existing = $this->readGuest($request);
        $this->setGuest($existing['guestId'] ?? Media::uuid(), $name, 201);
    }

    /** @param array<string,mixed> $guest */
    private function updateGuest(Request $request, array $guest): never
    {
        $name = Media::normalizeDisplayName(is_array($request->json) ? ($request->json['displayName'] ?? null) : null);
        if ($name === null) {
            Response::error(400, 'GUEST_NAME_INVALID', 'Escribe un nombre de entre 1 y 80 caracteres.');
        }
        $this->setGuest((string) $guest['guestId'], $name, 200);
    }

    private function setGuest(string $guestId, string $name, int $status): never
    {
        $seconds = 180 * 24 * 60 * 60;
        Response::signedCookie(self::GUEST_COOKIE, [
            'guestId' => $guestId,
            'displayName' => $name,
            'exp' => self::nowMs() + $seconds * 1000,
        ], $this->config, $seconds);
        Response::json($status, ['guest' => ['guestId' => $guestId, 'displayName' => $name]]);
    }

    /** @param array<string,mixed> $guest */
    private function gallery(Request $request, array $guest): never
    {
        $sort = $request->query['sort'] ?? 'uploaded';
        $direction = $request->query['direction'] ?? 'desc';
        $kind = $request->query['kind'] ?? 'all';
        $scope = $request->query['scope'] ?? 'all';
        $order = $request->query['order'] ?? null;
        if (!in_array($sort, ['uploaded', 'captured', 'type', 'guest'], true)
            || !in_array($direction, ['asc', 'desc'], true)
            || !in_array($kind, ['all', 'image', 'video'], true)
            || !in_array($scope, ['all', 'mine'], true)
            || ($order !== null && !in_array($order, ['newest', 'oldest'], true))
            || strlen($request->query['cursor'] ?? '') > 2048
        ) {
            Response::error(400, 'CURSOR_INVALID', 'La página solicitada no es válida.');
        }
        if ($order !== null) {
            $sort = 'uploaded';
            $direction = $order === 'newest' ? 'desc' : 'asc';
        }
        $page = $this->store->listVisibleMedia(20, $request->query['cursor'] ?? null, [
            'sort' => $sort,
            'direction' => $direction,
            'kind' => $kind,
            'ownerGuestId' => $scope === 'mine' ? (string) $guest['guestId'] : null,
        ]);
        $ids = [];
        foreach ($page['items'] as $item) {
            if (is_string($item['onedriveItemId'] ?? null)) {
                $ids[] = $item['onedriveItemId'];
            }
        }
        $thumbnails = $ids !== [] ? $this->graph->getThumbnails($ids) : [];
        $items = array_map(static fn (array $item): array => [
            'id' => $item['id'],
            'guestName' => $item['guestName'],
            'originalName' => $item['originalName'],
            'mimeType' => $item['mimeType'],
            'size' => $item['size'],
            'capturedAt' => $item['capturedAt'],
            'captureSource' => $item['captureSource'],
            'createdAt' => $item['createdAt'],
            'isOwner' => $item['guestId'] === $guest['guestId'],
            'thumbnailUrl' => is_string($item['onedriveItemId'] ?? null) ? ($thumbnails[$item['onedriveItemId']] ?? null) : null,
        ], $page['items']);
        Response::json(200, ['items' => $items, 'nextCursor' => $page['nextCursor']]);
    }

    private function mediaSource(string $mediaId): never
    {
        $this->assertUuid($mediaId, 'MEDIA_INVALID', 'El recuerdo solicitado no es válido.');
        $media = $this->store->getMedia($mediaId);
        if ($media === null || $media['status'] !== 'visible' || !is_string($media['onedriveItemId'])) {
            Response::error(404, 'MEDIA_NOT_FOUND', 'No se encontró el recuerdo.');
        }
        Response::json(200, [
            'url' => $this->graph->getDownloadUrl($media['onedriveItemId']),
            'filename' => $media['originalName'],
            'mimeType' => $media['mimeType'],
        ]);
    }

    /** @param array<string,mixed> $guest */
    private function deleteMedia(string $mediaId, array $guest): never
    {
        $this->assertUuid($mediaId, 'MEDIA_INVALID', 'El recuerdo solicitado no es válido.');
        $media = $this->store->getMedia($mediaId);
        if ($media === null || $media['guestId'] !== $guest['guestId']) {
            Response::error(404, 'MEDIA_NOT_FOUND', 'No se encontró el recuerdo.');
        }
        if ($media['status'] === 'deleted') {
            Response::noContent();
        }
        if ($media['status'] !== 'visible' || !is_string($media['onedriveItemId'])) {
            Response::error(404, 'MEDIA_NOT_FOUND', 'No se encontró el recuerdo.');
        }
        $this->graph->deleteItem($media['onedriveItemId']);
        $this->store->updateMedia($mediaId, ['status' => 'deleted', 'updatedAt' => self::now()]);
        Response::noContent();
    }

    private function uploadPolicy(): never
    {
        Response::json(200, [
            'maxFileBytes' => $this->config->integer('MAX_FILE_BYTES', 16_106_127_360),
            'maxBatchFiles' => $this->config->integer('MAX_BATCH_FILES', 50),
            'chunkBytes' => Media::CHUNK_BYTES,
            'parallelFiles' => Media::PARALLEL_FILES,
            'acceptedTypes' => array_keys(Media::TYPE_EXTENSIONS),
            'acceptedExtensions' => Media::extensions(),
            'genericTypes' => Media::GENERIC_TYPES,
            'typeExtensions' => Media::TYPE_EXTENSIONS,
        ]);
    }

    /** @param array<string,mixed> $guest */
    private function createUploadSession(Request $request, array $guest): never
    {
        $body = is_array($request->json) ? $request->json : [];
        $name = $body['originalName'] ?? null;
        $mime = $body['mimeType'] ?? null;
        $size = $body['size'] ?? null;
        $capturedAt = $body['capturedAt'] ?? null;
        $captureSource = $body['captureSource'] ?? 'unknown';
        if (!is_string($name) || $name === '' || strlen($name) > 512
            || !is_string($mime) || strlen($mime) > 127
            || !(is_int($size) || (is_float($size) && floor($size) === $size)) || $size <= 0
            || !in_array($captureSource, ['embedded', 'file_modified', 'unknown'], true)
            || !($capturedAt === null || is_string($capturedAt))
        ) {
            Response::error(400, 'UPLOAD_INVALID', 'Los datos del archivo no son válidos.');
        }
        $captureTime = is_string($capturedAt) ? strtotime($capturedAt) : false;
        $captureValid = $capturedAt === null
            ? $captureSource === 'unknown'
            : $captureSource !== 'unknown' && $captureTime !== false && $captureTime >= 0 && $captureTime <= time() + 86400;
        if (!$captureValid) {
            Response::error(400, 'UPLOAD_CAPTURE_DATE_INVALID', 'La fecha del archivo no es válida.');
        }
        if ($size > $this->config->integer('MAX_FILE_BYTES', 16_106_127_360)) {
            Response::error(413, 'FILE_TOO_LARGE', 'El archivo supera el tamaño máximo permitido.');
        }
        if (!Media::accepted($name, $mime)) {
            Response::error(415, 'MEDIA_TYPE_UNSUPPORTED', 'Solo se admiten fotografías y vídeos compatibles.');
        }
        if (!$this->graph->hasUploadCapacity((int) $size)) {
            Response::error(507, 'ONEDRIVE_CAPACITY_RESERVED', 'El álbum no tiene espacio disponible para este archivo.');
        }
        $id = Media::uuid();
        $safeName = Media::sanitizeName($name);
        $storedName = Media::storedName($id, $safeName);
        $now = self::now();
        $this->store->createMedia([
            'id' => $id,
            'guestId' => $guest['guestId'],
            'guestName' => $guest['displayName'],
            'originalName' => $safeName,
            'storedName' => $storedName,
            'mimeType' => Media::normalizedType($name, $mime),
            'size' => (int) $size,
            'capturedAt' => is_string($capturedAt) ? (new \DateTimeImmutable($capturedAt))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z') : null,
            'captureSource' => $captureSource,
            'onedriveItemId' => null,
            'status' => 'uploading',
            'createdAt' => $now,
            'updatedAt' => $now,
        ]);
        try {
            $session = $this->graph->createUploadSession($storedName);
        } catch (\Throwable $error) {
            $this->store->updateMedia($id, ['status' => 'failed', 'updatedAt' => self::now()]);
            throw $error;
        }
        Response::json(201, ['mediaId' => $id, 'storedName' => $storedName, ...$session]);
    }

    /** @param array<string,mixed> $guest */
    private function completeUpload(Request $request, string $mediaId, array $guest): never
    {
        $itemId = is_array($request->json) ? ($request->json['itemId'] ?? null) : null;
        if (!Media::validUuid($mediaId) || !is_string($itemId) || $itemId === '' || strlen($itemId) > 255) {
            Response::error(400, 'UPLOAD_COMPLETION_INVALID', 'No se pudo validar la subida.');
        }
        $media = $this->store->getMedia($mediaId);
        if ($media === null || $media['guestId'] !== $guest['guestId']) {
            Response::error(404, 'MEDIA_NOT_FOUND', 'No se encontró la subida.');
        }
        if ($media['status'] === 'visible') {
            Response::json(200, ['mediaId' => $mediaId, 'status' => 'visible']);
        }
        if ($media['status'] !== 'uploading') {
            Response::error(409, 'UPLOAD_NOT_ACTIVE', 'La subida ya no está activa.');
        }
        $completed = $this->graph->validateCompletedItem($itemId, $media['storedName'], $media['size']);
        $patch = ['onedriveItemId' => $itemId, 'status' => 'visible', 'updatedAt' => self::now()];
        if ($completed['capturedAt'] !== null) {
            $patch['capturedAt'] = $completed['capturedAt'];
            $patch['captureSource'] = 'embedded';
        }
        $this->store->updateMedia($mediaId, $patch);
        Response::json(200, ['mediaId' => $mediaId, 'status' => 'visible']);
    }

    /** @param array<string,mixed> $guest */
    private function failUpload(string $mediaId, array $guest): never
    {
        $this->assertUuid($mediaId, 'UPLOAD_INVALID', 'La subida no es válida.');
        $media = $this->store->getMedia($mediaId);
        if ($media === null || $media['guestId'] !== $guest['guestId']) {
            Response::error(404, 'MEDIA_NOT_FOUND', 'No se encontró la subida.');
        }
        if ($media['status'] === 'uploading') {
            $this->store->updateMedia($mediaId, ['status' => 'failed', 'updatedAt' => self::now()]);
        }
        Response::noContent();
    }

    private function createAdminSession(Request $request): never
    {
        $key = is_array($request->json) ? ($request->json['adminKey'] ?? null) : null;
        if (!is_string($key) || strlen($key) > 512 || !Crypto::constantTimeEqual($key, $this->config->required('ADMIN_KEY'))) {
            Response::error(401, 'ADMIN_INVALID', 'Clave de administración incorrecta.');
        }
        Response::signedCookie(self::ADMIN_COOKIE, ['admin' => true, 'exp' => self::nowMs() + 900_000], $this->config, 900);
        Response::noContent();
    }

    private function connectMicrosoft(): never
    {
        $pkce = Crypto::createPkceAttempt();
        Response::signedCookie(self::OAUTH_COOKIE, [
            'state' => $pkce['state'],
            'codeVerifier' => $pkce['codeVerifier'],
            'exp' => self::nowMs() + 600_000,
        ], $this->config, 600);
        Response::redirect($this->graph->buildAuthorizeUrl($pkce['state'], $pkce['codeChallenge']));
    }

    private function microsoftCallback(Request $request): never
    {
        $attempt = $this->cookie($request, self::OAUTH_COOKIE);
        $code = $request->query['code'] ?? '';
        $state = $request->query['state'] ?? '';
        if ($attempt === null || (int) ($attempt['exp'] ?? 0) <= self::nowMs()
            || !is_string($attempt['state'] ?? null) || !is_string($attempt['codeVerifier'] ?? null)
            || $code === '' || $state === '' || !Crypto::constantTimeEqual($state, $attempt['state'])
        ) {
            Response::text(400, 'La conexión con OneDrive no se pudo validar. Vuelve al panel e inténtalo de nuevo.');
        }
        $this->graph->exchangeAuthorizationCode($code, $attempt['codeVerifier']);
        Response::clearCookie(self::OAUTH_COOKIE);
        Response::redirect(rtrim($this->config->required('PUBLIC_APP_URL'), '/') . '/album/admin?connected=1');
    }

    /** @return array<string,mixed> */
    private function requireGuest(Request $request): array
    {
        $this->requireAccess($request);
        $guest = $this->readGuest($request);
        if ($guest === null) {
            Response::error(401, 'GUEST_REQUIRED', 'Identidad de invitado requerida.');
        }
        return $guest;
    }

    private function requireAccess(Request $request): void
    {
        if ($this->readAccess($request) === null) {
            Response::error(401, 'ACCESS_REQUIRED', 'Enlace de acceso no válido o caducado.');
        }
    }

    private function requireAdmin(Request $request): void
    {
        $admin = $this->cookie($request, self::ADMIN_COOKIE);
        if (($admin['admin'] ?? false) !== true || (int) ($admin['exp'] ?? 0) <= self::nowMs()) {
            Response::error(401, 'ADMIN_REQUIRED', 'Sesión de administración requerida.');
        }
    }

    /** @return array<string,mixed>|null */
    private function readAccess(Request $request): ?array
    {
        $value = $this->cookie($request, self::ACCESS_COOKIE);
        return ($value['granted'] ?? false) === true && (int) ($value['exp'] ?? 0) > self::nowMs() ? $value : null;
    }

    /** @return array<string,mixed>|null */
    private function readGuest(Request $request): ?array
    {
        $value = $this->cookie($request, self::GUEST_COOKIE);
        return is_string($value['guestId'] ?? null) && is_string($value['displayName'] ?? null) && (int) ($value['exp'] ?? 0) > self::nowMs()
            ? $value
            : null;
    }

    /** @return array<string,mixed>|null */
    private function cookie(Request $request, string $name): ?array
    {
        return Crypto::verifyPayload($request->cookies[$name] ?? null, $this->config->required('COOKIE_SECRET'));
    }

    private function enforceOrigin(Request $request): void
    {
        if (!in_array($request->method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return;
        }
        $expected = self::origin($this->config->required('PUBLIC_APP_URL'));
        $origin = $request->header('origin');
        if (($origin !== null && $origin !== $expected) || strtolower($request->header('sec-fetch-site') ?? '') === 'cross-site') {
            Response::error(403, 'ORIGIN_REJECTED', 'El origen de la solicitud no está permitido.');
        }
    }

    private function rate(Request $request, string $bucket, int $limit, int $window): void
    {
        if (!$this->limiter->check($bucket, $request->ip, $limit, $window)) {
            Response::error(429, 'RATE_LIMITED', 'Demasiados intentos. Espera unos minutos.');
        }
    }

    private function assertUuid(string $id, string $code, string $message): void
    {
        if (!Media::validUuid($id)) {
            Response::error(400, $code, $message);
        }
    }

    private static function origin(string $url): string
    {
        $parts = parse_url($url);
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        return strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']) . $port;
    }

    private static function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    private static function now(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }
}
