-- Migration: Add static_dm_enabled, static_comment_enabled, default_comment_reply columns to automation_rules
-- Date: 2026-08-14

ALTER TABLE automation_rules
ADD COLUMN IF NOT EXISTS static_dm_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS static_comment_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS default_comment_reply TEXT DEFAULT 'مرحباً بك! شكراً لتواصلك معنا.';

UPDATE automation_rules 
SET static_dm_enabled = COALESCE(static_dm_enabled, auto_reply_factual_questions, true),
    static_comment_enabled = COALESCE(static_comment_enabled, auto_reply_positive_comments, true)
WHERE static_dm_enabled IS NULL OR static_comment_enabled IS NULL;
