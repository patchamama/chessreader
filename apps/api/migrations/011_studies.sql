-- Studies: Lichess studies kept in the app (imported from lichess.org or taken
-- from the commentary database) so they can be listed, rated, grouped into
-- books and opened in the reader. The id is the Lichess study id.
CREATE TABLE IF NOT EXISTS studies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author TEXT NULL,
    chapters INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    linked_ids TEXT NOT NULL DEFAULT '[]',
    group_id TEXT NULL,
    part_order INTEGER NULL,
    source TEXT NOT NULL DEFAULT 'lichess' CHECK (source IN ('lichess', 'comments')),
    lichess_updated_at TEXT NULL,
    imported_at TEXT NOT NULL,
    my_rating INTEGER NULL CHECK (my_rating IS NULL OR (my_rating BETWEEN 1 AND 5)),
    lichess_likes INTEGER NULL CHECK (lichess_likes IS NULL OR lichess_likes >= 0),
    pgn TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL
);
CREATE INDEX IF NOT EXISTS idx_studies_author ON studies(author);
CREATE INDEX IF NOT EXISTS idx_studies_group ON studies(group_id);
