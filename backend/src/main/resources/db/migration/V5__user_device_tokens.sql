-- V5__user_device_tokens.sql: device tokens for push notifications (FCM)

CREATE TABLE IF NOT EXISTS user_device_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(4096) NOT NULL UNIQUE,
    platform VARCHAR(16) NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_id ON user_device_tokens(user_id);
