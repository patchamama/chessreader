<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/** Another request is writing the same stored EPUB right now. */
final class EpubBusyException extends \RuntimeException
{
}
