<?php

declare(strict_types=1);

namespace Album\Hostinger;

final readonly class Config
{
    /** @param array<string, mixed> $values */
    private function __construct(private array $values)
    {
    }

    public static function load(string $file): self
    {
        if (!is_file($file)) {
            throw new \RuntimeException('Album configuration file is missing.');
        }
        $values = require $file;
        if (!is_array($values)) {
            throw new \RuntimeException('Album configuration file must return an array.');
        }
        $config = new self($values);
        $config->validate();
        return $config;
    }

    public function string(string $name): string
    {
        $value = $this->values[$name] ?? '';
        return is_string($value) ? $value : '';
    }

    public function integer(string $name, int $fallback): int
    {
        $value = $this->values[$name] ?? $fallback;
        if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
            throw new \RuntimeException($name . ' must be a positive integer.');
        }
        $parsed = (int) $value;
        if ($parsed <= 0) {
            throw new \RuntimeException($name . ' must be a positive integer.');
        }
        return $parsed;
    }

    /** @return array{host:string,port:int,database:string,user:string,password:string} */
    public function mysql(): array
    {
        return [
            'host' => $this->required('MYSQL_HOST'),
            'port' => $this->integer('MYSQL_PORT', 3306),
            'database' => $this->required('MYSQL_DATABASE'),
            'user' => $this->required('MYSQL_USER'),
            'password' => $this->required('MYSQL_PASSWORD'),
        ];
    }

    public function required(string $name): string
    {
        $value = $this->string($name);
        if (trim($value) === '') {
            throw new \RuntimeException($name . ' is required.');
        }
        return $value;
    }

    private function validate(): void
    {
        foreach ([
            'PUBLIC_APP_URL', 'COOKIE_SECRET', 'ADMIN_KEY', 'ALBUM_ACCESS_TOKEN',
            'TOKEN_ENCRYPTION_KEY', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET',
            'MICROSOFT_REDIRECT_URI', 'ONEDRIVE_FOLDER', 'MYSQL_HOST', 'MYSQL_DATABASE',
            'MYSQL_USER', 'MYSQL_PASSWORD',
        ] as $name) {
            $this->required($name);
        }
        $this->integer('MYSQL_PORT', 3306);
        $this->integer('MAX_FILE_BYTES', 16_106_127_360);
        $this->integer('MAX_BATCH_FILES', 50);
        if (strlen($this->string('COOKIE_SECRET')) < 32) {
            throw new \RuntimeException('COOKIE_SECRET must contain at least 32 characters.');
        }
        if (strlen($this->string('ADMIN_KEY')) < 16) {
            throw new \RuntimeException('ADMIN_KEY must contain at least 16 characters.');
        }
        if (strlen($this->string('ALBUM_ACCESS_TOKEN')) < 16) {
            throw new \RuntimeException('ALBUM_ACCESS_TOKEN must contain at least 16 characters.');
        }
        Crypto::parseEncryptionKey($this->string('TOKEN_ENCRYPTION_KEY'));
        foreach (['PUBLIC_APP_URL', 'MICROSOFT_REDIRECT_URI'] as $name) {
            $url = parse_url($this->string($name));
            if (!is_array($url) || ($url['scheme'] ?? '') !== 'https' || empty($url['host'])) {
                throw new \RuntimeException($name . ' must be a valid HTTPS URL.');
            }
        }
        $this->mysql();
    }
}
