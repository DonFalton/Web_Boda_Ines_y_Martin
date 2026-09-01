<?php

declare(strict_types=1);

use Album\Hostinger\Application;
use Album\Hostinger\Config;
use Album\Hostinger\Graph;
use Album\Hostinger\RateLimiter;
use Album\Hostinger\Store;

require_once __DIR__ . '/Crypto.php';
require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Media.php';
require_once __DIR__ . '/Store.php';
require_once __DIR__ . '/Graph.php';
require_once __DIR__ . '/Application.php';

/** @return Application */
function createAlbumApplication(string $configurationFile, string $runtimeDirectory): Application
{
    $config = Config::load($configurationFile);
    $store = new Store($config);
    $store->init();
    $store->ping();
    return new Application($config, $store, new Graph($config, $store), new RateLimiter($runtimeDirectory . '/rate-limits'));
}
