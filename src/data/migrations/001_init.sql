-- 001: initial on-device schema. Mirrors the server's contacts/links/tags tables, minus accounts,
-- sharing and push. Timestamps are ISO-8601 UTC strings; ids are lowercase UUID strings.

CREATE TABLE self_profile (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    first_name  TEXT NOT NULL DEFAULT '',
    last_name   TEXT NOT NULL DEFAULT '',
    about       TEXT NOT NULL DEFAULT ''
);
INSERT INTO self_profile (id) VALUES (1);

CREATE TABLE contacts (
    id             TEXT PRIMARY KEY,
    first_name     TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
    last_name      TEXT NOT NULL DEFAULT '' CHECK (length(last_name) <= 100),
    about          TEXT NOT NULL DEFAULT '',
    phone_number   TEXT,
    note           TEXT NOT NULL DEFAULT '',
    strength       INTEGER NOT NULL DEFAULT 3 CHECK (strength BETWEEN 1 AND 5),
    last_contacted TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX idx_contacts_phone ON contacts (phone_number);

CREATE TABLE contact_links (
    id           TEXT PRIMARY KEY,
    contact_a_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
    contact_b_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL,
    CHECK (contact_a_id < contact_b_id),
    UNIQUE (contact_a_id, contact_b_id)
);
CREATE INDEX idx_contact_links_b ON contact_links (contact_b_id);

CREATE TABLE tags (
    id             TEXT PRIMARY KEY,
    category       TEXT NOT NULL,
    label          TEXT NOT NULL,
    parent_id      TEXT REFERENCES tags (id),
    level          INTEGER NOT NULL,
    icon           TEXT,
    display_order  INTEGER NOT NULL DEFAULT 0,
    self_only      INTEGER NOT NULL DEFAULT 0,
    single_select  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE contact_tags (
    id               TEXT PRIMARY KEY,
    contact_id       TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
    tag_id           TEXT REFERENCES tags (id) ON DELETE CASCADE,
    parent_tag_id    TEXT REFERENCES tags (id) ON DELETE SET NULL,
    custom_category  TEXT,
    custom_label     TEXT,
    UNIQUE (contact_id, tag_id)
);
CREATE INDEX idx_contact_tags_contact ON contact_tags (contact_id);
