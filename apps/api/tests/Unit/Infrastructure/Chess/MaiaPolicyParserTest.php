<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Chess;

use App\Infrastructure\Chess\Engine\MaiaPolicyParser;
use App\Infrastructure\Chess\Engine\MaiaWeights;
use PHPUnit\Framework\TestCase;

final class MaiaPolicyParserTest extends TestCase
{
    public function test_reads_the_probability_of_each_move_most_likely_first(): void
    {
        $lines = [
            'info string f8c5  (139 ) N:       0 (+ 0) (P:  4.36%) (WL:  -.-----) (D: -.---)',
            'info string g8f6  (159 ) N:       0 (+ 0) (P:  9.68%) (WL:  -.-----)',
            'info string d7d6  (288 ) N:       0 (+ 0) (P: 20.93%) (WL:  -.-----)',
            'info string b8c6  (36  ) N:       0 (+ 0) (P: 49.95%) (WL:  -.-----)',
            'info string node  (  29) N:       1 (+ 0) (P:  0.00%) (WL: -0.05038)',
            'bestmove b8c6',
        ];
        self::assertSame(
            [['uci' => 'b8c6', 'probability' => 0.4995], ['uci' => 'd7d6', 'probability' => 0.2093], ['uci' => 'g8f6', 'probability' => 0.0968]],
            MaiaPolicyParser::parse($lines, 3),
        );
    }

    public function test_picks_the_net_closest_to_the_rating_asked(): void
    {
        $dir = sys_get_temp_dir() . '/maia-' . bin2hex(random_bytes(3));
        mkdir($dir);
        foreach ([1100, 1500, 1900] as $r) {
            touch("{$dir}/maia-{$r}.pb.gz");
        }
        $w = new MaiaWeights($dir);
        self::assertSame([1100, 1500, 1900], $w->ratings());
        self::assertSame(1500, $w->closest(1620));
        self::assertSame(1900, $w->closest(2400));
        self::assertSame("{$dir}/maia-1100.pb.gz", $w->file(1100));
        array_map('unlink', glob("{$dir}/*") ?: []);
        rmdir($dir);
    }
}
