<?php

declare(strict_types=1);

use DI\Bridge\Slim\Bridge;

require __DIR__ . '/../vendor/autoload.php';

$container = require __DIR__ . '/../config/di.php';

$app = Bridge::create($container);

$routes = require __DIR__ . '/../config/routes.php';
$routes($app);

$app->run();
