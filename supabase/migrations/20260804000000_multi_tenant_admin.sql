-- Multi-Tenant Restaurant Platform Architecture Migration
-- Migration: 20260804000000_multi_tenant_admin.sql

-- 1. Tenants Table Extensions
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Brussels';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug) WHERE slug IS NOT NULL;

-- 2. Platform Admins Table
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Security Helper Function: is_platform_admin()
CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- 4. Enable RLS on platform_admins
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_admins_select ON platform_admins
  FOR SELECT TO authenticated
  USING (is_platform_admin());

-- 5. FAQs Table
CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question JSONB NOT NULL DEFAULT '{}'::jsonb,
  answer JSONB NOT NULL DEFAULT '{}'::jsonb,
  locale TEXT NOT NULL DEFAULT 'nl',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Media Assets Table
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Publishing Jobs Table
CREATE TABLE IF NOT EXISTS publishing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_connection_id UUID REFERENCES platform_connections(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image', 'video', 'carousel', 'reel', 'story')),
  caption TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'processing', 'publishing', 'published', 'failed', 'cancelled')),
  external_container_id TEXT,
  external_media_id TEXT,
  error_code TEXT,
  safe_error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- 8. Google Connections Table
CREATE TABLE IF NOT EXISTS google_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, account_id, location_id)
);

-- 9. OAuth States Table for CSRF Protection
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'google', 'tiktok')),
  state_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on newly created tables
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs FORCE ROW LEVEL SECURITY;

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;

ALTER TABLE publishing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE publishing_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;

-- 10. Cryptographically Auth-Bound Policies supporting Platform Admin OR Tenant Isolation
CREATE POLICY faqs_all ON faqs FOR ALL TO authenticated
  USING (is_platform_admin() OR tenant_id = get_auth_tenant_id())
  WITH CHECK (is_platform_admin() OR tenant_id = get_auth_tenant_id());

CREATE POLICY media_assets_all ON media_assets FOR ALL TO authenticated
  USING (is_platform_admin() OR tenant_id = get_auth_tenant_id())
  WITH CHECK (is_platform_admin() OR tenant_id = get_auth_tenant_id());

CREATE POLICY publishing_jobs_all ON publishing_jobs FOR ALL TO authenticated
  USING (is_platform_admin() OR tenant_id = get_auth_tenant_id())
  WITH CHECK (is_platform_admin() OR tenant_id = get_auth_tenant_id());

CREATE POLICY google_connections_all ON google_connections FOR ALL TO authenticated
  USING (is_platform_admin() OR (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('owner', 'manager')))
  WITH CHECK (is_platform_admin() OR (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'owner'));

CREATE POLICY oauth_states_all ON oauth_states FOR ALL TO authenticated
  USING (is_platform_admin() OR tenant_id = get_auth_tenant_id())
  WITH CHECK (is_platform_admin() OR tenant_id = get_auth_tenant_id());

-- Grant Platform Admin Override on Tenants & Core Tables
CREATE POLICY platform_admins_tenants_all ON tenants FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
