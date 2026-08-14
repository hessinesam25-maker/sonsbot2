import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '../lib/db/store';
import { encryptToken } from '../lib/security/encryption';
import { InstagramConnector } from '../lib/connectors/instagram';
import { GET as getRulesApi, PUT as putRulesApi } from '../app/api/rules/route';
import { POST as webhookPost } from '../app/api/webhooks/instagram/route';

describe('Automation Rules & Webhook Isolation Test Suite', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Server API (/api/rules) Authentication & Tenant Isolation', () => {
    it('returns HTTP 401 when request is unauthenticated', async () => {
      const req = new NextRequest('http://localhost:3000/api/rules?tenantId=' + tenantA);
      const res = await getRulesApi(req);
      expect(res.status).toBe(401);
    });

    it('returns default OFF rules when no rules exist for a tenant', async () => {
      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_A',
        tenant_id: tenantA,
        min_confidence_score: 0.85,
        max_public_replies_per_hour: 20,
        auto_reply_positive_comments: true,
        auto_reply_factual_questions: true,
        never_reply_complaints: true,
        hide_spam: true,
        ai_tone: 'friendly_warm',
        default_dm_reply: undefined,
        static_dm_enabled: false,
        static_comment_enabled: false,
        default_comment_reply: undefined,
        updated_at: new Date().toISOString(),
      });

      const req = new NextRequest('http://localhost:3000/api/rules?tenantId=' + tenantA, {
        headers: {
          'Authorization': 'Bearer test_token',
          'x-test-role': 'owner',
          'x-test-tenant-id': tenantA,
        },
      });

      const res = await getRulesApi(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tenant_id).toBe(tenantA);
      expect(data.static_dm_enabled).toBe(false);
      expect(data.static_comment_enabled).toBe(false);
      expect(data.default_dm_reply).toBeUndefined();
      expect(data.default_comment_reply).toBeUndefined();
    });

    it('returns rules for Tenant A when requested by authorized Tenant A owner', async () => {
      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_A',
        tenant_id: tenantA,
        min_confidence_score: 0.85,
        max_public_replies_per_hour: 20,
        auto_reply_positive_comments: true,
        auto_reply_factual_questions: true,
        never_reply_complaints: true,
        hide_spam: true,
        ai_tone: 'friendly_warm',
        default_dm_reply: 'DM Reply Tenant A',
        static_dm_enabled: true,
        static_comment_enabled: true,
        default_comment_reply: 'Comment Reply Tenant A',
        updated_at: new Date().toISOString(),
      });

      const req = new NextRequest('http://localhost:3000/api/rules?tenantId=' + tenantA, {
        headers: {
          'Authorization': 'Bearer test_token',
          'x-test-role': 'owner',
          'x-test-tenant-id': tenantA,
        },
      });

      const res = await getRulesApi(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tenant_id).toBe(tenantA);
      expect(data.default_dm_reply).toBe('DM Reply Tenant A');
      expect(data.default_comment_reply).toBe('Comment Reply Tenant A');
    });

    it('prevents Tenant A user from updating Tenant B rules (cross-tenant 403)', async () => {
      const req = new NextRequest('http://localhost:3000/api/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_token',
          'x-test-role': 'owner',
          'x-test-tenant-id': tenantA,
        },
        body: JSON.stringify({
          tenant_id: tenantB,
          default_dm_reply: 'Malicious Update',
        }),
      });

      const res = await putRulesApi(req);
      expect(res.status).toBe(403);
    });

    it('allows Platform Admin to fetch and update rules for any tenant', async () => {
      vi.spyOn(db, 'updateAutomationRules').mockImplementation(async (updates: any) => ({
        id: 'rules_B',
        tenant_id: tenantB,
        min_confidence_score: 0.85,
        max_public_replies_per_hour: 20,
        auto_reply_positive_comments: true,
        auto_reply_factual_questions: true,
        never_reply_complaints: true,
        hide_spam: true,
        ai_tone: 'friendly_warm',
        ...updates,
        updated_at: new Date().toISOString(),
      }));

      const req = new NextRequest('http://localhost:3000/api/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_token',
          'x-test-role': 'platform_admin',
          'x-test-tenant-id': tenantA,
        },
        body: JSON.stringify({
          tenant_id: tenantB,
          static_dm_enabled: true,
          default_dm_reply: 'Admin Updated Reply',
        }),
      });

      const res = await putRulesApi(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tenant_id).toBe(tenantB);
      expect(data.default_dm_reply).toBe('Admin Updated Reply');
    });

    it('decouples new static toggles from legacy factual-question and positive-comment flags', async () => {
      const updateSpy = vi.spyOn(db, 'updateAutomationRules').mockImplementation(async (updates: any) => ({
        id: 'rules_decoupled',
        tenant_id: tenantA,
        ...updates,
      }));

      const req = new NextRequest('http://localhost:3000/api/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_token',
          'x-test-role': 'owner',
          'x-test-tenant-id': tenantA,
        },
        body: JSON.stringify({
          tenant_id: tenantA,
          static_dm_enabled: true,
          static_comment_enabled: false,
        }),
      });

      const res = await putRulesApi(req);
      expect(res.status).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        static_dm_enabled: true,
        static_comment_enabled: false,
      }), tenantA);
      
      const payloadSent = updateSpy.mock.calls[0][0];
      expect(payloadSent.auto_reply_factual_questions).toBeUndefined();
      expect(payloadSent.auto_reply_positive_comments).toBeUndefined();
    });

    it('REGRESSION: strips camelCase tenantId and non-DB columns before passing payload to DB store', async () => {
      const updateSpy = vi.spyOn(db, 'updateAutomationRules').mockImplementation(async (updates: any) => ({
        id: 'rules_sanitized',
        tenant_id: tenantA,
        ...updates,
      }));

      const req = new NextRequest('http://localhost:3000/api/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_token',
          'x-test-role': 'owner',
          'x-test-tenant-id': tenantA,
        },
        body: JSON.stringify({
          tenantId: tenantA,
          tenant_id: tenantA,
          static_dm_enabled: true,
          default_dm_reply: 'Safe DM text',
          unrecognized_param: 'should_be_stripped',
        } as any),
      });

      const res = await putRulesApi(req);
      expect(res.status).toBe(200);
      const passedPayload = updateSpy.mock.calls[0][0] as any;
      expect(passedPayload.tenantId).toBeUndefined();
      expect(passedPayload.unrecognized_param).toBeUndefined();
      expect(passedPayload.static_dm_enabled).toBe(true);
      expect(passedPayload.default_dm_reply).toBe('Safe DM text');
    });

    it('REGRESSION: updateAutomationRules store function filters out non-database columns before calling Supabase upsert', async () => {
      const mockSupabaseClient = {
        from: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'rules_upserted_001',
            tenant_id: tenantA,
            static_dm_enabled: true,
            static_comment_enabled: false,
          },
          error: null,
        }),
      };

      const result = await db.updateAutomationRules({
        tenantId: tenantA,
        tenant_id: tenantA,
        static_dm_enabled: true,
        static_comment_enabled: false,
        invalid_field_abc: '123',
      } as any, tenantA, mockSupabaseClient);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('automation_rules');
      const upsertArg = mockSupabaseClient.upsert.mock.calls[0][0];
      expect(upsertArg.tenant_id).toBe(tenantA);
      expect(upsertArg.static_dm_enabled).toBe(true);
      expect(upsertArg.static_comment_enabled).toBe(false);
      expect(upsertArg.tenantId).toBeUndefined();
      expect(upsertArg.invalid_field_abc).toBeUndefined();
      expect(result.tenant_id).toBe(tenantA);
    });
  });

  describe('2. Direct Message (DM) Webhook Automation Matrix', () => {
    const mockConn = {
      id: 'conn_test_dm',
      tenant_id: tenantA,
      platform: 'instagram',
      account_id: '17841400011111111',
      account_name: 'test_account',
      access_token_encrypted: encryptToken('valid_access_token'),
      is_active: true,
    };

    beforeEach(() => {
      vi.spyOn(db, 'getConnections').mockResolvedValue([mockConn as any]);
      vi.spyOn(db, 'getConversations').mockResolvedValue([]);
      vi.spyOn(db, 'createConversation').mockResolvedValue({
        id: 'conv_dm_test_uuid',
        tenant_id: tenantA,
        platform: 'instagram',
        channel_type: 'dm',
        external_id: 'cust_dm_01',
        customer_id: 'cust_dm_01',
        customer_name: 'DM Customer',
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        created_at: new Date().toISOString(),
      } as any);
      vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);
      vi.spyOn(db, 'addMessage').mockResolvedValue({ id: 'msg_1', created_at: new Date().toISOString() } as any);
    });

    it('DM CASE 1: AI OFF + Static DM ON -> sends static DM reply using default_dm_reply ONLY', async () => {
      vi.spyOn(db, 'getAISettings').mockResolvedValue({
        id: 'ai_off',
        tenant_id: tenantA,
        ai_enabled: false,
        reply_to_dms: false,
      } as any);

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_dm_on',
        tenant_id: tenantA,
        static_dm_enabled: true,
        default_dm_reply: 'مرحباً! كيف يمكننا مساعدتك؟',
        static_comment_enabled: true,
        default_comment_reply: 'هذا نص تعليق يجب ألا يستخدم للرسائل!',
      } as any);

      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage').mockResolvedValue({
        success: true,
        messageId: 'mid_resp_101',
      });

      const sendCmtSpy = vi.spyOn(InstagramConnector.prototype, 'sendCommentReply');

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '17841400011111111',
            messaging: [{
              sender: { id: 'cust_dm_01' },
              recipient: { id: '17841400011111111' },
              message: { mid: `mid_dm_1_${Date.now()}`, text: 'أهلاً بك' }
            }]
          }]
        })
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(sendDmSpy).toHaveBeenCalledTimes(1);
      expect(sendDmSpy).toHaveBeenCalledWith(expect.objectContaining({
        content: 'مرحباً! كيف يمكننا مساعدتك؟',
      }));
      expect(sendCmtSpy).not.toHaveBeenCalled();
    });

    it('DM CASE 2: AI OFF + Static DM OFF -> sends NOTHING', async () => {
      vi.spyOn(db, 'getAISettings').mockResolvedValue({
        id: 'ai_off',
        tenant_id: tenantA,
        ai_enabled: false,
        reply_to_dms: false,
      } as any);

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_dm_off',
        tenant_id: tenantA,
        static_dm_enabled: false, // OFF!
        default_dm_reply: 'نص غير مستخدم',
      } as any);

      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage');

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '17841400011111111',
            messaging: [{
              sender: { id: 'cust_dm_01' },
              recipient: { id: '17841400011111111' },
              message: { mid: `mid_dm_2_${Date.now()}`, text: 'مرحباً' }
            }]
          }]
        })
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(sendDmSpy).not.toHaveBeenCalled();
    });

    it('DM CASE 3: Static DM ON + EMPTY default_dm_reply -> sends NOTHING', async () => {
      vi.spyOn(db, 'getAISettings').mockResolvedValue({
        id: 'ai_off',
        tenant_id: tenantA,
        ai_enabled: false,
        reply_to_dms: false,
      } as any);

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_dm_empty',
        tenant_id: tenantA,
        static_dm_enabled: true, // ON but text is empty!
        default_dm_reply: '   ', // whitespace only!
      } as any);

      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage');

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '17841400011111111',
            messaging: [{
              sender: { id: 'cust_dm_01' },
              recipient: { id: '17841400011111111' },
              message: { mid: `mid_dm_3_${Date.now()}`, text: 'مرحباً' }
            }]
          }]
        })
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(sendDmSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Comment Webhook Automation Matrix & Cross-Channel Isolation', () => {
    const mockConn = {
      id: 'conn_test_comment',
      tenant_id: tenantA,
      platform: 'instagram',
      account_id: '17841400011111111',
      account_name: 'test_account',
      access_token_encrypted: encryptToken('valid_access_token'),
      is_active: true,
    };

    beforeEach(() => {
      vi.spyOn(db, 'getConnections').mockResolvedValue([mockConn as any]);
      vi.spyOn(db, 'getComments').mockResolvedValue([]);
    });

    it('COMMENT CASE 1: AI OFF + Static Comment ON -> sends static comment reply using default_comment_reply ONLY', async () => {
      vi.spyOn(db, 'getAISettings').mockResolvedValue({
        id: 'ai_off',
        tenant_id: tenantA,
        ai_enabled: false,
        reply_to_comments: false,
      } as any);

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_cmt_on',
        tenant_id: tenantA,
        static_dm_enabled: true,
        default_dm_reply: 'هذا نص DM يجب ألا يتم استخدامه للتعليقات!',
        static_comment_enabled: true,
        default_comment_reply: 'شكراً لتعليقك المميز على منشورنا!',
      } as any);

      const sendCmtSpy = vi.spyOn(InstagramConnector.prototype, 'sendCommentReply').mockResolvedValue({
        success: true,
        replyId: 'cmt_resp_101',
      });

      const sendDmSpy = vi.spyOn(InstagramConnector.prototype, 'sendDirectMessage');

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '17841400011111111',
            changes: [{
              field: 'comments',
              value: {
                id: 'cmt_inbound_001',
                from: { id: 'user_cmt_99', username: 'commenter99' },
                text: 'منشور رائع جداً!',
                created_time: Math.floor(Date.now() / 1000)
              }
            }]
          }]
        })
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(sendCmtSpy).toHaveBeenCalledTimes(1);
      expect(sendCmtSpy).toHaveBeenCalledWith(expect.objectContaining({
        content: 'شكراً لتعليقك المميز على منشورنا!',
      }));
      expect(sendDmSpy).not.toHaveBeenCalled();
    });

    it('COMMENT CASE 2: AI OFF + Static Comment OFF -> sends NOTHING', async () => {
      vi.spyOn(db, 'getAISettings').mockResolvedValue({
        id: 'ai_off',
        tenant_id: tenantA,
        ai_enabled: false,
        reply_to_comments: false,
      } as any);

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_cmt_off',
        tenant_id: tenantA,
        static_comment_enabled: false, // Disabled!
        default_comment_reply: 'نص تعليق غير مستخدم',
      } as any);

      const sendCmtSpy = vi.spyOn(InstagramConnector.prototype, 'sendCommentReply');

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '17841400011111111',
            changes: [{
              field: 'comments',
              value: {
                id: 'cmt_inbound_002',
                from: { id: 'user_cmt_99', username: 'commenter99' },
                text: 'جميل',
                created_time: Math.floor(Date.now() / 1000)
              }
            }]
          }]
        })
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(sendCmtSpy).not.toHaveBeenCalled();
    });

    it('COMMENT CASE 3: Static Comment ON + EMPTY default_comment_reply -> sends NOTHING', async () => {
      vi.spyOn(db, 'getAISettings').mockResolvedValue({
        id: 'ai_off',
        tenant_id: tenantA,
        ai_enabled: false,
        reply_to_comments: false,
      } as any);

      vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
        id: 'rules_cmt_empty',
        tenant_id: tenantA,
        static_comment_enabled: true, // ON but text is empty!
        default_comment_reply: '', // Empty!
      } as any);

      const sendCmtSpy = vi.spyOn(InstagramConnector.prototype, 'sendCommentReply');

      const req = new NextRequest('http://localhost:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [{
            id: '17841400011111111',
            changes: [{
              field: 'comments',
              value: {
                id: 'cmt_inbound_003',
                from: { id: 'user_cmt_99', username: 'commenter99' },
                text: 'رائع',
                created_time: Math.floor(Date.now() / 1000)
              }
            }]
          }]
        })
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(sendCmtSpy).not.toHaveBeenCalled();
    });
  });
});
