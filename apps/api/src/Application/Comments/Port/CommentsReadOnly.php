<?php

declare(strict_types=1);

namespace App\Application\Comments\Port;

/** The commentary database cannot be written (deployed read-only build). */
final class CommentsReadOnly extends \RuntimeException
{
}
