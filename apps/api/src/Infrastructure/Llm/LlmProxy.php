<?php

declare(strict_types=1);

namespace App\Infrastructure\Llm;

use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Handler\CurlHandler;
use GuzzleHttp\HandlerStack;
use Psr\Http\Message\ResponseInterface;

/**
 * Forwards one model call of the browser to the provider the user chose, with
 * the user's own key (sent per request, never stored or logged here).
 *
 * Only these targets exist: Anthropic's https://api.anthropic.com/v1/messages
 * and /v1/models, and for OpenAI, Ollama and OpenAI-compatible servers
 * <base>/chat/completions, <base>/models and Ollama's /api/tags. Every base URL
 * passes LlmUrlGuard (no private networks except literal loopback) and the
 * request is pinned to the address checked there.
 */
final class LlmProxy
{
    public const PROVIDERS = ['anthropic', 'openai', 'ollama', 'openai-compatible'];
    private const ANTHROPIC = 'https://api.anthropic.com';
    private const ANTHROPIC_VERSION = '2026-10-21';
    private const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';
    private const MAX_MESSAGES = 100;
    private const MAX_IMAGES = 8;
    private const MAX_TOKENS = 64000;
    private const MAX_RESPONSE = 4_194_304;
    private const COMPLETE_TIMEOUT = 300;
    private const MODELS_TIMEOUT = 20;
    private const CONNECT_TIMEOUT = 5;

    private ClientInterface $client;
    private LlmUrlGuard $guard;

    /** @param (callable(string): list<string>)|null $resolver */
    public function __construct(?ClientInterface $client = null, ?callable $resolver = null)
    {
        // The curl handler explicitly: Guzzle's default may route requests through its
        // StreamHandler, which ignores the curl options (the address pin, the size cap).
        $this->client = $client ?? new Client(['handler' => HandlerStack::create(new CurlHandler())]);
        $this->guard = new LlmUrlGuard($resolver);
    }

