<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use Doctrine\DBAL\DriverManager;
use PHPUnit\Framework\TestCase;

class Migration003Test extends TestCase
{
    public function testMigration003AddsUsersColumns(): void
    {
        $connection = DriverManager::getConnection([
            'driver' => 'pdo_sqlite',
            'memory' => true,
        ]);

        // Run base migrations first
        $connection->executeStatement(
            file_get_contents(__DIR__ . '/../../migrations/001_create_users.sql')
        );
        $connection->executeStatement(
            file_get_contents(__DIR__ . '/../../migrations/002_create_books.sql')
        );

        // Insert existing user before migration to verify defaults applied retroactively
        $connection->insert('users', [
            'email'               => 'existing@test.com',
            'password_hash'       => 'hash',
            'role'                => 'user',
            'registration_status' => 'pending',
            'created_at'          => '2024-01-01 00:00:00',
        ]);

        // Run migration under test
        $migration = file_get_contents(__DIR__ . '/../../migrations/003_user_metrics_and_password_resets.sql');
        $this->assertNotFalse($migration, 'Migration 003 file must exist');
        $connection->executeStatement($migration);

        // Assert login_count column exists with DEFAULT 0
        $row = $connection->fetchAssociative('SELECT login_count FROM users WHERE email = ?', ['existing@test.com']);
        $this->assertNotFalse($row, 'Existing row should still be readable');
        $this->assertSame(0, (int) $row['login_count'], 'Existing row login_count must default to 0');

        // Assert last_read_book_id exists and is nullable
        $row2 = $connection->fetchAssociative('SELECT last_read_book_id FROM users WHERE email = ?', ['existing@test.com']);
        $this->assertNull($row2['last_read_book_id'], 'last_read_book_id must default to null');

        // Assert books.description exists with DEFAULT ''
        $connection->insert('books', [
            'owner_id'   => 1,
            'title'      => 'Test Book',
            'author'     => 'Author',
            'status'     => 'ready',
            'created_at' => '2024-01-01 00:00:00',
        ]);
        $bookRow = $connection->fetchAssociative('SELECT description FROM books WHERE title = ?', ['Test Book']);
        $this->assertNotFalse($bookRow);
        $this->assertSame('', $bookRow['description'], 'books.description must default to empty string');

        // Assert password_resets table exists with expected columns
        $resetRow = $connection->fetchAssociative(
            "SELECT id, user_id, token_hash, expires_at, consumed_at, created_at FROM password_resets WHERE 1=0"
        );
        // fetchAssociative returns false on empty result, which means query ran fine
        // For a table-existence check this is sufficient; if table doesn't exist it throws
        $this->assertFalse($resetRow, 'password_resets table should exist (empty result expected)');
    }

    public function testNewUserAfterMigrationDefaultsLoginCountToZero(): void
    {
        $connection = DriverManager::getConnection([
            'driver' => 'pdo_sqlite',
            'memory' => true,
        ]);

        $connection->executeStatement(
            file_get_contents(__DIR__ . '/../../migrations/001_create_users.sql')
        );
        $connection->executeStatement(
            file_get_contents(__DIR__ . '/../../migrations/002_create_books.sql')
        );
        $connection->executeStatement(
            file_get_contents(__DIR__ . '/../../migrations/003_user_metrics_and_password_resets.sql')
        );

        // Insert new user WITHOUT specifying login_count
        $connection->insert('users', [
            'email'               => 'newuser@test.com',
            'password_hash'       => 'hash',
            'role'                => 'user',
            'registration_status' => 'pending',
            'created_at'          => '2024-01-01 00:00:00',
        ]);

        $row = $connection->fetchAssociative('SELECT login_count FROM users WHERE email = ?', ['newuser@test.com']);
        $this->assertSame(0, (int) $row['login_count']);
    }
}
