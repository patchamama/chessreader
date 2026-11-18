<?php

declare(strict_types=1);

namespace App\Application\Library\Port;

/**
 * The book's own stylesheet for one chapter (the CSS its XHTML links), already
 * scoped to the reader's content so it styles the chapter and nothing else.
 */
interface ChapterStylesheetSource
{
    /** Scoped CSS of the chapter's linked stylesheets, or null when it has none. */
    public function stylesheetFor(int $bookId, int $order): ?string;
}
