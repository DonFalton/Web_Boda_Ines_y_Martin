<?php

declare(strict_types=1);

namespace Album\Hostinger;

final class Media
{
    /** @var array<string,list<string>> */
    public const TYPE_EXTENSIONS = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/heic' => ['heic'],
        'image/heif' => ['heif'],
        'image/webp' => ['webp'],
        'image/gif' => ['gif'],
        'video/mp4' => ['mp4'],
        'video/quicktime' => ['mov'],
        'video/x-m4v' => ['m4v'],
    ];
    public const GENERIC_TYPES = ['', 'application/octet-stream', 'binary/octet-stream', 'application/binary'];
    public const CHUNK_BYTES = 10 * 1024 * 1024;
    public const PARALLEL_FILES = 2;

    /** @return list<string> */
    public static function extensions(): array
    {
        return array_values(array_unique(array_merge(...array_values(self::TYPE_EXTENSIONS))));
    }

    public static function accepted(string $name, string $mimeType): bool
    {
        $extension = self::extension($name);
        $mime = self::cleanMime($mimeType);
        if (!in_array($extension, self::extensions(), true)) {
            return false;
        }
        return in_array($mime, self::GENERIC_TYPES, true)
            || in_array($extension, self::TYPE_EXTENSIONS[$mime] ?? [], true);
    }

    public static function normalizedType(string $name, string $mimeType): string
    {
        $mime = self::cleanMime($mimeType);
        if (!in_array($mime, self::GENERIC_TYPES, true)) {
            return $mime;
        }
        return match (self::extension($name)) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'heic' => 'image/heic',
            'heif' => 'image/heif',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'mp4' => 'video/mp4',
            'mov' => 'video/quicktime',
            'm4v' => 'video/x-m4v',
            default => 'application/octet-stream',
        };
    }

    public static function sanitizeName(string $input): string
    {
        $normalized = class_exists(\Normalizer::class)
            ? (\Normalizer::normalize($input, \Normalizer::FORM_C) ?: $input)
            : $input;
        $basename = basename(str_replace('\\', '/', $normalized));
        $basename = preg_replace('/["*:<>?\\\\\/|\x00-\x1F]/u', '-', $basename) ?? '';
        $basename = preg_replace('/\s+/u', ' ', trim($basename)) ?? '';
        $basename = rtrim($basename, ". ");
        if (preg_match('/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i', $basename)) {
            $basename = 'file-' . $basename;
        }
        $basename = $basename !== '' ? $basename : 'archivo';
        return self::unicodeSlice($basename, 180);
    }

    public static function storedName(string $mediaId, string $name): string
    {
        return (string) round(microtime(true) * 1000) . '-' . substr(str_replace('-', '', $mediaId), 0, 12) . '-' . self::sanitizeName($name);
    }

    public static function normalizeDisplayName(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $name = class_exists(\Normalizer::class)
            ? (\Normalizer::normalize($value, \Normalizer::FORM_C) ?: $value)
            : $value;
        $name = preg_replace('/\s+/u', ' ', trim($name)) ?? '';
        if ($name === '' || preg_match('/\p{C}/u', $name) || !preg_match('/[^\p{C}\p{Z}]/u', $name)) {
            return null;
        }
        return self::unicodeLength($name) <= 80 ? $name : null;
    }

    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }

    public static function validUuid(string $value): bool
    {
        return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value);
    }

    private static function cleanMime(string $mime): string
    {
        return strtolower(trim(explode(';', $mime, 2)[0]));
    }

    private static function extension(string $name): string
    {
        return strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
    }

    private static function unicodeLength(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : count(preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: []);
    }

    private static function unicodeSlice(string $value, int $length): string
    {
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $length, 'UTF-8');
        }
        return implode('', array_slice(preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, $length));
    }
}
