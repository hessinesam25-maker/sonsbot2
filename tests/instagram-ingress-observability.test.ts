import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '../lib/db/store';

vi.mock('../lib/ai/trace', () => ({
  createTraceSession: vi.fn(async () => ({ trace_id: 'trace_test' })),
  updateTraceSession: vi.fn(async () => null),
}));

vi.mock('../lib/db/client', () => ({
  getBackendSupabaseClient: vi.fn(() => ({
    from: () => ({
      insert: async () => ({ error: null }),
    }),
  })),
  getDbClient: vi.fn(() => ({})),
}));

import { POST } from '../app/api/webhooks/instagram/route';
import { createTraceSession } from '../lib/ai/trace';

const tenantId = '11111111-1111-1111-1111-111111111111';
const accountId = '17841400011111111';
const originalAppSecret = process.env.INSTAGRAM_APP_SECRET;

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/webhooks/instagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function validDm(text: string = 'HI') {
  return JSON.stringify({
    object: 'instagram',
    entry: [{
      id: accountId,
      messaging: [{
        sender: { id: 'customer_123' },
        recipient: { id: accountId },
        timestamp: Date.now(),
        message: { mid: 'mid_observability_1', text },
      }],
    }],
  });
}

describe('Instagram pre-trace ingress observability', () => {
  let logs: string[];

  beforeEach(() => {
    delete process.env.INSTAGRAM_APP_SECRET;
    logs = [];

    vi.spyOn(console, 'info').mockImplementation((...args) => logs.push(args.map(String).join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...args) => logs.push(args.map(String).join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => logs.push(args.map(String).join(' ')));

    vi.spyOn(db, 'getConnections').mockResolvedValue([]);
    vi.spyOn(db, 'addAuditLog').mockResolvedValue(null as any);
    vi.mocked(createTraceSession).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalAppSecret === undefined) delete process.env.INSTAGRAM_APP_SECRET;
    else process.env.INSTAGRAM_APP_SECRET = originalAppSecret;
  });

  it('logs receipt and proves a valid text DM reaches trace creation with unchanged HTTP success', async () => {
    vi.spyOn(db, 'getConnections').mockResolvedValue([{
      id: 'connection_test',
      tenant_id: tenantId,
      platform: 'instagram',
      account_id: accountId,
      account_name: 'test_account',
      access_token_encrypted: 'mock_access_token',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any]);
    vi.spyOn(db, 'getKnowledgeBase').mockResolvedValue({} as any);
    vi.spyOn(db, 'getMenu').mockResolvedValue([]);
    vi.spyOn(db, 'getAutomationRules').mockResolvedValue({
      default_dm_reply: null,
      static_dm_enabled: false,
    } as any);
    vi.spyOn(db, 'getConversations').mockResolvedValue([]);
    vi.spyOn(db, 'createConversation').mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      tenant_id: tenantId,
      external_id: 'customer_123',
      customer_id: 'customer_123',
      human_takeover: false,
      auto_reply_enabled: true,
    } as any);
    vi.spyOn(db, 'verifyConversationExists').mockResolvedValue(true);
    vi.spyOn(db, 'addMessage').mockResolvedValue({ id: 'message_test' } as any);
    vi.spyOn(db, 'getAISettings').mockResolvedValue({ ai_enabled: false, reply_to_dms: false } as any);

    const response = await POST(request(validDm()));

    expect(response.status).toBe(200);
    expect(vi.mocked(createTraceSession)).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('IG_WEBHOOK_POST_RECEIVED');
    expect(logs.join('\n')).toContain('IG_WEBHOOK_TRACE_CREATION_STARTED');
  });

  it('logs SIGNATURE_INVALID before returning 401', async () => {
    process.env.INSTAGRAM_APP_SECRET = 'test_app_secret';

    const response = await POST(request(validDm(), { 'x-hub-signature-256': 'sha256=invalid' }));

    expect(response.status).toBe(401);
    expect(logs.join('\n')).toContain('SIGNATURE_INVALID');
    expect(logs.join('\n')).not.toContain('test_app_secret');
    expect(vi.mocked(createTraceSession)).not.toHaveBeenCalled();
  });

  it('logs JSON_PARSE_FAILED for malformed JSON', async () => {
    const response = await POST(request('{ malformed CUSTOMER_SECRET_TEXT }'));

    expect(response.status).toBe(403);
    expect(logs.join('\n')).toContain('JSON_PARSE_FAILED');
    expect(logs.join('\n')).not.toContain('CUSTOMER_SECRET_TEXT');
  });

  it('logs an explicit reason for unsupported and non-text events', async () => {
    const unsupported = await POST(request(JSON.stringify({ object: 'page', entry: [] })));
    const nonText = await POST(request(JSON.stringify({
      object: 'instagram',
      entry: [{ messaging: [{ sender: { id: 'customer_123' }, message: { attachments: [] } }] }],
    })));

    expect(unsupported.status).toBe(403);
    expect(nonText.status).toBe(403);
    expect(logs.join('\n')).toContain('UNSUPPORTED_OBJECT');
    expect(logs.join('\n')).toContain('NON_TEXT_MESSAGE');
  });

  it('logs TENANT_NOT_FOUND without creating a trace', async () => {
    const response = await POST(request(validDm()));

    expect(response.status).toBe(403);
    expect(logs.join('\n')).toContain('TENANT_NOT_FOUND');
    expect(vi.mocked(createTraceSession)).not.toHaveBeenCalled();
  });

  it('does not put raw payload, customer text, or secrets in ingress logs', async () => {
    const customerText = 'CUSTOMER_SECRET_TEXT';
    await POST(request(validDm(customerText)));

    const ingressLogs = logs.filter(log => log.includes('[IG-WEBHOOK]')).join('\n');
    expect(ingressLogs).not.toContain(customerText);
    expect(ingressLogs).not.toContain('mock_access_token');
    expect(ingressLogs).not.toContain(accountId);
  });
});
