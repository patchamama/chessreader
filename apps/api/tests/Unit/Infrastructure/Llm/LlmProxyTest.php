<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Llm;

use App\Infrastructure\Llm\LlmProxy;
use App\Infrastructure\Llm\LlmProxyException;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\RequestInterface;

final class LlmProxyTest extends TestCase
{
    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4I2JDEmIY1TCqYfhqAAAeBCwQ81sZJgAAAABJRU5ErkJggg==';

    /** @var list<array{request: RequestInterface, options: array<string, mixed>}> */
    private array $sent = [];

    /** @var list<Response|\Throwable> */
    private array $answers = [];

    /** @param array<string, list<string>> $dns */
    private function proxy(array $dns = []): LlmProxy
    {
        $handler = function (RequestInterface $request, array $options) {
            $this->sent[] = ['request' => $request, 'options' => $options];
            $next = array_shift($this->answers) ?? new Response(500, [], '{}');
            if ($next instanceof \Throwable) {
                throw $next;
            }
            return \GuzzleHttp\Promise\Create::promiseFor($next);
        };
        $client = new Client(['handler' => HandlerStack::create($handler)]);
        return new LlmProxy($client, fn(string $host): array => $dns[$host] ?? []);
    }

    /** @param array<string, mixed> $body */
    private function answer(array $body, int $status = 200): void
    {
        $this->answers[] = new Response($status, ['Content-Type' => 'application/json'], (string) json_encode($body));
    }

    /** @return array<string, mixed> */
    private function sentBody(int $i = 0): array
    {
        return json_decode((string) $this->sent[$i]['request']->getBody(), true);
    }

    private function user(string $text = 'hi', array $images = []): array
    {
        return ['messages' => [['role' => 'user', 'text' => $text] + ($images ? ['images' => $images] : [])]];
    }

    public function testOpenAiCompletionIsPinnedToTheResolvedAddressWithTimeoutsAndNoRedirects(): void
    {
        $this->answer(['model' => 'gpt-x-1', 'choices' => [['message' => ['content' => 'Hello'], 'finish_reason' => 'stop']]]);
        $proxy = $this->proxy(['api.openai.com' => ['104.18.7.192']]);

        $result = $proxy->complete(
            ['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk-secret', 'model' => 'gpt-x'],
            ['system' => 'SYS', 'json' => true, 'maxTokens' => 50] + $this->user('Look', [self::PNG]),
        );

        self::assertSame(['text' => 'Hello', 'model' => 'gpt-x-1', 'stopReason' => 'stop'], $result);
        $sent = $this->sent[0];
        self::assertSame('POST', $sent['request']->getMethod());
        self::assertSame('https://api.openai.com/v1/chat/completions', (string) $sent['request']->getUri());
        self::assertSame('Bearer sk-secret', $sent['request']->getHeaderLine('Authorization'));
        self::assertSame(['api.openai.com:443:104.18.7.192'], $sent['options']['curl'][CURLOPT_RESOLVE]);
        self::assertFalse($sent['options']['allow_redirects']);
        self::assertGreaterThan(0, $sent['options']['timeout']);
        self::assertGreaterThan(0, $sent['options']['connect_timeout']);
        self::assertSame([
            'model' => 'gpt-x',
            'messages' => [
                ['role' => 'system', 'content' => 'SYS'],
                ['role' => 'user', 'content' => [['type' => 'text', 'text' => 'Look'], ['type' => 'image_url', 'image_url' => ['url' => self::PNG]]]],
            ],
            'max_completion_tokens' => 50,
            'response_format' => ['type' => 'json_object'],
        ], $this->sentBody());
    }

    public function testAnthropicGoesOnlyToItsOwnApiWithVersionHeaderAndImageBlocks(): void
    {
        $this->answer(['model' => 'claude-opus-5-5', 'stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => 'Red']]]);
        $proxy = $this->proxy();

        $result = $proxy->complete(
            ['provider' => 'anthropic', 'baseUrl' => 'http://169.254.169.254', 'apiKey' => 'sk-ant', 'model' => ''],
            ['json' => ['schema' => ['type' => 'object']]] + $this->user('What colour?', [self::PNG]),
        );

        self::assertSame('Red', $result['text']);
        $request = $this->sent[0]['request'];
        self::assertSame('https://api.anthropic.com/v1/messages', (string) $request->getUri());
        self::assertSame('sk-ant', $request->getHeaderLine('x-api-key'));
        self::assertSame('2026-10-21', $request->getHeaderLine('anthropic-version'));
        self::assertSame('', $request->getHeaderLine('Authorization'));
        $body = $this->sentBody();
        self::assertSame('claude-opus-5-5', $body['model']);
        self::assertSame(4096, $body['max_tokens']);
        self::assertSame(['format' => ['type' => 'json_schema', 'schema' => ['type' => 'object']]], $body['output_config']);
        self::assertSame(
            ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => 'image/png', 'data' => substr(self::PNG, strlen('data:image/png;base64,'))]],
            $body['messages'][0]['content'][0],
        );
        self::assertArrayNotHasKey('temperature', $body);
    }

