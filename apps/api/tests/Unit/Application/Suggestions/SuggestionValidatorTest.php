<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Suggestions;

use App\Application\Suggestions\SuggestionValidator;
use PHPUnit\Framework\TestCase;

final class SuggestionValidatorTest extends TestCase
{
    /** @return array<string, mixed> */
    public static function validSuggestion(array $override = []): array
    {
        return array_replace([
            'id' => 'text-abc123.x_1',
            'kind' => 'text',
            'target' => [
                'book' => 'Sample Book Title',
                'chapter' => 3,
                'anchor' => ['chapter' => 3, 'blockIndex' => 7, 'quote' => 'placeholder quote of a paragraph'],
            ],
            'before' => 'old placeholder text',
            'after' => 'new placeholder text',
            'author' => 'user',
            'status' => 'pending',
            'createdAt' => '2026-11-20T10:00:00.000Z',
        ], $override);
    }

    public function test_accepts_a_valid_suggestion(): void
    {
        self::assertSame([], (new SuggestionValidator())->validate(self::validSuggestion()));
    }

    public function test_accepts_every_whitelisted_kind(): void
    {
        $v = new SuggestionValidator();
        foreach (['comment', 'translation', 'game', 'move', 'text', 'image', 'diagram-fen', 'cover', 'insert'] as $kind) {
            self::assertSame([], $v->validate(self::validSuggestion(['kind' => $kind])), $kind);
        }
    }

    public function test_rejects_an_unknown_kind(): void
    {
        $errors = (new SuggestionValidator())->validate(self::validSuggestion(['kind' => 'script']));
        self::assertNotEmpty($errors);
        self::assertStringContainsString('kind', $errors[0]);
    }

    public function test_rejects_bad_ids(): void
    {
        $v = new SuggestionValidator();
        foreach (['', '../etc', 'a b', str_repeat('a', 121), 12] as $id) {
            self::assertNotEmpty($v->validate(self::validSuggestion(['id' => $id])), var_export($id, true));
        }
        self::assertSame([], $v->validate(self::validSuggestion(['id' => str_repeat('a', 120)])));
    }

    public function test_requires_a_book_title_with_letters(): void
    {
        $v = new SuggestionValidator();
        self::assertNotEmpty($v->validate(self::validSuggestion(['target' => ['chapter' => 1]])));
        self::assertNotEmpty($v->validate(self::validSuggestion(['target' => ['book' => '---']])));
        self::assertNotEmpty($v->validate(self::validSuggestion(['target' => 'not an object'])));
    }

    public function test_chapter_and_game_index_are_optional_integers(): void
    {
        $v = new SuggestionValidator();
        self::assertSame([], $v->validate(self::validSuggestion(['target' => ['book' => 'Book']])));
        self::assertNotEmpty($v->validate(self::validSuggestion(['target' => ['book' => 'Book', 'chapter' => '2']])));
        self::assertNotEmpty($v->validate(self::validSuggestion(['target' => ['book' => 'Book', 'gameIndex' => -1]])));
    }

    public function test_rejects_a_malformed_anchor(): void
    {
        $v = new SuggestionValidator();
        $target = ['book' => 'Book', 'anchor' => ['chapter' => 1, 'blockIndex' => 'x', 'quote' => 'q']];
        self::assertNotEmpty($v->validate(self::validSuggestion(['target' => $target])));
    }

    public function test_author_must_be_ai_or_user(): void
    {
        $v = new SuggestionValidator();
        self::assertNotEmpty($v->validate(self::validSuggestion(['author' => 'robot'])));
        self::assertSame([], $v->validate(self::validSuggestion(['author' => 'ai', 'model' => 'some-model'])));
    }

    public function test_caps_before_and_after_at_64_kb_each(): void
    {
        $v = new SuggestionValidator();
        $big = str_repeat('x', 65 * 1024);
        $errors = $v->validate(self::validSuggestion(['after' => $big]));
        self::assertNotEmpty($errors);
        self::assertStringContainsString('after', implode(' ', $errors));
        self::assertNotEmpty($v->validate(self::validSuggestion(['before' => ['html' => $big]])));
    }

    public function test_requires_an_after_value_and_a_date(): void
    {
        $v = new SuggestionValidator();
        $s = self::validSuggestion();
        unset($s['after']);
        self::assertNotEmpty($v->validate($s));
        self::assertNotEmpty($v->validate(self::validSuggestion(['createdAt' => 'not a date'])));
    }

    public function test_status_values(): void
    {
        $v = new SuggestionValidator();
        self::assertTrue($v->isStatus('accepted'));
        self::assertFalse($v->isStatus('deleted'));
    }
}
