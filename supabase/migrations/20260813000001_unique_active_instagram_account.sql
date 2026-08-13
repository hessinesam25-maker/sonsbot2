-- Migration: Unique active Instagram account constraint across all tenants
-- Ensures 1 active Instagram professional account belongs to AT MOST ONE SonsBot tenant.

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_connections_active_account 
ON public.platform_connections (platform, account_id) 
WHERE (is_active = true);
