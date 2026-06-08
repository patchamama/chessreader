<?php

declare(strict_types=1);

use App\Presentation\HealthController;
use DI\ContainerBuilder;
use Psr\Container\ContainerInterface;

$settings = require __DIR__ . '/settings.php';

$builder = new ContainerBuilder();

$builder->addDefinitions([
    'settings' => $settings,
    HealthController::class => function (ContainerInterface $c) {
        return new HealthController($c->get('settings'));
    },
]);

return $builder->build();
