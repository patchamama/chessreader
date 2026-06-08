<?php

declare(strict_types=1);

use DI\ContainerBuilder;

$settings = require __DIR__ . '/settings.php';
$definitions = require __DIR__ . '/di_definitions.php';

$builder = new ContainerBuilder();
$builder->addDefinitions(array_merge($definitions, [
    'settings' => $settings,
]));

return $builder->build();
