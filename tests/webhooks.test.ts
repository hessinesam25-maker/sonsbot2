import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyMetaSignature, verifyMetaWebhookChallenge } from '../lib/security/signatures';
import { InstagramConnector } from '../lib/connectors/instagram';
import { GET } from '../app/api/webhooks/instagram/route';
import { db } from '../lib/db/store';

describe('Meta Webhooks & Signature Validation Test Suite', () => {
  const appSecret = 'test_meta_app_secret_12345';
  const rawBody = JSON.stringify({ object: 'instagram', entry: [] });
  const originalEnvToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  beforeEach(() => {
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'test_webhook_verify_token_2026';
    vi.spyOn(db, 'getConnections').mockResolvedValue([]);
    vi.spyOn(db, 'getConversations').mockResolvedValue([]);
    vi.spyOn(db, 'createConversation').mockImplementation(async (conv: any) => ({
      id: crypto.randomUUID(),
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
    vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
      id: 'rules_default',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      min_confidence_score: 0.85,
      max_public_replies_per_hour: 20,
      auto_reply_positive_comments: true,
      auto_reply_factual_questions: true,
      never_reply_complaints: true,
      hide_spam: true,
      ai_tone: 'friendly_warm',
      default_dm_reply: 'Welkom! Hoe kunnen we u vandaag helpen?',
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnvToken !== undefined) {
      process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = originalEnvToken;
    } else {
      delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
    }
  });

  it('should verify valid HMAC-SHA256 signature', () => {
    const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const signatureHeader = `sha256=${hmac}`;

    const isValid = verifyMetaSignature(rawBody, signatureHeader, appSecret);
    expect(isValid).toBe(true);
  });

  it('should reject invalid HMAC signature', () => {
    const invalidSignatureHeader = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    const isValid = verifyMetaSignature(rawBody, invalidSignatureHeader, appSecret);
    expect(isValid).toBe(false);
  });

  it('should verify webhook subscription challenge', () => {
    const mode = 'subscribe';
    const verifyToken = 'ghent_cafe_secure_token';
    const challenge = '1158201207';

    const result = verifyMetaWebhookChallenge(mode, verifyToken, challenge, verifyToken);
    expect(result.success).toBe(true);
    expect(result.challenge).toBe('1158201207');
  });

  it('should parse Instagram message and comment webhooks idempotently', () => {
    const connector = new InstagramConnector(appSecret);
    const webhookPayload = {
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user_123', username: 'gentse_klant' },
              recipient: { id: 'page_456' },
              timestamp: 1770000000,
              message: { mid: 'mid_001', text: 'Wat zijn de openingsuren in Gent?' }
            }
          ]
        }
      ]
    };

    const events = connector.parseWebhookPayload(webhookPayload);
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('message');
    expect(events[0].content).toBe('Wat zijn de openingsuren in Gent?');
  });

  it('should ignore self-generated outgoing message events from bot account', () => {
    const connector = new InstagramConnector(appSecret);
    const selfWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'bot_account_123', username: 'ghent_cafe_bot' },
              recipient: { id: 'user_456' },
              timestamp: 1770000005,
              message: { mid: 'mid_002', text: 'Onze openingsuren in Gent zijn 08:00 - 18:00.' }
            }
          ]
        }
      ]
    };

    const events = connector.parseWebhookPayload(selfWebhookPayload);
    expect(events.length).toBe(1);
    expect(events[0].senderId).toBe('bot_account_123');
  });

  describe('GET /api/webhooks/instagram Route Verification Handler', () => {
    it('returns HTTP 200 with raw challenge on exact token match and subscribe mode', async () => {
      const url = 'http://localhost:3000/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=test_webhook_verify_token_2026&hub.challenge=challenge_abc_123';
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('challenge_abc_123');
    });

    it('returns HTTP 403 on verify token mismatch', async () => {
      const url = 'http://localhost:3000/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong_token_value&hub.challenge=challenge_abc_123';
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toBe('Forbidden: Invalid verify token');
    });

    it('returns HTTP 500 when INSTAGRAM_WEBHOOK_VERIFY_TOKEN is missing at runtime', async () => {
      delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
      const url = 'http://localhost:3000/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=test_webhook_verify_token_2026&hub.challenge=challenge_abc_123';
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe('Instagram webhook verify token is not configured');
    });

    it('proves hardcoded fallback token no longer exists when env var is missing', async () => {
      delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
      const url = 'http://localhost:3000/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=ghent_cafe_secure_webhook_verify_token_2026&hub.challenge=challenge_abc_123';
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe('Instagram webhook verify token is not configured');
    });

    it('returns HTTP 400 when required query params are missing', async () => {
      const url = 'http://localhost:3000/api/webhooks/instagram?hub.mode=subscribe';
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe('Bad Request: Missing required query parameters');
    });
  });

  describe('POST /api/webhooks/instagram Route Processing & Persistence Handler', () => {
    it('parses realistic Instagram Login entry.changes payload with recipientId', () => {
      const connector = new InstagramConnector(appSecret);
      const payload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400099999999',
            time: 1770000000,
            changes: [
              {
                field: 'messages',
                value: {
                  sender: { id: 'customer_777', username: 'tester_user' },
                  recipient: { id: '17841400099999999' },
                  timestamp: 1770000000,
                  message: { mid: 'mid_changes_101', text: 'Openingsuren Gent?' }
                }
              }
            ]
          }
        ]
      };

      const events = connector.parseWebhookPayload(payload);
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('message');
      expect(events[0].senderId).toBe('customer_777');
      expect(events[0].recipientId).toBe('17841400099999999');
      expect(events[0].content).toBe('Openingsuren Gent?');
    });

    it('safely returns empty events array on malformed or non-instagram payload', () => {
      const connector = new InstagramConnector(appSecret);
      expect(connector.parseWebhookPayload(null)).toEqual([]);
      expect(connector.parseWebhookPayload({})).toEqual([]);
      expect(connector.parseWebhookPayload({ object: 'page' })).toEqual([]);
      expect(connector.parseWebhookPayload({ object: 'instagram', entry: null })).toEqual([]);
    });

    it('creates persistent conversation and inserts incoming message once for active connection', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');

      const { encryptToken } = await import('../lib/security/encryption');

      vi.spyOn(db, 'getConnections').mockResolvedValue([
        {
          id: 'conn_test_1',
          tenant_id: '11111111-1111-1111-1111-111111111111',
          platform: 'instagram',
          account_id: '17841400011111111',
          account_name: 'allthingisgood',
          access_token_encrypted: encryptToken('mock_access_token_123'),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any
      ]);
      vi.spyOn(db, 'getConversations').mockResolvedValue([]);
      vi.spyOn(db, 'createConversation').mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_888',
        customer_id: 'cust_888',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        created_at: new Date().toISOString(),
      } as any);
      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);
      vi.spyOn(db, 'addMessage').mockImplementation(async (msg: any) => ({
        id: crypto.randomUUID(),
        ...msg,
        created_at: new Date().toISOString(),
      }));

      const mockPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            time: 1770000000,
            messaging: [
              {
                sender: { id: 'cust_888', username: 'allthingisgood' },
                recipient: { id: '17841400011111111' },
                timestamp: 1770000000,
                message: { mid: `mid_real_${Date.now()}`, text: 'Hello, what are your hours?' }
              }
            ]
          }
        ]
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedEvents).toBe(1);
    });

    it('rejects incoming POST webhooks when no active platform connection exists', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');

      vi.spyOn(db, 'getConnections').mockResolvedValue([]);

      const mockPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'unknown_account_999',
            messaging: [
              {
                sender: { id: 'cust_000' },
                recipient: { id: 'unknown_account_999' },
                message: { mid: 'mid_unk_123', text: 'Hello?' }
              }
            ]
          }
        ]
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Disconnected or unknown platform account');
    });

    it('executes outbound send with customer senderId as recipientId and records auto_replied status on Meta success', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { InstagramConnector } = await import('../lib/connectors/instagram');
      const { encryptToken } = await import('../lib/security/encryption');

      vi.spyOn(db, 'getConnections').mockResolvedValue([
        {
          id: 'conn_test_send',
          tenant_id: '11111111-1111-1111-1111-111111111111',
          platform: 'instagram',
          account_id: '17841400011111111',
          account_name: 'allthingisgood',
          access_token_encrypted: encryptToken('valid_access_token_123'),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any
      ]);

      vi.spyOn(db, 'createConversation').mockResolvedValue({
        id: '11111111-2222-3333-4444-555555555555',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_888',
        customer_id: 'cust_888',
        customer_name: 'Message Request Sender',
        customer_language: 'nl',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as any);

      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);

      vi.spyOn(db, 'addMessage').mockResolvedValue({
        id: 'msg_test_1',
        conversation_id: '11111111-2222-3333-4444-555555555555',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        sender_type: 'customer',
        content: 'Wat zijn de openingsuren?',
        sanitized_content: 'Wat zijn de openingsuren?',
        status: 'received',
        created_at: new Date().toISOString(),
      } as any);

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_test',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        min_confidence_score: 0.85,
        max_public_replies_per_hour: 20,
        auto_reply_positive_comments: true,
        auto_reply_factual_questions: true,
        never_reply_complaints: true,
        hide_spam: true,
        ai_tone: 'friendly_warm',
        default_dm_reply: 'Hallo! Bedankt voor je bericht.',
        updated_at: new Date().toISOString(),
      });

      const sendSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
        success: true,
        messageId: 'ig_msg_outbound_1001',
        recipientId: 'cust_888',
        httpStatus: 200,
      });

      const mockPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            messaging: [
              {
                sender: { id: 'cust_888', username: 'message_request_sender' },
                recipient: { id: '17841400011111111' },
                timestamp: 1770000000,
                message: { mid: `mid_send_${Date.now()}`, text: 'Wat zijn de openingsuren?' }
              }
            ]
          }
        ]
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Verify Instagram send was called with correct customer recipient ID
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][0].recipientId).toBe('cust_888');
    });

    it('does not falsely record auto_replied message when Meta API returns an outbound send failure', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { InstagramConnector } = await import('../lib/connectors/instagram');
      const { encryptToken } = await import('../lib/security/encryption');

      vi.spyOn(db, 'getConnections').mockResolvedValue([
        {
          id: 'conn_test_fail',
          tenant_id: '11111111-1111-1111-1111-111111111111',
          platform: 'instagram',
          account_id: '17841400011111111',
          account_name: 'allthingisgood',
          access_token_encrypted: encryptToken('valid_access_token_123'),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any
      ]);

      vi.spyOn(db, 'createConversation').mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_999',
        customer_id: 'cust_999',
        customer_name: 'Test Customer',
        customer_language: 'nl',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as any);

      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);

      vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
        success: false,
        httpStatus: 400,
        errorCode: 100,
        errorType: 'OAuthException',
        error: 'Unsupported request or invalid recipient',
      });

      const addMessageSpy = vi.spyOn(db, 'addMessage').mockImplementation(async (msg: any) => ({
        id: crypto.randomUUID(),
        ...msg,
        created_at: new Date().toISOString(),
      }));

      const mockPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            messaging: [
              {
                sender: { id: 'cust_999' },
                recipient: { id: '17841400011111111' },
                message: { mid: `mid_fail_${Date.now()}`, text: 'Wat zijn de openingsuren?' }
              }
            ]
          }
        ]
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Verify no message was falsely recorded with status: 'auto_replied'
      const autoRepliedCalls = addMessageSpy.mock.calls.filter(call => call[0].status === 'auto_replied');
      expect(autoRepliedCalls.length).toBe(0);
    });

    it('bypasses outbound send attempt if token decryption fails', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { InstagramConnector } = await import('../lib/connectors/instagram');

      vi.spyOn(db, 'getConnections').mockResolvedValue([
        {
          id: 'conn_test_bad_token',
          tenant_id: '11111111-1111-1111-1111-111111111111',
          platform: 'instagram',
          account_id: '17841400011111111',
          account_name: 'allthingisgood',
          access_token_encrypted: 'invalid_corrupted_token_string',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any
      ]);

      const sendSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage');

      const mockPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            messaging: [
              {
                sender: { id: 'cust_bad_tok' },
                recipient: { id: '17841400011111111' },
                message: { mid: `mid_bad_tok_${Date.now()}`, text: 'Hello?' }
              }
            ]
          }
        ]
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('regression test for 23503: verifies conversation DB persistence before message insert and reuses existing conversation for subsequent messages', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { encryptToken } = await import('../lib/security/encryption');

      const mockConn = {
        id: 'conn_test_23503',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        platform: 'instagram',
        account_id: '17841400011111111',
        account_name: 'allthingisgood',
        access_token_encrypted: encryptToken('valid_access_token_123'),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(db, 'getConnections').mockResolvedValue([mockConn as any]);

      const testSenderId = `cust_new_${Date.now()}`;
      const conversationId = crypto.randomUUID();
      const mockConv = {
        id: conversationId,
        tenant_id: mockConn.tenant_id,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: testSenderId,
        customer_id: testSenderId,
        customer_name: 'New Sender',
        customer_language: 'nl',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      // 1. Initial lookup returns empty array -> new sender
      const getConvSpy = vi.spyOn(db, 'getConversations').mockResolvedValueOnce([]).mockResolvedValue([mockConv as any]);
      const createConvSpy = vi.spyOn(db, 'createConversation').mockResolvedValue(mockConv as any);
      const verifyConvSpy = vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);
      const addMsgSpy = vi.spyOn(db, 'addMessage').mockImplementation(async (msg: any) => ({
        id: crypto.randomUUID(),
        ...msg,
        created_at: new Date().toISOString(),
      }));

      const firstPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            messaging: [
              {
                sender: { id: testSenderId },
                recipient: { id: '17841400011111111' },
                message: { mid: `mid_first_${Date.now()}`, text: 'First message from new sender' }
              }
            ]
          }
        ]
      };

      const firstReq = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firstPayload)
      });

      const firstRes = await POST(firstReq);
      expect(firstRes.status).toBe(200);

      // Verify createConversation was called and conversation DB existence was verified
      expect(createConvSpy).toHaveBeenCalledTimes(1);
      expect(verifyConvSpy).toHaveBeenCalledWith(conversationId, mockConn.tenant_id);

      // Verify customer message was inserted with valid conversation_id
      const customerMsgCall = addMsgSpy.mock.calls.find(c => c[0].sender_type === 'customer');
      expect(customerMsgCall).toBeDefined();
      expect(customerMsgCall![0].conversation_id).toBe(conversationId);

      // 2. Second message from same sender: reuses existing conversation
      const secondPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            messaging: [
              {
                sender: { id: testSenderId },
                recipient: { id: '17841400011111111' },
                message: { mid: `mid_second_${Date.now()}`, text: 'Second message from same sender' }
              }
            ]
          }
        ]
      };

      const secondReq = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondPayload)
      });

      const secondRes = await POST(secondReq);
      expect(secondRes.status).toBe(200);
      // createConversation should NOT be called again for existing sender
      expect(createConvSpy).toHaveBeenCalledTimes(1);
    });

    it('safely skips message insert if conversation DB creation fails (prevents 23503)', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { encryptToken } = await import('../lib/security/encryption');

      vi.spyOn(db, 'getConnections').mockResolvedValue([
        {
          id: 'conn_test_failed_conv',
          tenant_id: '11111111-1111-1111-1111-111111111111',
          platform: 'instagram',
          account_id: '17841400011111111',
          account_name: 'allthingisgood',
          access_token_encrypted: encryptToken('valid_access_token_123'),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any
      ]);

      vi.spyOn(db, 'getConversations').mockResolvedValue([]);
      // Simulate failed conversation creation (returns null)
      vi.spyOn(db, 'createConversation').mockResolvedValue(null);
      const addMsgSpy = vi.spyOn(db, 'addMessage');

      const mockPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            messaging: [
              {
                sender: { id: 'cust_conv_failed' },
                recipient: { id: '17841400011111111' },
                message: { mid: `mid_failed_conv_${Date.now()}`, text: 'Hello?' }
              }
            ]
          }
        ]
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      // addMessage MUST NOT be called if conversation creation failed
      expect(addMsgSpy).not.toHaveBeenCalled();
    });

    it('allows unlimited distinct messages from same sender A, deduplicates retried MIDs, processes sender B independently, and persists messages during human_takeover', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { encryptToken } = await import('../lib/security/encryption');

      const mockConn = {
        id: 'conn_test_multi_msg',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        platform: 'instagram',
        account_id: '17841400011111111',
        account_name: 'allthingisgood',
        access_token_encrypted: encryptToken('valid_access_token_123'),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(db, 'getConnections').mockResolvedValue([mockConn as any]);

      const convSenderA = {
        id: 'conv_sender_a_uuid',
        tenant_id: mockConn.tenant_id,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'sender_A',
        customer_id: 'sender_A',
        customer_name: 'Sender A',
        customer_language: 'nl',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const convSenderB = {
        id: 'conv_sender_b_uuid',
        tenant_id: mockConn.tenant_id,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'sender_B',
        customer_id: 'sender_B',
        customer_name: 'Sender B',
        customer_language: 'nl',
        status: 'needs_human_review',
        human_takeover: true, // Human takeover active!
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const storedMessagesSenderA: any[] = [];
      const storedMessagesSenderB: any[] = [];

      vi.spyOn(db, 'getConversations').mockImplementation(async () => [convSenderA as any, convSenderB as any]);
      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);
      vi.spyOn(db, 'getMessages').mockImplementation(async (convId) => {
        return convId === convSenderA.id ? storedMessagesSenderA : storedMessagesSenderB;
      });

      const addMsgSpy = vi.spyOn(db, 'addMessage').mockImplementation(async (msg) => {
        const stored = { id: `msg_${Date.now()}_${Math.random()}`, ...msg, created_at: new Date().toISOString() };
        if (msg.conversation_id === convSenderA.id) {
          storedMessagesSenderA.push(stored);
        } else {
          storedMessagesSenderB.push(stored);
        }
        return stored as any;
      });

      const sendWebhookMsg = async (senderId: string, mid: string, text: string) => {
        const payload = {
          object: 'instagram',
          entry: [
            {
              id: '17841400011111111',
              messaging: [
                {
                  sender: { id: senderId },
                  recipient: { id: '17841400011111111' },
                  timestamp: Date.now(),
                  message: { mid, text }
                }
              ]
            }
          ]
        };
        const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        return await POST(req);
      };

      const sendWebhookNoMidMsg = async (senderId: string, timestamp: number, text: string) => {
        const payload = {
          object: 'instagram',
          entry: [
            {
              id: '17841400011111111', // Connected Professional Account ID shared by both senders
              messaging: [
                {
                  sender: { id: senderId },
                  recipient: { id: '17841400011111111' },
                  timestamp,
                  message: { text } // No mid provided!
                }
              ]
            }
          ]
        };
        const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        return await POST(req);
      };

      const getCustomerMsgs = (list: any[]) => list.filter(m => m.sender_type === 'customer');

      // 1. Sender A message MID-1
      await sendWebhookMsg('sender_A', 'mid_001', 'First DM from sender A');
      let customerMsgsA = getCustomerMsgs(storedMessagesSenderA);
      expect(customerMsgsA.length).toBe(1);
      expect(customerMsgsA[0].external_message_id).toBe('mid_001');

      // 2. Sender A message MID-2
      await sendWebhookMsg('sender_A', 'mid_002', 'Second DM from sender A');
      customerMsgsA = getCustomerMsgs(storedMessagesSenderA);
      expect(customerMsgsA.length).toBe(2);

      // 3. Sender A message MID-3
      await sendWebhookMsg('sender_A', 'mid_003', 'Third DM from sender A');
      customerMsgsA = getCustomerMsgs(storedMessagesSenderA);
      expect(customerMsgsA.length).toBe(3);

      // 4. Meta retry MID-2 from Sender A -> MUST be ignored as duplicate
      await sendWebhookMsg('sender_A', 'mid_002', 'Second DM from sender A');
      customerMsgsA = getCustomerMsgs(storedMessagesSenderA);
      expect(customerMsgsA.length).toBe(3);

      // 5. No-mid payload delivered twice -> stored once using deterministic fallback key
      const fixedTs = 1770000000000;
      await sendWebhookNoMidMsg('sender_A', fixedTs, 'No-mid message');
      customerMsgsA = getCustomerMsgs(storedMessagesSenderA);
      expect(customerMsgsA.length).toBe(4);
      const noMidKey1 = customerMsgsA[3].external_message_id;
      expect(noMidKey1).toContain('ig_msg_det_sender_A_');

      // Retry exact same no-mid payload -> MUST produce exact same key and be ignored as duplicate
      await sendWebhookNoMidMsg('sender_A', fixedTs, 'No-mid message');
      customerMsgsA = getCustomerMsgs(storedMessagesSenderA);
      expect(customerMsgsA.length).toBe(4); // Remained 4!

      // 6. Sender B to the SAME recipient/business account (entry.id = "17841400011111111")
      await sendWebhookMsg('sender_B', 'mid_004', 'Message from sender B to same business account');
      const customerMsgsB = getCustomerMsgs(storedMessagesSenderB);
      expect(customerMsgsB.length).toBe(1);
      expect(customerMsgsB[0].external_message_id).toBe('mid_004');
    }, 15000);

    it('end-to-end: sends ONE fixed predefined DM reply regardless of language or text content, preserving comment variable rules', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { encryptToken } = await import('../lib/security/encryption');
      const { InstagramConnector } = await import('../lib/connectors/instagram');

      const mockConn = {
        id: 'conn_test_fixed_dm',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        platform: 'instagram',
        account_id: '17841400011111111',
        account_name: 'allthingisgood',
        access_token_encrypted: encryptToken('valid_access_token_123'),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(db, 'getConnections').mockResolvedValue([mockConn as any]);
      vi.spyOn(db, 'getConversations').mockResolvedValue([]);
      vi.spyOn(db, 'createConversation').mockResolvedValue({
        id: 'conv_fixed_dm_uuid',
        tenant_id: mockConn.tenant_id,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_fixed_dm_001',
        customer_id: 'cust_fixed_dm_001',
        customer_name: 'Fixed DM User',
        customer_language: 'ar',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as any);
      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);

      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
        success: true,
        messageId: 'mid_outbound_fixed_resp',
      });

      const sendCommentSpy = vi.spyOn(InstagramConnector.prototype, 'sendCommentReply').mockResolvedValue({
        success: true,
        replyId: 'cmt_resp_123',
      });

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_test',
        tenant_id: mockConn.tenant_id,
        min_confidence_score: 0.85,
        max_public_replies_per_hour: 20,
        auto_reply_positive_comments: true,
        auto_reply_factual_questions: true,
        never_reply_complaints: true,
        hide_spam: true,
        ai_tone: 'friendly_warm',
        default_dm_reply: 'Hallo! Bedankt voor je bericht bij onze zaak in Gent. Hoe kunnen we je helpen?',
        updated_at: new Date().toISOString(),
      });

      const testDmLanguages = ['هاي', 'Hello', 'Hallo', 'Bonjour', 'random_query_xyz'];

      for (let i = 0; i < testDmLanguages.length; i++) {
        const text = testDmLanguages[i];
        const payload = {
          object: 'instagram',
          entry: [
            {
              id: '17841400011111111',
              messaging: [
                {
                  sender: { id: `cust_dm_${i}` },
                  recipient: { id: '17841400011111111' },
                  timestamp: Date.now() + i,
                  message: { mid: `mid_dm_lang_${i}`, text }
                }
              ]
            }
          ]
        };

        const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // Verify sendDirectMessage was called 5 times (once per DM) with the SAME configured fixed reply
      expect(sendDmSpy).toHaveBeenCalledTimes(5);
      expect(sendDmSpy.mock.calls[0][0].content).toBe('Hallo! Bedankt voor je bericht bij onze zaak in Gent. Hoe kunnen we je helpen?');

      // Test Comment Automation Isolation: Comments MUST continue to use variable rule logic
      vi.spyOn(db, 'getComments').mockResolvedValue([]);
      const commentPayload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400011111111',
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'cmt_test_001',
                  from: { id: 'user_cmt_1', username: 'commenter1' },
                  text: 'Super lekere koffie in Gent!',
                  media: { id: 'media_123' },
                  created_time: Math.floor(Date.now() / 1000)
                }
              }
            ]
          }
        ]
      };

      const cmtReq = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commentPayload)
      });

      const cmtRes = await POST(cmtReq);
      expect(cmtRes.status).toBe(200);
      expect(sendCommentSpy).toHaveBeenCalledTimes(1);
    }, 15000);

    it('stores incoming customer DM but DOES NOT send anything when default_dm_reply is missing', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { encryptToken } = await import('../lib/security/encryption');
      const { InstagramConnector } = await import('../lib/connectors/instagram');

      const mockConn = {
        id: 'conn_missing_reply',
        tenant_id: 'tenant_no_reply_123',
        platform: 'instagram',
        account_id: '17841400022222222',
        account_name: 'no_reply_account',
        access_token_encrypted: encryptToken('valid_access_token_123'),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(db, 'getConnections').mockResolvedValue([mockConn as any]);
      vi.spyOn(db, 'getConversations').mockResolvedValue([]);
      vi.spyOn(db, 'createConversation').mockResolvedValue({
        id: 'conv_missing_reply_uuid',
        tenant_id: mockConn.tenant_id,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_missing_001',
        customer_id: 'cust_missing_001',
        customer_name: 'Customer No Reply',
        customer_language: 'nl',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as any);
      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);

      // Return automation rules WITHOUT default_dm_reply
      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_missing',
        tenant_id: mockConn.tenant_id,
        min_confidence_score: 0.85,
        max_public_replies_per_hour: 20,
        auto_reply_positive_comments: true,
        auto_reply_factual_questions: true,
        never_reply_complaints: true,
        hide_spam: true,
        ai_tone: 'friendly_warm',
        default_dm_reply: undefined, // NO fixed DM reply configured!
        updated_at: new Date().toISOString(),
      });

      const addMsgSpy = vi.spyOn(db, 'addMessage');
      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage');

      const payload = {
        object: 'instagram',
        entry: [
          {
            id: '17841400022222222',
            messaging: [
              {
                sender: { id: 'cust_missing_001' },
                recipient: { id: '17841400022222222' },
                timestamp: Date.now(),
                message: { mid: 'mid_missing_reply_01', text: 'Wat zijn de openingsuren?' }
              }
            ]
          }
        ]
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Customer message MUST be stored
      expect(addMsgSpy).toHaveBeenCalledWith(expect.objectContaining({
        sender_type: 'customer',
        content: 'Wat zijn de openingsuren?',
      }));

      // Direct Message send MUST NOT be attempted
      expect(sendDmSpy).not.toHaveBeenCalled();
    });

    it('enforces strict tenant isolation: Tenant A and Tenant B send their own configured fixed DM replies', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { encryptToken } = await import('../lib/security/encryption');
      const { InstagramConnector } = await import('../lib/connectors/instagram');

      const connA = {
        id: 'conn_tenant_A',
        tenant_id: 'tenant_A_uuid',
        platform: 'instagram',
        account_id: '178414000AAAAAA',
        account_name: 'account_A',
        access_token_encrypted: encryptToken('token_A'),
        is_active: true,
      };

      const connB = {
        id: 'conn_tenant_B',
        tenant_id: 'tenant_B_uuid',
        platform: 'instagram',
        account_id: '178414000BBBBBB',
        account_name: 'account_B',
        access_token_encrypted: encryptToken('token_B'),
        is_active: true,
      };

      vi.spyOn(db, 'getConnections').mockImplementation(async (tenantId) => {
        if (tenantId === 'tenant_A_uuid') return [connA as any];
        if (tenantId === 'tenant_B_uuid') return [connB as any];
        return [connA as any, connB as any];
      });

      vi.spyOn(db, 'getConversations').mockResolvedValue([]);
      vi.spyOn(db, 'createConversation').mockImplementation(async (conv: any) => ({
        ...conv,
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        created_at: new Date().toISOString(),
      }));
      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);

      vi.spyOn(db, 'getAutomationRules').mockImplementation(async (tenantId) => {
        if (tenantId === 'tenant_A_uuid') {
          return {
            id: 'rules_A',
            tenant_id: 'tenant_A_uuid',
            default_dm_reply: 'Welkom bij Tenant A Cafe in Gent!',
          } as any;
        }
        return {
          id: 'rules_B',
          tenant_id: 'tenant_B_uuid',
          default_dm_reply: 'Bienvenue au Café Tenant B!',
        } as any;
      });

      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
        success: true,
        messageId: 'mid_outbound_test',
      });

      // DM to Tenant A
      const reqA = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '178414000AAAAAA',
            messaging: [{
              sender: { id: 'cust_for_A' },
              recipient: { id: '178414000AAAAAA' },
              timestamp: Date.now(),
              message: { mid: 'mid_to_A', text: 'Hi A' }
            }]
          }]
        })
      });
      await POST(reqA);
      expect(sendDmSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        content: 'Welkom bij Tenant A Cafe in Gent!',
      }));

      // DM to Tenant B
      const reqB = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '178414000BBBBBB',
            messaging: [{
              sender: { id: 'cust_for_B' },
              recipient: { id: '178414000BBBBBB' },
              timestamp: Date.now(),
              message: { mid: 'mid_to_B', text: 'Hi B' }
            }]
          }]
        })
      });
      await POST(reqB);
      expect(sendDmSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        content: 'Bienvenue au Café Tenant B!',
      }));
    });

    it('resets legacy automated human_takeover (is_manual_takeover=false) and allows fixed DM reply, while respecting explicit manual takeover (is_manual_takeover=true)', async () => {
      const { POST } = await import('../app/api/webhooks/instagram/route');
      const { db } = await import('../lib/db/store');
      const { encryptToken } = await import('../lib/security/encryption');
      const { InstagramConnector } = await import('../lib/connectors/instagram');

      const mockConn = {
        id: 'conn_takeover_test',
        tenant_id: 'tenant_takeover_123',
        platform: 'instagram',
        account_id: '17841400033333333',
        account_name: 'takeover_account',
        access_token_encrypted: encryptToken('valid_token'),
        is_active: true,
      };

      vi.spyOn(db, 'getConnections').mockResolvedValue([mockConn as any]);
      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_takeover',
        tenant_id: mockConn.tenant_id,
        default_dm_reply: 'Fixed DM Reply text for takeover test',
      } as any);

      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
        success: true,
        messageId: 'mid_takeover_resp',
      });
      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);

      // Scenario A: Existing conversation has human_takeover=true from LEGACY AI threshold run (is_manual_takeover=false)
      const legacyConv = {
        id: 'conv_legacy_takeover_uuid',
        tenant_id: mockConn.tenant_id,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_legacy_001',
        customer_id: 'cust_legacy_001',
        customer_name: 'Legacy User',
        customer_language: 'nl',
        status: 'needs_human_review',
        human_takeover: true,
        is_manual_takeover: false, // Legacy automated flag!
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      vi.spyOn(db, 'getConversations').mockResolvedValue([legacyConv as any]);
      const updateConvSpy = vi.spyOn(db, 'updateConversation');

      const payloadA = {
        object: 'instagram',
        entry: [{
          id: '17841400033333333',
          messaging: [{
            sender: { id: 'cust_legacy_001' },
            recipient: { id: '17841400033333333' },
            timestamp: Date.now(),
            message: { mid: 'mid_legacy_01', text: 'Nieuw bericht' }
          }]
        }]
      };

      const reqA = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadA)
      });

      const resA = await POST(reqA);
      expect(resA.status).toBe(200);

      // Legacy automated takeover MUST be reset to false and status to 'open'
      expect(updateConvSpy).toHaveBeenCalledWith('conv_legacy_takeover_uuid', expect.objectContaining({
        human_takeover: false,
        is_manual_takeover: false,
        status: 'open',
      }));

      // Outbound fixed DM send MUST succeed
      expect(sendDmSpy).toHaveBeenCalledTimes(1);

      // Scenario B: Conversation has EXPLICIT MANUAL TAKEOVER (is_manual_takeover=true)
      sendDmSpy.mockClear();
      const manualConv = {
        id: 'conv_manual_takeover_uuid',
        tenant_id: mockConn.tenant_id,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_manual_002',
        customer_id: 'cust_manual_002',
        customer_name: 'Manual User',
        customer_language: 'nl',
        status: 'needs_human_review',
        human_takeover: true,
        is_manual_takeover: true, // EXPLICIT manual takeover by support agent!
        auto_reply_enabled: true,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      vi.spyOn(db, 'getConversations').mockResolvedValue([manualConv as any]);

      const payloadB = {
        object: 'instagram',
        entry: [{
          id: '17841400033333333',
          messaging: [{
            sender: { id: 'cust_manual_002' },
            recipient: { id: '17841400033333333' },
            timestamp: Date.now(),
            message: { mid: 'mid_manual_01', text: 'Ik wil spreken met een mens' }
          }]
        }]
      };

      const reqB = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadB)
      });

      const resB = await POST(reqB);
      expect(resB.status).toBe(200);

      // Outbound fixed DM send MUST NOT be attempted for explicit manual takeover
      expect(sendDmSpy).not.toHaveBeenCalled();
    });
  });
});

