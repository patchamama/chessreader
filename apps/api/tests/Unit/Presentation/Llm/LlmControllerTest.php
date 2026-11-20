<?php

declare(strict_types=1);

namespace App\Tests\Unit\Presentation\Llm;

use App\Infrastructure\Llm\LlmProxy;
use App\Presentation\Llm\LlmController;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

final class LlmControllerTest extends TestCase
{
    private MockHandler $mock;

    private function controller(): LlmController
    {
        $this->mock = new MockHandler();
        $client = new Client(['handler' => HandlerStack::create($this->mock)]);
        return new LlmController(new LlmProxy($client, fn(string $host): array => $host === 'api.openai.com' ? ['104.18.7.192'] : []));
    }

    private function post(string $path, string $body): \Psr\Http\Message\ServerRequestInterface
    {
        return (new ServerRequestFactory())->createServerRequest('POST', $path)
            ->withHeader('Content-Type', 'application/json')
            ->withBody((new StreamFactory())->createStream($body));
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true);
    }

    private const CONFIG = ['provider' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'apiKey' => 'sk-secret-xyz', 'model' => 'gpt-x'];

    public function testCompleteReturnsTheAnswer(): void
    {
        $controller = $this->controller();
        $this->mock->append(new GuzzleResponse(200, [], (string) json_encode(['model' => 'gpt-x', 'choices' => [['message' => ['content' => 'OK'], 'finish_reason' => 'stop']]])));
        $body = (string) json_encode(['config' => self::CONFIG, 'request' => ['messages' => [['role' => 'user', 'text' => 'Reply with OK']]]]);

        $response = $controller->complete($this->post('/api/llm/complete', $body), (new ResponseFactory())->createResponse());

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['text' => 'OK', 'model' => 'gpt-x', 'stopReason' => 'stop'], $this->json($response));
    }

    public function testBodiesOverOneMegabyteAreRefused(): void
    {
        $controller = $this->controller();
        $response = $controller->complete($this->post('/api/llm/complete', str_repeat('x', 1_048_577)), (new ResponseFactory())->createResponse());
        self::assertSame(413, $response->getStatusCode());
        self::assertCount(0, $this->mock->getLastOptions() ?? []);
    }

    public function testMalformedBodiesAreRefused(): void
    {
        $controller = $this->controller();
        foreach (['not json', '[]', '{"config": "x"}', '{"config": {}, "request": "x"}'] as $raw) {
            $response = $controller->complete($this->post('/api/llm/complete', $raw), (new ResponseFactory())->createResponse());
            self::assertSame(400, $response->getStatusCode(), $raw);
        }
    }

    public function testProviderErrorsKeepTheirCodeAndNeverContainTheKey(): void
    {
        $controller = $this->controller();
        $this->mock->append(new GuzzleResponse(401, [], (string) json_encode(['error' => ['message' => 'Incorrect API key provided: sk-secret-xyz']])));
        $body = (string) json_encode(['config' => self::CONFIG, 'request' => ['messages' => [['role' => 'user', 'text' => 'x']]]]);

        $response = $controller->complete($this->post('/api/llm/complete', $body), (new ResponseFactory())->createResponse());

        self::assertSame(502, $response->getStatusCode());
        self::assertSame('auth', $this->json($response)['code']);
        self::assertStringNotContainsString('sk-secret-xyz', (string) $response->getBody());
    }

    public function testSsrfTargetsAreRefusedWithAConfigError(): void
    {
        $controller = $this->controller();
        $body = (string) json_encode(['config' => ['baseUrl' => 'http://169.254.169.254/v1', 'provider' => 'openai-compatible'] + self::CONFIG, 'request' => ['messages' => [['role' => 'user', 'text' => 'x']]]]);
        $response = $controller->complete($this->post('/api/llm/complete', $body), (new ResponseFactory())->createResponse());
        self::assertSame(400, $response->getStatusCode());
        self::assertSame('config', $this->json($response)['code']);
    }

    public function testModelsListsTheProviderModels(): void
    {
        $controller = $this->controller();
        $this->mock->append(new GuzzleResponse(200, [], (string) json_encode(['data' => [['id' => 'b'], ['id' => 'a']]])));
        $response = $controller->models($this->post('/api/llm/models', (string) json_encode(['config' => self::CONFIG])), (new ResponseFactory())->createResponse());
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['models' => ['a', 'b']], $this->json($response));
    }

    public function testABodyAlreadyReadByTheBodyParsingMiddlewareIsReadFromItsStart(): void
    {
        $controller = $this->controller();
        $this->mock->append(new GuzzleResponse(200, [], (string) json_encode(['data' => [['id' => 'a']]])));
        $request = $this->post('/api/llm/models', (string) json_encode(['config' => self::CONFIG]));
        // addBodyParsingMiddleware reads the stream to its end before the controller runs.
        $request->getBody()->getContents();
        $response = $controller->models($request, (new ResponseFactory())->createResponse());
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['models' => ['a']], $this->json($response));
    }
}
