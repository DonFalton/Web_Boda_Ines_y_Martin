<?php

declare(strict_types=1);

namespace Album\Hostinger;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use PDO;

final class Store
{
    private readonly PDO $pdo;
    private readonly string $database;

    public function __construct(Config $config)
    {
        $mysql = $config->mysql();
        $this->database = $mysql['database'];
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $mysql['host'],
            $mysql['port'],
            $mysql['database'],
        );
        $this->pdo = new PDO($dsn, $mysql['user'], $mysql['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+00:00'",
        ]);
    }

    public function init(): void
    {
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS media (
            id VARCHAR(36) PRIMARY KEY,
            guest_id VARCHAR(36) NOT NULL,
            guest_name VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            stored_name VARCHAR(255) NOT NULL UNIQUE,
            mime_type VARCHAR(127) NOT NULL,
            size BIGINT UNSIGNED NOT NULL,
            captured_at DATETIME(3) NULL,
            capture_source ENUM('embedded','file_modified','unknown') NOT NULL DEFAULT 'unknown',
            onedrive_item_id VARCHAR(255) NULL,
            status ENUM('uploading','visible','failed','deleted') NOT NULL,
            created_at DATETIME(3) NOT NULL,
            updated_at DATETIME(3) NOT NULL,
            INDEX idx_media_status_created_id (status, created_at DESC, id DESC),
            INDEX idx_media_status_captured_created_id (status, captured_at DESC, created_at DESC, id DESC),
            INDEX idx_media_status_guest_name_created_id (status, guest_name, created_at DESC, id DESC),
            INDEX idx_media_status_mime_created_id (status, mime_type, created_at DESC, id DESC),
            INDEX idx_media_guest_status_created_id (guest_id, status, created_at DESC, id DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $this->migrateMediaSchema();
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS oauth_tokens (
            id VARCHAR(32) PRIMARY KEY,
            encrypted_refresh_token TEXT NOT NULL,
            updated_at DATETIME(3) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    private function migrateMediaSchema(): void
    {
        $statement = $this->pdo->prepare("SELECT column_name, column_type FROM information_schema.columns
            WHERE table_schema=? AND table_name='media'");
        $statement->execute([$this->database]);
        $columns = [];
        foreach ($statement->fetchAll() as $row) {
            $name = $row['column_name'] ?? $row['COLUMN_NAME'] ?? null;
            $type = $row['column_type'] ?? $row['COLUMN_TYPE'] ?? null;
            if (is_string($name) && is_string($type)) {
                $columns[strtolower($name)] = strtolower($type);
            }
        }
        if (!isset($columns['captured_at'])) {
            $this->pdo->exec('ALTER TABLE media ADD COLUMN captured_at DATETIME(3) NULL AFTER size');
        }
        if (!isset($columns['capture_source'])) {
            $this->pdo->exec("ALTER TABLE media ADD COLUMN capture_source ENUM('embedded','file_modified','unknown') NOT NULL DEFAULT 'unknown' AFTER captured_at");
        }
        if (isset($columns['status']) && !str_contains($columns['status'], "'deleted'")) {
            $this->pdo->exec("ALTER TABLE media MODIFY status ENUM('uploading','visible','failed','deleted') NOT NULL");
        }
        $requiredIndexes = [
            'idx_media_status_created_id' => '(status, created_at DESC, id DESC)',
            'idx_media_status_captured_created_id' => '(status, captured_at DESC, created_at DESC, id DESC)',
            'idx_media_status_guest_name_created_id' => '(status, guest_name, created_at DESC, id DESC)',
            'idx_media_status_mime_created_id' => '(status, mime_type, created_at DESC, id DESC)',
            'idx_media_guest_status_created_id' => '(guest_id, status, created_at DESC, id DESC)',
        ];
        $indexStatement = $this->pdo->prepare("SELECT index_name FROM information_schema.statistics
            WHERE table_schema=? AND table_name='media'");
        $indexStatement->execute([$this->database]);
        $indexes = [];
        foreach ($indexStatement->fetchAll() as $row) {
            $name = $row['index_name'] ?? $row['INDEX_NAME'] ?? null;
            if (is_string($name)) {
                $indexes[strtolower($name)] = true;
            }
        }
        foreach ($requiredIndexes as $name => $definition) {
            if (!isset($indexes[strtolower($name)])) {
                $this->pdo->exec('ALTER TABLE media ADD INDEX ' . $name . ' ' . $definition);
            }
        }
    }

    public function ping(): void
    {
        $this->pdo->query('SELECT 1')->fetchColumn();
    }

    public function saveOAuthToken(string $encryptedRefreshToken, string $updatedAt): void
    {
        $statement = $this->pdo->prepare("INSERT INTO oauth_tokens (id, encrypted_refresh_token, updated_at)
            VALUES ('microsoft', ?, ?)
            ON DUPLICATE KEY UPDATE encrypted_refresh_token=VALUES(encrypted_refresh_token), updated_at=VALUES(updated_at)");
        $statement->execute([$encryptedRefreshToken, self::dbDate($updatedAt)]);
    }

    /** @return array{id:string,encryptedRefreshToken:string,updatedAt:string}|null */
    public function getOAuthToken(): ?array
    {
        $row = $this->pdo->query("SELECT id, encrypted_refresh_token, updated_at FROM oauth_tokens WHERE id='microsoft' LIMIT 1")->fetch();
        if (!is_array($row)) {
            return null;
        }
        return [
            'id' => (string) $row['id'],
            'encryptedRefreshToken' => (string) $row['encrypted_refresh_token'],
            'updatedAt' => self::isoDate((string) $row['updated_at']),
        ];
    }

    /** @param array<string, mixed> $media */
    public function createMedia(array $media): void
    {
        $statement = $this->pdo->prepare('INSERT INTO media
            (id,guest_id,guest_name,original_name,stored_name,mime_type,size,captured_at,capture_source,onedrive_item_id,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $statement->execute([
            $media['id'], $media['guestId'], $media['guestName'], $media['originalName'], $media['storedName'],
            $media['mimeType'], $media['size'], $media['capturedAt'] ? self::dbDate((string) $media['capturedAt']) : null,
            $media['captureSource'], $media['onedriveItemId'], $media['status'], self::dbDate((string) $media['createdAt']),
            self::dbDate((string) $media['updatedAt']),
        ]);
    }

    /** @param array<string, mixed> $patch
     *  @return array<string, mixed>|null
     */
    public function updateMedia(string $id, array $patch): ?array
    {
        $allowed = [
            'capturedAt' => 'captured_at',
            'captureSource' => 'capture_source',
            'onedriveItemId' => 'onedrive_item_id',
            'status' => 'status',
            'updatedAt' => 'updated_at',
        ];
        $fields = [];
        $values = [];
        foreach ($allowed as $key => $column) {
            if (!array_key_exists($key, $patch)) {
                continue;
            }
            $fields[] = $column . '=?';
            $value = $patch[$key];
            if (($key === 'capturedAt' || $key === 'updatedAt') && is_string($value)) {
                $value = self::dbDate($value);
            }
            $values[] = $value;
        }
        if ($fields !== []) {
            $values[] = $id;
            $statement = $this->pdo->prepare('UPDATE media SET ' . implode(',', $fields) . ' WHERE id=?');
            $statement->execute($values);
        }
        return $this->getMedia($id);
    }

    /** @return array<string, mixed>|null */
    public function getMedia(string $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM media WHERE id=? LIMIT 1');
        $statement->execute([$id]);
        $row = $statement->fetch();
        return is_array($row) ? self::toMedia($row) : null;
    }

    /**
     * @param array{sort:string,direction:string,kind:string,ownerGuestId:?string} $options
     * @return array{items:list<array<string,mixed>>,nextCursor:?string}
     */
    public function listVisibleMedia(int $limit, ?string $cursor, array $options): array
    {
        $decoded = $cursor !== null && $cursor !== '' ? self::decodeCursor($cursor, $options) : null;
        $where = ["status='visible'"];
        $params = [];
        if ($options['ownerGuestId'] !== null) {
            $where[] = 'guest_id=?';
            $params[] = $options['ownerGuestId'];
        }
        if ($options['kind'] !== 'all') {
            $where[] = 'mime_type LIKE ?';
            $params[] = $options['kind'] . '/%';
        }
        $direction = $options['direction'] === 'asc' ? 'ASC' : 'DESC';
        $comparison = $options['direction'] === 'asc' ? '>' : '<';
        $sortExpression = match ($options['sort']) {
            'captured' => $options['direction'] === 'asc'
                ? "COALESCE(captured_at, CAST('9999-12-31 23:59:59.999' AS DATETIME(3)))"
                : "COALESCE(captured_at, CAST('1000-01-01 00:00:00.000' AS DATETIME(3)))",
            'type' => "CASE WHEN mime_type LIKE 'video/%' THEN 'video' ELSE 'image' END",
            'guest' => 'guest_name',
            default => 'created_at',
        };
        if ($decoded !== null) {
            $where[] = "($sortExpression $comparison ? OR ($sortExpression = ? AND (created_at $comparison ? OR (created_at = ? AND id $comparison ?))))";
            $sortValue = in_array($options['sort'], ['uploaded', 'captured'], true)
                ? self::dbDate($decoded['sortValue'])
                : $decoded['sortValue'];
            array_push($params, $sortValue, $sortValue, self::dbDate($decoded['createdAt']), self::dbDate($decoded['createdAt']), $decoded['id']);
        }
        $sql = 'SELECT * FROM media WHERE ' . implode(' AND ', $where)
            . " ORDER BY $sortExpression $direction, created_at $direction, id $direction LIMIT ?";
        $statement = $this->pdo->prepare($sql);
        foreach ($params as $index => $value) {
            $statement->bindValue($index + 1, $value, PDO::PARAM_STR);
        }
        $statement->bindValue(count($params) + 1, $limit + 1, PDO::PARAM_INT);
        $statement->execute();
        $rows = $statement->fetchAll();
        $hasMore = count($rows) > $limit;
        $items = array_map(self::toMedia(...), array_slice($rows, 0, $limit));
        return [
            'items' => $items,
            'nextCursor' => $hasMore && $items !== [] ? self::encodeCursor($items[array_key_last($items)], $options) : null,
        ];
    }

    /** @param array<string, mixed> $row
     *  @return array<string, mixed>
     */
    private static function toMedia(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'guestId' => (string) $row['guest_id'],
            'guestName' => (string) $row['guest_name'],
            'originalName' => (string) $row['original_name'],
            'storedName' => (string) $row['stored_name'],
            'mimeType' => (string) $row['mime_type'],
            'size' => (int) $row['size'],
            'capturedAt' => $row['captured_at'] !== null ? self::isoDate((string) $row['captured_at']) : null,
            'captureSource' => (string) $row['capture_source'],
            'onedriveItemId' => $row['onedrive_item_id'] !== null ? (string) $row['onedrive_item_id'] : null,
            'status' => (string) $row['status'],
            'createdAt' => self::isoDate((string) $row['created_at']),
            'updatedAt' => self::isoDate((string) $row['updated_at']),
        ];
    }

    /** @param array<string,mixed> $media
     *  @param array{sort:string,direction:string,kind:string,ownerGuestId:?string} $options
     */
    private static function encodeCursor(array $media, array $options): string
    {
        $sortValue = match ($options['sort']) {
            'captured' => $media['capturedAt'] ?? ($options['direction'] === 'asc' ? '9999-12-31T23:59:59.999Z' : '1000-01-01T00:00:00.000Z'),
            'type' => str_starts_with((string) $media['mimeType'], 'video/') ? 'video' : 'image',
            'guest' => $media['guestName'],
            default => $media['createdAt'],
        };
        $json = json_encode([
            'sortValue' => $sortValue,
            'createdAt' => $media['createdAt'],
            'id' => $media['id'],
            'sort' => $options['sort'],
            'direction' => $options['direction'],
            'kind' => $options['kind'],
            'scope' => $options['ownerGuestId'] !== null ? 'mine' : 'all',
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        return Crypto::base64UrlEncode($json);
    }

    /** @param array{sort:string,direction:string,kind:string,ownerGuestId:?string} $options
     *  @return array{sortValue:string,createdAt:string,id:string}
     */
    private static function decodeCursor(string $cursor, array $options): array
    {
        try {
            $value = json_decode(Crypto::base64UrlDecode($cursor), true, 16, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new \InvalidArgumentException('Invalid cursor.');
        }
        $scope = $options['ownerGuestId'] !== null ? 'mine' : 'all';
        if (!is_array($value)
            || !is_string($value['sortValue'] ?? null)
            || !is_string($value['createdAt'] ?? null)
            || !is_string($value['id'] ?? null)
            || ($value['sort'] ?? null) !== $options['sort']
            || ($value['direction'] ?? null) !== $options['direction']
            || ($value['kind'] ?? null) !== $options['kind']
            || ($value['scope'] ?? null) !== $scope
            || strtotime($value['createdAt']) === false
        ) {
            throw new \InvalidArgumentException('Invalid cursor.');
        }
        return ['sortValue' => $value['sortValue'], 'createdAt' => $value['createdAt'], 'id' => $value['id']];
    }

    private static function dbDate(string $value): string
    {
        return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    }

    private static function isoDate(string $value): string
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s.v', $value, new DateTimeZone('UTC'))
            ?: new DateTimeImmutable($value, new DateTimeZone('UTC'));
        return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }
}
