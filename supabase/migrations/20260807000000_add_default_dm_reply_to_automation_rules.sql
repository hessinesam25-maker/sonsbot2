-- Migration: Add default_dm_reply column to automation_rules table
-- Date: 2026-08-07

ALTER TABLE automation_rules
ADD COLUMN IF NOT EXISTS default_dm_reply TEXT;
