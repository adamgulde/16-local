-- 005: when you last worked with someone (opened, edited, tagged, linked, noted or selected them).
-- Null until first interaction. Drives the "Recent" list.
ALTER TABLE contacts ADD COLUMN last_interacted_at TEXT;
