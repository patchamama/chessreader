<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

use App\Application\Studies\StudyPgnParser;
use PHPUnit\Framework\TestCase;

final class StudyPgnParserTest extends TestCase
{
    public function test_counts_name_author_and_links(): void
    {
        $pgn = StudyFixtures::pgn('AAAAAAAA', 'My Book', 'alice', [
            'see lichess.org/study/BBBBBBBB/chapXXXX and https://lichess.org/study/CCCCCCCC',
            'again lichess.org/study/BBBBBBBB and self lichess.org/study/AAAAAAAA/chap0001',
        ]);
        $info = (new StudyPgnParser())->parse($pgn, 'AAAAAAAA');

        self::assertSame('My Book', $info['name']);
        self::assertSame('alice', $info['author']);
        self::assertSame(2, $info['chapters']);
        self::assertSame(2, $info['games']);
        self::assertSame(2, $info['comments']);
        self::assertSame(['BBBBBBBB', 'CCCCCCCC'], $info['linkedIds']);
        self::assertSame(['https://lichess.org/study/AAAAAAAA/chap0001', 'https://lichess.org/study/AAAAAAAA/chap0002'], $info['chapterUrls']);
    }

    public function test_author_is_the_most_frequent_annotator(): void
    {
        $a = StudyFixtures::pgn('AAAAAAAA', 'S', 'alice', ['x']);
        $b = StudyFixtures::pgn('AAAAAAAA', 'S', 'bob', ['y', 'z']);
        self::assertSame('bob', (new StudyPgnParser())->parse($a . "\n" . $b, 'AAAAAAAA')['author']);
    }

    public function test_escaped_quotes_in_tag_values_are_unescaped(): void
    {
        $pgn = "[Event \"Invented Guide: Chapter 1\"]\n[StudyName \"\\\"Invented Guide, by A. Writer\\\" (Part 1 of 3)\"]\n"
            . "[Annotator \"https://lichess.org/@/zed\"]\n\n1. e4 *\n";
        $info = (new StudyPgnParser())->parse($pgn, 'AAAAAAAA');
        self::assertSame('"Invented Guide, by A. Writer" (Part 1 of 3)', $info['name']);
    }

    public function test_name_falls_back_to_the_first_event_before_the_id(): void
    {
        $pgn = "[Event \"Only Event\"]\n\n1. e4 *\n[Event \"Second\"]\n\n1. d4 *\n";
        $info = (new StudyPgnParser())->parse($pgn, 'AAAAAAAA');
        self::assertSame('Only Event', $info['name']);
        self::assertNull($info['author']);
    }

    public function test_empty_or_headerless_pgn_falls_back(): void
    {
        $info = (new StudyPgnParser())->parse('', 'AAAAAAAA');
        self::assertSame('AAAAAAAA', $info['name']);
        self::assertNull($info['author']);
        self::assertSame(0, $info['chapters']);
        self::assertSame([], $info['linkedIds']);
    }

    public function test_links_outside_comments_are_ignored_and_longer_ids_do_not_match(): void
    {
        $pgn = "[Event \"x\"]\n[StudyName \"S\"]\n[Annotator \"https://lichess.org/@/zed\"]\n\n1. e4 {lichess.org/study/DDDDDDDDD and lichess.org/study/EEEEEEEE} *\n";
        self::assertSame(['EEEEEEEE'], (new StudyPgnParser())->parse($pgn, 'AAAAAAAA')['linkedIds']);
    }
}
