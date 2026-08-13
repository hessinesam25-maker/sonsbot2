import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getAuthMe } from '@/app/api/auth/me/route';
import { GET as getAiSettings, PUT as putAiSettings } from '@/app/api/ai-settings/route';
import { NextRequest } from 'next/server';

describe('Auth Hydration & Multi-Tenant Authorization Security Suite', () => {
  it('1. normal owner is assigned their own tenant and NOT platform admin', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_user',
        'x-test-role': 'owner',
        'x-test-tenant-id': '11111111-1111-1111-1111-111111111111',
      },
    });

    const res = await getAuthMe(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.authenticated).toBe(true);
    expect(data.isPlatformAdmin).toBe(false);
    expect(data.role).toBe('owner');
    expect(data.tenantId).toBe('11111111-1111-1111-1111-111111111111');
    expect(data.allowedTenants.length).toBe(1);
    expect(data.allowedTenants[0].id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('2. platform admin receives list of all allowed tenants', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });

    const res = await getAuthMe(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.authenticated).toBe(true);
    expect(data.isPlatformAdmin).toBe(true);
    expect(data.role).toBe('platform_admin');
    expect(data.allowedTenants.length).toBeGreaterThan(0);
  });

  it('3. server strictly blocks manually crafted cross-tenant API requests for normal users', async () => {
    const req = new NextRequest('http://localhost:3000/api/ai-settings?tenantId=1029a20d-1342-42fa-87c2-c0fef3cceeaf', {
      headers: {
        'Authorization': 'Bearer test_user',
        'x-test-role': 'owner',
        'x-test-tenant-id': '11111111-1111-1111-1111-111111111111',
      },
    });

    const res = await getAiSettings(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Forbidden: Cross-tenant access denied.');
  });

  it('4. platform admin is permitted to access settings for any valid tenant', async () => {
    const req = new NextRequest('http://localhost:3000/api/ai-settings?tenantId=11111111-1111-1111-1111-111111111111', {
      headers: {
        'Authorization': 'Bearer test_admin',
        'x-test-role': 'platform_admin',
      },
    });

    const res = await getAiSettings(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenant_id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('5. unauthenticated request to /api/auth/me returns 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/me');
    const res = await getAuthMe(req);
    expect(res.status).toBe(401);
  });
});
