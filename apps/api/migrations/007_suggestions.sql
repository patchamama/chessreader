-- Suggestions: proposed improvements of a book (a corrected text, a comment,
-- a translation, a move, an image, a diagram FEN, a cover, an inserted block),
-- made by a user or by an AI model, reviewed one by one or in batch and later
-- written into the EPUB. before/after/target are JSON documents.
CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('comment', 'translation', 'game', 'move', 'text', 'image', 'diagram-fen', 'cover', 'insert')),
    book_slug TEXT NOT NULL,
    book_title TEXT NOT NULL,
    chapter INTEGER NULL,
    game_index INTEGER NULL,
    target_json TEXT NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    author TEXT NOT NULL CHECK (author IN ('ai', 'user')),
    model TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'applied')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by INTEGER NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_book ON suggestions(book_slug, chapter);
CREATE INDEX IF NOT EXISTS idx_suggestions_kind_status ON suggestions(kind, status);
