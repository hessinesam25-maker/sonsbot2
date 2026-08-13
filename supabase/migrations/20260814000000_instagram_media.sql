-- Migration: 20260814000000_instagram_media.sql
-- Create tenant-scoped instagram_media table with Auth-bound RLS

CREATE TABLE IF NOT EXISTS instagram_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_connection_id UUID REFERENCES platform_connections(id) ON DELETE CASCADE,
  instagram_media_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_product_type TEXT,
  caption TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  timestamp TIMESTAMPTZ,
  username TEXT,
  comments_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, instagram_media_id)
);

-- Operational sync status tracking on platform_connections
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS last_sync_status TEXT DEFAULT 'idle';
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS last_sync_media_count INTEGER DEFAULT 0;
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS last_sync_comments_count INTEGER DEFAULT 0;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_instagram_media_tenant_id ON instagram_media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instagram_media_connection_id ON instagram_media(platform_connection_id);
CREATE INDEX IF NOT EXISTS idx_instagram_media_instagram_media_id ON instagram_media(instagram_media_id);

-- Enable RLS and Force RLS
ALTER TABLE instagram_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_media FORCE ROW LEVEL SECURITY;

-- Tenant Isolation & Platform Admin RLS Policy
CREATE POLICY instagram_media_all ON instagram_media FOR ALL TO authenticated
  USING (is_platform_admin() OR tenant_id = get_auth_tenant_id())
  WITH CHECK (is_platform_admin() OR tenant_id = get_auth_tenant_id());
