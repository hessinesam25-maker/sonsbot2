import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/store';
import { syncInstagramData } from '@/lib/services/instagram-sync';
import { encryptToken } from '@/lib/security/encryption';
import { POST } from '@/app/api/instagram/sync/route';
import { NextRequest } from 'next/server';

const TENANT_A = '11111111-1111-1111-1111-111111111111'; // Ghent Draak
const TENANT_B = '22222222-2222-2222-2222-222222222222'; // Pica Beans
const DISCONNECTED_TENANT = '33333333-3333-3333-3333-333333333333'; // Disconnected

describe('Instagram Foundation Data Sync Test Suite', () => {
  beforeEach(async () => {
    // Setup active connection for Tenant A
    const encryptedTokenA = encryptToken('token_ig_auth_mock_tenant_a');
    await db.updateConnection('conn_a_test', {
      tenant_id: TENANT_A,
      platform: 'instagram',
      account_id: '17841448075798336',
      account_name: 'allthingisgood',
      access_token_encrypted: encryptedTokenA,
      is_active: true,
    });

    // Setup active connection for Tenant B
    const encryptedTokenB = encryptToken('token_ig_auth_mock_tenant_b');
    await db.updateConnection('conn_b_test', {
      tenant_id: TENANT_B,
      platform: 'instagram',
      account_id: '17841447229729431',
      account_name: 'pica_beans_gent',
      access_token_encrypted: encryptedTokenB,
      is_active: true,
    });

    // Ensure clean state before each test
    await db.upsertInstagramMedia({
      tenant_id: TENANT_A,
      platform_connection_id: 'conn_a_test',
      instagram_media_id: 'media_test_init_a',
      media_type: 'IMAGE',
      caption: 'Initial post A',
    });
  });

  it('1. connected tenant sync succeeds', async () => {
    const result = await syncInstagramData(TENANT_A);
    expect(result.success).toBe(true);
    expect(result.tenantId).toBe(TENANT_A);
    expect(result.mediaSynced).toBeGreaterThan(0);
    expect(result.commentsSynced).toBeGreaterThan(0);
    expect(result.lastSuccessfulSync).toBeDefined();
  });

  it('2. disconnected tenant sync is blocked', async () => {
    const result = await syncInstagramData(DISCONNECTED_TENANT);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No active Instagram connection found');
  });

  it('3. cross-tenant sync API request returns 403 for unauthorized tenant user', async () => {
    const req = new NextRequest('http://localhost:3000/api/instagram/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test_user_${TENANT_A}`,
      },
      body: JSON.stringify({ tenantId: TENANT_B }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Forbidden');
  });

  it('4 & 5. media upsert is idempotent and syncing twice does not duplicate rows', async () => {
    const result1 = await syncInstagramData(TENANT_A);
    expect(result1.success).toBe(true);
    const mediaBefore = await db.getInstagramMedia(TENANT_A);

    const result2 = await syncInstagramData(TENANT_A);
    expect(result2.success).toBe(true);
    const mediaAfter = await db.getInstagramMedia(TENANT_A);

    expect(mediaAfter.length).toBe(mediaBefore.length);
  });

  it('6. webhook comment + sync comment with same Instagram comment ID does not duplicate', async () => {
    const sharedCommentId = 'ig_comment_dup_test_999';

    // Simulated Webhook comment insert
    await db.upsertComment({
      tenant_id: TENANT_A,
      platform: 'instagram',
      external_comment_id: sharedCommentId,
      media_id: 'media_test_001',
      media_type: 'post',
      author_username: 'webhook_user',
      content: 'Hello from Webhook!',
      classification: 'question',
    });

    const commentsBefore = await db.getComments(TENANT_A);
    const dupCountBefore = commentsBefore.filter(c => c.external_comment_id === sharedCommentId).length;
    expect(dupCountBefore).toBe(1);

    // Simulated Sync comment insert with same ID
    await db.upsertComment({
      tenant_id: TENANT_A,
      platform: 'instagram',
      external_comment_id: sharedCommentId,
      media_id: 'media_test_001',
      media_type: 'post',
      author_username: 'webhook_user',
      content: 'Hello from Webhook! (Updated via Sync)',
      classification: 'question',
    });

    const commentsAfter = await db.getComments(TENANT_A);
    const dupCountAfter = commentsAfter.filter(c => c.external_comment_id === sharedCommentId).length;
    expect(dupCountAfter).toBe(1);
  });

  it('7. pagination handling is bounded and does not loop infinitely', async () => {
    const result = await syncInstagramData(TENANT_A);
    expect(result.success).toBe(true);
    expect(result.mediaSynced).toBeLessThanOrEqual(50);
  });

  it('8. tenant A media never appears for Tenant B', async () => {
    await db.upsertInstagramMedia({
      tenant_id: TENANT_A,
      instagram_media_id: 'media_isolated_tenant_a_unique',
      media_type: 'IMAGE',
      caption: 'Exclusive Draak Post',
    });

    const mediaB = await db.getInstagramMedia(TENANT_B);
    const hasLeak = mediaB.some(m => m.instagram_media_id === 'media_isolated_tenant_a_unique');
    expect(hasLeak).toBe(false);
  });

  it('9. invalid or corrupted token produces controlled sanitized error', async () => {
    // Upsert broken connection record
    const connId = `conn_broken_${Date.now()}`;
    await db.updateConnection(connId, {
      tenant_id: 'tenant_corrupt_test',
      platform: 'instagram',
      account_id: '123456789',
      account_name: 'corrupt_account',
      access_token_encrypted: 'invalid_corrupt_gcm_token_format',
      is_active: true,
    });

    const result = await syncInstagramData('tenant_corrupt_test');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain('access_token=');
  });

  it('10. sync status updates correctly on platform_connections', async () => {
    const result = await syncInstagramData(TENANT_A);
    expect(result.success).toBe(true);

    const conns = await db.getConnections(TENANT_A);
    const activeConn = conns.find(c => c.platform === 'instagram' && c.is_active);
    expect(activeConn).toBeDefined();
    expect(activeConn?.last_synced_at).toBeDefined();
  });

  it('11. API route response returns NO access token to browser', async () => {
    const req = new NextRequest('http://localhost:3000/api/instagram/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test_admin`,
      },
      body: JSON.stringify({ tenantId: TENANT_A }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.access_token).toBeUndefined();
    expect(data.accessToken).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('token_ig_');
  });

  it('12. Platform Admin can sync any selected tenant', async () => {
    const req = new NextRequest('http://localhost:3000/api/instagram/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test_admin`,
      },
      body: JSON.stringify({ tenantId: TENANT_B }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.tenantId).toBe(TENANT_B);
  });
});
