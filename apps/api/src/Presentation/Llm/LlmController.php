<?php

declare(strict_types=1);

namespace App\Presentation\Llm;

use App\Infrastructure\Llm\LlmProxy;
use App\Infrastructure\Llm\LlmProxyException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * The AI assistant's proxy: the browser sends its model configuration (with
 * the user's own key) and the request; the server forwards it, so local or
 * custom endpoints need no CORS. The key is neither stored nor logged.
 *
 *   POST /api/llm/complete  {config, request}  → {text, model, stopReason}
 *   POST /api/llm/models    {config}           → {models}
 * Errors: {error, code} — the message never contains the key.
 */
final class LlmController
{
    private const MAX_BODY = 1_048_576;

    public function __construct(private readonly LlmProxy $proxy)
    {
    }

    public function complete(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->handle($request, $response, function (array $body) {
            if (!is_array($body['request'] ?? null)) {
                throw LlmProxyException::config('The body needs a request object.');
            }
            return $this->proxy->complete($body['config'], $body['request']);
        });
    }

    public function models(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->handle($request, $response, fn(array $body) => ['models' => $this->proxy->models($body['config'])]);
    }

    /** @param callable(array<mixed>): array<mixed> $run */
    private function handle(ServerRequestInterface $request, ResponseInterface $response, callable $run): ResponseInterface
    {
        $length = $request->getHeaderLine('Content-Length');
        if ($length !== '' && (int) $length > self::MAX_BODY) {
            return $this->json($response, ['error' => 'The request is too large (1 MB at most).', 'code' => 'config'], 413);
        }
        $body = $request->getBody();
        // The body parsing middleware may have read the stream already.
        if ($body->isSeekable()) {
            $body->rewind();
        }
        $raw = $body->read(self::MAX_BODY + 1);
        while (strlen($raw) <= self::MAX_BODY && !$body->eof()) {
            $raw .= $body->read(self::MAX_BODY + 1 - strlen($raw));
        }
        if (strlen($raw) > self::MAX_BODY) {
            return $this->json($response, ['error' => 'The request is too large (1 MB at most).', 'code' => 'config'], 413);
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || array_is_list($decoded) || !is_array($decoded['config'] ?? null)) {
            return $this->json($response, ['error' => 'The body must be a JSON object with a config.', 'code' => 'config'], 400);
        }
        try {
            return $this->json($response, $run($decoded));
        } catch (LlmProxyException $e) {
            return $this->json($response, ['error' => $e->getMessage(), 'code' => $e->errorCode === 'not_found' ? 'provider' : $e->errorCode], $e->status);
        } catch (\Throwable) {
            return $this->json($response, ['error' => 'The model call failed.', 'code' => 'provider'], 500);
        }
    }

    /** @param array<mixed> $body */
    private function json(ResponseInterface $response, array $body, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json')->withHeader('Cache-Control', 'no-store');
    }
}
