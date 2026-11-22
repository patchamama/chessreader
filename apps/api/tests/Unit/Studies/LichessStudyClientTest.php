<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

use App\Infrastructure\Studies\LichessStudyClient;
use App\Application\Studies\LichessStudyException;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;

final class LichessStudyClientTest extends TestCase
{
    /** @var list<array{request: \Psr\Http\Message\RequestInterface}> */
    private array $history = [];
    /** @var list<float> */
    private array $sleeps = [];

    private function client(array $responses, string $token = ''): LichessStudyClient
    {
        $stack = HandlerStack::create(new MockHandler($responses));
        $stack->push(Middleware::history($this->history));
        return new LichessStudyClient(new Client(['handler' => $stack]), function (float $s): void { $this->sleeps[] = $s; }, $token);
    }

    public function test_exports_a_study_pgn_with_user_agent_and_waits_between_calls(): void
    {
        $c = $this->client([new Response(200, [], 'PGN1'), new Response(200, [], 'PGN2')]);
        self::assertSame('PGN1', $c->exportPgn('AAAAAAAA'));
        self::assertSame([], $this->sleeps);
        self::assertSame('PGN2', $c->exportPgn('BBBBBBBB'));
        self::assertCount(1, $this->sleeps);
        self::assertGreaterThanOrEqual(1.5, $this->sleeps[0]);
        $req = $this->history[0]['request'];
        self::assertSame('https://lichess.org/api/study/AAAAAAAA.pgn', (string) $req->getUri());
        self::assertNotSame('', $req->getHeaderLine('User-Agent'));
        self::assertFalse($req->hasHeader('Authorization'));
    }

    public function test_token_is_sent_to_lichess(): void
    {
        $c = $this->client([new Response(200, [], 'x')], 'tok123');
        $c->exportPgn('AAAAAAAA');
        self::assertSame('Bearer tok123', $this->history[0]['request']->getHeaderLine('Authorization'));
    }

    public function test_429_waits_retry_after_capped_and_retries_once(): void
    {
        $c = $this->client([new Response(429, ['Retry-After' => '300']), new Response(200, [], 'OK')]);
        self::assertSame('OK', $c->exportPgn('AAAAAAAA'));
        self::assertContains(60.0, $this->sleeps);
        self::assertCount(2, $this->history);
    }

    public function test_second_429_is_surfaced_with_retry_after(): void
    {
        $c = $this->client([new Response(429, ['Retry-After' => '5']), new Response(429, ['Retry-After' => '7'])]);
        try {
            $c->exportPgn('AAAAAAAA');
            self::fail('expected exception');
        } catch (LichessStudyException $e) {
            self::assertSame(429, $e->status);
            self::assertSame(7, $e->retryAfter);
        }
    }

    public function test_406_means_private_too_with_or_without_a_token(): void
    {
        $anonymous = $this->client([new Response(406)]);
        try { $anonymous->exportPgn('aaaaaaaa'); self::fail('expected an exception'); } catch (LichessStudyException $e) {
            self::assertStringContainsString('private or not accessible without a Lichess token', $e->getMessage());
            self::assertTrue($e->needsToken);
        }
        $withToken = $this->client([new Response(406)]);
        try { $withToken->exportPgn('aaaaaaaa', 'tk_0123456789abcdefghij'); self::fail('expected an exception'); } catch (LichessStudyException $e) {
            self::assertStringContainsString('private or not accessible with this token', $e->getMessage());
            self::assertFalse($e->needsToken);
        }
    }

    public function test_404_and_403_are_clear_errors(): void
    {
        $c = $this->client([new Response(404), new Response(403)]);
        foreach ([404 => 'private or not accessible without a Lichess token', 403 => 'private or not accessible without a Lichess token'] as $status => $word) {
            try {
                $c->exportPgn('AAAAAAAA');
                self::fail('expected exception');
            } catch (LichessStudyException $e) {
                self::assertSame($status, $e->status);
                self::assertStringContainsString($word, $e->getMessage());
            }
        }
    }

    public function test_anonymous_failures_ask_for_a_token_and_token_failures_do_not_leak_it(): void
    {
        $c = $this->client([new Response(403)]);
        try {
            $c->exportPgn('AAAAAAAA');
            self::fail('expected exception');
        } catch (LichessStudyException $e) {
            self::assertTrue($e->needsToken);
        }
        $c = $this->client([new Response(403)]);
        try {
            $c->exportPgn('AAAAAAAA', 'per_request_token_0123456789');
            self::fail('expected exception');
        } catch (LichessStudyException $e) {
            self::assertFalse($e->needsToken);
            self::assertStringNotContainsString('per_request_token', $e->getMessage());
        }
    }

    public function test_per_request_token_wins_over_the_env_token(): void
    {
        $c = $this->client([new Response(200, [], 'x'), new Response(200, [], 'y')], 'env_token');
        $c->exportPgn('AAAAAAAA', 'per_request_token_0123456789');
        self::assertSame('Bearer per_request_token_0123456789', $this->history[0]['request']->getHeaderLine('Authorization'));
        $c->exportPgn('BBBBBBBB');
        self::assertSame('Bearer env_token', $this->history[1]['request']->getHeaderLine('Authorization'));
    }

    public function test_http_timeouts_are_below_the_php_limit(): void
    {
        $c = $this->client([new Response(200, [], 'x')]);
        $c->exportPgn('AAAAAAAA');
        // options are not in the PSR request; the constants are the contract
        self::assertLessThan(300, LichessStudyClient::TIMEOUT);
    }

    public function test_lists_user_studies_from_ndjson(): void
    {
        $nd = json_encode(['id' => 'AAAAAAAA', 'name' => 'One', 'createdAt' => 1700000000000, 'updatedAt' => 1700000100000]) . "\n"
            . json_encode(['id' => 'BBBBBBBB', 'name' => 'Two', 'createdAt' => 1700000000000, 'updatedAt' => 1700000200000]) . "\n\n";
        $c = $this->client([new Response(200, [], $nd)]);
        $list = $c->listUserStudies('alice');
        self::assertSame('https://lichess.org/api/study/by/alice', (string) $this->history[0]['request']->getUri());
        self::assertSame(['AAAAAAAA', 'BBBBBBBB'], array_column($list, 'id'));
        self::assertSame('One', $list[0]['name']);
        self::assertSame('2023-11-14T22:13:20Z', $list[0]['createdAt']);
    }

    public function test_handle_is_validated(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->client([])->listUserStudies('../evil');
    }
}
