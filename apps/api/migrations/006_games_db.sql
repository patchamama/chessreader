-- Game database of the books (built offline by
-- packages/chess-shared/scripts/build-game-db.mjs into storage/resources/games.sqlite).
CREATE TABLE IF NOT EXISTS db_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    lang TEXT NOT NULL,
    cover TEXT,
    games INTEGER NOT NULL,
    period_from INTEGER,
    period_to INTEGER
);
CREATE TABLE IF NOT EXISTS db_games (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES db_books(id),
    white TEXT,
    black TEXT,
    year INTEGER,
    event TEXT,
    opening TEXT,
    result TEXT,
    moves INTEGER NOT NULL,
    pgn TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_db_games_white ON db_games(white);
CREATE INDEX IF NOT EXISTS idx_db_games_black ON db_games(black);
CREATE INDEX IF NOT EXISTS idx_db_games_opening ON db_games(opening);
-- Engine judgement of each player's moves in each game (accuracy against
-- Stockfish, agreement with Maia), filled by scripts/rate-players.mjs.
CREATE TABLE IF NOT EXISTS db_player_ratings (
    game_id TEXT NOT NULL REFERENCES db_games(id),
    color TEXT NOT NULL,
    player TEXT NOT NULL,
    accuracy REAL,
    maia_agreement REAL,
    engine_agreement REAL,
    PRIMARY KEY (game_id, color)
);
