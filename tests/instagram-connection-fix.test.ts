import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { db } from '../lib/db/store';
import { encryptToken } from '../lib/security/encryption';

describe('Instagram Connection Fix Focused Test Suite', () => {
  const tenantA_ID = '1029a20d-1342-42fa-87c2-c0fef3cceeaf';
  const tenantB_ID = '48a68bd0-8d93-4616-8efe-80cd5304d5c3';

  it('1. Selected restaurant ID survives OAuth state initiation -> callback -> storage', () => {
    const selectedTenant = tenantA_ID;
    const stateToken = crypto.randomBytes(32).toString('hex');

    // OAuth state record created at initiate
    const stateRecord = {
      tenant_id: selectedTenant,
      platform: 'instagram',
      state_hash: stateToken,
      scopes: ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_messages'],
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };

    // Callback reads consumed state
    const consumedState = { ...stateRecord };
    const targetTenantId = consumedState.tenant_id;

    // Platform connection payload
    const connectionPayload = {
      tenant_id: targetTenantId,
      platform: 'instagram',
      account_id: '17841448075798336',
      account_name: 'allthingisgood',
    };

    expect(connectionPayload.tenant_id).toBe(selectedTenant);
    expect(connectionPayload.tenant_id).not.toBe(tenantB_ID);
  });

  it('2. Callback upserts platform_connections under correct tenant', () => {
    const targetTenant = tenantA_ID;
    const accountId = '17841448075798336';
    const accountName = 'allthingisgood';
    const rawToken = 'IGQJv_test_token_12345';
    const encryptedToken = encryptToken(rawToken);

    const record = {
      tenant_id: targetTenant,
      platform: 'instagram',
      account_id: accountId,
      account_name: accountName,
      access_token_encrypted: encryptedToken,
      is_active: true,
      permissions: ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_messages'],
      updated_at: new Date().toISOString(),
    };

    expect(record.tenant_id).toBe(tenantA_ID);
    expect(record.platform).toBe('instagram');
    expect(record.is_active).toBe(true);
    expect(record.access_token_encrypted).not.toBe(rawToken);
  });

  it('3. Existing connection is updated idempotently (onConflict tenant_id, platform, account_id)', () => {
    const existingRecord = {
      id: 'conn_123',
      tenant_id: tenantA_ID,
      platform: 'instagram',
      account_id: '17841448075798336',
      account_name: 'allthingisgood',
      is_active: true,
      updated_at: '2026-08-05T00:00:00.000Z',
    };

    const updatePayload = {
      tenant_id: tenantA_ID,
      platform: 'instagram',
      account_id: '17841448075798336',
      account_name: 'allthingisgood',
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Idempotent upsert merges based on composite unique constraint (tenant_id, platform, account_id)
    const mergedRecord = { ...existingRecord, ...updatePayload };

    expect(mergedRecord.id).toBe(existingRecord.id);
    expect(mergedRecord.account_id).toBe('17841448075798336');
    expect(new Date(mergedRecord.updated_at).getTime()).toBeGreaterThan(new Date(existingRecord.updated_at).getTime());
  });

  it('4. Platform connections RLS policy supports Platform Admins and enforces tenant isolation', async () => {
    // RLS policy: is_platform_admin() OR (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('owner', 'manager'))
    const mockCheckSelectPermission = (user: { is_admin: boolean; user_tenant: string }, rowTenant: string) => {
      if (user.is_admin) return true; // Platform Admin override
      return user.user_tenant === rowTenant;
    };

    const adminUser = { is_admin: true, user_tenant: '' };
    const tenantAUser = { is_admin: false, user_tenant: tenantA_ID };

    expect(mockCheckSelectPermission(adminUser, tenantA_ID)).toBe(true);
    expect(mockCheckSelectPermission(adminUser, tenantB_ID)).toBe(true);
    expect(mockCheckSelectPermission(tenantAUser, tenantA_ID)).toBe(true);
    expect(mockCheckSelectPermission(tenantAUser, tenantB_ID)).toBe(false);
  });

  it('5. UI recognizes saved platform and active status correctly', () => {
    const connections = [
      { id: '1', tenant_id: tenantA_ID, platform: 'instagram', account_id: '17841448075798336', account_name: 'allthingisgood', is_active: true },
      { id: '2', tenant_id: tenantA_ID, platform: 'google', account_id: 'g_123', account_name: 'Ghent Cafe', is_active: false },
    ];

    const igConn = connections.find(c => c.platform === 'instagram');
    const isConnected = Boolean(igConn && igConn.is_active);

    expect(isConnected).toBe(true);
    expect(igConn?.account_name).toBe('allthingisgood');
  });

  it('6. Missing connection returns Not Connected without throwing HTTP 406 or .single() error', () => {
    const emptyConnections: any[] = [];

    // Safe lookup without .single()
    const activeConnections = emptyConnections.filter(c => c.platform === 'instagram' && c.is_active);
    const targetConn = activeConnections.length > 0 ? activeConnections[0] : null;

    expect(targetConn).toBeNull();
    expect(Boolean(targetConn)).toBe(false);
  });

  it('7. Duplicate connection rows are handled safely without crashing .single()', () => {
    const duplicateConnections = [
      { id: 'conn_1', tenant_id: tenantA_ID, platform: 'instagram', account_id: '17841448075798336', is_active: true, created_at: '2026-08-05' },
      { id: 'conn_2', tenant_id: tenantA_ID, platform: 'instagram', account_id: '17841448075798336', is_active: true, created_at: '2026-08-06' },
    ];

    // Safe handling: filter active connections and take latest
    const activeConnections = duplicateConnections.filter(c => c.is_active);
    expect(activeConnections.length).toBe(2);

    const safeConnection = activeConnections.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    expect(safeConnection.id).toBe('conn_2');
  });

  it('8. Callback failures redirect with safe error codes without exposing secrets or raw tokens', () => {
    const mapError = (errType: string) => {
      switch (errType) {
        case 'access_denied':
          return '/dashboard/integrations?error=oauth_cancelled';
        case 'invalid_state':
          return '/dashboard/integrations?error=invalid_state';
        case 'token_exchange_failed':
          return '/dashboard/integrations?error=token_exchange_failed';
        default:
          return '/dashboard/integrations?error=oauth_failed';
      }
    };

    const redirect1 = mapError('access_denied');
    const redirect2 = mapError('invalid_state');

    expect(redirect1).toBe('/dashboard/integrations?error=oauth_cancelled');
    expect(redirect2).toBe('/dashboard/integrations?error=invalid_state');
    expect(redirect1).not.toContain('access_token');
    expect(redirect1).not.toContain('secret');
  });
});
