-- Migration: 20260814000004_security_fix_drop_anon_all_policies.sql
-- Security Fix: Drop overly permissive anonymous ALL policies on ai_settings and automation_rules
-- Re-enforce strict authentication and tenant-level RLS policies.

DROP POLICY IF EXISTS "ai_settings_all_anon" ON public.ai_settings;
DROP POLICY IF EXISTS "automation_rules_all_anon" ON public.automation_rules;

-- Ensure RLS is enabled on both tables
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