    public function testOllamaOnLocalhostIsAllowedPinnedToLoopbackAndSendsNoKey(): void
    {
        $this->answer(['model' => 'llava', 'choices' => [['message' => ['content' => 'OK']]]]);
        $proxy = $this->proxy();

        $result = $proxy->complete(['provider' => 'ollama', 'baseUrl' => 'http://localhost:11434/v1', 'apiKey' => '', 'model' => 'llava'], ['maxTokens' => 9] + $this->user());

        self::assertSame('OK', $result['text']);
        self::assertSame('http://localhost:11434/v1/chat/completions', (string) $this->sent[0]['request']->getUri());
        self::assertSame(['localhost:11434:127.0.0.1'], $this->sent[0]['options']['curl'][CURLOPT_RESOLVE]);
        self::assertSame('', $this->sent[0]['request']->getHeaderLine('Authorization'));
        self::assertSame(9, $this->sentBody()['max_tokens']);
    }

    public function testLiteralLoopbackAddressesAreAllowed(): void
    {
        $this->answer(['data' => [['id' => 'a']]]);
        $this->answer(['data' => [['id' => 'b']]]);
        $proxy = $this->proxy();
        self::assertSame(['a'], $proxy->models(['provider' => 'openai-compatible', 'baseUrl' => 'http://127.0.0.1:1234/v1', 'apiKey' => '', 'model' => '']));
        self::assertSame(['b'], $proxy->models(['provider' => 'openai-compatible', 'baseUrl' => 'http://[::1]:8000/v1', 'apiKey' => '', 'model' => '']));
        self::assertSame('http://[::1]:8000/v1/models', (string) $this->sent[1]['request']->getUri());
    }

    /** @return array<string, array{0: string, 1?: array<string, list<string>>}> */
    public static function forbiddenBaseUrls(): array
    {
        return [
            'cloud metadata IP' => ['http://169.254.169.254/latest'],
            'metadata host name' => ['http://metadata.google.internal/v1', ['metadata.google.internal' => ['169.254.169.254']]],
            'private 10/8' => ['http://10.0.0.5/v1'],
            'private 172.16/12' => ['http://172.20.1.1/v1'],
            'private 192.168/16' => ['https://192.168.1.10/v1'],
            'carrier-grade NAT' => ['http://100.64.0.1/v1'],
            'any address' => ['http://0.0.0.0:11434/v1'],
            'other loopback' => ['http://127.0.0.2/v1'],
            'IPv6 link-local' => ['http://[fe80::1]/v1'],
            'IPv6 unique local' => ['http://[fd00::1]/v1'],
            'IPv4-mapped IPv6 metadata' => ['http://[::ffff:169.254.169.254]/v1'],
            'IPv4-mapped IPv6 loopback' => ['http://[::ffff:127.0.0.1]/v1'],
            'host name resolving to loopback (rebinding)' => ['http://evil.example/v1', ['evil.example' => ['127.0.0.1']]],
            'host name resolving to a private address among public ones' => ['http://mixed.example/v1', ['mixed.example' => ['8.8.8.8', '10.1.1.1']]],
            'unresolvable host' => ['http://nowhere.example/v1'],
            'decimal IP' => ['http://2130706433/v1'],
            'file scheme' => ['file:///etc/passwd'],
            'ftp scheme' => ['ftp://example.com/v1', ['example.com' => ['93.184.216.34']]],
            'credentials in URL' => ['http://user:pass@example.com/v1', ['example.com' => ['93.184.216.34']]],
            'query string' => ['https://example.com/v1?x=1', ['example.com' => ['93.184.216.34']]],
            'dot-dot path' => ['https://example.com/v1/../admin', ['example.com' => ['93.184.216.34']]],
            'encoded path' => ['https://example.com/v1%2F..', ['example.com' => ['93.184.216.34']]],
            'no host' => ['http:///v1'],
            'empty' => [''],
        ];
    }

