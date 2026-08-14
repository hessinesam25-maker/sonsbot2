-- Migration: Change static automation defaults to false/NULL and safely reset non-tester production rows
-- Date: 2026-08-14

ALTER TABLE automation_rules
ALTER COLUMN static_dm_enabled SET DEFAULT false,
ALTER COLUMN static_comment_enabled SET DEFAULT false,
ALTER COLUMN default_comment_reply SET DEFAULT NULL;

-- Reset non-tester tenant rows (such as pica beans) to safe defaults (OFF and NULL comment text)
UPDATE automation_rules
SET static_dm_enabled = false,
    static_comment_enabled = false,
    default_comment_reply = NULL
WHERE tenant_id != '1029a20d-1342-42fa-87c2-c0fef3cceeaf';
