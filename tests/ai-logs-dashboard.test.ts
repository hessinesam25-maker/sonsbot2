import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/ai-logs/route';
import { db } from '@/lib/db/store';
import { AIDecisionTrace } from '@/lib/db/types';

describe('Phase 1A.1: AI Observability Logs Dashboard & API Test Suite', () => {
  const tenantA = 'tenant_a_11111111-1111-1111-1111-111111111111';
  const tenantB = 'tenant_b_22222222-2222-2222-2222-222222222222';

  const mockTraceSuccess: AIDecisionTrace = {
    id: 'trace_row_001',
    trace_id: 'trace_uuid_001',
    tenant_id: tenantA,
    conversation_id: 'conv_123',
    incoming_message_id: 'msg_inc_123',
    outgoing_message_id: 'msg_out_123',
    external_outgoing_message_id: 'meta_graph_123',
    platform: 'instagram',
    external_event_id: 'evt_123',
    external_message_id: 'mid_123',
    channel_type: 'dm',
    processing_stage: 'OUTGOING_MESSAGE_PERSISTED',
    final_outcome: 'REPLY_SENT',
    retrieval_summary: { matched_topics: ['Opening Hours'] },
    retrieval_result_count: 1,
    ai_provider: 'deepseek',
    ai_model: 'deepseek-v4-flash',
    generation_attempted: true,
    generation_success: true,
    generation_latency_ms: 250,
    tokens_prompt: 150,
    tokens_completion: 30,
    tokens_total: 180,
    fallback_used: false,
    fallback_reason: null,
    fallback_type: null,
    meta_send_attempted: true,
    meta_send_success: true,
    meta_http_status: 200,
    meta_error_code: null,
    meta_error_type: null,
    meta_error_subcode: null,
    failure_category: null,
    failure_reason: null,
    history_message_count: 2,
    total_latency_ms: 450,
    created_at: new Date(Date.now() - 60000).toISOString(),
    updated_at: new Date(Date.now() - 59000).toISOString(),
  };

  const mockTraceProcessing: AIDecisionTrace = {
    id: 'trace_row_002',
    trace_id: 'trace_uuid_002',
    tenant_id: tenantA,
    conversation_id: 'conv_124',
    incoming_message_id: null,
    outgoing_message_id: null,
    external_outgoing_message_id: null,
    platform: 'instagram',
    external_event_id: 'evt_124',
    external_message_id: 'mid_124',
    channel_type: 'dm',
    processing_stage: 'AI_GENERATION_STARTED',
    final_outcome: null, // In progress
    retrieval_summary: {},
    retrieval_result_count: 0,
    ai_provider: 'deepseek',
    ai_model: 'deepseek-v4-flash',
    generation_attempted: true,
    generation_success: null,
    generation_latency_ms: null,
    tokens_prompt: null,
    tokens_completion: null,
    tokens_total: null,
    fallback_used: false,
    fallback_reason: null,
    fallback_type: null,
    meta_send_attempted: false,
    meta_send_success: null,
    meta_http_status: null,
    meta_error_code: null,
    meta_error_type: null,
    meta_error_subcode: null,
    failure_category: null,
    failure_reason: null,
    history_message_count: 0,
    total_latency_ms: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockTraceFailure: AIDecisionTrace = {
    id: 'trace_row_003',
    trace_id: 'trace_uuid_003',
    tenant_id: tenantA,
    conversation_id: 'conv_125',
    incoming_message_id: 'msg_inc_125',
    outgoing_message_id: null,
    external_outgoing_message_id: null,
    platform: 'instagram',
    external_event_id: 'evt_125',
    external_message_id: 'mid_125',
    channel_type: 'comment',
    processing_stage: 'META_SEND_FAILED',
    final_outcome: 'NO_REPLY_META_SEND_FAILED',
    retrieval_summary: {},
    retrieval_result_count: 0,
    ai_provider: 'deepseek',
    ai_model: 'deepseek-v4-flash',
    generation_attempted: true,
    generation_success: true,
    generation_latency_ms: 180,
    tokens_prompt: 100,
    tokens_completion: 20,
    tokens_total: 120,
    fallback_used: false,
    fallback_reason: null,
    fallback_type: null,
    meta_send_attempted: true,
    meta_send_success: false,
    meta_http_status: 500,
    meta_error_code: 1,
    meta_error_type: 'OAuthException',
    meta_error_subcode: null,
    failure_category: 'META_SEND_FAILURE',
    failure_reason: 'Instagram Graph API returned 500 internal server error',
    history_message_count: 0,
    total_latency_ms: 600,
    created_at: new Date(Date.now() - 120000).toISOString(),
    updated_at: new Date(Date.now() - 119000).toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Tenant A cannot read Tenant B traces (Cross-Tenant Access Denied 403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantB}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'owner',
        'x-test-tenant-id': tenantA, // Authenticated as Tenant A
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Cross-tenant access denied');
  });

  it('2. Owner can view own tenant traces (200 OK + Scoped Traces)', async () => {
    vi.spyOn(db, 'getAIDecisionTraces').mockResolvedValue([mockTraceSuccess, mockTraceProcessing, mockTraceFailure]);

    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantA}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'owner',
        'x-test-tenant-id': tenantA,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.traces.length).toBe(3);
    expect(body.summary.totalEvents).toBe(3);
    expect(body.summary.repliesSent).toBe(1);
    expect(body.summary.failedSends).toBe(1);
  });

  it('3. Manager can view own tenant traces (200 OK)', async () => {
    vi.spyOn(db, 'getAIDecisionTraces').mockResolvedValue([mockTraceSuccess]);

    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantA}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'manager',
        'x-test-tenant-id': tenantA,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.traces.length).toBe(1);
  });

  it('4. Unauthorized role (support_agent) is forbidden (403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantA}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'support_agent',
        'x-test-tenant-id': tenantA,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Insufficient permissions');
  });

  it('5. Unauthenticated request is rejected (401)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantA}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('6. In-flight trace with NULL final_outcome is returned as processing state', async () => {
    vi.spyOn(db, 'getAIDecisionTraces').mockResolvedValue([mockTraceProcessing]);

    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantA}&outcome=PROCESSING`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'owner',
        'x-test-tenant-id': tenantA,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traces.length).toBe(1);
    expect(body.traces[0].final_outcome).toBeNull();
    expect(body.traces[0].processing_stage).toBe('AI_GENERATION_STARTED');
  });

  it('7. Failure trace returns failure_category and failure_reason', async () => {
    vi.spyOn(db, 'getAIDecisionTraces').mockResolvedValue([mockTraceFailure]);

    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantA}&outcome=FAILED`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'owner',
        'x-test-tenant-id': tenantA,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traces.length).toBe(1);
    expect(body.traces[0].failure_category).toBe('META_SEND_FAILURE');
    expect(body.traces[0].failure_reason).toBe('Instagram Graph API returned 500 internal server error');
  });

  it('8. Privacy verification: No raw secrets or tokens appear in API response payload', async () => {
    vi.spyOn(db, 'getAIDecisionTraces').mockResolvedValue([mockTraceSuccess, mockTraceFailure]);

    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantA}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'owner',
        'x-test-tenant-id': tenantA,
      },
    });

    const res = await GET(req);
    const rawText = await res.text();

    expect(rawText).not.toContain('access_token_encrypted');
    expect(rawText).not.toContain('EAAB');
    expect(rawText).not.toContain('sk-');
    expect(rawText).not.toContain('service_role');
  });

  it('9. Platform admin can query any tenant with tenantId parameter', async () => {
    vi.spyOn(db, 'getAIDecisionTraces').mockResolvedValue([mockTraceSuccess]);

    const req = new NextRequest(`http://localhost:3000/api/ai-logs?tenantId=${tenantB}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'platform_admin',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
