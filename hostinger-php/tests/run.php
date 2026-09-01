<?php

declare(strict_types=1);

use Album\Hostinger\Config;
use Album\Hostinger\Crypto;
use Album\Hostinger\Graph;
use Album\Hostinger\Media;
use Album\Hostinger\Store;

require_once dirname(__DIR__) . '/app/bootstrap.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

/** @param array<string,mixed> $overrides */
function testConfig(array $overrides = []): string
{
    $values = array_merge([
        'PUBLIC_APP_URL' => 'https://staging.example.test',
        'COOKIE_SECRET' => str_repeat('c', 48),
        'ADMIN_KEY' => str_repeat('a', 24),
        'ALBUM_ACCESS_TOKEN' => str_repeat('g', 24),
        'TOKEN_ENCRYPTION_KEY' => base64_encode(str_repeat('k', 32)),
        'MICROSOFT_CLIENT_ID' => '00000000-0000-4000-8000-000000000001',
        'MICROSOFT_CLIENT_SECRET' => 'dummy-client-secret',
        'MICROSOFT_REDIRECT_URI' => 'https://staging.example.test/api/admin/microsoft/callback',
        'ONEDRIVE_FOLDER' => 'Boda/Album/Staging/Originales',
        'MAX_FILE_BYTES' => 16106127360,
        'MAX_BATCH_FILES' => 50,
        'MYSQL_HOST' => getenv('TEST_MYSQL_HOST') ?: 'mysql',
        'MYSQL_PORT' => (int) (getenv('TEST_MYSQL_PORT') ?: '3306'),
        'MYSQL_DATABASE' => getenv('TEST_MYSQL_DATABASE') ?: 'album_php_test',
        'MYSQL_USER' => getenv('TEST_MYSQL_USER') ?: 'album_php_test',
        'MYSQL_PASSWORD' => getenv('TEST_MYSQL_PASSWORD') ?: 'local-test-app-only',
    ], $overrides);
    $file = tempnam(sys_get_temp_dir(), 'album-config-');
    if ($file === false) {
        throw new RuntimeException('Unable to prepare test configuration.');
    }
    file_put_contents($file, "<?php return " . var_export($values, true) . ";");
    return $file;
}

function mediaRecord(string $id, string $guest, string $created, string $name = 'mysql-persistence-test.jpg'): array
{
    return [
        'id' => $id,
        'guestId' => '10000000-0000-4000-8000-000000000001',
        'guestName' => $guest,
        'originalName' => $name,
        'storedName' => $id . '-' . $name,
        'mimeType' => 'image/jpeg',
        'size' => 15 * 1024 ** 3,
        'capturedAt' => '2026-08-30T10:00:00.000Z',
        'captureSource' => 'embedded',
        'onedriveItemId' => 'drive-' . $id,
        'status' => 'visible',
        'createdAt' => $created,
        'updatedAt' => $created,
    ];
}

