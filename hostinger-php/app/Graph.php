<?php

declare(strict_types=1);

namespace Album\Hostinger;

final class GraphException extends \RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $graphCode)
    {
        parent::__construct('Microsoft Graph request failed.');
    }
}

/**
 * Microsoft Graph adapter for shared PHP hosting.
 *
 * File bytes never pass through PHP: this class only creates upload sessions
 * and returns temporary Microsoft content URLs to the existing React client.
 */
final class Graph
{
    /** @var array{value:string,expiresAt:int}|null */
    private ?array $accessToken = null;
    /** @var array{id:string,expiresAt:int}|null */
    private ?array $folder = null;
    /** @var array{remaining:int,expiresAt:int}|null */
    private ?array $quota = null;

    /** @param null|\Closure(string,string,list<string>,?string,bool):array{status:int,headers:array<string,string>,body:string} $transport */
    public function __construct(
        private readonly Config $config,
        private readonly Store $store,
        private readonly ?\Closure $transport = null,
    ) {
    }

    public function isConnected(): bool
    {
        return $this->store->getOAuthToken() !== null;
    }

    public function buildAuthorizeUrl(string $state, string $codeChallenge): string
    {
        return 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?' . http_build_query([
            'client_id' => $this->config->required('MICROSOFT_CLIENT_ID'),
            'response_type' => 'code',
            'redirect_uri' => $this->config->required('MICROSOFT_REDIRECT_URI'),
            'response_mode' => 'query',
            'scope' => 'offline_access https://graph.microsoft.com/Files.ReadWrite',
            'state' => $state,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    public function exchangeAuthorizationCode(string $code, string $codeVerifier): void
    {
        $token = $this->requestToken([
            'client_id' => $this->config->required('MICROSOFT_CLIENT_ID'),
            'client_secret' => $this->config->required('MICROSOFT_CLIENT_SECRET'),
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $this->config->required('MICROSOFT_REDIRECT_URI'),
            'code_verifier' => $codeVerifier,
            'scope' => 'offline_access https://graph.microsoft.com/Files.ReadWrite',
        ]);
        $refresh = $token['refresh_token'] ?? null;
        if (!is_string($refresh) || $refresh === '') {
            throw new GraphException(502, 'MICROSOFT_REFRESH_TOKEN_MISSING');
        }
        $this->store->saveOAuthToken(
            Crypto::encryptToken($refresh, $this->config->required('TOKEN_ENCRYPTION_KEY')),
            self::now(),
        );
        $this->cacheAccessToken($token);
    }

    /** @return array{ok:true,itemName:string} */
    public function testConnection(): array
    {
        $folderId = $this->ensureFolder();
        $filename = 'codex-onedrive-test.txt';
        $content = "Conexión OneDrive del álbum verificada.\n";
        $response = $this->http(
            'PUT',
            'https://graph.microsoft.com/v1.0/me/drive/items/' . rawurlencode($folderId) . ':/' . rawurlencode($filename) . ':/content',
            ['Authorization: Bearer ' . $this->getAccessToken(), 'Content-Type: text/plain; charset=utf-8'],
            $content,
        );
        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new GraphException($response['status'], 'ONEDRIVE_TEST_UPLOAD_FAILED');
        }
        $item = self::decodeObject($response['body']);
        if (($item['name'] ?? null) !== $filename || (int) ($item['size'] ?? -1) !== strlen($content) || empty($item['id'])) {
            throw new GraphException(502, 'ONEDRIVE_TEST_VALIDATION_FAILED');
        }
        return ['ok' => true, 'itemName' => $filename];
    }

    /** @return array{uploadUrl:string,expiresAt:string} */
    public function createUploadSession(string $storedName): array
    {
        $this->ensureFolder();
        $path = implode('/', array_map('rawurlencode', [...$this->folderParts(), $storedName]));
        $result = $this->graph('POST', '/me/drive/root:/' . $path . ':/createUploadSession', [
            'item' => ['@microsoft.graph.conflictBehavior' => 'fail'],
        ]);
        if (!is_string($result['uploadUrl'] ?? null) || !self::isHttps((string) $result['uploadUrl'])) {
            throw new GraphException(502, 'UPLOAD_SESSION_MISSING_URL');
        }
        return [
            'uploadUrl' => (string) $result['uploadUrl'],
            'expiresAt' => (string) ($result['expirationDateTime'] ?? ''),
        ];
    }

    /** @return array{capturedAt:?string} */
    public function validateCompletedItem(string $itemId, string $storedName, int $expectedSize): array
    {
        $folderId = $this->ensureFolder();
        $item = $this->graph('GET', '/me/drive/items/' . rawurlencode($itemId) . '?$select=id,name,size,parentReference,photo');
        if (($item['name'] ?? null) !== $storedName
            || (int) ($item['size'] ?? -1) !== $expectedSize
            || ($item['parentReference']['id'] ?? null) !== $folderId
        ) {
            throw new GraphException(409, 'UPLOAD_COMPLETION_MISMATCH');
        }
        $taken = $item['photo']['takenDateTime'] ?? null;
        $capturedAt = is_string($taken) && strtotime($taken) !== false
            ? (new \DateTimeImmutable($taken))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z')
            : null;
        return ['capturedAt' => $capturedAt];
    }

