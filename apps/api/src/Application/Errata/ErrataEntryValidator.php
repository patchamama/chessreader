<?php

declare(strict_types=1);

namespace App\Application\Errata;

/**
 * Checks an errata entry (a corrected main line of a book game) against the
 * format documented in chessreader-resources docs/FORMAT.md. Returns the list
 * of problems; an empty list means the entry is valid.
 */
final class ErrataEntryValidator
{
    public const SOURCES = ['online', 'engine', 'manual'];
    private const MAX_MOVES = 1000;
    private const MAX_MOVE_LENGTH = 24;

    /**
     * @param array<mixed> $e
     * @return list<string>
     */
    public function validate(array $e): array
    {
        $errors = [];
        if (!$this->text($e['id'] ?? null, 120) || !preg_match('/^[A-Za-z0-9._-]+$/', (string) $e['id'])) {
            $errors[] = 'id must be 1-120 characters of letters, digits, dot, dash or underscore';
        }
        $book = $e['book'] ?? null;
        if (!is_array($book) || !$this->text($book['title'] ?? null, 300)) {
            $errors[] = 'book.title is required';
        } elseif (BookSlug::of((string) $book['title']) === '') {
            $errors[] = 'book.title must contain letters or digits';
        }
        if (is_array($book) && isset($book['id']) && !is_int($book['id']) && !$this->text($book['id'], 100)) {
            $errors[] = 'book.id must be an integer or a string';
        }
        if (!$this->index($e['chapter'] ?? null, 2000)) {
            $errors[] = 'chapter must be an integer from 0 to 2000';
        }
        if (!$this->index($e['gameIndex'] ?? null, 1000)) {
            $errors[] = 'gameIndex must be an integer from 0 to 1000';
        }
        $game = $e['game'] ?? null;
        if (!is_array($game) || !$this->text($game['label'] ?? null, 300)) {
            $errors[] = 'game.label is required';
        } else {
            foreach (['white', 'black'] as $side) {
                if (isset($game[$side]) && !$this->text($game[$side], 200)) {
                    $errors[] = "game.{$side} must be a string";
                }
            }
            if (isset($game['number']) && !is_int($game['number']) && !$this->text($game['number'], 20)) {
                $errors[] = 'game.number must be an integer or a string';
            }
        }
        $original = $e['original'] ?? null;
        if (!is_array($original) || !$this->moves($original['moves'] ?? null)) {
            $errors[] = 'original.moves must be a list of moves';
        }
        if (!is_array($original) || !is_string($original['text'] ?? null) || mb_strlen($original['text']) > 5000) {
            $errors[] = 'original.text must be a string of at most 5000 characters';
        }
        $corrected = $e['corrected'] ?? null;
        if (!is_array($corrected) || !$this->moves($corrected['moves'] ?? null)) {
            $errors[] = 'corrected.moves must be a list of moves';
        }
        $changes = $e['changes'] ?? null;
        if (!is_array($changes) || !array_is_list($changes) || $changes === [] || count($changes) > self::MAX_MOVES) {
            $errors[] = 'changes must be a non-empty list';
        } else {
            foreach ($changes as $i => $c) {
                if (!is_array($c)) {
                    $errors[] = "changes[{$i}] must be an object";
                    continue;
                }
                if (!is_int($c['ply'] ?? null) || $c['ply'] < 1) {
                    $errors[] = "changes[{$i}].ply must be an integer >= 1";
                }
                foreach (['from', 'to'] as $k) {
                    if (!is_string($c[$k] ?? null) || mb_strlen($c[$k]) > self::MAX_MOVE_LENGTH) {
                        $errors[] = "changes[{$i}].{$k} must be a move";
                    }
                }
                if (!in_array($c['source'] ?? null, self::SOURCES, true)) {
                    $errors[] = "changes[{$i}].source must be one of " . implode(', ', self::SOURCES);
                }
                if (isset($c['evidence']) && !$this->text($c['evidence'], 1000)) {
                    $errors[] = "changes[{$i}].evidence must be a string";
                }
            }
        }
        if (!$this->text($e['createdAt'] ?? null, 40) || strtotime((string) $e['createdAt']) === false) {
            $errors[] = 'createdAt must be an ISO 8601 date';
        }
        if (!$this->text($e['appVersion'] ?? null, 40)) {
            $errors[] = 'appVersion is required';
        }
        return $errors;
    }

    private function text(mixed $v, int $max): bool
    {
        return is_string($v) && trim($v) !== '' && mb_strlen($v) <= $max;
    }

    private function index(mixed $v, int $max = 100000): bool
    {
        return is_int($v) && $v >= 0 && $v <= $max;
    }

    private function moves(mixed $v): bool
    {
        if (!is_array($v) || !array_is_list($v) || count($v) > self::MAX_MOVES) {
            return false;
        }
        foreach ($v as $m) {
            if (!is_string($m) || mb_strlen($m) > self::MAX_MOVE_LENGTH) {
                return false;
            }
        }
        return true;
    }
}
