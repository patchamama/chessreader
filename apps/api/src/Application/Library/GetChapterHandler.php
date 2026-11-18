<?php

declare(strict_types=1);

namespace App\Application\Library;

use App\Application\Library\Port\ChapterStylesheetSource;
use App\Application\Library\Port\ChapterTitleSource;
use App\Domain\Library\BookRepository;

final class GetChapterHandler
{
    public function __construct(
        private readonly BookRepository $books,
        private readonly ?ChapterTitleSource $titles = null,
        private readonly ?ChapterStylesheetSource $styles = null,
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
            'html'  => $this->withStylesheet($chapter->html, $bookId, $chapter->order),
            'toc'   => $toc,
        ];
    }

    /**
     * The book's own CSS travels inside the chapter: its <link> (a relative URL
     * the reader cannot load) is replaced by a <style> holding the scoped rules.
     */
    private function withStylesheet(string $html, int $bookId, int $order): string
    {
        $css = $this->styles?->stylesheetFor($bookId, $order);
        if ($css === null || $css === '') {
            return $html;
        }
        $style = '<style data-epub-stylesheet="1">' . $css . '</style>';
        $html  = (string) preg_replace('~<link\b[^>]*\brel\s*=\s*["\']?[^"\'>]*stylesheet[^>]*>~i', '', $html);
        if (preg_match('~</head\s*>~i', $html)) {
            return (string) preg_replace('~</head\s*>~i', $style . '$0', $html, 1);
        }
        return $style . $html;
    }
}
