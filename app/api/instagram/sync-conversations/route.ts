import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { syncInstagramConversations } from '@/lib/services/instagram-conversations-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

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

      const { data: adminCheck } = await backend
        .from('platform_admins')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (adminCheck) {
        isPlatformAdmin = true;
      } else {
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
        userTenantId = testHeader.replace('Bearer test_user_', '');
        userRole = 'owner';
        authenticatedUserId = '11111111-1111-1111-1111-111111111111';
      }
    }

    if (!authenticatedUserId && !isPlatformAdmin && !userTenantId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized: Authentication required to sync Instagram conversations.',
      }, { status: 401 });
    }

    const targetTenantId = requestedTenantId || userTenantId;

    if (!targetTenantId) {
      return NextResponse.json({
        success: false,
        error: 'tenantId parameter is required.',
      }, { status: 400 });
    }

    // 2. Authorization & Tenant Isolation Check
    if (!isPlatformAdmin) {
      if (userTenantId !== targetTenantId) {
        return NextResponse.json({
          success: false,
          error: 'Forbidden: You do not have permission to sync conversations for this restaurant.',
        }, { status: 403 });
      }

      if (userRole && !['owner', 'manager'].includes(userRole)) {
        return NextResponse.json({
          success: false,
          error: 'Forbidden: Only restaurant owners and managers can trigger conversation sync.',
        }, { status: 403 });
      }
    }

    // 3. Execute Server-Side Instagram Conversations Sync
    const result = await syncInstagramConversations(targetTenantId);

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
      conversationsSynced: result.conversationsSynced || 0,
      messagesSynced: result.messagesSynced || 0,
      lastSuccessfulSync: result.lastSuccessfulSync,
    });
  } catch (err: any) {
    console.error('Instagram sync conversations API route error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal server error',
    }, { status: 500 });
  }
}
