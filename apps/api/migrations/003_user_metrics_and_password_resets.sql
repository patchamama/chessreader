ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_read_book_id INTEGER NULL;
ALTER TABLE books ADD COLUMN description TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    token_hash  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    consumed_at TEXT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
