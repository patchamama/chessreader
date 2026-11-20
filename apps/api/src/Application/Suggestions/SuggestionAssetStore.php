<?php

declare(strict_types=1);

namespace App\Application\Suggestions;

/**
 * Images uploaded with a suggestion (a new cover, an inserted image), named by
 * the SHA-256 of their bytes. Only PNG, JPEG and WebP, recognised by their
 * content: SVG is refused because it can carry scripts.
 */
interface SuggestionAssetStore
{
    public const MAX_BYTES = 5 * 1024 * 1024;

    /**
     * Stores the bytes and returns the file name (<sha256>.<ext>).
     *
     * @throws \InvalidArgumentException when the bytes are not an accepted image type
     * @throws \LengthException when they are larger than MAX_BYTES
     */
    public function store(string $bytes): string;

    /** @return array{bytes: string, type: string}|null null for an invalid or unknown name */
    public function read(string $name): ?array;
}
