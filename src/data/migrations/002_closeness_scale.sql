-- 002: closeness moves from 1–5 (integer) to 1–10 (decimal). Existing values are rescaled so the
-- old estimates keep their meaning: 1→1, 2→3.25, 3→5.5, 4→7.75, 5→10.
-- SQLite can't alter a CHECK constraint, so the table is rebuilt. This migration runs with foreign
-- keys off (see migrate.ts) so dropping the old table can't cascade into links and tags.

CREATE TABLE contacts_new (
    id             TEXT PRIMARY KEY,
    first_name     TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
    last_name      TEXT NOT NULL DEFAULT '' CHECK (length(last_name) <= 100),
    about          TEXT NOT NULL DEFAULT '',
    phone_number   TEXT,
    note           TEXT NOT NULL DEFAULT '',
    strength       REAL NOT NULL DEFAULT 5.5 CHECK (strength >= 1 AND strength <= 10),
    last_contacted TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

INSERT INTO contacts_new (id, first_name, last_name, about, phone_number, note, strength, last_contacted, created_at, updated_at)
SELECT id, first_name, last_name, about, phone_number, note,
       1 + (strength - 1) * 9.0 / 4.0,
       last_contacted, created_at, updated_at
FROM contacts;

DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;
CREATE INDEX idx_contacts_phone ON contacts (phone_number);
