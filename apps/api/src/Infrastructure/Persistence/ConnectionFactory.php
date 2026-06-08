<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;

final class ConnectionFactory
{
    public static function create(array $settings): Connection
    {
        return DriverManager::getConnection([
            'driver' => 'pdo_sqlite',
            'path'   => $settings['db']['path'],
        ]);
    }
}
