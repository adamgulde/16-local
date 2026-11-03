-- 004: tags are one global, user-typed list. The seeded taxonomy (categories, parent/child tags,
-- single-select groups, self-only tags) and the SELF/CUSTOM/PRIVATE kinds go away.
-- Labels people typed earlier are kept as global tags (case-insensitive, de-duplicated) and their
-- assignments move onto them. Assignments to seeded tags are dropped.

CREATE TABLE tags_global (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(label) BETWEEN 1 AND 60),
    created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO tags_global (id, label, created_at)
SELECT lower(hex(randomblob(16))), trim(custom_label), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM contact_tags
WHERE custom_label IS NOT NULL AND trim(custom_label) <> ''
ORDER BY custom_label;

CREATE TABLE contact_tags_new (
    contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
    tag_id     TEXT NOT NULL REFERENCES tags_global (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (contact_id, tag_id)
);

INSERT OR IGNORE INTO contact_tags_new (contact_id, tag_id, created_at)
SELECT ct.contact_id, g.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM contact_tags ct
JOIN tags_global g ON g.label = trim(ct.custom_label) COLLATE NOCASE
WHERE ct.custom_label IS NOT NULL;

DROP TABLE contact_tags;
DROP TABLE tags;
ALTER TABLE tags_global RENAME TO tags;
ALTER TABLE contact_tags_new RENAME TO contact_tags;
CREATE INDEX idx_contact_tags_contact ON contact_tags (contact_id);
