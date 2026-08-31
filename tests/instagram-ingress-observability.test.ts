import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
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

function signedRequest(rawBody: Buffer, secret: string, signature?: string) {
  const signatureHeader = signature || `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return new NextRequest('http://localhost:3000/api/webhooks/instagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signatureHeader },
    body: rawBody as any,
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

function validChangesDm(text: string = 'HI') {
  return JSON.stringify({
    object: 'instagram',
    entry: [{
      id: accountId,
      changes: [{
        field: 'messages',
        value: {
          sender: { id: 'customer_changes_123' },
          recipient: { id: accountId },
          timestamp: String(Math.floor(Date.now() / 1000)),
          message: { mid: 'mid_changes_observability_1', text },
        },
      }],
    }],
  });
}

function configureActiveTracePath() {
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
    configureActiveTracePath();

    const response = await POST(request(validDm()));

    expect(response.status).toBe(200);
    expect(vi.mocked(createTraceSession)).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('IG_WEBHOOK_POST_RECEIVED');
    expect(logs.join('\n')).toContain('IG_WEBHOOK_TRACE_CREATION_STARTED');
  });

  it('keeps a valid changes[] text DM on the trace-creation path', async () => {
    configureActiveTracePath();

    const response = await POST(request(validChangesDm()));

    expect(response.status).toBe(200);
    expect(vi.mocked(createTraceSession)).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('IG_WEBHOOK_TRACE_CREATION_STARTED');
  });

  it('does not crash on the Meta Test-style payload', async () => {
    const response = await POST(request(JSON.stringify({
      object: 'instagram',
      entry: [{
        id: '0',
        time: 1744813777,
        changes: [{
          field: 'messages',
          value: {
            sender: { id: '12334' },
            recipient: { id: '23245' },
            timestamp: '1527459824',
            message: { mid: 'random_mid', text: 'random_text' },
          },
        }],
      }],
    })));

    expect(response.status).toBe(403);
    expect(logs.join('\n')).not.toContain('PAYLOAD_SHAPE_PARSE_FAILED');
    expect(logs.join('\n')).not.toContain('IG_WEBHOOK_POST_FAILED');
  });

  it('records safe parser exception diagnostics when an unexpected error escapes', async () => {
    vi.spyOn(db, 'getConnections').mockRejectedValue(new RangeError('Invalid time value'));

    const response = await POST(request(validDm()));
    const ingressLogs = logs.filter(log => log.includes('[IG-WEBHOOK]')).join('\n');

    expect(response.status).toBe(500);
    expect(ingressLogs).toContain('"error_name":"RangeError"');
    expect(ingressLogs).toContain('"error_message":"Invalid time value"');
    expect(ingressLogs).toContain('"top_stack_frame":"    at ');
  });

  it('logs SIGNATURE_INVALID before returning 401', async () => {
    process.env.INSTAGRAM_APP_SECRET = 'test_app_secret';

    const response = await POST(request(validDm(), { 'x-hub-signature-256': 'sha256=invalid' }));

    expect(response.status).toBe(401);
    expect(logs.join('\n')).toContain('SIGNATURE_INVALID');
    expect(logs.join('\n')).not.toContain('test_app_secret');
    expect(vi.mocked(createTraceSession)).not.toHaveBeenCalled();
  });

  it('accepts the exact raw Buffer with the request-time secret', async () => {
    configureActiveTracePath();
    const secret = 'request_time_app_secret';
    process.env.INSTAGRAM_APP_SECRET = secret;
    const rawBody = Buffer.from(validDm('RAW_BUFFER_MESSAGE'), 'utf8');
    const req = signedRequest(rawBody, secret);
    const arrayBufferSpy = vi.spyOn(req, 'arrayBuffer');

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(arrayBufferSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createTraceSession)).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('"raw_buffer_signature_valid":true');
    expect(logs.join('\n')).toContain('"legacy_text_signature_valid":true');
  });

  it('rejects a signature generated with the wrong secret', async () => {
    process.env.INSTAGRAM_APP_SECRET = 'wrong_request_time_secret';
    const rawBody = Buffer.from(validDm('WRONG_SECRET_MESSAGE'), 'utf8');

    const response = await POST(signedRequest(rawBody, 'correct_request_time_secret'));

    expect(response.status).toBe(401);
    expect(vi.mocked(createTraceSession)).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('"raw_buffer_signature_valid":false');
  });

  it('rejects a malformed X-Hub-Signature-256 header', async () => {
    const secret = 'malformed_header_secret';
    process.env.INSTAGRAM_APP_SECRET = secret;
    const rawBody = Buffer.from(validDm('MALFORMED_HEADER_MESSAGE'), 'utf8');

    const response = await POST(signedRequest(rawBody, secret, 'sha256=not-a-valid-signature'));

    expect(response.status).toBe(401);
    expect(vi.mocked(createTraceSession)).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('"signature_format_valid":false');
  });

  it('preserves Unicode webhook bytes during raw-body verification', async () => {
    configureActiveTracePath();
    const secret = 'unicode_request_time_secret';
    process.env.INSTAGRAM_APP_SECRET = secret;
    const rawBody = Buffer.from(validDm('Café 👋 مرحباً'), 'utf8');

    const response = await POST(signedRequest(rawBody, secret));

    expect(response.status).toBe(200);
    expect(vi.mocked(createTraceSession)).toHaveBeenCalledTimes(1);
  });

  it('parses invalid-signature JSON only for safe diagnostics and does not process the event', async () => {
    const secret = 'invalid_diagnostic_secret';
    process.env.INSTAGRAM_APP_SECRET = secret;
    const rawBody = Buffer.from(JSON.stringify({
      object: 'instagram',
      entry: [{ id: accountId, messaging: [{ message: { text: 'DO_NOT_PROCESS_THIS' } }] }],
    }), 'utf8');
    const invalidSignature = `sha256=${'0'.repeat(64)}`;

    const response = await POST(signedRequest(rawBody, secret, invalidSignature));
    const ingressLogs = logs.filter(log => log.includes('[IG-WEBHOOK]')).join('\n');

    expect(response.status).toBe(401);
    expect(vi.mocked(db.getConnections)).not.toHaveBeenCalled();
    expect(vi.mocked(createTraceSession)).not.toHaveBeenCalled();
    expect(ingressLogs).toContain('"webhook_object_type":"instagram"');
    expect(ingressLogs).toContain('"entry_count":1');
    expect(ingressLogs).toContain(`"first_entry_account_id_hash":"${crypto.createHash('sha256').update(accountId).digest('hex').slice(0, 8)}"`);
    expect(ingressLogs).not.toContain('IG_WEBHOOK_BODY_PARSED');
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
    const appSecret = 'CUSTOMER_APP_SECRET_TEXT';
    const customerText = 'CUSTOMER_SECRET_TEXT';
    process.env.INSTAGRAM_APP_SECRET = appSecret;
    const invalidSignature = `sha256=${'f'.repeat(64)}`;
    await POST(request(validDm(customerText), { 'x-hub-signature-256': invalidSignature }));

    const ingressLogs = logs.filter(log => log.includes('[IG-WEBHOOK]')).join('\n');
    expect(ingressLogs).not.toContain(customerText);
    expect(ingressLogs).not.toContain('mock_access_token');
    expect(ingressLogs).not.toContain(accountId);
    expect(ingressLogs).not.toContain(appSecret);
    expect(ingressLogs).not.toContain(invalidSignature);
  });
});
