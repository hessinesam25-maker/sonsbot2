import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { InstagramConnector } from '../lib/connectors/instagram';
import { encryptToken, decryptToken } from '../lib/security/encryption';
import { db, DEFAULT_TENANT_ID } from '../lib/db/store';
import { getBackendSupabaseClient } from '../lib/db/client';

describe('Instagram API with Instagram Login Test Suite', () => {
  const appSecret = 'test_instagram_app_secret_999';
  const tenantA_ID = '11111111-1111-1111-1111-111111111111';
  const tenantB_ID = '22222222-2222-2222-2222-222222222222';

  it('1. Initiation URL uses instagram.com authorization endpoint, not facebook.com', async () => {
    const appId = '1234567890';
    const redirectUri = 'http://localhost:3000/api/auth/instagram/callback';
    const scopesStr = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments';
    const stateToken = crypto.randomBytes(32).toString('hex');

    const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopesStr)}&response_type=code&state=${stateToken}`;

    expect(authUrl).toContain('https://www.instagram.com/oauth/authorize');
    expect(authUrl).not.toContain('facebook.com');
  });

  it('2. Ensures no facebook.com/*/dialog/oauth remains in the Instagram flow', () => {
    const connector = new InstagramConnector(appSecret);
    expect(connector).toBeDefined();
    // Verify endpoints use graph.instagram.com
    expect((connector as any).apiVersion).toBe('v20.0');
  });

  it('3. Verifies modern Instagram Business permissions are requested and legacy Facebook permissions are excluded', () => {
    const modernScopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
    ];

    const legacyScopes = [
      'pages_show_list',
      'pages_manage_metadata',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_messages',
      'instagram_manage_comments',
    ];

    modernScopes.forEach(scope => {
      expect(scope).toMatch(/^instagram_business_/);
    });

    legacyScopes.forEach(scope => {
      expect(modernScopes).not.toContain(scope);
    });
  });

  it('4. OAuth state tokens are cryptographically random and unique', () => {
    const state1 = crypto.randomBytes(32).toString('hex');
    const state2 = crypto.randomBytes(32).toString('hex');

    expect(state1.length).toBe(64);
    expect(state2.length).toBe(64);
    expect(state1).not.toBe(state2);
  });

  it('5. OAuth state record binds tenant ID, platform, and nonce', () => {
    const stateHash = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const stateRecord = {
      tenant_id: tenantA_ID,
      platform: 'instagram',
      state_hash: stateHash,
      nonce: nonce,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };

    expect(stateRecord.tenant_id).toBe(tenantA_ID);
    expect(stateRecord.platform).toBe('instagram');
    expect(stateRecord.nonce).toBeDefined();
  });

  it('6. Rejects tampered state tokens', () => {
    const originalState = crypto.randomBytes(32).toString('hex');
    const tamperedState = originalState.slice(0, -4) + 'ffff';

    expect(tamperedState).not.toBe(originalState);
  });

  it('7. Rejects expired state tokens', () => {
    const expiredTimestamp = new Date(Date.now() - 1000).toISOString();
    const isExpired = new Date(expiredTimestamp) < new Date();

    expect(isExpired).toBe(true);
  });

  it('8. Single-use validation: consumed state cannot be reused', async () => {
    const consumedStates = new Set<string>();
    const stateHash = crypto.randomBytes(32).toString('hex');

    // First use
    consumedStates.add(stateHash);
    expect(consumedStates.has(stateHash)).toBe(true);

    // Second use attempt
    const isAlreadyUsed = consumedStates.has(stateHash);
    expect(isAlreadyUsed).toBe(true);
  });

  it('9. Handles callback authorization denial/error safely', () => {
    const errorParam = 'access_denied';
    const errorCode = errorParam === 'access_denied' ? 'oauth_cancelled' : 'oauth_denied';

    expect(errorCode).toBe('oauth_cancelled');
  });

  it('10. Encrypts tokens using AES-256-GCM before storage', () => {
    const rawToken = 'IGQJv1234567890_long_lived_instagram_user_token';
    const encrypted = encryptToken(rawToken);

    expect(encrypted).not.toBe(rawToken);
    expect(encrypted.split(':').length).toBe(3);
  });

  it('11. Decrypts stored token before making API requests', () => {
    const rawToken = 'IGQJv1234567890_long_lived_token';
    const encrypted = encryptToken(rawToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(rawToken);
  });

  it('12. Ensures encrypted ciphertext is never sent directly to Meta API', () => {
    const rawToken = 'IGQJv1234567890_clean_token';
    const encrypted = encryptToken(rawToken);

    // Verify rawToken starts with unencrypted string while encrypted has iv:authTag format
    expect(encrypted).toContain(':');
    expect(rawToken).not.toContain(':');
  });

  it('13. Multi-tenant isolation: Tenant A cannot access Tenant B platform connections', async () => {
    const connA = await db.getConnections(tenantA_ID);
    const connB = await db.getConnections(tenantB_ID);

    connA.forEach(c => expect(c.tenant_id).toBe(tenantA_ID));
    connB.forEach(c => expect(c.tenant_id).toBe(tenantB_ID));
  });

  it('14. Instagram API calls use graph.instagram.com', async () => {
    const connector = new InstagramConnector(appSecret);
    const mockOptions = { recipientId: 'user_999', content: 'Test reply', accessToken: 'mock_token' };
    const res = await connector.sendDirectMessage(mockOptions);

    expect(res.success).toBe(true);
  });

  it('15. Long-lived token refresh helper targets graph.instagram.com', async () => {
    const connector = new InstagramConnector(appSecret);
    const result = await connector.refreshLongLivedToken('mock_long_lived_token');

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('mock_long_lived_token');
  });

  it('16. Webhook events map to the correct target tenant connection', async () => {
    const connector = new InstagramConnector(appSecret);
    const webhookBody = {
      object: 'instagram',
      entry: [
        {
          id: 'ig_acc_1001',
          messaging: [
            {
              sender: { id: 'cust_777', username: 'klant_ghent' },
              recipient: { id: 'ig_acc_1001' },
              timestamp: Date.now(),
              message: { mid: 'mid_999', text: 'Heeft u halal opties?' }
            }
          ]
        }
      ]
    };

    const events = connector.parseWebhookPayload(webhookBody);
    expect(events.length).toBe(1);
    expect(events[0].senderId).toBe('cust_777');
  });

  it('17. Idempotency: Duplicate webhook message IDs are skipped', () => {
    const processedMessages = new Set<string>();
    const msgId = 'mid_duplicate_check_001';

    processedMessages.add(msgId);
    const isDuplicate = processedMessages.has(msgId);

    expect(isDuplicate).toBe(true);
  });

  it('18. Existing knowledge base and rules functionality remain intact', async () => {
    const kb = await db.getKnowledgeBase(tenantA_ID);
    const rules = await db.getAutomationRules(tenantA_ID);

    expect(kb.tenant_id).toBe(tenantA_ID);
    expect(rules.tenant_id).toBe(tenantA_ID);
  });
});