    /** @param list<string> $itemIds
     *  @return array<string,string>
     */
    public function getThumbnails(array $itemIds): array
    {
        $output = [];
        foreach (array_chunk($itemIds, 20) as $chunk) {
            $requests = [];
            foreach ($chunk as $index => $itemId) {
                $requests[] = ['id' => (string) $index, 'method' => 'GET', 'url' => '/me/drive/items/' . rawurlencode($itemId) . '/thumbnails'];
            }
            $batch = $this->graph('POST', '/$batch', ['requests' => $requests]);
            foreach (($batch['responses'] ?? []) as $response) {
                if (!is_array($response) || (int) ($response['status'] ?? 0) < 200 || (int) ($response['status'] ?? 0) >= 300) {
                    continue;
                }
                $index = filter_var($response['id'] ?? null, FILTER_VALIDATE_INT);
                $itemId = $index !== false ? ($chunk[$index] ?? null) : null;
                $set = $response['body']['value'][0] ?? null;
                $url = is_array($set) ? ($set['large']['url'] ?? $set['medium']['url'] ?? $set['small']['url'] ?? null) : null;
                if (is_string($itemId) && is_string($url) && self::isHttps($url)) {
                    $output[$itemId] = $url;
                }
            }
        }
        return $output;
    }

    public function getDownloadUrl(string $itemId): string
    {
        $response = $this->http(
            'GET',
            'https://graph.microsoft.com/v1.0/me/drive/items/' . rawurlencode($itemId) . '/content',
            ['Authorization: Bearer ' . $this->getAccessToken()],
            null,
            false,
        );
        if ($response['status'] >= 300 && $response['status'] < 400) {
            $location = $response['headers']['location'] ?? null;
            if (is_string($location) && self::isHttps($location)) {
                return $location;
            }
            throw new GraphException(502, 'DOWNLOAD_URL_INVALID');
        }
        throw new GraphException($response['status'] ?: 502, self::graphCode($response['body'], 'DOWNLOAD_URL_UNAVAILABLE'));
    }

    public function deleteItem(string $itemId): void
    {
        try {
            $this->graph('DELETE', '/me/drive/items/' . rawurlencode($itemId));
        } catch (GraphException $error) {
            if ($error->status !== 404) {
                throw $error;
            }
        }
    }

    public function hasUploadCapacity(int $size): bool
    {
        if ($this->quota === null || $this->quota['expiresAt'] <= time()) {
            $drive = $this->graph('GET', '/me/drive?$select=quota');
            $this->quota = ['remaining' => (int) ($drive['quota']['remaining'] ?? 0), 'expiresAt' => time() + 60];
        }
        if ($this->quota['remaining'] - $size < 20 * 1024 ** 3) {
            return false;
        }
        $this->quota['remaining'] -= $size;
        return true;
    }

