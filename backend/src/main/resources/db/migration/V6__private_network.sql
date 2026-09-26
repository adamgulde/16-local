-- V6__private_network.sql: Private-network overhaul (Plan §4 P1). Additive only — nothing dropped
-- or renamed; the old connections/connection_requests/user_tags/user_notes tables and columns stay
-- exactly as they are (their removal is deferred to V7, after prod runs this cleanly — see §7).
--
-- Design notes for the two calls the plan asks this migration to make explicit:
--
-- 1. contacts.phone_number encryption: EncryptedPhoneNumberConverter (security/) only encrypts in
--    the JPA layer (Java AttributeConverter) — there is no SQL-side equivalent this migration could
--    call. Every contact row this migration creates therefore gets phone_number = NULL: rows come
--    from (a) connections, where the linked user's own (already encrypted) phone is looked up live
--    at read time via linked_user_id, never copied, and (b) tag/note placeholders, which never had a
--    phone number to begin with. A real phone number only ever gets written to a contact through the
--    P2 API, going through the converter like users.phone_number does.
--
-- 2. share_requests.target_phone_encrypted: the exact same deterministic AES-256-CBC ciphertext
--    EncryptedPhoneNumberConverter would produce for the normalized phone number — i.e. what the
--    backend writes when it saves that value as a users.phone_number. This is reversible with the
--    app key (deterministic encryption, not a one-way hash): it gets the same protection level as
--    users.phone_number, no more, no less. That lets a plain
--    `WHERE target_phone_encrypted = <freshly-encrypted phone>` equality lookup find pending
--    requests for a phone number once it registers, without introducing a second secret to manage.
--    It deliberately does NOT support "does this phone already have an account" — that lookup goes
--    straight through users.phone_number (via UserRepository#findByPhoneNumber, which the JPA
--    converter already encrypts transparently) and never touches this column at all.

-- 1. Contacts: a user's private notepad of nodes (placeholder or linked to a real account).
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    about TEXT,
    phone_number VARCHAR(255),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_linked_user ON contacts(linked_user_id);
-- At most one registered contact per (owner, linked user); placeholders (linked_user_id NULL) are
-- unaffected since a partial index only ever considers rows where the predicate holds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_owner_linked_user
    ON contacts(owner_id, linked_user_id) WHERE linked_user_id IS NOT NULL;

