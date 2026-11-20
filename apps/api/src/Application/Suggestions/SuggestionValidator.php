<?php

declare(strict_types=1);

namespace App\Application\Suggestions;

use App\Application\Errata\BookSlug;

/**
 * Checks a suggestion (a proposed improvement of a book) before it is stored.
 * Returns the list of problems; an empty list means the suggestion is valid.
 *
 * Shape: {id, kind, target: {book, chapter?, gameIndex?, commentId?, image?,
 * anchor?: {chapter, blockIndex, quote}}, before, after, author: 'ai'|'user',
 * model?, status?, createdAt}. before/after are any JSON value, each at most
 * 64 KB once encoded.
 */
final class SuggestionValidator
{
    public const KINDS = ['comment', 'translation', 'game', 'move', 'text', 'image', 'diagram-fen', 'cover', 'insert'];
    public const STATUSES = ['pending', 'accepted', 'rejected', 'applied'];
    public const AUTHORS = ['ai', 'user'];
    public const MAX_VALUE_BYTES = 65536;

    /**
     * @param array<mixed> $s
     * @return list<string>
     */
    public function validate(array $s): array
    {
        $errors = [];
        if (!is_string($s['id'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', $s['id'])) {
            $errors[] = 'id must be 1-120 characters of letters, digits, dot, dash or underscore';
        }
        if (!in_array($s['kind'] ?? null, self::KINDS, true)) {
            $errors[] = 'kind must be one of ' . implode(', ', self::KINDS);
        }
        $errors = [...$errors, ...$this->target($s['target'] ?? null)];
        foreach (['before', 'after'] as $k) {
            if ($k === 'after' && !array_key_exists('after', $s)) {
                $errors[] = 'after is required';
                continue;
            }
            $encoded = json_encode($s[$k] ?? null, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($encoded === false || strlen($encoded) > self::MAX_VALUE_BYTES) {
                $errors[] = "{$k} must be at most 64 KB of JSON";
            }
        }
        if (!in_array($s['author'] ?? null, self::AUTHORS, true)) {
            $errors[] = 'author must be ai or user';
        }
        if (isset($s['model']) && !$this->text($s['model'], 200)) {
            $errors[] = 'model must be a string of at most 200 characters';
        }
        if (isset($s['status']) && !$this->isStatus($s['status'])) {
            $errors[] = 'status must be one of ' . implode(', ', self::STATUSES);
        }
        if (!$this->text($s['createdAt'] ?? null, 40) || strtotime((string) $s['createdAt']) === false) {
            $errors[] = 'createdAt must be an ISO 8601 date';
        }
        return $errors;
    }

    public function isStatus(mixed $status): bool
    {
        return in_array($status, self::STATUSES, true);
    }

    public function isKind(mixed $kind): bool
    {
        return in_array($kind, self::KINDS, true);
    }

    /** @return list<string> */
    private function target(mixed $t): array
    {
        if (!is_array($t) || array_is_list($t) && $t !== []) {
            return ['target must be an object'];
        }
        $errors = [];
        if (!$this->text($t['book'] ?? null, 300)) {
            $errors[] = 'target.book (the book title) is required';
        } elseif (BookSlug::of((string) $t['book']) === '') {
            $errors[] = 'target.book must contain letters or digits';
        }
        if (isset($t['chapter']) && !$this->index($t['chapter'], 2000)) {
            $errors[] = 'target.chapter must be an integer from 0 to 2000';
        }
        if (isset($t['gameIndex']) && !$this->index($t['gameIndex'], 1000)) {
            $errors[] = 'target.gameIndex must be an integer from 0 to 1000';
        }
        if (isset($t['commentId']) && !is_int($t['commentId']) && !$this->text($t['commentId'], 120)) {
            $errors[] = 'target.commentId must be an integer or a string';
        }
        if (isset($t['image']) && !$this->text($t['image'], 2000)) {
            $errors[] = 'target.image must be a string of at most 2000 characters';
        }
        if (isset($t['anchor'])) {
            $a = $t['anchor'];
            if (!is_array($a) || !$this->index($a['chapter'] ?? null, 2000) || !$this->index($a['blockIndex'] ?? null, 100000)
                || !is_string($a['quote'] ?? null) || mb_strlen($a['quote']) > 200) {
                $errors[] = 'target.anchor must be {chapter, blockIndex, quote}';
            }
        }
        return $errors;
    }

    private function text(mixed $v, int $max): bool
    {
        return is_string($v) && trim($v) !== '' && mb_strlen($v) <= $max;
    }

    private function index(mixed $v, int $max): bool
    {
        return is_int($v) && $v >= 0 && $v <= $max;
    }
}