    /** @param array<string,mixed>|null $body
     *  @return array<string,mixed>
     */
    private function graph(string $method, string $path, ?array $body = null): array
    {
        $response = $this->http(
            $method,
            'https://graph.microsoft.com/v1.0' . $path,
            ['Authorization: Bearer ' . $this->getAccessToken(), ...($body !== null ? ['Content-Type: application/json'] : [])],
            $body !== null ? json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) : null,
        );
        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new GraphException($response['status'], self::graphCode($response['body'], 'GRAPH_REQUEST_FAILED'));
        }
        return $response['status'] === 204 || $response['body'] === '' ? [] : self::decodeObject($response['body']);
    }

    private function getAccessToken(): string
    {
        if ($this->accessToken !== null && $this->accessToken['expiresAt'] > time()) {
            return $this->accessToken['value'];
        }
        $stored = $this->store->getOAuthToken();
        if ($stored === null) {
            throw new GraphException(503, 'ONEDRIVE_DISCONNECTED');
        }
        $refresh = Crypto::decryptToken($stored['encryptedRefreshToken'], $this->config->required('TOKEN_ENCRYPTION_KEY'));
        $token = $this->requestToken([
            'client_id' => $this->config->required('MICROSOFT_CLIENT_ID'),
            'client_secret' => $this->config->required('MICROSOFT_CLIENT_SECRET'),
            'grant_type' => 'refresh_token',
            'refresh_token' => $refresh,
            'scope' => 'offline_access https://graph.microsoft.com/Files.ReadWrite',
        ]);
        if (is_string($token['refresh_token'] ?? null) && $token['refresh_token'] !== $refresh) {
            $this->store->saveOAuthToken(
                Crypto::encryptToken($token['refresh_token'], $this->config->required('TOKEN_ENCRYPTION_KEY')),
                self::now(),
            );
        }
        $this->cacheAccessToken($token);
        return (string) $token['access_token'];
    }

    /** @param array<string,string> $values
     *  @return array<string,mixed>
     */
    private function requestToken(array $values): array
    {
        $response = $this->http(
            'POST',
            'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
            ['Content-Type: application/x-www-form-urlencoded'],
            http_build_query($values, '', '&', PHP_QUERY_RFC3986),
        );
        $body = self::decodeObject($response['body']);
        if ($response['status'] < 200 || $response['status'] >= 300 || !is_string($body['access_token'] ?? null)) {
            throw new GraphException(502, is_string($body['error'] ?? null) ? $body['error'] : 'MICROSOFT_TOKEN_FAILED');
        }
        return $body;
    }

    /** @param array<string,mixed> $token */
    private function cacheAccessToken(array $token): void
    {
        $expires = max(60, (int) ($token['expires_in'] ?? 3600) - 120);
        $this->accessToken = ['value' => (string) $token['access_token'], 'expiresAt' => time() + $expires];
    }

    private function ensureFolder(): string
    {
        if ($this->folder !== null && $this->folder['expiresAt'] > time()) {
            return $this->folder['id'];
        }
        $built = [];
        $parent = 'root';
        foreach ($this->folderParts() as $name) {
            $built[] = $name;
            try {
                $parent = (string) $this->itemByPath($built)['id'];
            } catch (GraphException $error) {
                if ($error->status !== 404) {
                    throw $error;
                }
                $endpoint = $parent === 'root' ? '/me/drive/root/children' : '/me/drive/items/' . rawurlencode($parent) . '/children';
                try {
                    $created = $this->graph('POST', $endpoint, ['name' => $name, 'folder' => new \stdClass(), '@microsoft.graph.conflictBehavior' => 'fail']);
                    $parent = (string) $created['id'];
                } catch (GraphException $createError) {
                    if ($createError->status !== 409) {
                        throw $createError;
                    }
                    $parent = (string) $this->itemByPath($built)['id'];
                }
            }
        }
        $this->folder = ['id' => $parent, 'expiresAt' => time() + 60];
        return $parent;
    }

    /** @param list<string> $parts
     *  @return array<string,mixed>
     */
    private function itemByPath(array $parts): array
    {
        return $this->graph('GET', '/me/drive/root:/' . implode('/', array_map('rawurlencode', $parts)));
    }

    /** @return list<string> */
    private function folderParts(): array
    {
        return array_values(array_filter(array_map('trim', explode('/', $this->config->required('ONEDRIVE_FOLDER'))), static fn (string $part): bool => $part !== ''));
    }

    /**
     * @param list<string> $headers
     * @return array{status:int,headers:array<string,string>,body:string}
     */
    private function http(string $method, string $url, array $headers, ?string $body, bool $followRedirects = true): array
    {
        if ($this->transport !== null) {
            return ($this->transport)($method, $url, $headers, $body, $followRedirects);
        }
        if (!extension_loaded('curl')) {
            throw new \RuntimeException('The PHP cURL extension is required.');
        }
        $handle = curl_init($url);
        if ($handle === false) {
            throw new \RuntimeException('Unable to initialize an outbound request.');
        }
        $responseHeaders = [];
        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_FOLLOWLOCATION => $followRedirects,
            CURLOPT_MAXREDIRS => $followRedirects ? 3 : 0,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$responseHeaders): int {
                $length = strlen($line);
                $separator = strpos($line, ':');
                if ($separator !== false) {
                    $responseHeaders[strtolower(trim(substr($line, 0, $separator)))] = trim(substr($line, $separator + 1));
                }
                return $length;
            },
        ]);
        if ($body !== null) {
            curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
        }
        $responseBody = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $failed = $responseBody === false;
        curl_close($handle);
        if ($failed) {
            throw new GraphException(502, 'MICROSOFT_NETWORK_FAILED');
        }
        return ['status' => $status, 'headers' => $responseHeaders, 'body' => (string) $responseBody];
    }

    /** @return array<string,mixed> */
    private static function decodeObject(string $json): array
    {
        try {
            $value = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new GraphException(502, 'MICROSOFT_RESPONSE_INVALID');
        }
        return is_array($value) ? $value : [];
    }

    private static function graphCode(string $body, string $fallback): string
    {
        try {
            $value = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
            $code = is_array($value) ? ($value['error']['code'] ?? null) : null;
            return is_string($code) && $code !== '' ? $code : $fallback;
        } catch (\Throwable) {
            return $fallback;
        }
    }

    private static function isHttps(string $url): bool
    {
        return strtolower((string) parse_url($url, PHP_URL_SCHEME)) === 'https' && is_string(parse_url($url, PHP_URL_HOST));
    }

    private static function now(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }
}
