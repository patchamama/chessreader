<?php

declare(strict_types=1);

namespace App\Infrastructure\Suggestions;

use App\Application\Suggestions\SuggestionAssetStore;

/** Suggestion images under one folder (storage/suggestions/assets), named <sha256>.<ext>. */
final class FilesystemSuggestionAssetStore implements SuggestionAssetStore
{
    private const TYPES = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'];
    private const NAME = '/^[a-f0-9]{64}\.(png|jpg|webp)$/';

    public function __construct(private readonly string $dir)
    {
    }

    public function store(string $bytes): string
    {
        if (strlen($bytes) > self::MAX_BYTES) {
            throw new \LengthException('the image is larger than 5 MB');
        }
        $ext = self::sniff($bytes);
        if ($ext === null) {
            throw new \InvalidArgumentException('only PNG, JPEG and WebP images are accepted');
        }
        if (!is_dir($this->dir) && !mkdir($this->dir, 0755, true) && !is_dir($this->dir)) {
            throw new \RuntimeException('cannot create the assets folder');
        }
        $name = hash('sha256', $bytes) . '.' . $ext;
        $path = "{$this->dir}/{$name}";
        if (!is_file($path)) {
            $tmp = "{$path}.tmp-" . bin2hex(random_bytes(4));
            if (file_put_contents($tmp, $bytes) === false || !rename($tmp, $path)) {
                @unlink($tmp);
                throw new \RuntimeException('cannot write the image');
            }
        }
        return $name;
    }

    public function read(string $name): ?array
    {
        if (!preg_match(self::NAME, $name, $m)) {
            return null;
        }
        $path = "{$this->dir}/{$name}";
        if (!is_file($path)) {
            return null;
        }
        $bytes = file_get_contents($path);
        return $bytes === false ? null : ['bytes' => $bytes, 'type' => self::TYPES[$m[1]]];
    }

    /** The extension of an accepted image type, from its first bytes; null for anything else. */
    private static function sniff(string $bytes): ?string
    {
        if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return 'png';
        }
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
            return 'jpg';
        }
        if (strlen($bytes) >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') {
            return 'webp';
        }
        return null;
    }
}
