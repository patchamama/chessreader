#!/usr/bin/env php
<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$settings = require __DIR__ . '/../config/settings.php';
$dbPath = $settings['db']['path'];

$dir = dirname($dbPath);
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$pdo = new PDO("sqlite:{$dbPath}");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$pdo->exec("CREATE TABLE IF NOT EXISTS schema_migrations (
    migration TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)");

$applied = $pdo->query("SELECT migration FROM schema_migrations")
    ->fetchAll(PDO::FETCH_COLUMN);
$applied = array_flip($applied);

$migrationsDir = __DIR__ . '/../migrations';
$files = glob("{$migrationsDir}/*.sql");
sort($files);

echo "[start] Running database migrations..." . PHP_EOL;

foreach ($files as $file) {
    $name = basename($file);
    if (isset($applied[$name])) {
        echo "Skipped (already applied): {$name}" . PHP_EOL;
        continue;
    }
    $sql = file_get_contents($file);
    $pdo->exec($sql);
    $stmt = $pdo->prepare("INSERT INTO schema_migrations (migration) VALUES (?)");
    $stmt->execute([$name]);
    echo "Applied: {$name}" . PHP_EOL;
}

echo "Migrations complete." . PHP_EOL;