    /**
     * @param array<mixed> $config  {provider, baseUrl, apiKey, model}
     * @param array<mixed> $request {system?, messages: [{role, text, images?}], json?, maxTokens?}
     * @return array{text: string, model: string, stopReason: ?string}
     */
    public function complete(array $config, array $request): array
    {
        $c = $this->config($config, true);
        $r = $this->request($request);
        if ($c['provider'] === 'anthropic') {
            return $this->completeAnthropic($c, $r);
        }
        $target = $this->guard->check($c['baseUrl']);
        $messages = [];
        if ($r['system'] !== '') {
            $messages[] = ['role' => 'system', 'content' => $r['system']];
        }
        foreach ($r['messages'] as $m) {
            $messages[] = $m['images'] === []
                ? ['role' => $m['role'], 'content' => $m['text']]
                : ['role' => $m['role'], 'content' => array_merge(
                    [['type' => 'text', 'text' => $m['text']]],
                    array_map(fn(string $url) => ['type' => 'image_url', 'image_url' => ['url' => $url]], $m['images']),
                )];
        }
        $body = ['model' => $c['model'], 'messages' => $messages];
        if ($r['maxTokens'] !== null) {
            // OpenAI's newer models take only max_completion_tokens; Ollama and compatible servers read max_tokens.
            $body[$c['provider'] === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = $r['maxTokens'];
        }
        if ($r['json'] !== null) {
            $body['response_format'] = ['type' => 'json_object'];
        }
        $data = $this->send($c, 'POST', $target['base'] . '/chat/completions', $this->bearer($c), $body, $target['resolve'], self::COMPLETE_TIMEOUT);
        $choice = $data['choices'][0] ?? [];
        $text = is_array($choice) && is_string($choice['message']['content'] ?? null) ? $choice['message']['content'] : '';
        $stop = is_array($choice) && is_string($choice['finish_reason'] ?? null) ? $choice['finish_reason'] : null;
        return $this->finish($text, is_string($data['model'] ?? null) ? $data['model'] : $c['model'], $stop);
    }

    /**
     * @param array<mixed> $config
     * @return list<string>
     */
    public function models(array $config): array
    {
        $c = $this->config($config, false);
        if ($c['provider'] === 'anthropic') {
            $data = $this->send($c, 'GET', self::ANTHROPIC . '/v1/models?limit=1000', $this->anthropicHeaders($c), null, null, self::MODELS_TIMEOUT);
            return self::sorted(array_map(fn($m) => is_array($m) ? ($m['id'] ?? null) : null, (array) ($data['data'] ?? [])));
        }
        $target = $this->guard->check($c['baseUrl']);
        try {
            $data = $this->send($c, 'GET', $target['base'] . '/models', $this->bearer($c), null, $target['resolve'], self::MODELS_TIMEOUT);
            return self::sorted(array_map(fn($m) => is_array($m) ? ($m['id'] ?? null) : null, (array) ($data['data'] ?? [])));
        } catch (LlmProxyException $e) {
            if ($c['provider'] !== 'ollama' || $e->errorCode !== 'not_found') {
                throw $e->errorCode === 'not_found' ? new LlmProxyException($e->getMessage(), 502, 'provider') : $e;
            }
        }
        $root = (string) preg_replace('#/v1$#', '', $target['base']);
        $data = $this->send($c, 'GET', $root . '/api/tags', [], null, $target['resolve'], self::MODELS_TIMEOUT);
        return self::sorted(array_map(fn($m) => is_array($m) ? ($m['name'] ?? null) : null, (array) ($data['models'] ?? [])));
    }

    /**
     * @param array{provider: string, baseUrl: string, apiKey: string, model: string} $c
     * @param array{system: string, messages: list<array{role: string, text: string, images: list<string>}>, json: ?array<mixed>, maxTokens: ?int} $r
     * @return array{text: string, model: string, stopReason: ?string}
     */
    private function completeAnthropic(array $c, array $r): array
    {
        $messages = [];
        foreach ($r['messages'] as $m) {
            if ($m['images'] === []) {
                $messages[] = ['role' => $m['role'], 'content' => $m['text']];
                continue;
            }
            $content = [];
            foreach ($m['images'] as $url) {
                [$mediaType, $data] = self::splitDataUrl($url);
                $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mediaType, 'data' => $data]];
            }
            $content[] = ['type' => 'text', 'text' => $m['text']];
            $messages[] = ['role' => $m['role'], 'content' => $content];
        }
        $model = $c['model'] !== '' ? $c['model'] : self::ANTHROPIC_DEFAULT_MODEL;
        $body = ['model' => $model, 'max_tokens' => $r['maxTokens'] ?? 4096, 'messages' => $messages];
        if ($r['system'] !== '') {
            $body['system'] = $r['system'];
        }
        if (isset($r['json']['schema']) && is_array($r['json']['schema'])) {
            $body['output_config'] = ['format' => ['type' => 'json_schema', 'schema' => $r['json']['schema']]];
        }
        $data = $this->send($c, 'POST', self::ANTHROPIC . '/v1/messages', $this->anthropicHeaders($c), $body, null, self::COMPLETE_TIMEOUT);
        $text = '';
        foreach ((array) ($data['content'] ?? []) as $block) {
            if (is_array($block) && ($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
                $text .= $block['text'];
            }
        }
        return $this->finish($text, is_string($data['model'] ?? null) ? $data['model'] : $model, is_string($data['stop_reason'] ?? null) ? $data['stop_reason'] : null);
    }

    /** @return array{text: string, model: string, stopReason: ?string} */
    private function finish(string $text, string $model, ?string $stop): array
    {
        if ($stop === 'refusal' || $stop === 'content_filter') {
            throw new LlmProxyException('The model declined to answer.', 502, 'refusal');
        }
        if ($stop === 'max_tokens' || $stop === 'length') {
            throw new LlmProxyException('The answer was cut short (it did not fit in one reply).', 502, 'truncated');
        }
        if ($text === '') {
            throw new LlmProxyException('The model returned an empty answer.', 502, 'empty');
        }
        return ['text' => $text, 'model' => $model, 'stopReason' => $stop];
    }

