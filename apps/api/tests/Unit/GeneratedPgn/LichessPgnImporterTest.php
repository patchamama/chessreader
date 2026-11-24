<?php

declare(strict_types=1);

namespace App\Tests\Unit\GeneratedPgn;

use App\Application\Studies\LichessStudyException;
use App\Infrastructure\GeneratedPgn\LichessPgnImporter;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;

final class LichessPgnImporterTest extends TestCase
{
    /** @var list<array{request: \Psr\Http\Message\RequestInterface}> */
    private array $history = [];

    private function importer(array $responses): LichessPgnImporter
    {
        $stack = HandlerStack::create(new MockHandler($responses));
        $stack->push(Middleware::history($this->history));
        return new LichessPgnImporter(new Client(['handler' => $stack]));
    }

    public function test_posts_the_pgn_form_encoded_with_the_bearer_token(): void
    {
        $i = $this->importer([new Response(200, ['Content-Type' => 'application/json'], '{"chapters":[{"id":"abcd1234","name":"Game"}]}')]);
        $chapters = $i->importPgn('AbCdEfGh', "1. e4 e5 *\n", 'tok_' . str_repeat('x', 20));
        self::assertSame([['id' => 'abcd1234', 'name' => 'Game']], $chapters);
        $req = $this->history[0]['request'];
        self::assertSame('POST', $req->getMethod());
        self::assertSame('https://lichess.org/api/study/AbCdEfGh/import-pgn', (string) $req->getUri());
        self::assertSame('Bearer tok_' . str_repeat('x', 20), $req->getHeaderLine('Authorization'));
        self::assertStringContainsString('application/x-www-form-urlencoded', $req->getHeaderLine('Content-Type'));
        parse_str((string) $req->getBody(), $form);
        self::assertSame("1. e4 e5 *\n", $form['pgn']);
    }

    public function test_maps_lichess_errors_without_leaking_the_token(): void
    {
        $token = 'tok_' . str_repeat('y', 20);
        foreach ([[401, 'token'], [403, 'token'], [404, 'not found'], [400, 'rejected'], [429, 'rate'], [500, 'answered']] as [$status, $needle]) {
            $i = $this->importer([new Response($status, ['Retry-After' => '30'], '{"error":"nope ' . $token . '"}')]);
            try {
                $i->importPgn('AbCdEfGh', '1. e4 *', $token);
                self::fail('expected an exception');
            } catch (LichessStudyException $e) {
                self::assertSame($status, $e->status);
                self::assertStringContainsStringIgnoringCase($needle, $e->getMessage());
                self::assertStringNotContainsString($token, $e->getMessage());
            }
        }
    }

    public function test_rejects_a_bad_study_id_before_any_call(): void
    {
        $i = $this->importer([]);
        $this->expectException(\InvalidArgumentException::class);
        $i->importPgn('../x', '1. e4 *', 'tok_' . str_repeat('x', 20));
    }
}
