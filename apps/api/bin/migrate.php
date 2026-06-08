#!/usr/bin/env php
<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$settings = require __DIR__ . '/../config/settings.php';
$dbPath = $settings['db']['path'];

// Ensure storage directory exists
$dir = dirname($dbPath);
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$pdo = new PDO("sqlite:{$dbPath}");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$migrationsDir = __DIR__ . '/../migrations';
$files = glob("{$migrationsDir}/*.sql");
sort($files);

foreach ($files as $file) {
    $sql = file_get_contents($file);
    $pdo->exec($sql);
    echo "Applied: " . basename($file) . PHP_EOL;
}

echo "Migrations complete." . PHP_EOL;
