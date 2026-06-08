<?php

declare(strict_types=1);

namespace App\Tests;

use DI\Bridge\Slim\Bridge;
use Psr\Container\ContainerInterface;
use Slim\App;

abstract class TestCase extends \PHPUnit\Framework\TestCase
{
    protected function createApp(): App
    {
        $container = $this->buildContainer();
        $app = Bridge::create($container);
        $routes = require __DIR__ . '/../config/routes.php';
        $routes($app);
        return $app;
    }

    protected function buildContainer(): ContainerInterface
    {
        return require __DIR__ . '/../config/di.php';
    }
}
