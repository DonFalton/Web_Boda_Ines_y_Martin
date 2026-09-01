<?php

declare(strict_types=1);

namespace Album\Hostinger;

final readonly class Request
{
    /**
     * @param array<string, string> $query
     * @param array<string, string> $cookies
     * @param array<string, string> $headers
     */
    public function __construct(
        public string $method,
        public string $path,
        public array $query,
        public array $cookies,
        public array $headers,
        public mixed $json,
        public string $ip,
        public bool $invalidJson = false,
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_') && is_string($value)) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
        $raw = file_get_contents('php://input');
        $json = null;
        $invalidJson = false;
        if ($raw !== false && $raw !== '') {
            try {
                $json = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                $invalidJson = true;
            }
        }
        $path = rawurldecode((string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/'));
        return new self(
            strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            $path,
            array_map('strval', $_GET),
            array_map('strval', $_COOKIE),
            $headers,
            $json,
            (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
            $invalidJson,
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }
}

final class Response
{
    /** @param mixed $body */
    public static function json(int $status, mixed $body): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function noContent(): never
    {
        http_response_code(204);
        exit;
    }

    public static function redirect(string $url, int $status = 302): never
    {
        header('Location: ' . $url, true, $status);
        exit;
    }

    public static function text(int $status, string $body): never
    {
        http_response_code($status);
        header('Content-Type: text/plain; charset=utf-8');
        echo $body;
        exit;
    }

    public static function error(int $status, string $code, string $message): never
    {
        self::json($status, ['error' => ['code' => $code, 'message' => $message]]);
    }

    /** @param array<string, mixed> $payload */
    public static function signedCookie(string $name, array $payload, Config $config, int $maxAgeSeconds): void
    {
        setcookie($name, Crypto::signPayload($payload, $config->string('COOKIE_SECRET')), [
            'expires' => time() + $maxAgeSeconds,
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function clearCookie(string $name): void
    {
        setcookie($name, '', [
            'expires' => 1,
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function securityHeaders(bool $albumPath): void
    {
        header_remove('X-Powered-By');
        header('Cache-Control: private, no-store');
        header('Content-Security-Policy: default-src \'self\'; base-uri \'self\'; font-src \'self\' https://fonts.gstatic.com data:; form-action \'self\'; frame-ancestors \'none\'; frame-src \'self\' https://*.1drv.com https://*.sharepoint.com https://*.microsoftpersonalcontent.com; img-src \'self\' data: blob: https://*.1drv.com https://*.sharepoint.com https://*.microsoftpersonalcontent.com https://*.svc.ms; object-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; media-src \'self\' blob: https://*.1drv.com https://*.sharepoint.com https://*.microsoftpersonalcontent.com; connect-src \'self\' https://*.up.1drv.com https://*.1drv.com https://*.sharepoint.com https://*.microsoftpersonalcontent.com; worker-src \'none\'; manifest-src \'self\'; upgrade-insecure-requests');
        header('Cross-Origin-Opener-Policy: same-origin');
        header('Cross-Origin-Resource-Policy: same-origin');
        header('Origin-Agent-Cluster: ?1');
        header('Referrer-Policy: no-referrer');
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('X-Permitted-Cross-Domain-Policies: none');
        if ($albumPath) {
            header('X-Robots-Tag: noindex, nofollow, noarchive');
        }
    }
}

final class RateLimiter
{
    public function __construct(private readonly string $directory)
    {
    }

    public function check(string $bucket, string $key, int $limit, int $windowSeconds): bool
    {
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new \RuntimeException('Rate limit storage is unavailable.');
        }
        $path = $this->directory . DIRECTORY_SEPARATOR . hash('sha256', $bucket . "\0" . $key) . '.json';
        $handle = fopen($path, 'c+');
        if ($handle === false) {
            throw new \RuntimeException('Rate limit storage is unavailable.');
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new \RuntimeException('Rate limit storage is unavailable.');
            }
            $raw = stream_get_contents($handle);
            $state = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
            $now = time();
            if (!is_array($state) || !isset($state['start'], $state['count']) || (int) $state['start'] + $windowSeconds <= $now) {
                $state = ['start' => $now, 'count' => 0];
            }
            $state['count'] = (int) $state['count'] + 1;
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, json_encode($state, JSON_THROW_ON_ERROR));
            fflush($handle);
            return $state['count'] <= $limit;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}
