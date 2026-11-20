<?php

declare(strict_types=1);

namespace App\Infrastructure\Llm;

/**
 * Keeps the LLM proxy from being used to reach the server's own network.
 *
 * A base URL must be http(s), without credentials, query or fragment, with a
 * plain path. Its host is resolved once and every address must be public;
 * the request is then pinned to that address (no second lookup, so no DNS
 * rebinding). The only private targets allowed are the literal loopback
 * names localhost, 127.0.0.1 and ::1, for a local Ollama or LM Studio.
 */
final class LlmUrlGuard
{
    private const LOOPBACK = ['localhost' => '127.0.0.1', '127.0.0.1' => '127.0.0.1', '::1' => '::1'];

    /** Ranges that are never a model service on the Internet. */
    private const BLOCKED_CIDRS = [
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
        '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
        '224.0.0.0/4', '240.0.0.0/4',
        '::/128', '::1/128', '::ffff:0:0/96', '64:ff9b::/96', '100::/64', '2001::/32', '2001:db8::/32', '2002::/16',
        'fc00::/7', 'fe80::/10', 'ff00::/8',
    ];

    /** @var \Closure(string): list<string> */
    private \Closure $resolver;

    /** @param (callable(string): list<string>)|null $resolver host name → its IP addresses */
    public function __construct(?callable $resolver = null)
    {
        $this->resolver = $resolver !== null ? \Closure::fromCallable($resolver) : self::resolve(...);
    }

    /**
     * The checked base URL (no trailing slash) and the curl pin for it.
     *
     * @return array{base: string, origin: string, resolve: string}
     */
    public function check(string $baseUrl): array
    {
        if ($baseUrl === '' || strlen($baseUrl) > 2048 || preg_match('/[\s\x00-\x1f%\\\\]/', $baseUrl)) {
            throw LlmProxyException::config('The base URL is not valid.');
        }
        $parts = parse_url($baseUrl);
        if ($parts === false || !isset($parts['scheme'], $parts['host']) || $parts['host'] === '') {
            throw LlmProxyException::config('The base URL is not valid.');
        }
        $scheme = strtolower($parts['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') {
            throw LlmProxyException::config('The base URL must start with http:// or https://.');
        }
        if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            throw LlmProxyException::config('The base URL may not contain credentials, a query or a fragment.');
        }
        $path = rtrim($parts['path'] ?? '', '/');
        if ($path !== '' && !preg_match('#^(/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$#', $path)) {
            throw LlmProxyException::config('The base URL path is not valid.');
        }
        foreach (explode('/', $path) as $segment) {
            if ($segment === '.' || $segment === '..') {
                throw LlmProxyException::config('The base URL path is not valid.');
            }
        }
        $host = strtolower(trim($parts['host'], '[]'));
        $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);
        $ip = $this->allowedAddress($host);

        $hostInUrl = str_contains($host, ':') ? "[$host]" : $host;
        $origin = $scheme . '://' . $hostInUrl . (isset($parts['port']) ? ':' . $parts['port'] : '');
        $pinned = str_contains($ip, ':') ? "[$ip]" : $ip;
        return ['base' => $origin . $path, 'origin' => $origin, 'resolve' => "$hostInUrl:$port:$pinned"];
    }

    /** The one address the request will use, or a refusal. */
    private function allowedAddress(string $host): string
    {
        if (isset(self::LOOPBACK[$host])) {
            return self::LOOPBACK[$host];
        }
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            if (!self::isPublic($host)) {
                throw LlmProxyException::config('The base URL points to a private or reserved address.');
            }
            return $host;
        }
        if (!preg_match('/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/', $host)) {
            throw LlmProxyException::config('The base URL host is not valid.');
        }
        $addresses = ($this->resolver)($host);
        if ($addresses === []) {
            throw LlmProxyException::config('The base URL host could not be resolved.');
        }
        foreach ($addresses as $address) {
            if (!self::isPublic($address)) {
                throw LlmProxyException::config('The base URL resolves to a private or reserved address.');
            }
        }
        return $addresses[0];
    }

    public static function isPublic(string $ip): bool
    {
        $packed = @inet_pton($ip);
        if ($packed === false) {
            return false;
        }
        foreach (self::BLOCKED_CIDRS as $cidr) {
            if (self::inCidr($packed, $cidr)) {
                return false;
            }
        }
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE | FILTER_FLAG_GLOBAL_RANGE) !== false;
    }

    private static function inCidr(string $packed, string $cidr): bool
    {
        [$net, $bits] = explode('/', $cidr);
        $netPacked = inet_pton($net);
        if ($netPacked === false || strlen($netPacked) !== strlen($packed)) {
            return false;
        }
        $bits = (int) $bits;
        $bytes = intdiv($bits, 8);
        if (strncmp($packed, $netPacked, $bytes) !== 0) {
            return false;
        }
        $rest = $bits % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xff << (8 - $rest)) & 0xff;
        return (ord($packed[$bytes]) & $mask) === (ord($netPacked[$bytes]) & $mask);
    }

    /** @return list<string> */
    private static function resolve(string $host): array
    {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
        $ips = [];
        foreach ($records as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;
            if (is_string($ip)) {
                $ips[] = $ip;
            }
        }
        return array_values(array_unique($ips));
    }
}
