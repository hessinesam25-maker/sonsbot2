-- Migration: 20260814000005_fix_automation_rules_insert_rls.sql
-- Security Fix: Restrict automation_rules INSERT policy to platform admin or authorized tenant owner/manager.

DROP POLICY IF EXISTS "automation_rules_insert" ON public.automation_rules;

CREATE POLICY "automation_rules_insert"
  ON public.automation_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_platform_admin()
    OR (
      tenant_id = get_auth_tenant_id()
      AND get_auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])
    )
  );
