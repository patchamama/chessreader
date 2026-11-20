-- A hidden comment stays in the database (with its translations); readers skip it.
-- Run only on databases without the column (the store adds it itself when missing).
ALTER TABLE position_comments ADD COLUMN hidden_at TEXT;
