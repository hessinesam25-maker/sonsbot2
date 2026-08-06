-- Fix Platform Connections RLS Policy for Platform Admins
-- Migration: 20260806000000_fix_platform_connections_rls.sql

DROP POLICY IF EXISTS platform_connections_select ON platform_connections;
DROP POLICY IF EXISTS platform_connections_insert ON platform_connections;
DROP POLICY IF EXISTS platform_connections_update ON platform_connections;
DROP POLICY IF EXISTS platform_connections_delete ON platform_connections;

-- Allow Platform Admins OR Tenant Owners/Managers to select connections
CREATE POLICY platform_connections_select ON platform_connections
  FOR SELECT TO authenticated
  USING (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('owner', 'manager'))
  );

-- Allow Platform Admins OR Tenant Owners to insert connections
CREATE POLICY platform_connections_insert ON platform_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'owner')
  );

-- Allow Platform Admins OR Tenant Owners to update connections
CREATE POLICY platform_connections_update ON platform_connections
  FOR UPDATE TO authenticated
  USING (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'owner')
  )
  WITH CHECK (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'owner')
  );

-- Allow Platform Admins OR Tenant Owners to delete connections
CREATE POLICY platform_connections_delete ON platform_connections
  FOR DELETE TO authenticated
  USING (
    is_platform_admin() 
    OR (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'owner')
  );