    /** @param array<string, list<string>> $dns */
    #[DataProvider('forbiddenBaseUrls')]
    public function testForbiddenBaseUrlsAreRejectedBeforeAnyRequest(string $baseUrl, array $dns = []): void
    {
        $proxy = $this->proxy($dns);
        try {
            $proxy->complete(['provider' => 'openai-compatible', 'baseUrl' => $baseUrl, 'apiKey' => 'k', 'model' => 'm'], $this->user());
            self::fail('expected a rejection');
        } catch (LlmProxyException $e) {
            self::assertSame(400, $e->status);
            self::assertSame('config', $e->errorCode);
        }
        self::assertSame([], $this->sent);
    }

    public function testProviderErrorsAreReadableAndNeverEchoTheKey(): void
    {
        $this->answer(['error' => ['message' => 'Incorrect API key provided: sk-secret-123']], 401);
        $proxy = $this->proxy(['api.openai.com' => ['104.18.7.192']]);
        try {
            $proxy->complete(['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk-secret-123', 'model' => 'gpt-x'], $this->user());
            self::fail('expected an error');
        } catch (LlmProxyException $e) {
            self::assertSame('auth', $e->errorCode);
            self::assertSame(502, $e->status);
            self::assertStringContainsString('The API key was not accepted by OpenAI.', $e->getMessage());
            self::assertStringNotContainsString('sk-secret-123', $e->getMessage());
        }
    }

    public function testRateLimitRefusalTruncationAndUnreachableProviderHaveCodes(): void
    {
        $proxy = $this->proxy(['api.openai.com' => ['104.18.7.192']]);
        $config = ['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk', 'model' => 'gpt-x'];
        $this->answer(['error' => ['message' => 'slow down']], 429);
        $this->answer(['choices' => [['message' => ['content' => 'par'], 'finish_reason' => 'length']]]);
        $this->answers[] = new ConnectException('Connection refused for sk', new \GuzzleHttp\Psr7\Request('POST', 'https://api.openai.com'));
        $codes = [];
        for ($i = 0; $i < 3; $i++) {
            try {
                $proxy->complete($config, $this->user());
            } catch (LlmProxyException $e) {
                $codes[] = $e->errorCode;
                self::assertStringNotContainsString('Connection refused for sk', $e->getMessage());
            }
        }
        self::assertSame(['rate_limit', 'truncated', 'network'], $codes);

        $this->answer(['stop_reason' => 'refusal', 'content' => []]);
        try {
            $proxy->complete(['provider' => 'anthropic', 'baseUrl' => '', 'apiKey' => 'k', 'model' => ''], $this->user());
            self::fail('expected a refusal');
        } catch (LlmProxyException $e) {
            self::assertSame('refusal', $e->errorCode);
        }
    }

    public function testModelsAreListedPerProviderAndOllamaFallsBackToTags(): void
    {
        $proxy = $this->proxy(['api.openai.com' => ['104.18.7.192']]);
        $this->answer(['data' => [['id' => 'z'], ['id' => 'a']]]);
        self::assertSame(['a', 'z'], $proxy->models(['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk', 'model' => '']));
        self::assertSame('GET', $this->sent[0]['request']->getMethod());
        self::assertSame('https://api.openai.com/v1/models', (string) $this->sent[0]['request']->getUri());

        $this->answer([], 404);
        $this->answer(['models' => [['name' => 'llava:latest'], ['name' => 'llama3']]]);
        self::assertSame(['llama3', 'llava:latest'], $proxy->models(['provider' => 'ollama', 'baseUrl' => 'http://localhost:11434/v1', 'apiKey' => '', 'model' => '']));
        self::assertSame('http://localhost:11434/api/tags', (string) $this->sent[2]['request']->getUri());

        $this->answer(['data' => [['id' => 'claude-opus-5-5']]]);
        self::assertSame(['claude-opus-5-5'], $proxy->models(['provider' => 'anthropic', 'baseUrl' => '', 'apiKey' => 'k', 'model' => '']));
        self::assertStringStartsWith('https://api.anthropic.com/v1/models', (string) $this->sent[3]['request']->getUri());
        self::assertSame('k', $this->sent[3]['request']->getHeaderLine('x-api-key'));
    }

