-- Ghent Café AI Customer Support & Social Engagement Platform
-- Migration: 20260813000000_add_ai_settings.sql
-- Dedicated Tenant-Scoped AI Settings table with auth-bound RLS

CREATE TABLE IF NOT EXISTS ai_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  primary_language TEXT NOT NULL DEFAULT 'nl-BE',
  tone TEXT NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly', 'professional', 'casual')),
  reply_length TEXT NOT NULL DEFAULT 'short' CHECK (reply_length IN ('very_short', 'short', 'normal')),
  emoji_usage TEXT NOT NULL DEFAULT 'low' CHECK (emoji_usage IN ('none', 'low', 'normal')),
  custom_instructions TEXT NOT NULL DEFAULT '',
  reply_to_dms BOOLEAN NOT NULL DEFAULT TRUE,
  reply_to_comments BOOLEAN NOT NULL DEFAULT TRUE,
  use_knowledge_base BOOLEAN NOT NULL DEFAULT TRUE,
  fallback_behavior TEXT NOT NULL DEFAULT 'human_handoff' CHECK (fallback_behavior IN ('human_handoff', 'fallback_message')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable and FORCE RLS on ai_settings
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings FORCE ROW LEVEL SECURITY;

-- Drop legacy policies if any
DROP POLICY IF EXISTS ai_settings_select ON ai_settings;
DROP POLICY IF EXISTS ai_settings_insert ON ai_settings;
DROP POLICY IF EXISTS ai_settings_update ON ai_settings;
DROP POLICY IF EXISTS ai_settings_delete ON ai_settings;

-- 1. SELECT: Platform Admin OR Tenant users can read AI settings
CREATE POLICY ai_settings_select ON ai_settings
  FOR SELECT TO authenticated
  USING (
    is_platform_admin() 
    OR tenant_id = get_auth_tenant_id()
  );

-- 2. INSERT: Platform Admin OR Tenant Owner/Manager can insert settings
CREATE POLICY ai_settings_insert ON ai_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('owner', 'manager'))
  );

-- 3. UPDATE: Platform Admin OR Tenant Owner/Manager can update settings
CREATE POLICY ai_settings_update ON ai_settings
  FOR UPDATE TO authenticated
  USING (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('owner', 'manager'))
  )
  WITH CHECK (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('owner', 'manager'))
  );

-- 4. DELETE: Platform Admin OR Tenant Owner can delete AI settings
CREATE POLICY ai_settings_delete ON ai_settings
  FOR DELETE TO authenticated
  USING (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'owner')
  );

