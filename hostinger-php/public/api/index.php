<?php

declare(strict_types=1);

use Album\Hostinger\Request;
use Album\Hostinger\Response;

function writeStartupDiagnostic(string $appRoot, Throwable $error): void
{
    $parts = [$error::class];
    $exceptionCode = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $error->getCode());
    if (is_string($exceptionCode) && $exceptionCode !== '') {
        $parts[] = 'code=' . $exceptionCode;
    }
    if ($error instanceof PDOException && isset($error->errorInfo[1])) {
        $driverCode = preg_replace('/[^0-9]/', '', (string) $error->errorInfo[1]);
        if (is_string($driverCode) && $driverCode !== '') {
            $parts[] = 'driver=' . $driverCode;
        }
    }

    $runtimeDirectory = rtrim($appRoot, '/\\') . '/runtime';
    if (!is_dir($runtimeDirectory) && !@mkdir($runtimeDirectory, 0700, true) && !is_dir($runtimeDirectory)) {
        return;
    }

    $diagnosticFile = $runtimeDirectory . '/startup-error.log';
    @file_put_contents(
        $diagnosticFile,
        gmdate('c') . ' ' . implode(' ', $parts) . PHP_EOL,
        FILE_APPEND | LOCK_EX,
    );
    @chmod($diagnosticFile, 0600);
}

$appRoot = getenv('ALBUM_APP_ROOT');
if (!is_string($appRoot) || $appRoot === '') {
    $appRoot = dirname(__DIR__, 3) . '/album-app';
}

try {
    require_once rtrim($appRoot, '/\\') . '/app/bootstrap.php';
    createAlbumApplication(
        rtrim($appRoot, '/\\') . '/config.php',
        rtrim($appRoot, '/\\') . '/runtime',
    )->run(Request::fromGlobals());
} catch (Throwable $error) {
    writeStartupDiagnostic($appRoot, $error);
    error_log('[album] Startup failed: ' . $error::class);
    if (class_exists(Response::class)) {
        Response::securityHeaders(false);
        Response::error(503, 'STARTUP_FAILED', 'El álbum no está disponible temporalmente.');
    }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":{"code":"STARTUP_FAILED","message":"El álbum no está disponible temporalmente."}}';
}
