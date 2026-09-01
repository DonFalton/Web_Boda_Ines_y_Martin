<?php

declare(strict_types=1);

namespace Album\Hostinger;

final class Crypto
{
    public static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $value): string
    {
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $value)) {
            throw new \RuntimeException('Invalid Base64URL value.');
        }
        $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
        if ($decoded === false || self::base64UrlEncode($decoded) !== $value) {
            throw new \RuntimeException('Invalid Base64URL value.');
        }
        return $decoded;
    }

    public static function constantTimeEqual(string $actual, string $expected): bool
    {
        return hash_equals(hash('sha256', $expected, true), hash('sha256', $actual, true));
    }

    /** @param array<string, mixed> $payload */
    public static function signPayload(array $payload, string $secret): string
    {
        if ($secret === '') {
            throw new \RuntimeException('Cookie secret is not configured.');
        }
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $body = self::base64UrlEncode($json);
        $signature = self::base64UrlEncode(hash_hmac('sha256', $body, $secret, true));
        return $body . '.' . $signature;
    }

    /** @return array<string, mixed>|null */
    public static function verifyPayload(?string $value, string $secret): ?array
    {
        if ($value === null || $value === '' || $secret === '') {
            return null;
        }
        $separator = strrpos($value, '.');
        if ($separator === false || $separator < 1) {
            return null;
        }
        $body = substr($value, 0, $separator);
        $supplied = substr($value, $separator + 1);
        $expected = self::base64UrlEncode(hash_hmac('sha256', $body, $secret, true));
        if (!hash_equals($expected, $supplied)) {
            return null;
        }
        try {
            $payload = json_decode(self::base64UrlDecode($body), true, 16, JSON_THROW_ON_ERROR);
            return is_array($payload) ? $payload : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public static function parseEncryptionKey(string $raw): string
    {
        $invalid = static fn (): \RuntimeException => new \RuntimeException('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
        if (preg_match('/^[a-f0-9]{64}$/i', $raw)) {
            $key = hex2bin($raw);
            if ($key !== false && strlen($key) === 32) {
                return $key;
            }
            throw $invalid();
        }
        if (!preg_match('/^[A-Za-z0-9+\/]+={0,2}$/', $raw)) {
            throw $invalid();
        }
        $key = base64_decode($raw, true);
        if ($key === false || strlen($key) !== 32) {
            throw $invalid();
        }
        $canonical = base64_encode($key);
        if ($raw !== $canonical && $raw !== rtrim($canonical, '=')) {
            throw $invalid();
        }
        return $key;
    }

    public static function encryptToken(string $plainText, string $rawKey): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($plainText, 'aes-256-gcm', self::parseEncryptionKey($rawKey), OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($ciphertext === false || strlen($tag) !== 16) {
            throw new \RuntimeException('Token encryption failed.');
        }
        return 'v1.' . self::base64UrlEncode($iv) . '.' . self::base64UrlEncode($tag) . '.' . self::base64UrlEncode($ciphertext);
    }

    public static function decryptToken(string $value, string $rawKey): string
    {
        $parts = explode('.', $value);
        if (count($parts) !== 4 || $parts[0] !== 'v1') {
            throw new \RuntimeException('Encrypted token has an invalid format.');
        }
        $plainText = openssl_decrypt(
            self::base64UrlDecode($parts[3]),
            'aes-256-gcm',
            self::parseEncryptionKey($rawKey),
            OPENSSL_RAW_DATA,
            self::base64UrlDecode($parts[1]),
            self::base64UrlDecode($parts[2]),
        );
        if ($plainText === false) {
            throw new \RuntimeException('Token decryption failed.');
        }
        return $plainText;
    }

    /** @return array{state:string,codeVerifier:string,codeChallenge:string} */
    public static function createPkceAttempt(): array
    {
        $state = self::base64UrlEncode(random_bytes(32));
        $verifier = self::base64UrlEncode(random_bytes(64));
        return [
            'state' => $state,
            'codeVerifier' => $verifier,
            'codeChallenge' => self::base64UrlEncode(hash('sha256', $verifier, true)),
        ];
    }
}
