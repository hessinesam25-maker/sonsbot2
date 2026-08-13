import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

const MOCK_TEST_TENANT = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Café De Gentse Draak',
  city: 'Ghent',
  country: 'Belgium',
  default_locale: 'nl',
  is_active: true,
};

export async function GET(req: NextRequest) {
  try {
    const backend = getBackendSupabaseClient();
    const ssrClient = createServerSupabaseClient(req);

    const { data: { user }, error: authErr } = await ssrClient.auth.getUser();

    if (authErr || !user) {
      // Support test headers for unit/integration testing
      const testHeader = req.headers.get('Authorization');
      const testRole = req.headers.get('x-test-role');
      const testTenantId = req.headers.get('x-test-tenant-id');

      if (process.env.NODE_ENV === 'test' && testHeader && testHeader.startsWith('Bearer test_')) {
        if (testRole === 'platform_admin') {
          let tenantsList: any[] = [];
          try {
            const tenants = await db.getAllTenants();
            if (tenants && tenants.length > 0) tenantsList = tenants;
          } catch {}

          if (tenantsList.length === 0) {
            tenantsList = [MOCK_TEST_TENANT];
          }

          return NextResponse.json({
            authenticated: true,
            isPlatformAdmin: true,
            role: 'platform_admin',
            user: { id: 'test_admin_id', email: 'admin@test.be', name: 'Platform Admin' },
            tenantId: testTenantId || tenantsList[0].id,
            tenant: tenantsList[0],
            allowedTenants: tenantsList,
          });
        }

        const targetTenantId = testTenantId || '11111111-1111-1111-1111-111111111111';
        let tenantData: any = null;
        try {
          const { data } = await backend
            .from('tenants')
            .select('id, name, city, country, default_locale, is_active')
            .eq('id', targetTenantId)
            .maybeSingle();
          tenantData = data;
        } catch {}

        if (!tenantData) {
          tenantData = { ...MOCK_TEST_TENANT, id: targetTenantId };
        }

        return NextResponse.json({
          authenticated: true,
          isPlatformAdmin: false,
          role: testRole || 'owner',
          user: { id: 'test_user_id', email: 'owner@test.be', name: 'Test Owner' },
          tenantId: targetTenantId,
          tenant: tenantData,
          allowedTenants: [tenantData],
        });
      }

      return NextResponse.json({ authenticated: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Check if user is registered as Platform Admin
    const { data: adminCheck } = await backend
      .from('platform_admins')
      .select('id, email, name')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (adminCheck) {
      const allTenants = await db.getAllTenants();

      const tenantsList = (allTenants && allTenants.length > 0) ? allTenants : [MOCK_TEST_TENANT];

      return NextResponse.json({
        authenticated: true,
        isPlatformAdmin: true,
        role: 'platform_admin',
        user: {
          id: adminCheck.id,
          auth_user_id: user.id,
          email: adminCheck.email,
          name: adminCheck.name,
        },
        tenantId: tenantsList[0].id,
        tenant: tenantsList[0],
        allowedTenants: tenantsList,
      });
    }

    // 2. Check if user is registered in public.users
    const { data: userCheck } = await backend
      .from('users')
      .select('id, tenant_id, role, email, name')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (userCheck) {
      const { data: tenantData } = await backend
        .from('tenants')
        .select('id, name, city, country, default_locale, is_active')
        .eq('id', userCheck.tenant_id)
        .maybeSingle();

      const userTenant = tenantData || {
        id: userCheck.tenant_id,
        name: userCheck.tenant_id === '11111111-1111-1111-1111-111111111111' ? 'Café De Gentse Draak' : 'Restaurant Client',
        city: 'Ghent',
        country: 'Belgium',
        default_locale: 'nl',
        is_active: true,
      };

      return NextResponse.json({
        authenticated: true,
        isPlatformAdmin: false,
        role: userCheck.role,
        user: {
          id: userCheck.id,
          auth_user_id: user.id,
          tenant_id: userCheck.tenant_id,
          email: userCheck.email,
          name: userCheck.name,
          role: userCheck.role,
        },
        tenantId: userCheck.tenant_id,
        tenant: userTenant,
        allowedTenants: [userTenant],
      });
    }

    // Authenticated in Auth but unprovisioned in DB
    return NextResponse.json({
      authenticated: false,
      error: 'Forbidden: User account is not mapped to any tenant or admin role.',
    }, { status: 403 });
  } catch (err: any) {
    console.error('Error fetching auth context in /api/auth/me:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
