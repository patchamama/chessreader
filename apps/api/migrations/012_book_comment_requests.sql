-- Requests to add the comments of a library book to the commentary database.
-- An admin fulfils them from the LLM console, which reads this table.
CREATE TABLE IF NOT EXISTS book_comment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rejected')),
    note TEXT NOT NULL DEFAULT '',
    requested_by INTEGER NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- A book has at most one pending request.
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_comment_requests_pending
    ON book_comment_requests(book_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_book_comment_requests_status ON book_comment_requests(status);
