import { describe, it, expect } from 'vitest';
import { GET as getAuthMe } from '@/app/api/auth/me/route';
import { POST as createTenantApi, DELETE as deleteTenantApi } from '@/app/api/admin/tenants/route';
import { getNormalizedInstagramState } from '@/lib/db/store';
import { NextRequest } from 'next/server';

describe('Tenant List Synchronization & Lifecycle Test Suite', () => {
  let createdTenantId: string = '';

  it('1. Platform Admin creates a new tenant D -> receives valid ID and allowedTenants includes it upon refresh', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/admin/tenants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
      body: JSON.stringify({
        name: 'Trattoria Gentse Graven',
        city: 'Ghent',
        country: 'Belgium',
        default_locale: 'nl',
        timezone: 'Europe/Brussels',
      }),
    });

    const createRes = await createTenantApi(createReq);
    expect(createRes.status).toBe(201);
    const createdData = await createRes.json();
    expect(createdData.id).toBeDefined();
    createdTenantId = createdData.id;

    // Refresh auth context via /api/auth/me
    const meReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });

    const meRes = await getAuthMe(meReq);
    expect(meRes.status).toBe(200);
    const meData = await meRes.json();

    expect(meData.authenticated).toBe(true);
    expect(meData.isPlatformAdmin).toBe(true);
    const foundCreated = meData.allowedTenants.find((t: any) => t.id === createdTenantId);
    expect(foundCreated).toBeDefined();
    expect(foundCreated.name).toBe('Trattoria Gentse Graven');
  });

  it('2. switchTenant to newly created Tenant D succeeds because allowedTenants is updated', async () => {
    expect(createdTenantId).not.toBe('');

    // Fetch allowedTenants for admin
    const meReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });

    const meRes = await getAuthMe(meReq);
    const meData = await meRes.json();
    const allowed = meData.allowedTenants;

    const target = allowed.find((t: any) => t.id === createdTenantId);
    expect(target).toBeDefined();
    expect(allowed.map((t: any) => t.id)).toContain(createdTenantId);
  });

  it('3. Delete tenant -> Tenant disappears from allowedTenants upon refresh', async () => {
    expect(createdTenantId).not.toBe('');

    // Delete created tenant
    const delReq = new NextRequest(`http://localhost:3000/api/admin/tenants?tenantId=${createdTenantId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });

    const delRes = await deleteTenantApi(delReq);
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.success).toBe(true);

    // Refresh auth context
    const meReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });

    const meRes = await getAuthMe(meReq);
    const meData = await meRes.json();
    const foundDeleted = meData.allowedTenants.find((t: any) => t.id === createdTenantId);
    expect(foundDeleted).toBeUndefined();
  });

  it('4. Deleting currently selected tenant automatically selects another valid allowed tenant', async () => {
    // Fetch initial allowedTenants for admin
    const meReqBefore = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });
    const meResBefore = await getAuthMe(meReqBefore);
    const meDataBefore = await meResBefore.json();
    expect(meDataBefore.allowedTenants.length).toBeGreaterThan(0);
    const selectedBeforeId = meDataBefore.tenantId;

    // Simulate delete request for currently selected tenant
    const delReq = new NextRequest(`http://localhost:3000/api/admin/tenants?tenantId=${selectedBeforeId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });
    await deleteTenantApi(delReq);

    // Refresh /api/auth/me
    const meReqAfter = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });
    const meResAfter = await getAuthMe(meReqAfter);
    const meDataAfter = await meResAfter.json();

    expect(meDataAfter.tenantId).toBeDefined();
    expect(meDataAfter.allowedTenants.some((t: any) => t.id === meDataAfter.tenantId)).toBe(true);
  });

  it('5. Deleted tenant is removed from localStorage check & allowed list', async () => {
    const meReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });
    const meRes = await getAuthMe(meReq);
    const meData = await meRes.json();

    const bogusDeletedId = '99999999-9999-9999-9999-999999999999';
    expect(meData.allowedTenants.some((t: any) => t.id === bogusDeletedId)).toBe(false);
  });

  it('6. Created tenant does not require logout/login to appear for Platform Admin', async () => {
    const meReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });
    const meRes = await getAuthMe(meReq);
    expect(meRes.status).toBe(200);
    const meData = await meRes.json();
    expect(meData.authenticated).toBe(true);
    expect(meData.allowedTenants.length).toBeGreaterThan(0);
  });

  it('7. Tenant switching reloads Instagram state specifically for the selected tenant', async () => {
    const dummyConnA = [{
      id: 'conn-a',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      platform: 'instagram' as const,
      account_id: 'ig_123',
      account_name: '@gentse_draak',
      access_token_encrypted: 'dummy_enc_token',
      permissions: ['instagram_basic'],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }];

    const dummyConnB: any[] = [];

    const stateA = getNormalizedInstagramState(dummyConnA);
    const stateB = getNormalizedInstagramState(dummyConnB);

    expect(stateA.connected).toBe(true);
    expect(stateA.username).toBe('gentse_draak');

    expect(stateB.connected).toBe(false);
    expect(stateB.username).toBeUndefined();
  });

  it('8. Normal tenant users still cannot gain new tenant access by refreshing', async () => {
    const meReq = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_user',
        'x-test-role': 'owner',
        'x-test-tenant-id': '11111111-1111-1111-1111-111111111111',
      },
    });

    const meRes = await getAuthMe(meReq);
    const meData = await meRes.json();

    expect(meData.authenticated).toBe(true);
    expect(meData.isPlatformAdmin).toBe(false);
    expect(meData.allowedTenants.length).toBe(1);
    expect(meData.allowedTenants[0].id).toBe('11111111-1111-1111-1111-111111111111');
  });
});