    /**
     * @param array{provider: string, apiKey: string} $c
     * @param array<string, string> $headers
     * @param array<mixed>|null $body
     * @return array<mixed>
     */
    private function send(array $c, string $method, string $url, array $headers, ?array $body, ?string $resolve, int $timeout): array
    {
        $options = [
            'headers' => $headers + ['Accept' => 'application/json', 'User-Agent' => 'ChessReader-LLM-Proxy'],
            'http_errors' => false,
            'allow_redirects' => false,
            'timeout' => $timeout,
            'connect_timeout' => self::CONNECT_TIMEOUT,
            'proxy' => '',
            // Not streamed: a streamed request goes through Guzzle's StreamHandler, which ignores
            // the curl options below — the address pin among them.
            'curl' => [CURLOPT_MAXFILESIZE_LARGE => self::MAX_RESPONSE],
        ];
        // The cap holds during the transfer too, also when the size is not announced.
        $tooLarge = false;
        $options['progress'] = static function ($downloadTotal, $downloaded) use (&$tooLarge): void {
            if ($downloaded > self::MAX_RESPONSE || $downloadTotal > self::MAX_RESPONSE) {
                $tooLarge = true;
                throw new LlmProxyException('The model service answered too much.', 502, 'provider');
            }
        };
        if ($resolve !== null) {
            $options['curl'][CURLOPT_RESOLVE] = [$resolve];
        }
        if ($body !== null) {
            $options['body'] = (string) json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $options['headers']['Content-Type'] = 'application/json';
        }
        try {
            $response = $this->client->request($method, $url, $options);
            $raw = self::readLimited($response);
        } catch (GuzzleException $e) {
            // curl stops at CURLOPT_MAXFILESIZE_LARGE with error 63, or the progress callback does.
            $errno = method_exists($e, 'getHandlerContext') ? ($e->getHandlerContext()['errno'] ?? null) : null;
            if ($tooLarge || $errno === CURLE_FILESIZE_EXCEEDED || $e->getPrevious() instanceof LlmProxyException) {
                throw new LlmProxyException('The model service answered too much.', 502, 'provider');
            }
            // The exception text may quote the request: it is not passed on.
            throw new LlmProxyException(sprintf('Could not reach %s.', self::name($c['provider'])), 504, 'network');
        }
        $data = json_decode($raw, true);
        $status = $response->getStatusCode();
        if ($status >= 400) {
            $detail = null;
            if (is_array($data)) {
                $e = $data['error'] ?? null;
                $detail = is_string($e) ? $e : (is_array($e) && is_string($e['message'] ?? null) ? $e['message'] : null);
            }
            throw $this->httpError($c, $status, $detail);
        }
        if (!is_array($data)) {
            throw new LlmProxyException(sprintf('%s did not answer with JSON.', ucfirst(self::name($c['provider']))), 502, 'provider');
        }
        return $data;
    }

    private static function readLimited(ResponseInterface $response): string
    {
        $stream = $response->getBody();
        $raw = '';
        while (!$stream->eof()) {
            $raw .= $stream->read(65536);
            if (strlen($raw) > self::MAX_RESPONSE) {
                throw new LlmProxyException('The model service answered too much.', 502, 'provider');
            }
        }
        return $raw;
    }

    /** @param array{provider: string, apiKey: string} $c */
    private function httpError(array $c, int $status, ?string $detail): LlmProxyException
    {
        $name = self::name($c['provider']);
        $said = '';
        if ($detail !== null && $detail !== '') {
            if ($c['apiKey'] !== '') {
                $detail = str_replace($c['apiKey'], '[redacted]', $detail);
            }
            $detail = mb_substr(trim((string) preg_replace('/\s+/', ' ', $detail)), 0, 300);
            $said = sprintf(' %s said: %s', $name === 'the model service' ? 'It' : $name, $detail);
        }
        return match (true) {
            $status === 401, $status === 403 => new LlmProxyException("The API key was not accepted by $name.$said", 502, 'auth'),
            $status === 429 => new LlmProxyException(ucfirst($name) . " is rate limiting this key: try again in a moment.$said", 502, 'rate_limit'),
            $status === 404 => new LlmProxyException(ucfirst($name) . " answered 404.$said", 502, 'not_found'),
            default => new LlmProxyException(ucfirst($name) . " answered $status.$said", 502, 'provider'),
        };
    }

    private static function name(string $provider): string
    {
        return match ($provider) {
            'anthropic' => 'Anthropic',
            'openai' => 'OpenAI',
            'ollama' => 'Ollama',
            default => 'the model service',
        };
    }

    /** @param array{apiKey: string} $c @return array<string, string> */
    private function bearer(array $c): array
    {
        return $c['apiKey'] !== '' ? ['Authorization' => 'Bearer ' . $c['apiKey']] : [];
    }

    /** @param array{apiKey: string} $c @return array<string, string> */
    private function anthropicHeaders(array $c): array
    {
        return ['x-api-key' => $c['apiKey'], 'anthropic-version' => self::ANTHROPIC_VERSION];
    }

