-- Ghent Café AI Customer Support & Social Engagement Platform
-- Supabase / PostgreSQL Migration: 20260730000000_init_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security (RLS) helper functions
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Ghent',
  country TEXT NOT NULL DEFAULT 'Belgium',
  default_locale TEXT NOT NULL DEFAULT 'nl',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'support_agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Platform Connections Table
CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, platform, account_id)
);

-- 4. Knowledge Base Table
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  cafe_name TEXT NOT NULL,
  address TEXT NOT NULL,
  google_maps_url TEXT NOT NULL,
  opening_hours JSONB NOT NULL,
  holiday_hours JSONB NOT NULL,
  reservation_rules TEXT NOT NULL,
  delivery_takeaway_info TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  promotions TEXT[] NOT NULL DEFAULT '{}',
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  ingredients TEXT[] NOT NULL DEFAULT '{}',
  is_vegetarian BOOLEAN NOT NULL DEFAULT FALSE,
  is_vegan BOOLEAN NOT NULL DEFAULT FALSE,
  approved_allergens TEXT[] NOT NULL DEFAULT '{}',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
  channel_type TEXT NOT NULL CHECK (channel_type IN ('dm', 'comment')),
  external_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_language TEXT NOT NULL DEFAULT 'nl',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'needs_human_review', 'resolved')),
  human_takeover BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, platform, external_id)
);

-- 7. Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'agent')),
  external_message_id TEXT,
  content TEXT NOT NULL,
  sanitized_content TEXT NOT NULL,
  ai_confidence NUMERIC(3, 2),
  ai_suggested_reply TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'auto_replied', 'manually_replied', 'flagged_for_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
  external_comment_id TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'post',
  author_username TEXT NOT NULL,
  content TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'neutral' CHECK (classification IN ('question', 'positive', 'neutral', 'complaint', 'spam', 'abuse', 'collaboration', 'needs_review')),
  auto_replied BOOLEAN NOT NULL DEFAULT FALSE,
  reply_content TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Automation Rules Table
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  min_confidence_score NUMERIC(3, 2) NOT NULL DEFAULT 0.85,
  max_public_replies_per_hour INTEGER NOT NULL DEFAULT 20,
  auto_reply_positive_comments BOOLEAN NOT NULL DEFAULT TRUE,
  auto_reply_factual_questions BOOLEAN NOT NULL DEFAULT TRUE,
  never_reply_complaints BOOLEAN NOT NULL DEFAULT TRUE,
  hide_spam BOOLEAN NOT NULL DEFAULT TRUE,
  ai_tone TEXT NOT NULL DEFAULT 'friendly_warm',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'ai', 'webhook', 'user')),
  actor_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_comments_tenant_classification ON comments(tenant_id, classification);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_event ON audit_logs(tenant_id, event_type);

-- Row Level Security (RLS) Policies
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies
CREATE POLICY tenant_isolation_users ON users USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_platform_connections ON platform_connections USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_knowledge_base ON knowledge_base USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_menu_items ON menu_items USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_conversations ON conversations USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_messages ON messages USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_comments ON comments USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_automation_rules ON automation_rules USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_audit_logs ON audit_logs USING (tenant_id = current_tenant_id());
