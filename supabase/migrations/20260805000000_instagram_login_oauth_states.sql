-- Ghent Café Platform Migration: 20260805000000_instagram_login_oauth_states.sql
-- Additive migration for Instagram API with Instagram Login OAuth State Binding

ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS nonce TEXT;
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_states_state_hash ON oauth_states(state_hash);
