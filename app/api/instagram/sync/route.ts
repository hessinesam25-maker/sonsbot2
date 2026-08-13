import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { syncInstagramData } from '@/lib/services/instagram-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    const requestedTenantId = body.tenantId || searchParams.get('tenantId');

    const backend = getBackendSupabaseClient();
    const ssrClient = createServerSupabaseClient(req);

    // 1. Session Authentication
    const { data: { user }, error: authErr } = await ssrClient.auth.getUser();

    let authenticatedUserId: string | null = null;
    let isPlatformAdmin = false;
    let userTenantId: string | null = null;
    let userRole: string | null = null;

    if (user && !authErr) {
      authenticatedUserId = user.id;

      // Check Platform Admin
      const { data: adminCheck } = await backend
        .from('platform_admins')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (adminCheck) {
        isPlatformAdmin = true;
      } else {
        // Check Tenant User
        const { data: userCheck } = await backend
          .from('users')
          .select('tenant_id, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (userCheck) {
          userTenantId = userCheck.tenant_id;
          userRole = userCheck.role;
        }
      }
    } else if (process.env.NODE_ENV === 'test') {
      const testHeader = req.headers.get('Authorization');
      if (testHeader && testHeader.startsWith('Bearer test_admin')) {
        isPlatformAdmin = true;
        authenticatedUserId = '00000000-0000-0000-0000-000000000000';
      } else if (testHeader && testHeader.startsWith('Bearer test_user_')) {
        // e.g. Bearer test_user_tenantId
        userTenantId = testHeader.replace('Bearer test_user_', '');
        userRole = 'owner';
        authenticatedUserId = '11111111-1111-1111-1111-111111111111';
      }
    }

    if (!authenticatedUserId && !isPlatformAdmin && !userTenantId) {
      return NextResponse.json({
        error: 'Unauthorized: Authentication required to sync Instagram data.',
      }, { status: 401 });
    }

    // Determine target tenant ID
    const targetTenantId = requestedTenantId || userTenantId;

    if (!targetTenantId) {
      return NextResponse.json({ error: 'tenantId parameter is required' }, { status: 400 });
    }

    // 2. Authorization & Tenant Isolation Check
    if (!isPlatformAdmin) {
      if (userTenantId !== targetTenantId) {
        return NextResponse.json({
          error: 'Forbidden: You do not have permission to sync Instagram data for this restaurant.',
        }, { status: 403 });
      }

      if (userRole && !['owner', 'manager'].includes(userRole)) {
        return NextResponse.json({
          error: 'Forbidden: Only restaurant owners and managers can trigger Instagram data sync.',
        }, { status: 403 });
      }
    }

    // 3. Execute Server-Side Instagram Sync
    const result = await syncInstagramData(targetTenantId);

    if (!result.success) {
      const isNotFound = result.error?.includes('No active Instagram connection');
      return NextResponse.json({
        success: false,
        tenantId: targetTenantId,
        error: result.error,
      }, { status: isNotFound ? 404 : 400 });
    }

    return NextResponse.json({
      success: true,
      tenantId: targetTenantId,
      mediaSynced: result.mediaSynced || 0,
      commentsSynced: result.commentsSynced || 0,
      lastSuccessfulSync: result.lastSuccessfulSync,
    });
  } catch (err: any) {
    console.error('Instagram sync API route error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
