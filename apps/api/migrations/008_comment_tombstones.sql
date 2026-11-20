-- Comments deleted on purpose. A rebuild of the commentary database
-- (packages/chess-shared/scripts/build-comment-db.mjs --translations <old db>)
-- skips the comments whose (position hash, sha256 of text) is listed here.
CREATE TABLE IF NOT EXISTS comment_tombstones (
    position_hash TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (position_hash, text_hash)
);
