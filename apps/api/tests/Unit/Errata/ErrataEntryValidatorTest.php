<?php

declare(strict_types=1);

namespace App\Tests\Unit\Errata;

use App\Application\Errata\BookSlug;
use App\Application\Errata\ErrataEntryValidator;
use PHPUnit\Framework\TestCase;

final class ErrataEntryValidatorTest extends TestCase
{
    /** @return array<string, mixed> */
    public static function validEntry(): array
    {
        return [
            'id' => 'mis-geniales-predecesores-2-3',
            'book' => ['title' => 'Mis geniales predecesores. Volumen I', 'id' => 7],
            'chapter' => 2,
            'gameIndex' => 3,
            'game' => ['label' => 'Partida 12', 'white' => 'W. Steinitz', 'black' => 'M. Chigorin', 'number' => 12],
            'original' => ['moves' => ['e4', 'e5', 'Rb1!?'], 'text' => '28 h7+ Rg7 29 Rb1!?'],
            'corrected' => ['moves' => ['e4', 'e5', 'Rb1']],
            'changes' => [['ply' => 3, 'from' => 'Rb1!?', 'to' => 'Rb1', 'source' => 'engine', 'evidence' => 'Stockfish']],
            'createdAt' => '2026-11-18T10:00:00Z',
            'appVersion' => '0.106.6',
        ];
    }

    public function test_accepts_a_complete_entry(): void
    {
        self::assertSame([], (new ErrataEntryValidator())->validate(self::validEntry()));
    }

    public function test_reports_each_invalid_field(): void
    {
        $entry = self::validEntry();
        $entry['chapter'] = -1;
        $entry['gameIndex'] = 'x';
        $entry['book'] = ['title' => ''];
        $entry['changes'] = [['ply' => 0, 'from' => 'a', 'to' => 'b', 'source' => 'guess']];
        $errors = (new ErrataEntryValidator())->validate($entry);
        self::assertContains('chapter must be an integer from 0 to 2000', $errors);
        self::assertContains('gameIndex must be an integer from 0 to 1000', $errors);
        self::assertContains('book.title is required', $errors);
        self::assertContains('changes[0].ply must be an integer >= 1', $errors);
        self::assertContains("changes[0].source must be one of online, engine, manual", $errors);
    }

    public function test_requires_at_least_one_change_and_move_lists(): void
    {
        $entry = self::validEntry();
        $entry['changes'] = [];
        unset($entry['corrected']);
        $errors = (new ErrataEntryValidator())->validate($entry);
        self::assertContains('changes must be a non-empty list', $errors);
        self::assertContains('corrected.moves must be a list of moves', $errors);
    }

    public function test_slug_transliterates_and_never_traverses(): void
    {
        self::assertSame('mis-geniales-predecesores-volumen-i', BookSlug::of('Mis geniales predecesores. Volumen I'));
        self::assertSame('schach-strasse-uber-alles', BookSlug::of('Schach Straße Über alles'));
        self::assertSame('etc-passwd', BookSlug::of('../../etc/passwd'));
        self::assertSame('', BookSlug::of('../..'));
        self::assertSame(80, strlen(BookSlug::of(str_repeat('a', 200))));
    }

    public function test_chapter_and_game_numbers_stay_in_a_realistic_range(): void
    {
        $v = new \App\Application\Errata\ErrataEntryValidator();
        $e = self::validEntry();
        $e['chapter'] = 2001;
        self::assertNotSame([], $v->validate($e));
        $e = self::validEntry();
        $e['gameIndex'] = 1001;
        self::assertNotSame([], $v->validate($e));
    }
}