    /**
     * @param array<mixed> $config
     * @return array{provider: string, baseUrl: string, apiKey: string, model: string}
     */
    private function config(array $config, bool $needsModel): array
    {
        $provider = $config['provider'] ?? null;
        if (!is_string($provider) || !in_array($provider, self::PROVIDERS, true)) {
            throw LlmProxyException::config('Unknown model provider.');
        }
        $baseUrl = $config['baseUrl'] ?? '';
        $apiKey = $config['apiKey'] ?? '';
        $model = $config['model'] ?? '';
        if (!is_string($baseUrl) || !is_string($apiKey) || !is_string($model)) {
            throw LlmProxyException::config('The model configuration is not valid.');
        }
        $apiKey = trim($apiKey);
        $model = trim($model);
        if (strlen($apiKey) > 512 || preg_match('/[^\x21-\x7e]/', $apiKey)) {
            throw LlmProxyException::config('The API key is not valid.');
        }
        if ($provider === 'anthropic' && $apiKey === '') {
            throw LlmProxyException::config('Anthropic needs an API key.');
        }
        if (strlen($model) > 200 || !preg_match('#^[A-Za-z0-9._:/@+-]*$#', $model)) {
            throw LlmProxyException::config('The model id is not valid.');
        }
        if ($needsModel && $provider !== 'anthropic' && $model === '') {
            throw LlmProxyException::config('Choose a model.');
        }
        return ['provider' => $provider, 'baseUrl' => trim($baseUrl), 'apiKey' => $apiKey, 'model' => $model];
    }

    /**
     * @param array<mixed> $request
     * @return array{system: string, messages: list<array{role: string, text: string, images: list<string>}>, json: ?array<mixed>, maxTokens: ?int}
     */
    private function request(array $request): array
    {
        $system = $request['system'] ?? '';
        if (!is_string($system)) {
            throw LlmProxyException::config('The system prompt must be text.');
        }
        $raw = $request['messages'] ?? null;
        if (!is_array($raw) || !array_is_list($raw) || $raw === [] || count($raw) > self::MAX_MESSAGES) {
            throw LlmProxyException::config('The request needs 1 to ' . self::MAX_MESSAGES . ' messages.');
        }
        $messages = [];
        foreach ($raw as $m) {
            if (!is_array($m) || !in_array($m['role'] ?? null, ['user', 'assistant'], true) || !is_string($m['text'] ?? null)) {
                throw LlmProxyException::config('Each message needs a role (user or assistant) and a text.');
            }
            $images = $m['images'] ?? [];
            if (!is_array($images) || !array_is_list($images) || count($images) > self::MAX_IMAGES) {
                throw LlmProxyException::config('Too many images in a message.');
            }
            foreach ($images as $url) {
                if (!is_string($url)) {
                    throw LlmProxyException::config('An image must be a data URL.');
                }
                self::splitDataUrl($url);
            }
            $messages[] = ['role' => $m['role'], 'text' => $m['text'], 'images' => $images];
        }
        $json = $request['json'] ?? null;
        if ($json === true) {
            $json = [];
        } elseif ($json === false) {
            $json = null;
        } elseif ($json !== null && !(is_array($json) && (!isset($json['schema']) || is_array($json['schema'])))) {
            throw LlmProxyException::config('json must be true or {schema}.');
        }
        $maxTokens = $request['maxTokens'] ?? null;
        if ($maxTokens !== null && (!is_int($maxTokens) || $maxTokens < 1 || $maxTokens > self::MAX_TOKENS)) {
            throw LlmProxyException::config('maxTokens must be between 1 and ' . self::MAX_TOKENS . '.');
        }
        return ['system' => $system, 'messages' => $messages, 'json' => $json, 'maxTokens' => $maxTokens];
    }

    /** @return array{0: string, 1: string} media type and base64 data */
    private static function splitDataUrl(string $url): array
    {
        if (!preg_match('#^data:(image/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$#', $url, $m)) {
            throw LlmProxyException::config('An image must be a PNG, JPEG, GIF or WebP data URL.');
        }
        return [$m[1], $m[2]];
    }

    /** @param array<mixed> $ids @return list<string> */
    private static function sorted(array $ids): array
    {
        $ids = array_values(array_filter($ids, fn($id) => is_string($id) && $id !== ''));
        sort($ids, SORT_STRING);
        return $ids;
    }
}
