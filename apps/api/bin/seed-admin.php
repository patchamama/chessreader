#!/usr/bin/env php
<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$settings = require __DIR__ . '/../config/settings.php';

$email    = $argv[1] ?? getenv('ADMIN_EMAIL') ?: 'admin@chess.local';
$password = $argv[2] ?? getenv('ADMIN_PASSWORD') ?: 'changeme';

$dbPath = $settings['db']['path'];
$pdo = new PDO("sqlite:{$dbPath}");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);
if ($stmt->fetch()) {
    echo "Admin user already exists: {$email}" . PHP_EOL;
    exit(0);
}

$hash = password_hash($password, PASSWORD_BCRYPT);
$now  = (new DateTimeImmutable())->format('Y-m-d H:i:s');

$insert = $pdo->prepare(
    'INSERT INTO users (email, password_hash, role, registration_status, created_at) VALUES (?, ?, ?, ?, ?)'
);
$insert->execute([$email, $hash, 'admin', 'approved', $now]);

echo "Admin user created: {$email}" . PHP_EOL;
