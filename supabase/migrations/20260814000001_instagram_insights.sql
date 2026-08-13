-- Migration: 20260814000001_instagram_insights.sql
-- Create tenant-scoped instagram_insights_snapshots table with Auth-bound RLS

CREATE TABLE IF NOT EXISTS instagram_insights_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_connection_id UUID REFERENCES platform_connections(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'day',
  media_id TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_insights_tenant_id ON instagram_insights_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_insights_metric_name ON instagram_insights_snapshots(metric_name);
CREATE INDEX IF NOT EXISTS idx_insights_fetched_at ON instagram_insights_snapshots(fetched_at);

-- Enable & Force RLS
ALTER TABLE instagram_insights_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_insights_snapshots FORCE ROW LEVEL SECURITY;

-- Tenant Isolation & Platform Admin RLS Policy
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'instagram_insights_snapshots' AND policyname = 'insights_snapshots_all'
  ) THEN
    CREATE POLICY insights_snapshots_all ON instagram_insights_snapshots FOR ALL TO authenticated
      USING (is_platform_admin() OR tenant_id = get_auth_tenant_id())
      WITH CHECK (is_platform_admin() OR tenant_id = get_auth_tenant_id());
  END IF;
END $$;
