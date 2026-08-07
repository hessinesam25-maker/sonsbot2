-- Migration: Add is_manual_takeover column to conversations table
-- Date: 2026-08-07

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS is_manual_takeover BOOLEAN NOT NULL DEFAULT FALSE;
