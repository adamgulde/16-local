-- 003: whether you know a person yourself. Only people you know get a direct edge from you on the
-- graph; the others are added and then connected to someone else (or left unconnected).
ALTER TABLE contacts ADD COLUMN known_personally INTEGER NOT NULL DEFAULT 1 CHECK (known_personally IN (0, 1));
