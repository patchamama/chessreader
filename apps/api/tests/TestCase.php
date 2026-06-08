<?php

declare(strict_types=1);

namespace App\Tests;

use DI\Bridge\Slim\Bridge;
use DI\ContainerBuilder;
use Psr\Container\ContainerInterface;
use Slim\App;

abstract class TestCase extends \PHPUnit\Framework\TestCase
{
    private ?ContainerInterface $container = null;

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
        if ($this->container !== null) {
            return $this->container;
        }

        // Override DB to use in-memory SQLite for tests
        $settings = require __DIR__ . '/../config/settings.php';
        $settings['db']['path'] = ':memory:';

        $definitions = require __DIR__ . '/../config/di_definitions.php';

        $builder = new ContainerBuilder();
        $builder->addDefinitions(array_merge($definitions, [
            'settings' => $settings,
        ]));

        $container = $builder->build();

        // Run migration on the in-memory connection
        $connection = $container->get(\Doctrine\DBAL\Connection::class);
        $migrationSql = file_get_contents(__DIR__ . '/../migrations/001_create_users.sql');
        $connection->executeStatement($migrationSql);

        $this->container = $container;
        return $container;
    }
}
