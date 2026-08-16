-- Ghent Café AI Customer Support & Social Engagement Platform
-- Supabase Migration: 20260816151054_create_ai_decision_traces.sql
-- Phase 1A: End-to-End Traceability & Observability Table (Hardened)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. AI Decision Traces Table
CREATE TABLE IF NOT EXISTS ai_decision_traces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trace_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  incoming_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  outgoing_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  external_outgoing_message_id TEXT,

  platform TEXT NOT NULL DEFAULT 'instagram',
  external_event_id TEXT,
  external_message_id TEXT,
  channel_type TEXT NOT NULL DEFAULT 'dm' CHECK (channel_type IN ('dm', 'comment')),

  processing_stage TEXT NOT NULL,
  final_outcome TEXT, -- NULL while processing; populated only at terminal points

  -- Language & Intent (V2 Forward Compatibility; NULL in Phase 1A)
  detected_language TEXT,
  language_confidence NUMERIC(3, 2),
  intent TEXT,
  normalized_question TEXT,
  needs_business_data BOOLEAN,
  needs_conversation_context BOOLEAN,
  risk_level TEXT,
  search_query TEXT,
  verification_status TEXT,

  -- Retrieval Metadata (Structured JSON summary only; no full KB duplication)
  retrieval_summary JSONB DEFAULT '{}'::jsonb,
  retrieval_result_count INTEGER DEFAULT 0,

  -- AI Generation Metadata
  ai_provider TEXT,
  ai_model TEXT,
  generation_attempted BOOLEAN DEFAULT FALSE,
  generation_success BOOLEAN,
  generation_latency_ms INTEGER,
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  tokens_total INTEGER,

  -- Fallback Metadata
  fallback_used BOOLEAN DEFAULT FALSE,
  fallback_reason TEXT,
  fallback_type TEXT,

  -- Meta Delivery Metadata
  meta_send_attempted BOOLEAN DEFAULT FALSE,
  meta_send_success BOOLEAN,
  meta_http_status INTEGER,
  meta_error_code INTEGER,
  meta_error_type TEXT,
  meta_error_subcode INTEGER,

  -- Failure Metadata
  failure_category TEXT,
  failure_reason TEXT,

  -- Conversation & Latency Metadata
  history_message_count INTEGER DEFAULT 0,
  total_latency_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Database-Level Global Trace Uniqueness
  CONSTRAINT uq_ai_decision_traces_trace UNIQUE (trace_id)
);

-- 2. Tenant-Scoped Query Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ai_decision_traces_tenant_event ON ai_decision_traces(tenant_id, external_event_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_traces_tenant_ext_msg ON ai_decision_traces(tenant_id, external_message_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_traces_tenant_inc_msg ON ai_decision_traces(tenant_id, incoming_message_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_traces_tenant_conv ON ai_decision_traces(tenant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_traces_tenant_created ON ai_decision_traces(tenant_id, created_at DESC);

-- 3. Row Level Security Configuration
ALTER TABLE ai_decision_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_decision_traces FORCE ROW LEVEL SECURITY;

-- Read-only policy for authenticated restaurant Owner & Manager roles using canonical helper
CREATE POLICY ai_decision_traces_select ON ai_decision_traces
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_auth_tenant_id() 
    AND get_auth_role() IN ('owner', 'manager')
  );

-- Explicitly disallow browser-side mutations (Backend service_role executes writes)
CREATE POLICY ai_decision_traces_no_user_insert ON ai_decision_traces FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY ai_decision_traces_no_user_update ON ai_decision_traces FOR UPDATE TO authenticated USING (false);
CREATE POLICY ai_decision_traces_no_user_delete ON ai_decision_traces FOR DELETE TO authenticated USING (false);

-- 4. Table Privileges
GRANT SELECT ON ai_decision_traces TO authenticated;
REVOKE ALL ON ai_decision_traces FROM anon;
