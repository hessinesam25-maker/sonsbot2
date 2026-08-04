-- Ghent Café AI Customer Support & Social Engagement Platform
-- Migration: 20260730000001_auth_bound_rls.sql
-- Cryptographically Auth-Bound Supabase RLS Architecture via auth.uid()

-- 1. Ensure public.users has immutable link to auth.users.id
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Mark test fixtures flag on tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_test_fixture BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Secure Helper Functions for Tenant & Role Derivation
CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION get_auth_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_auth_tenant_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_auth_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_auth_role() TO authenticated, service_role;

-- 3. Drop Legacy Settings-Based RLS Policies
DROP POLICY IF EXISTS tenant_isolation_users ON users;
DROP POLICY IF EXISTS tenant_isolation_platform_connections ON platform_connections;
DROP POLICY IF EXISTS tenant_isolation_knowledge_base ON knowledge_base;
DROP POLICY IF EXISTS tenant_isolation_menu_items ON menu_items;
DROP POLICY IF EXISTS tenant_isolation_conversations ON conversations;
DROP POLICY IF EXISTS tenant_isolation_messages ON messages;
DROP POLICY IF EXISTS tenant_isolation_comments ON comments;
DROP POLICY IF EXISTS tenant_isolation_automation_rules ON automation_rules;
DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;

-- Drop legacy table policies if any
DROP POLICY IF EXISTS tenant_select_tenants ON tenants;
DROP POLICY IF EXISTS users_select_policy ON users;
DROP POLICY IF EXISTS users_insert_policy ON users;
DROP POLICY IF EXISTS users_update_policy ON users;
DROP POLICY IF EXISTS users_delete_policy ON users;

-- 4. Enable FORCE RLS on all public tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base FORCE ROW LEVEL SECURITY;

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items FORCE ROW LEVEL SECURITY;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- 5. Define Cryptographically-Bound RLS Policies

-- TENANTS: No enumeration allowed!
CREATE POLICY tenants_select ON tenants
  FOR SELECT TO authenticated
  USING (id = get_auth_tenant_id());

-- USERS: Strict tenant isolation + Role-based Insert/Update/Delete
CREATE POLICY users_select ON users
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

CREATE POLICY users_insert ON users
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() = 'owner'
  );

CREATE POLICY users_update ON users
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND (auth_user_id = auth.uid() OR get_auth_role() = 'owner')
  )
  WITH CHECK (
    tenant_id = get_auth_tenant_id()
  );

CREATE POLICY users_delete ON users
  FOR DELETE TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() = 'owner'
    AND auth_user_id != auth.uid() -- Cannot delete self
  );

-- PLATFORM CONNECTIONS: Secrets hidden from support agents; Owner only for modifications
CREATE POLICY platform_connections_select ON platform_connections
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() IN ('owner', 'manager')
  );

CREATE POLICY platform_connections_insert ON platform_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() = 'owner'
  );

CREATE POLICY platform_connections_update ON platform_connections
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() = 'owner'
  )
  WITH CHECK (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() = 'owner'
  );

CREATE POLICY platform_connections_delete ON platform_connections
  FOR DELETE TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() = 'owner'
  );

-- KNOWLEDGE BASE: Owner & Manager can update
CREATE POLICY knowledge_base_select ON knowledge_base
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

CREATE POLICY knowledge_base_update ON knowledge_base
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() IN ('owner', 'manager')
  );

-- MENU ITEMS: Owner & Manager can modify
CREATE POLICY menu_items_select ON menu_items
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

CREATE POLICY menu_items_all ON menu_items
  FOR ALL TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() IN ('owner', 'manager')
  );

-- CONVERSATIONS: Tenant isolated
CREATE POLICY conversations_select ON conversations
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

CREATE POLICY conversations_all ON conversations
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id())
  WITH CHECK (tenant_id = get_auth_tenant_id());

-- MESSAGES: Tenant isolated
CREATE POLICY messages_select ON messages
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

CREATE POLICY messages_all ON messages
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id())
  WITH CHECK (tenant_id = get_auth_tenant_id());

-- COMMENTS: Tenant isolated
CREATE POLICY comments_select ON comments
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

CREATE POLICY comments_all ON comments
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id())
  WITH CHECK (tenant_id = get_auth_tenant_id());

-- AUTOMATION RULES: Owner & Manager can update
CREATE POLICY automation_rules_select ON automation_rules
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

CREATE POLICY automation_rules_update ON automation_rules
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() IN ('owner', 'manager')
  );

-- AUDIT LOGS: Immutable for normal users! Read only for Owner & Manager; Insert strictly via backend/service_role
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() IN ('owner', 'manager')
  );

-- Explicitly disallow INSERT, UPDATE, DELETE on audit_logs for authenticated role
DROP POLICY IF EXISTS prevent_audit_logs_update ON audit_logs;
DROP POLICY IF EXISTS prevent_audit_logs_delete ON audit_logs;

CREATE POLICY audit_logs_no_user_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY audit_logs_no_user_update ON audit_logs FOR UPDATE TO authenticated USING (false);
CREATE POLICY audit_logs_no_user_delete ON audit_logs FOR DELETE TO authenticated USING (false);
