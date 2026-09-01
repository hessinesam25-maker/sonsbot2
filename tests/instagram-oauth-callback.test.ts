import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  addAuditLog: vi.fn(),
  backendFrom: vi.fn(),
  encryptToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  getBackendSupabaseClient: vi.fn(() => ({ from: mocks.backendFrom })),
}));

vi.mock('@/lib/db/store', () => ({
  db: { addAuditLog: mocks.addAuditLog },
}));

vi.mock('@/lib/security/encryption', () => ({
  encryptToken: mocks.encryptToken,
}));

import { GET } from '@/app/api/auth/instagram/callback/route';

const tenantId = '11111111-1111-1111-1111-111111111111';
const originalEnv = {
  appId: process.env.INSTAGRAM_APP_ID,
  appSecret: process.env.INSTAGRAM_APP_SECRET,
  publicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
};

function query(initialResult: { data: unknown; error: unknown }) {
  const builder: any = {};
  ['delete', 'select', 'eq', 'gt', 'neq', 'upsert'].forEach(method => {
    builder[method] = vi.fn(() => builder);
  });
  builder.single = vi.fn().mockResolvedValue(initialResult);
  builder.maybeSingle = vi.fn().mockResolvedValue(initialResult);
  return builder;
}

type QueryResult = { data: unknown; error: unknown };

function configureBackend({
  stateResults = [{ data: { tenant_id: tenantId }, error: null }],
  upsertResult = { data: { id: 'connection-id' }, error: null },
}: { stateResults?: QueryResult[]; upsertResult?: QueryResult } = {}) {
  const stateQuery = query(stateResults[0]);
  stateQuery.single.mockImplementation(async () => stateResults.shift() || { data: null, error: { code: 'PGRST116' } });

  let platformConnectionQueryCount = 0;
  mocks.backendFrom.mockImplementation((table: string) => {
    if (table === 'oauth_states') return stateQuery;

    if (table === 'platform_connections') {
      platformConnectionQueryCount += 1;
      if (platformConnectionQueryCount === 1 || platformConnectionQueryCount === 2) {
        return query({ data: null, error: null });
      }
      return query(upsertResult);
    }

    return query({ data: null, error: null });
  });
}

function callbackRequest(code = 'authorization-code-secret', state = 'oauth-state') {
  return new NextRequest(
    `http://0.0.0.0:3000/api/auth/instagram/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
}

function jsonResponse(body: unknown, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('Instagram OAuth callback diagnostics and redirects', () => {
  let logs: string[];

  beforeEach(() => {
    process.env.INSTAGRAM_APP_ID = 'instagram-app-id';
    process.env.INSTAGRAM_APP_SECRET = 'client-secret-value';
    process.env.NEXT_PUBLIC_APP_URL = 'https://elsons.site';
    logs = [];

    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.map(String).join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...args) => logs.push(args.map(String).join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => logs.push(args.map(String).join(' ')));
    vi.stubGlobal('fetch', mocks.fetch);

    mocks.addAuditLog.mockResolvedValue(null);
    mocks.encryptToken.mockReturnValue('encrypted-token');
    mocks.fetch.mockReset();
    mocks.backendFrom.mockReset();
    configureBackend();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalEnv.appId === undefined) delete process.env.INSTAGRAM_APP_ID;
    else process.env.INSTAGRAM_APP_ID = originalEnv.appId;
    if (originalEnv.appSecret === undefined) delete process.env.INSTAGRAM_APP_SECRET;
    else process.env.INSTAGRAM_APP_SECRET = originalEnv.appSecret;
    if (originalEnv.publicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalEnv.publicAppUrl;
  });

  it('logs safe Meta error fields and redirects token exchange failures to the public origin', async () => {
    const authorizationCode = 'authorization-code-secret';
    const shortLivedToken = 'short-lived-token-secret';
    mocks.fetch.mockResolvedValueOnce(jsonResponse({
      access_token: shortLivedToken,
      error_type: 'OAuthException',
      code: 190,
      error_subcode: 1234,
      error_message: 'Invalid authorization code',
    }, 400));

    const response = await GET(callbackRequest(authorizationCode));
    const location = response.headers.get('location') || '';
    const output = logs.join('\n');

    expect(response.status).toBe(307);
    expect(location).toBe(`https://elsons.site/dashboard/integrations?tenant_id=${tenantId}&error=token_exchange_failed`);
    expect(location).not.toContain('0.0.0.0');
    expect(output).toContain('"stage":"short_lived_token_exchange"');
    expect(output).toContain('"tenant_id":"' + tenantId + '"');
    expect(output).toContain('"http_status":400');
    expect(output).toContain('"meta_error_type":"OAuthException"');
    expect(output).toContain('"meta_error_code":190');
    expect(output).toContain('"meta_error_subcode":1234');
    expect(output).toContain('"meta_error_message":"Invalid authorization code"');
    expect(output).not.toContain(authorizationCode);
    expect(output).not.toContain(shortLivedToken);
    expect(output).not.toContain('client-secret-value');
  });

  it('does not log secrets, tokens, authorization codes, or full token responses', async () => {
    const authorizationCode = 'code-never-log';
    const shortLivedToken = 'token-never-log';
    const sensitiveResponse = {
      access_token: shortLivedToken,
      error: { type: 'OAuthException', code: 400, message: 'Rejected' },
      refresh_token: 'refresh-token-never-log',
    };
    mocks.fetch.mockResolvedValueOnce(jsonResponse(sensitiveResponse, 400));

    await GET(callbackRequest(authorizationCode));
    const output = logs.join('\n');

    expect(output).not.toContain(authorizationCode);
    expect(output).not.toContain(shortLivedToken);
    expect(output).not.toContain('refresh-token-never-log');
    expect(output).not.toContain('client-secret-value');
  });

  it('redirects successful callbacks to the public app origin', async () => {
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'short-lived-token', user_id: '17841432799131684' }, 200))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'long-lived-token', expires_in: 3600 }, 200))
      .mockResolvedValueOnce(jsonResponse({ id: '17841432799131684', username: 'dragon147.3' }, 200));

    const response = await GET(callbackRequest());
    const location = response.headers.get('location') || '';

    expect(response.status).toBe(307);
    expect(location).toBe(`https://elsons.site/dashboard/clients/${tenantId}?success=instagram_connected`);
    expect(location).not.toContain('0.0.0.0');
  });

  it('preserves atomic state consumption: the first callback consumes state and the retry is invalid_state', async () => {
    configureBackend({
      stateResults: [
        { data: { tenant_id: tenantId }, error: null },
        { data: null, error: { code: 'PGRST116' } },
      ],
    });
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ error_type: 'OAuthException', code: 400, error_message: 'Invalid authorization code' }, 400));

    const firstResponse = await GET(callbackRequest('first-code', 'single-use-state'));
    const secondResponse = await GET(callbackRequest('retry-code', 'single-use-state'));

    expect(firstResponse.headers.get('location')).toBe(`https://elsons.site/dashboard/integrations?tenant_id=${tenantId}&error=token_exchange_failed`);
    expect(secondResponse.headers.get('location')).toBe('https://elsons.site/dashboard/integrations?error=invalid_state');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
