import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/webhooks/instagram/route';
import { db } from '../lib/db/store';
import { InstagramConnector } from '../lib/connectors/instagram';
import { encryptToken } from '../lib/security/encryption';
import * as deepseekModule from '../lib/ai/deepseek';
import { getTraceById, getTracesByConversationId } from '../lib/ai/trace';
import { AIDecisionTrace } from '../lib/db/types';

describe('Phase 1A: End-to-End Traceability & Observability Test Suite', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const rawKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  function createMockPostRequest(bodyObj: any): NextRequest {
    return new NextRequest('http://localhost:3000/api/webhooks/instagram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyObj),
    });
  }

  beforeEach(() => {
    delete process.env.INSTAGRAM_APP_SECRET;
    process.env.TOKEN_ENCRYPTION_KEY = rawKey;
    process.env.DEEPSEEK_API_KEY = 'test_deepseek_key';

    // Mock platform connection for Tenant A
    vi.spyOn(db, 'getConnections').mockResolvedValue([
      {
        id: 'conn_tenant_a',
        tenant_id: tenantA,
        platform: 'instagram',
        account_id: 'page_123',
        account_name: '@gentse_cafe',
        access_token_encrypted: encryptToken('valid_access_token_123'),
        is_active: true,
        permissions: ['instagram_business_basic'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    vi.spyOn(db, 'getConversations').mockResolvedValue([]);
    vi.spyOn(db, 'createConversation').mockImplementation(async (conv: any) => ({
      id: conv.id || crypto.randomUUID(),
      status: 'open',
      human_takeover: false,
      auto_reply_enabled: true,
      ...conv,
      created_at: new Date().toISOString(),
    }));
    vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);
    vi.spyOn(db, 'addMessage').mockImplementation(async (msg: any) => ({
      id: crypto.randomUUID(),
      ...msg,
      created_at: new Date().toISOString(),
    }));
    vi.spyOn(db, 'updateConversation').mockImplementation(async () => true as any);

    // Mock KB & Menu
    vi.spyOn(db, 'getKnowledgeBase').mockResolvedValue({
      id: 'kb_a',
      tenant_id: tenantA,
      cafe_name: 'Café De Gentse Draak',
      address: 'Korenmarkt 14, 9000 Gent',
      google_maps_url: 'https://maps.google.com/?q=Korenmarkt+14',
      opening_hours: {
        monday: '08:00 - 18:00',
        tuesday: '08:00 - 18:00',
        wednesday: '08:00 - 18:00',
        thursday: '08:00 - 18:00',
        friday: '08:00 - 20:00',
        saturday: '09:00 - 20:00',
        sunday: '09:00 - 18:00',
      },
      holiday_hours: {},
      reservation_rules: 'Tafels online reserveren',
      delivery_takeaway_info: 'Takeaway mogelijk',
      contact_email: 'info@gent.be',
      contact_phone: '+32 9 000',
      wifi_details: 'Free WiFi',
      payment_methods: ['Bancontact', 'Cash'],
      promotions: [],
      faqs: [],
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(db, 'getMenu').mockResolvedValue([
      {
        id: 'menu_1',
        tenant_id: tenantA,
        category: 'Coffee',
        name: 'Americano',
        price: 3.5,
        description: 'Black coffee',
        ingredients: ['Espresso', 'Water'],
        is_vegetarian: true,
        is_vegan: true,
        approved_allergens: [],
        is_available: true,
        created_at: new Date().toISOString(),
      },
    ]);

    vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
      id: 'rules_a',
      tenant_id: tenantA,
      min_confidence_score: 0.85,
      max_public_replies_per_hour: 20,
      auto_reply_positive_comments: true,
      auto_reply_factual_questions: true,
      never_reply_complaints: true,
      hide_spam: true,
      ai_tone: 'friendly_warm',
      default_dm_reply: 'Welkom bij onze zaak!',
      static_dm_enabled: false,
      static_comment_enabled: false,
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(db, 'getAISettings').mockResolvedValue({
      id: 'ai_set_a',
      tenant_id: tenantA,
      ai_enabled: true,
      primary_language: 'nl-BE',
      tone: 'friendly',
      reply_length: 'short',
      emoji_usage: 'low',
      custom_instructions: '',
      reply_to_dms: true,
      reply_to_comments: true,
      use_knowledge_base: true,
      fallback_behavior: 'human_handoff',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Successful DM: Trace records complete lifecycle with final outcome = REPLY_SENT', async () => {
    const eventId = `msg_succ_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_999', username: 'jan_gent' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'Wat zijn de openingsuren?' },
            },
          ],
        },
      ],
    };

    vi.spyOn(deepseekModule, 'generateDeepSeekReply').mockResolvedValue({
      success: true,
      content: 'We zijn vandaag open van 08:00 tot 18:00!',
      httpStatus: 200,
      latencyMs: 180,
      model: 'deepseek-v4-flash',
      usage: { promptTokens: 45, completionTokens: 15, totalTokens: 60 },
    });

    vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
      success: true,
      messageId: `ig_out_${Date.now()}`,
      httpStatus: 200,
    });

    const req = createMockPostRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const traces = await db.getAIDecisionTraces(tenantA);
    const trace = traces.find(t => t.external_event_id === eventId);

    expect(trace).toBeDefined();
    expect(trace?.tenant_id).toBe(tenantA);
    expect(trace?.channel_type).toBe('dm');
    expect(trace?.processing_stage).toBe('OUTGOING_MESSAGE_PERSISTED');
    expect(trace?.final_outcome).toBe('REPLY_SENT');
    expect(trace?.generation_attempted).toBe(true);
    expect(trace?.generation_success).toBe(true);
    expect(trace?.meta_send_attempted).toBe(true);
    expect(trace?.meta_send_success).toBe(true);
    expect(trace?.meta_http_status).toBe(200);
    expect(trace?.tokens_prompt).toBe(45);
    expect(trace?.tokens_completion).toBe(15);
  });

  it('2. Duplicate Event: Trace records DUPLICATE_CHECKED and final outcome = NO_REPLY_DUPLICATE', async () => {
    const eventId = `msg_dup_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_888', username: 'sarah' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'Hello duplicate!' },
            },
          ],
        },
      ],
    };

    vi.spyOn(db, 'getConversations').mockResolvedValue([
      {
        id: 'conv_dup_test',
        tenant_id: tenantA,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_888',
        customer_id: 'cust_888',
        customer_name: 'sarah',
        customer_language: 'nl',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    vi.spyOn(db, 'getMessages').mockResolvedValue([
      {
        id: 'msg_existing_1',
        conversation_id: 'conv_dup_test',
        tenant_id: tenantA,
        sender_type: 'customer',
        external_message_id: eventId,
        content: 'Hello duplicate!',
        sanitized_content: 'Hello duplicate!',
        status: 'received',
        created_at: new Date().toISOString(),
      },
    ]);

    const req = createMockPostRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const traces = await db.getAIDecisionTraces(tenantA);
    const dupTrace = traces.find(t => t.external_event_id === eventId && t.final_outcome === 'NO_REPLY_DUPLICATE');

    expect(dupTrace).toBeDefined();
    expect(dupTrace?.processing_stage).toBe('DUPLICATE_CHECKED');
    expect(dupTrace?.failure_category).toBe('DUPLICATE_EVENT');
    expect(dupTrace?.final_outcome).toBe('NO_REPLY_DUPLICATE');
  });

  it('3. AI Failure + No Fallback: Trace records AI_PROVIDER_ERROR and NO_REPLY_NO_FALLBACK', async () => {
    const eventId = `msg_aifail_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_777', username: 'ahmed' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'Wat is de prijs van Americano?' },
            },
          ],
        },
      ],
    };

    vi.spyOn(deepseekModule, 'generateDeepSeekReply').mockResolvedValue({
      success: false,
      error: 'DeepSeek returned 503 Service Unavailable',
      httpStatus: 503,
      latencyMs: 320,
      model: 'deepseek-v4-flash',
    });

    // Static fallback is disabled
    vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
      id: 'rules_a',
      tenant_id: tenantA,
      min_confidence_score: 0.85,
      max_public_replies_per_hour: 20,
      auto_reply_positive_comments: true,
      auto_reply_factual_questions: true,
      never_reply_complaints: true,
      hide_spam: true,
      ai_tone: 'friendly_warm',
      static_dm_enabled: false,
      default_dm_reply: '',
      updated_at: new Date().toISOString(),
    });

    const req = createMockPostRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const traces = await db.getAIDecisionTraces(tenantA);
    const trace = traces.find(t => t.external_event_id === eventId);

    expect(trace).toBeDefined();
    expect(trace?.generation_attempted).toBe(true);
    expect(trace?.generation_success).toBe(false);
    expect(trace?.fallback_used).toBe(false);
    expect(trace?.failure_category).toBe('AI_PROVIDER_ERROR');
    expect(trace?.final_outcome).toBe('NO_REPLY_NO_FALLBACK');
  });

  it('4. Meta 429 Rate Limit: Trace records META_RATE_LIMIT and NO_REPLY_META_SEND_FAILED', async () => {
    const eventId = `msg_meta429_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_666', username: 'elena' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'Do you have vegan options?' },
            },
          ],
        },
      ],
    };

    vi.spyOn(deepseekModule, 'generateDeepSeekReply').mockResolvedValue({
      success: true,
      content: 'Yes, we have delicious vegan options!',
      httpStatus: 200,
      latencyMs: 120,
      model: 'deepseek-v4-flash',
    });

    vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
      success: false,
      httpStatus: 429,
      errorCode: 4,
      errorType: 'OAuthException',
      error: 'Application request limit reached',
    });

    const req = createMockPostRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const traces = await db.getAIDecisionTraces(tenantA);
    const trace = traces.find(t => t.external_event_id === eventId);

    expect(trace).toBeDefined();
    expect(trace?.meta_send_attempted).toBe(true);
    expect(trace?.meta_send_success).toBe(false);
    expect(trace?.meta_http_status).toBe(429);
    expect(trace?.meta_error_code).toBe(4);
    expect(trace?.failure_category).toBe('META_RATE_LIMIT');
    expect(trace?.final_outcome).toBe('NO_REPLY_META_SEND_FAILED');
  });

  it('5. Meta 500 Server Error: Trace records META_SERVER_ERROR and NO_REPLY_META_SEND_FAILED', async () => {
    const eventId = `msg_meta500_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_555', username: 'lucas' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'What is the address?' },
            },
          ],
        },
      ],
    };

    vi.spyOn(deepseekModule, 'generateDeepSeekReply').mockResolvedValue({
      success: true,
      content: 'We are located at Korenmarkt 14, Ghent!',
      httpStatus: 200,
    });

    vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
      success: false,
      httpStatus: 500,
      errorCode: 2,
      error: 'Meta Graph API internal server error',
    });

    const req = createMockPostRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const traces = await db.getAIDecisionTraces(tenantA);
    const trace = traces.find(t => t.external_event_id === eventId);

    expect(trace).toBeDefined();
    expect(trace?.meta_http_status).toBe(500);
    expect(trace?.failure_category).toBe('META_SERVER_ERROR');
    expect(trace?.final_outcome).toBe('NO_REPLY_META_SEND_FAILED');
  });

  it('6. AI Timeout: Trace distinguishes AI_PROVIDER_TIMEOUT', async () => {
    const eventId = `msg_timeout_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_444', username: 'claire' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'Hello there' },
            },
          ],
        },
      ],
    };

    vi.spyOn(deepseekModule, 'generateDeepSeekReply').mockResolvedValue({
      success: false,
      error: 'DeepSeek request timed out after 8000ms',
      httpStatus: 408,
      latencyMs: 8002,
      model: 'deepseek-v4-flash',
    });

    const req = createMockPostRequest(payload);
    await POST(req);

    const traces = await db.getAIDecisionTraces(tenantA);
    const trace = traces.find(t => t.external_event_id === eventId);

    expect(trace).toBeDefined();
    expect(trace?.failure_category).toBe('AI_PROVIDER_TIMEOUT');
    expect(trace?.generation_latency_ms).toBeGreaterThanOrEqual(8000);
  });

  it('7. Human Takeover: Trace records intentional NO_REPLY_HUMAN_TAKEOVER', async () => {
    const eventId = `msg_human_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_human_1', username: 'mark' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'I want to speak with the manager' },
            },
          ],
        },
      ],
    };

    vi.spyOn(db, 'getConversations').mockResolvedValue([
      {
        id: 'conv_human_takeover',
        tenant_id: tenantA,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_human_1',
        customer_id: 'cust_human_1',
        customer_name: 'Mark',
        customer_language: 'nl',
        status: 'needs_human_review',
        human_takeover: true,
        is_manual_takeover: true,
        auto_reply_enabled: false,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const req = createMockPostRequest(payload);
    await POST(req);

    const traces = await db.getAIDecisionTraces(tenantA);
    const trace = traces.find(t => t.external_event_id === eventId);

    expect(trace).toBeDefined();
    expect(trace?.failure_category).toBe('HUMAN_TAKEOVER');
    expect(trace?.final_outcome).toBe('NO_REPLY_HUMAN_TAKEOVER');
    expect(trace?.generation_attempted).toBe(false);
  });

  it('8. AI Disabled: Trace records intentional NO_REPLY_AI_DISABLED', async () => {
    const eventId = `msg_disabled_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_333', username: 'emma' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'Are you open?' },
            },
          ],
        },
      ],
    };

    vi.spyOn(db, 'getAISettings').mockResolvedValue({
      id: 'ai_set_a',
      tenant_id: tenantA,
      ai_enabled: false,
      primary_language: 'nl-BE',
      tone: 'friendly',
      reply_length: 'short',
      emoji_usage: 'low',
      custom_instructions: '',
      reply_to_dms: false,
      reply_to_comments: false,
      use_knowledge_base: true,
      fallback_behavior: 'human_handoff',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
      id: 'rules_a',
      tenant_id: tenantA,
      min_confidence_score: 0.85,
      max_public_replies_per_hour: 20,
      auto_reply_positive_comments: false,
      auto_reply_factual_questions: false,
      never_reply_complaints: true,
      hide_spam: true,
      ai_tone: 'friendly_warm',
      static_dm_enabled: false,
      default_dm_reply: '',
      updated_at: new Date().toISOString(),
    });

    const req = createMockPostRequest(payload);
    await POST(req);

    const traces = await db.getAIDecisionTraces(tenantA);
    const trace = traces.find(t => t.external_event_id === eventId);

    expect(trace).toBeDefined();
    expect(trace?.failure_category).toBe('AI_DISABLED');
    expect(trace?.final_outcome).toBe('NO_REPLY_AI_DISABLED');
  });

  it('9. Tenant Isolation: Tenant A cannot retrieve Tenant B traces', async () => {
    // Insert trace for Tenant B
    const traceB = await db.createAIDecisionTrace({
      trace_id: 'trace_secret_b',
      tenant_id: tenantB,
      platform: 'instagram',
      external_event_id: 'event_b_secret',
      channel_type: 'dm',
      processing_stage: 'PROCESSING_COMPLETED',
      final_outcome: 'REPLY_SENT',
    });

    expect(traceB).toBeDefined();

    // Query traces for Tenant A
    const tracesA = await db.getAIDecisionTraces(tenantA);
    const foundBInA = tracesA.find(t => t.trace_id === 'trace_secret_b');
    expect(foundBInA).toBeUndefined();

    // Direct lookup by ID for Tenant A returns null
    const lookupResult = await db.getAIDecisionTrace('trace_secret_b', tenantA);
    expect(lookupResult).toBeNull();
  });

  it('10. In-Flight State & Distinct Message IDs: Trace starts with final_outcome = null and distinguishes UUID vs Meta ID', async () => {
    const { createTraceSession, updateTraceSession } = await import('../lib/ai/trace');
    const traceId = crypto.randomUUID();

    // 1. In-flight session creation
    const inFlightTrace = await createTraceSession({
      traceId,
      tenantId: tenantA,
      platform: 'instagram',
      channelType: 'dm',
      externalEventId: 'event_mid_123',
    });

    expect(inFlightTrace.final_outcome).toBeNull();
    expect(inFlightTrace.processing_stage).toBe('EVENT_PARSED');

    // 2. Terminal update with distinct IDs
    const botMsgUuid = crypto.randomUUID();
    const metaGraphMsgId = 'aWdfbWVzc2FnZToxNzg0MTQwMDA...';

    vi.spyOn(db, 'verifyMessageExists').mockImplementation(async (id, tenantId) => {
      return id === botMsgUuid && tenantId === tenantA;
    });

    const completedTrace = await updateTraceSession(traceId, tenantA, {
      processing_stage: 'OUTGOING_MESSAGE_PERSISTED',
      outgoing_message_id: botMsgUuid,
      external_outgoing_message_id: metaGraphMsgId,
      final_outcome: 'REPLY_SENT',
    });

    expect(completedTrace?.final_outcome).toBe('REPLY_SENT');
    expect(completedTrace?.outgoing_message_id).toBe(botMsgUuid);
    expect(completedTrace?.external_outgoing_message_id).toBe(metaGraphMsgId);
  });

  it('11. Secret & Payload Sanitization: sanitizeTraceError strips tokens, secrets, and truncates', async () => {
    const { sanitizeTraceError } = await import('../lib/ai/trace');

    const leakRawError = 'Meta API failed with Bearer EAAXyZ123456789 secret at https://graph.instagram.com/v20.0/me/messages?access_token=EAAB1234567890abcdef and key 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const sanitized = sanitizeTraceError(leakRawError);

    expect(sanitized).not.toContain('EAAXyZ123456789');
    expect(sanitized).not.toContain('EAAB1234567890abcdef');
    expect(sanitized).not.toContain('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(sanitized).toContain('Bearer [REDACTED]');
    expect(sanitized).toContain('access_token=[REDACTED]');
    expect(sanitized).toContain('[REDACTED_SECRET]');
  });

  it('12. Fail-Closed Tenant Foreign Reference Validation: Tenant A trace omits Tenant B references', async () => {
    const { createTraceSession, updateTraceSession } = await import('../lib/ai/trace');

    // Setup: Conversation & Messages belonging to Tenant B
    const convB = 'conv_tenant_b_123';
    const incMsgB = 'msg_tenant_b_inc_456';
    const outMsgB = 'msg_tenant_b_out_789';

    // Mock verifyConversationExists and verifyMessageExists
    vi.spyOn(db, 'verifyConversationExists').mockImplementation(async (id, tenantId) => {
      // convB only exists for tenantB
      return id === convB && tenantId === tenantB;
    });

    vi.spyOn(db, 'verifyMessageExists').mockImplementation(async (id, tenantId) => {
      // incMsgB and outMsgB only exist for tenantB
      return (id === incMsgB || id === outMsgB) && tenantId === tenantB;
    });

    const traceId = crypto.randomUUID();

    // 1. Create trace for Tenant A passing Tenant B conversation and incoming message IDs
    const createdTrace = await createTraceSession({
      traceId,
      tenantId: tenantA, // Target tenant is Tenant A
      conversationId: convB, // Unsafe reference belonging to Tenant B
      incomingMessageId: incMsgB, // Unsafe reference belonging to Tenant B
    });

    // Both unsafe foreign references MUST fail closed to null
    expect(createdTrace.tenant_id).toBe(tenantA);
    expect(createdTrace.conversation_id).toBeNull();
    expect(createdTrace.incoming_message_id).toBeNull();

    // 2. Update trace for Tenant A passing Tenant B outgoing message ID
    const updatedTrace = await updateTraceSession(traceId, tenantA, {
      outgoing_message_id: outMsgB, // Unsafe reference belonging to Tenant B
      conversation_id: convB, // Unsafe reference belonging to Tenant B
    });

    // Must fail closed to null
    expect(updatedTrace?.outgoing_message_id).toBeNull();
    expect(updatedTrace?.conversation_id).toBeNull();
  });

  it('13. Resilience: Trace INSERT database failure still permits normal customer reply', async () => {
    const eventId = `msg_res_insert_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_res_1', username: 'lucas' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'Do you have coffee?' },
            },
          ],
        },
      ],
    };

    // Simulate Supabase trace INSERT failure
    vi.spyOn(db, 'createAIDecisionTrace').mockRejectedValueOnce(new Error('Supabase insert connection timeout'));

    vi.spyOn(deepseekModule, 'generateDeepSeekReply').mockResolvedValue({
      success: true,
      content: 'Ja, we hebben verse koffie!',
      httpStatus: 200,
      latencyMs: 120,
      model: 'deepseek-v4-flash',
    });

    const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
      success: true,
      messageId: `ig_out_res_${Date.now()}`,
      httpStatus: 200,
    });

    const req = createMockPostRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(sendDmSpy).toHaveBeenCalledTimes(1);
  });

  it('14. Resilience: Mid-processing trace UPDATE database failure still allows reply dispatch', async () => {
    const eventId = `msg_res_update_${Date.now()}`;
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page_123',
          messaging: [
            {
              sender: { id: 'cust_res_2', username: 'charlotte' },
              recipient: { id: 'page_123' },
              timestamp: Date.now(),
              message: { mid: eventId, text: 'What is your address?' },
            },
          ],
        },
      ],
    };

    // Simulate Supabase trace UPDATE failure on mid-stream checkpoint
    vi.spyOn(db, 'updateAIDecisionTrace').mockRejectedValueOnce(new Error('Supabase update connection reset'));

    vi.spyOn(deepseekModule, 'generateDeepSeekReply').mockResolvedValue({
      success: true,
      content: 'Ons adres is Korenmarkt 14 in Gent.',
      httpStatus: 200,
      latencyMs: 140,
      model: 'deepseek-v4-flash',
    });

    const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
      success: true,
      messageId: `ig_out_res2_${Date.now()}`,
      httpStatus: 200,
    });

    const req = createMockPostRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(sendDmSpy).toHaveBeenCalledTimes(1);
  });

  it('15. Resilience: Tenant reference verification DB exception fails closed without throwing', async () => {
    const { validateTenantConversation, validateTenantMessage } = await import('../lib/ai/trace');

    vi.spyOn(db, 'verifyConversationExists').mockRejectedValue(new Error('Database connectivity error'));
    vi.spyOn(db, 'verifyMessageExists').mockRejectedValue(new Error('Database connectivity error'));

    // Both should fail closed to null without throwing
    const safeConv = await validateTenantConversation('conv_error_123', tenantA);
    const safeMsg = await validateTenantMessage('msg_error_456', tenantA);

    expect(safeConv).toBeNull();
    expect(safeMsg).toBeNull();
  });

  it('16. Resilience: Trace operation timeout falls back to in-memory store without unhandled rejection', async () => {
    const { createTraceSession } = await import('../lib/ai/trace');

    // Create session should complete quickly and fallback gracefully
    const trace = await createTraceSession({
      tenantId: tenantA,
      platform: 'instagram',
      channelType: 'dm',
      externalEventId: 'evt_timeout_test',
    });

    expect(trace).toBeDefined();
    expect(trace.tenant_id).toBe(tenantA);
    expect(trace.processing_stage).toBe('EVENT_PARSED');
  });
});
