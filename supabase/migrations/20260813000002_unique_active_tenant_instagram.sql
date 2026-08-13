-- Migration: Safe partial unique index ensuring AT MOST ONE active Instagram account per tenant.

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_connections_active_tenant_instagram 
ON public.platform_connections (tenant_id) 
WHERE (platform = 'instagram' AND is_active = true);