-- 2. Contact links: undirected edges between two of the *same* owner's contacts (e.g. "these two
-- placeholders are the same person" or "these two people know each other" per the owner's notes).
CREATE TABLE IF NOT EXISTS contact_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_a_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    contact_b_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT chk_contact_links_order CHECK (contact_a_id < contact_b_id),
    CONSTRAINT uq_contact_links_a_b UNIQUE (contact_a_id, contact_b_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_links_owner ON contact_links(owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_links_a ON contact_links(contact_a_id);
CREATE INDEX IF NOT EXISTS idx_contact_links_b ON contact_links(contact_b_id);

-- 3. Contact tags: mirrors user_tags (dictionary tag XOR parent_tag_id+custom_label), but keyed by
-- contact instead of (tagger, subject) — the contact itself already identifies both the owner
-- (contacts.owner_id) and who the tag is about (the contact's identity).
CREATE TABLE IF NOT EXISTS contact_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    parent_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
    custom_category VARCHAR(255),
    custom_label VARCHAR(255),
    CONSTRAINT uq_contact_tags_contact_tag UNIQUE (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);

-- 4. Share requests: replace connection requests. Requests to a phone number with no account yet
-- are stored with recipient_id NULL and only target_phone_encrypted set, and delivered once that
-- number registers (P3).
CREATE TABLE IF NOT EXISTS share_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_phone_encrypted VARCHAR(255),
    target_invite_code VARCHAR(255),
    placeholder_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_share_requests_status CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_share_requests_sender ON share_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_share_requests_recipient ON share_requests(recipient_id);
CREATE INDEX IF NOT EXISTS idx_share_requests_target_phone_encrypted ON share_requests(target_phone_encrypted);

-- 5. Graph shares: a live grant from sharer to viewer, with per-share visibility flags.
CREATE TABLE IF NOT EXISTS graph_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sharer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_about BOOLEAN NOT NULL DEFAULT FALSE,
    share_tags BOOLEAN NOT NULL DEFAULT FALSE,
    share_notes BOOLEAN NOT NULL DEFAULT FALSE,
    share_phone BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_graph_shares_sharer ON graph_shares(sharer_id);
CREATE INDEX IF NOT EXISTS idx_graph_shares_viewer ON graph_shares(viewer_id);
-- Only one *active* share per (sharer, viewer) pair; a revoked share doesn't block a new one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_graph_shares_active_sharer_viewer
    ON graph_shares(sharer_id, viewer_id) WHERE revoked_at IS NULL;

-- 6. Per-share hidden contacts: the sharer's interactive "hide this node" choices for one share.
CREATE TABLE IF NOT EXISTS graph_share_hidden_contacts (
    share_id UUID NOT NULL REFERENCES graph_shares(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (share_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_graph_share_hidden_contacts_contact ON graph_share_hidden_contacts(contact_id);

-- 7. Third-party opt-in: whether a registered contact of someone else may be shown (as themselves,
-- not Hidden User) in a graph shared to a third party.
ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable_in_shared_graphs BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================================================
-- Data copy (idempotent — every INSERT below is guarded so re-running this section is a no-op).
-- =============================================================================================

-- 8a. Each connections(a,b) row becomes a mutual pair of REGISTERED contacts: a's contact for b,
-- and b's contact for a, each named from the linked user's current name. Must run before 8b so that
-- already-connected (tagger, subject) pairs resolve to this REGISTERED contact instead of a new
-- placeholder.
INSERT INTO contacts (id, owner_id, linked_user_id, first_name, last_name, phone_number, created_at, updated_at)
SELECT gen_random_uuid(), c.user_a_id, c.user_b_id, ub.first_name, ub.last_name, NULL,
       COALESCE(c.created_at, now()), COALESCE(c.created_at, now())
FROM connections c
JOIN users ub ON ub.id = c.user_b_id
WHERE NOT EXISTS (
    SELECT 1 FROM contacts existing
    WHERE existing.owner_id = c.user_a_id AND existing.linked_user_id = c.user_b_id
);

INSERT INTO contacts (id, owner_id, linked_user_id, first_name, last_name, phone_number, created_at, updated_at)
SELECT gen_random_uuid(), c.user_b_id, c.user_a_id, ua.first_name, ua.last_name, NULL,
       COALESCE(c.created_at, now()), COALESCE(c.created_at, now())
FROM connections c
JOIN users ua ON ua.id = c.user_a_id
WHERE NOT EXISTS (
    SELECT 1 FROM contacts existing
    WHERE existing.owner_id = c.user_b_id AND existing.linked_user_id = c.user_a_id
);

-- 8b. Resolve, for every (owner=tagger/author, subject) pair with a private tag and/or a note about
-- a non-self subject, which contact those attach to: the existing REGISTERED contact if the pair is
-- connected, otherwise one deterministic UNLINKED placeholder id per pair — so a tagger who both
-- tagged and wrote a note about the same unconnected subject lands both on the *same* placeholder,
-- and re-running this migration body resolves to the same id instead of creating a duplicate.
-- (md5(...)::uuid is a stable 128-bit fingerprint used purely as a repeatable row key here, not a
-- real UUIDv5 — it needs no extension, unlike uuid_generate_v5/uuid-ossp.)
DROP TABLE IF EXISTS tmp_contact_targets;
CREATE TEMP TABLE tmp_contact_targets AS
SELECT DISTINCT
    pairs.owner_id,
    pairs.subject_id,
    COALESCE(rc.id, (md5(pairs.owner_id::text || ':' || pairs.subject_id::text || ':v6-placeholder'))::uuid) AS contact_id,
    (rc.id IS NULL) AS is_placeholder
FROM (
    SELECT tagger_id AS owner_id, subject_id FROM user_tags WHERE tagger_id <> subject_id
    UNION
    SELECT author_id AS owner_id, subject_id FROM user_notes WHERE author_id <> subject_id
) pairs
LEFT JOIN contacts rc ON rc.owner_id = pairs.owner_id AND rc.linked_user_id = pairs.subject_id;

-- 8c. Create the UNLINKED placeholders resolved above (named from the subject's current name).
INSERT INTO contacts (id, owner_id, linked_user_id, first_name, last_name, phone_number, created_at, updated_at)
SELECT t.contact_id, t.owner_id, NULL, u.first_name, u.last_name, NULL, now(), now()
FROM tmp_contact_targets t
JOIN users u ON u.id = t.subject_id
WHERE t.is_placeholder
ON CONFLICT (id) DO NOTHING;

-- 8d. user_tags with tagger <> subject (private annotations, never self-tags) -> contact_tags on
-- the resolved contact. Guarded against re-insertion by an explicit NOT EXISTS (a plain unique
-- constraint can't dedupe custom tags, since Postgres treats every NULL tag_id as distinct).
INSERT INTO contact_tags (id, contact_id, tag_id, parent_tag_id, custom_category, custom_label)
SELECT gen_random_uuid(), t.contact_id, ut.tag_id, ut.parent_tag_id, ut.custom_category, ut.custom_label
FROM user_tags ut
JOIN tmp_contact_targets t ON t.owner_id = ut.tagger_id AND t.subject_id = ut.subject_id
WHERE ut.tagger_id <> ut.subject_id
AND NOT EXISTS (
    SELECT 1 FROM contact_tags ct
    WHERE ct.contact_id = t.contact_id
      AND ct.tag_id IS NOT DISTINCT FROM ut.tag_id
      AND ct.custom_label IS NOT DISTINCT FROM ut.custom_label
);

-- 8e. user_notes with author <> subject -> contacts.note on the resolved contact (one note per
-- contact, same as user_notes' one-per-pair rule; only fills a still-empty note so a rerun of this
-- body is a no-op).
UPDATE contacts c
SET note = un.content,
    updated_at = now()
FROM user_notes un
JOIN tmp_contact_targets t ON t.owner_id = un.author_id AND t.subject_id = un.subject_id
WHERE c.id = t.contact_id
  AND un.author_id <> un.subject_id
  AND (c.note IS NULL OR c.note = '');

DROP TABLE IF EXISTS tmp_contact_targets;

-- 8f. Pending connection_requests -> share_requests (recipient already known; connection_requests
-- has no created_at column to carry over, so these are timestamped at migration time).
INSERT INTO share_requests (id, sender_id, recipient_id, status, created_at)
SELECT gen_random_uuid(), cr.sender_id, cr.receiver_id, 'PENDING', now()
FROM connection_requests cr
WHERE cr.status = 'PENDING'
AND NOT EXISTS (
    SELECT 1 FROM share_requests sr
    WHERE sr.sender_id = cr.sender_id AND sr.recipient_id = cr.receiver_id AND sr.status = 'PENDING'
);
