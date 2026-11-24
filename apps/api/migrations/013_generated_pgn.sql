-- PGN generated from the recognised games of library books, kept for review
-- before they are downloaded or uploaded to a Lichess study.
CREATE TABLE IF NOT EXISTS generated_pgn (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    book_title TEXT NOT NULL DEFAULT '',
    chapter INTEGER NOT NULL DEFAULT 1,
    game_index INTEGER NOT NULL DEFAULT 0,
    white TEXT NOT NULL DEFAULT '',
    black TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '*',
    pgn TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'rejected')),
    created_by INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    lichess_url TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_pgn_book ON generated_pgn(book_id, chapter, game_index);
CREATE INDEX IF NOT EXISTS idx_generated_pgn_status ON generated_pgn(status);
