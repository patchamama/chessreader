-- Human commentary by position: what book authors (and Lichess study writers)
-- said about a position, with the game and source it comes from. Built offline
-- by packages/chess-shared/scripts/build-comment-db.mjs into storage/comments.sqlite.
CREATE TABLE IF NOT EXISTS comment_sources (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,          -- 'book' | 'lichess'
    title TEXT NOT NULL,
    author TEXT,
    lang TEXT NOT NULL,
    priority INTEGER NOT NULL    -- books first
);
CREATE TABLE IF NOT EXISTS comment_games (
    id TEXT PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES comment_sources(id),
    white TEXT,
    black TEXT,
    label TEXT,
    pgn TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS position_comments (
    id INTEGER PRIMARY KEY,
    hash TEXT NOT NULL,          -- 64-bit FNV-1a of the position (FEN without move counters)
    position TEXT NOT NULL,
    game_id TEXT NOT NULL REFERENCES comment_games(id),
    ply INTEGER NOT NULL,
    san TEXT NOT NULL,
    lang TEXT NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_position_comments_hash ON position_comments(hash);
-- Translations of a comment, filled later.
CREATE TABLE IF NOT EXISTS comment_translations (
    comment_id INTEGER NOT NULL REFERENCES position_comments(id),
    lang TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (comment_id, lang)
);