$configFile = testConfig();
try {
    $config = Config::load($configFile);
    check($config->mysql()['port'] === 3306, 'Integer MYSQL_PORT configuration was rejected.');

    $signed = Crypto::signPayload(['guestId' => 'guest', 'exp' => 123], $config->required('COOKIE_SECRET'));
    check(Crypto::verifyPayload($signed, $config->required('COOKIE_SECRET'))['guestId'] === 'guest', 'Signed cookie did not round-trip.');
    check(Crypto::verifyPayload($signed . 'x', $config->required('COOKIE_SECRET')) === null, 'Tampered cookie was accepted.');
    check($signed === 'eyJndWVzdElkIjoiZ3Vlc3QiLCJleHAiOjEyM30.AjzAgrFS_Aomlp0ZVMaH6ZSryFjftABnE_aUx6CfDAk', 'Signed cookies are not compatible with the Node implementation.');
    $cipher = Crypto::encryptToken('dummy-refresh-token', $config->required('TOKEN_ENCRYPTION_KEY'));
    check(!str_contains($cipher, 'dummy-refresh-token'), 'Refresh token was not encrypted.');
    check(Crypto::decryptToken($cipher, $config->required('TOKEN_ENCRYPTION_KEY')) === 'dummy-refresh-token', 'Refresh token did not decrypt.');
    check(Crypto::decryptToken('v1.7rBigV_ANnpRkvUX.rWiHP2hAboE8fuPe3AVMSg.j6SU91Qr4O_iFvEcgcUCPSRYa5hUbtuolqauKHrsEUFS', $config->required('TOKEN_ENCRYPTION_KEY')) === 'compatibility-dummy-refresh-token', 'Encrypted tokens are not compatible with the Node implementation.');

    $invalidFile = testConfig(['TOKEN_ENCRYPTION_KEY' => 'arbitrary text']);
    try {
        Config::load($invalidFile);
        throw new RuntimeException('Invalid encryption key was accepted.');
    } catch (RuntimeException $error) {
        check(str_contains($error->getMessage(), 'exactly 32 bytes'), 'Invalid key failed for an unexpected reason.');
    } finally {
        unlink($invalidFile);
    }

    check(Media::accepted('foto.HEIC', 'application/octet-stream'), 'HEIC generic MIME was rejected.');
    check(Media::accepted('video.mov', 'video/quicktime'), 'MOV was rejected.');
    check(!Media::accepted('document.pdf', 'application/pdf'), 'Unsupported document was accepted.');
    check(Media::normalizeDisplayName("  Inés   Martín 🥂 ") === 'Inés Martín 🥂', 'Unicode guest name was not normalized.');
    check(!str_contains(Media::sanitizeName('../CON?.jpg'), '?'), 'Filename was not sanitized.');

    $store = null;
    for ($attempt = 0; $attempt < 20; $attempt++) {
        try {
            $store = new Store($config);
            $store->init();
            $store->init();
            $store->ping();
            break;
        } catch (PDOException) {
            $store = null;
            usleep(250000);
        }
    }
    check($store instanceof Store, 'MySQL connection unavailable.');

    $records = [
        mediaRecord('20000000-0000-4000-8000-000000000001', "Inés Martín 🥂", '2026-08-30T10:00:00.000Z'),
        mediaRecord('20000000-0000-4000-8000-000000000002', "José María", '2026-08-30T10:00:00.000Z'),
        mediaRecord('20000000-0000-4000-8000-000000000003', "Robert'); DROP TABLE media;--", '2026-08-30T10:00:00.000Z'),
    ];
    foreach ($records as $record) {
        $store->createMedia($record);
    }
    $store->saveOAuthToken($cipher, '2026-08-30T10:00:00.000Z');

    unset($store);
    $reopened = new Store($config);
    $reopened->init();
    check($reopened->getMedia($records[0]['id'])['guestName'] === "Inés Martín 🥂", 'Unicode media did not survive reconnection.');
    check($reopened->getMedia($records[0]['id'])['size'] === 15 * 1024 ** 3, 'BIGINT media size did not survive reconnection.');
    check($reopened->getMedia($records[2]['id'])['guestName'] === "Robert'); DROP TABLE media;--", 'SQL-like input was not stored as data.');
    $storedToken = $reopened->getOAuthToken();
    check($storedToken !== null && Crypto::decryptToken($storedToken['encryptedRefreshToken'], $config->required('TOKEN_ENCRYPTION_KEY')) === 'dummy-refresh-token', 'Encrypted OAuth token did not survive reconnection.');

    $options = ['sort' => 'uploaded', 'direction' => 'asc', 'kind' => 'all', 'ownerGuestId' => null];
    $first = $reopened->listVisibleMedia(2, null, $options);
    $second = $reopened->listVisibleMedia(2, $first['nextCursor'], $options);
    $ids = array_map(static fn (array $item): string => $item['id'], [...$first['items'], ...$second['items']]);
    check(count($ids) === 3 && count(array_unique($ids)) === 3, 'Cursor pagination produced a gap or duplicate.');

    $graph = new Graph($config, $reopened);
    $authorize = $graph->buildAuthorizeUrl('state', 'challenge');
    check(str_contains($authorize, 'Files.ReadWrite') && !str_contains($authorize, 'Files.ReadWrite.All'), 'OAuth scope changed unexpectedly.');

    $folderReads = 0;
    $transport = static function (string $method, string $url, array $headers, ?string $body, bool $follow) use (&$folderReads): array {
        if (str_ends_with($url, '/oauth2/v2.0/token')) {
            parse_str($body ?? '', $fields);
            check(($fields['scope'] ?? null) === 'offline_access https://graph.microsoft.com/Files.ReadWrite', 'Token request scope changed.');
            return ['status' => 200, 'headers' => [], 'body' => json_encode([
                'access_token' => 'dummy-access-token',
                'refresh_token' => 'rotated-dummy-refresh-token',
                'expires_in' => 3600,
            ], JSON_THROW_ON_ERROR)];
        }
        check(in_array('Authorization: Bearer dummy-access-token', $headers, true), 'Graph request omitted its bearer token.');
        if ($method === 'GET' && str_contains($url, '/me/drive/root:/')) {
            $folderReads++;
            return ['status' => 200, 'headers' => [], 'body' => json_encode(['id' => 'folder-' . $folderReads], JSON_THROW_ON_ERROR)];
        }
        if ($method === 'POST' && str_ends_with($url, ':/createUploadSession')) {
            check(in_array('Content-Type: application/json', $headers, true), 'Upload session request omitted its JSON content type.');
            $payload = is_string($body) ? json_decode($body, true, 16, JSON_THROW_ON_ERROR) : null;
            check(($payload['item']['@microsoft.graph.conflictBehavior'] ?? null) === 'fail', 'Upload session request omitted its explicit request body.');
            return ['status' => 200, 'headers' => [], 'body' => json_encode([
                'uploadUrl' => 'https://upload.example.test/session',
                'expirationDateTime' => '2026-09-01T12:00:00Z',
            ], JSON_THROW_ON_ERROR)];
        }
        if ($method === 'GET' && str_contains($url, '/me/drive/items/item-1?$select=')) {
            return ['status' => 200, 'headers' => [], 'body' => json_encode([
                'id' => 'item-1', 'name' => 'stored.jpg', 'size' => 123,
                'parentReference' => ['id' => 'folder-4'],
                'photo' => ['takenDateTime' => '2026-08-30T11:30:00Z'],
            ], JSON_THROW_ON_ERROR)];
        }
        if ($method === 'POST' && str_ends_with($url, '/$batch')) {
            return ['status' => 200, 'headers' => [], 'body' => json_encode(['responses' => [[
                'id' => '0', 'status' => 200, 'body' => ['value' => [['large' => ['url' => 'https://thumb.example.test/item-1']]]],
            ]]], JSON_THROW_ON_ERROR)];
        }
        if ($method === 'GET' && str_ends_with($url, '/items/item-1/content') && !$follow) {
            return ['status' => 302, 'headers' => ['location' => 'https://download.example.test/item-1'], 'body' => ''];
        }
        if ($method === 'DELETE' && str_ends_with($url, '/items/item-1')) {
            return ['status' => 204, 'headers' => [], 'body' => ''];
        }
        if ($method === 'GET' && str_ends_with($url, '/me/drive?$select=quota')) {
            return ['status' => 200, 'headers' => [], 'body' => json_encode(['quota' => ['remaining' => 100 * 1024 ** 3]], JSON_THROW_ON_ERROR)];
        }
        throw new RuntimeException('Unexpected mocked Microsoft endpoint.');
    };
    $mockGraph = new Graph($config, $reopened, $transport);
    $mockGraph->exchangeAuthorizationCode('authorization-code', 'verifier');
    $rotated = $reopened->getOAuthToken();
    check($rotated !== null && Crypto::decryptToken($rotated['encryptedRefreshToken'], $config->required('TOKEN_ENCRYPTION_KEY')) === 'rotated-dummy-refresh-token', 'OAuth exchange did not encrypt the refresh token.');
    $uploadSession = $mockGraph->createUploadSession('stored.jpg');
    check($uploadSession['uploadUrl'] === 'https://upload.example.test/session', 'Upload session response was not preserved.');
    check($mockGraph->validateCompletedItem('item-1', 'stored.jpg', 123)['capturedAt'] === '2026-08-30T11:30:00.000Z', 'Completed item validation lost capture date.');
    check($mockGraph->getThumbnails(['item-1'])['item-1'] === 'https://thumb.example.test/item-1', 'Thumbnail batch response was not parsed.');
    check($mockGraph->getDownloadUrl('item-1') === 'https://download.example.test/item-1', 'Temporary download redirect was not parsed.');
    $mockGraph->deleteItem('item-1');
    check($mockGraph->hasUploadCapacity(1024), 'OneDrive quota reserve rejected an allowed upload.');

    $httpSource = file_get_contents(dirname(__DIR__) . '/app/Http.php');
    check(is_string($httpSource) && !str_contains($httpSource, "connect-src *") && !str_contains($httpSource, "*.microsoft.com"), 'CSP contains an unsafe wildcard.');
    check(str_contains((string) $httpSource, "connect-src \\'self\\' https://*.up.1drv.com https://*.1drv.com https://*.sharepoint.com https://*.microsoftpersonalcontent.com"), 'CSP omitted the restricted personal-content upload host family.');
    check(str_contains((string) $httpSource, "img-src \\'self\\' data: blob: https://*.1drv.com https://*.sharepoint.com https://*.microsoftpersonalcontent.com https://*.svc.ms"), 'CSP omitted the restricted Microsoft thumbnail host family.');
    check(!str_contains((string) $httpSource, 'northeurope1-mediap.svc.ms'), 'CSP hardcoded a regional thumbnail hostname.');
    echo "PHP unit/security tests: PASS\n";
    echo "MySQL schema/idempotency/persistence tests: PASS\n";
    echo "OAuth encrypted-token restart test: PASS\n";
    echo "Microsoft Graph contract tests: PASS\n";
} finally {
    if (is_file($configFile)) {
        unlink($configFile);
    }
}
