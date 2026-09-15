-- V2__add_email_support.sql: Add email authentication support and make phone number optional

-- 1. Users table: add email column, make phone_number optional
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_email') THEN
        ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Otps table: add email column, make phone_number optional
ALTER TABLE otps ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE otps ALTER COLUMN phone_number DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