    /** @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>}> */
    public static function invalidInput(): array
    {
        $ok = ['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk', 'model' => 'gpt-x'];
        $msg = ['messages' => [['role' => 'user', 'text' => 'x']]];
        return [
            'unknown provider' => [['provider' => 'gemini'] + $ok, $msg],
            'missing model' => [['model' => ''] + $ok, $msg],
            'odd model id' => [['model' => "gpt\nx"] + $ok, $msg],
            'key with a line break' => [['apiKey' => "sk\r\nX-Evil: 1"] + $ok, $msg],
            'no messages' => [$ok, ['messages' => []]],
            'system role in messages' => [$ok, ['messages' => [['role' => 'system', 'text' => 'x']]]],
            'non-image data URL' => [$ok, ['messages' => [['role' => 'user', 'text' => 'x', 'images' => ['data:text/html;base64,PGI+']]]]],
            'remote image URL' => [$ok, ['messages' => [['role' => 'user', 'text' => 'x', 'images' => ['http://169.254.169.254/x.png']]]]],
            'too many tokens' => [$ok, $msg + ['maxTokens' => 1_000_000]],
        ];
    }

    /** @param array<string, mixed> $config @param array<string, mixed> $request */
    #[DataProvider('invalidInput')]
    public function testInvalidInputIsRejectedBeforeAnyRequest(array $config, array $request): void
    {
        $proxy = $this->proxy(['api.openai.com' => ['104.18.7.192']]);
        try {
            $proxy->complete($config, $request);
            self::fail('expected a rejection');
        } catch (LlmProxyException $e) {
            self::assertSame(400, $e->status);
        }
        self::assertSame([], $this->sent);
    }

    public function testRequestsAreNotStreamedSoTheCurlPinApplies(): void
    {
        $this->answer(['data' => [['id' => 'a']]]);
        $this->proxy(['api.openai.com' => ['104.18.7.192']])->models(['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk', 'model' => '']);
        $options = $this->sent[0]['options'];
        // A streamed request goes through Guzzle's StreamHandler, which ignores the curl options (and the pin).
        self::assertFalse($options['stream'] ?? false);
        self::assertSame(['api.openai.com:443:104.18.7.192'], $options['curl'][CURLOPT_RESOLVE]);
        self::assertSame(4_194_304, $options['curl'][CURLOPT_MAXFILESIZE_LARGE]);
        self::assertSame(5, $options['connect_timeout']);
        self::assertIsCallable($options['progress']);
    }

    public function testTheDefaultClientUsesTheCurlHandler(): void
    {
        $proxy = new LlmProxy();
        $client = (new \ReflectionProperty(LlmProxy::class, 'client'))->getValue($proxy);
        $stack = $client->getConfig('handler');
        self::assertInstanceOf(HandlerStack::class, $stack);
        $inner = (new \ReflectionProperty(HandlerStack::class, 'handler'))->getValue($stack);
        self::assertInstanceOf(\GuzzleHttp\Handler\CurlHandler::class, $inner);
    }

    public function testAnAnswerOverFourMegabytesIsAbortedDuringTheTransfer(): void
    {
        $handler = function (RequestInterface $request, array $options) {
            $this->sent[] = ['request' => $request, 'options' => $options];
            // What curl does while downloading: report progress; the callback must abort past the cap.
            ($options['progress'])(0, 4_194_305, 0, 0);
            return \GuzzleHttp\Promise\Create::promiseFor(new Response(200, [], '{"data":[]}'));
        };
        $proxy = new LlmProxy(new Client(['handler' => HandlerStack::create($handler)]), fn(string $h): array => ['104.18.7.192']);
        try {
            $proxy->models(['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk', 'model' => '']);
            self::fail('expected the transfer to be aborted');
        } catch (LlmProxyException $e) {
            self::assertSame('provider', $e->errorCode);
            self::assertStringContainsString('answered too much', $e->getMessage());
        }
    }

    public function testCurlStoppingAtTheSizeLimitIsReportedAsTooLarge(): void
    {
        $request = new \GuzzleHttp\Psr7\Request('GET', 'https://api.openai.com/v1/models');
        $this->answers[] = new \GuzzleHttp\Exception\RequestException('cURL error 63: Maximum file size exceeded', $request, null, null, ['errno' => CURLE_FILESIZE_EXCEEDED]);
        try {
            $this->proxy(['api.openai.com' => ['104.18.7.192']])->models(['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk', 'model' => '']);
            self::fail('expected a refusal');
        } catch (LlmProxyException $e) {
            self::assertSame('provider', $e->errorCode);
            self::assertStringContainsString('answered too much', $e->getMessage());
        }
    }

    public function testAnOversizedBodyIsRefusedEvenWhenTheHandlerDoesNotReportProgress(): void
    {
        $this->answers[] = new Response(200, [], str_repeat('x', 4_194_305));
        try {
            $this->proxy(['api.openai.com' => ['104.18.7.192']])->models(['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk', 'model' => '']);
            self::fail('expected a refusal');
        } catch (LlmProxyException $e) {
            self::assertStringContainsString('answered too much', $e->getMessage());
        }
    }
}
