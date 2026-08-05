-- Ghent Café Platform Migration: 20260805000000_instagram_login_oauth_states.sql
-- Additive, safe migration for Instagram Login OAuth & Webhook Idempotency

-- 1. Additive columns on oauth_states table (nullable to preserve existing data)
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS nonce TEXT;
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_states_state_hash ON oauth_states(state_hash);

-- 2. Atomic state consumption stored procedure / RPC
CREATE OR REPLACE FUNCTION consume_oauth_state(p_state_hash TEXT)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  platform TEXT,
  state_hash TEXT,
  user_id UUID,
  nonce TEXT,
  scopes TEXT[],
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  DELETE FROM public.oauth_states
  WHERE oauth_states.state_hash = p_state_hash
    AND oauth_states.expires_at > NOW()
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Dedicated Webhook Idempotency Table with strict unique constraint per tenant/platform/event_id
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, platform, event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_tenant_event 
  ON processed_webhook_events(tenant_id, platform, event_id);
