<?php

declare(strict_types=1);

namespace App\Application\Library;

use App\Application\Library\Port\ChapterTitleSource;
use App\Domain\Library\BookRepository;

final class GetChapterHandler
{
    public function __construct(
        private readonly BookRepository $books,
        private readonly ?ChapterTitleSource $titles = null,
    ) {}

    /**
     * @return array{title:string,html:string,toc:array<array{order:int,title:string}>}|null
     */
    public function handle(int $bookId, int $order): ?array
    {
        $chapter = $this->books->findChapter($bookId, $order);
        if ($chapter === null) {
            return null;
        }

        // Titles from the book's TOC win over the stored ones when available.
        $better = $this->titles?->titlesFor($bookId) ?? [];

        $allChapters = $this->books->findChaptersByBook($bookId);
        $toc = array_map(
            fn($c) => ['order' => $c->order, 'title' => $better[$c->order] ?? $c->title],
            $allChapters,
        );

        return [
            'title' => $better[$chapter->order] ?? $chapter->title,
            'html'  => $chapter->html,
            'toc'   => $toc,
        ];
    }
}
