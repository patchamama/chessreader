-- Language of the book: a lowercase 2-letter code ("en", "es"…), '' when unknown.
-- Books already stored get it computed the first time they are listed.
ALTER TABLE books ADD COLUMN language TEXT NOT NULL DEFAULT '';
