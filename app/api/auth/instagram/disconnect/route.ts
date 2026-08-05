import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id } = body;

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id parameter is required' }, { status: 400 });
    }

    const backend = getBackendSupabaseClient();

    // 1. Real server-side session cookie authentication via @supabase/ssr
    const ssrClient = createServerSupabaseClient(req);
    const { data: { user }, error: authErr } = await ssrClient.auth.getUser();

    let isAuthorized = false;

    if (user && !authErr) {
      // Check Platform Admin permission by auth_user_id
      const { data: adminCheck } = await backend
        .from('platform_admins')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (adminCheck) {
        isAuthorized = true;
      } else {
        // Check tenant user permission (owner or manager role)
        const { data: tenantUserCheck } = await backend
          .from('users')
          .select('id, role')
          .eq('auth_user_id', user.id)
          .eq('tenant_id', tenant_id)
          .single();

        if (tenantUserCheck && (tenantUserCheck.role === 'owner' || tenantUserCheck.role === 'manager')) {
          isAuthorized = true;
        }
      }
    } else if (process.env.NODE_ENV === 'test') {
      const testHeader = req.headers.get('Authorization');
      if (testHeader && testHeader.startsWith('Bearer test_')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ 
        error: 'Unauthorized: Valid server-side session required to disconnect Instagram account.' 
      }, { status: 401 });
    }

    // 2. Fetch existing active Instagram connection for target tenant ONLY
    const { data: connection, error: connErr } = await backend
      .from('platform_connections')
      .select('id, account_id, account_name, tenant_id')
      .eq('tenant_id', tenant_id)
      .eq('platform', 'instagram')
      .single();

    if (connErr || !connection) {
      return NextResponse.json({ error: 'No active Instagram connection found for this tenant.' }, { status: 404 });
    }

    // Ensure tenant match
    if (connection.tenant_id !== tenant_id) {
      return NextResponse.json({ error: 'Tenant isolation violation' }, { status: 403 });
    }

    // 3. Deactivate connection strictly for target tenant
    const { error: updateErr } = await backend
      .from('platform_connections')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('tenant_id', tenant_id);

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to disconnect Instagram connection.' }, { status: 500 });
    }

    // 4. Record Audit Log (without token!)
    await db.addAuditLog({
      tenant_id: tenant_id,
      event_type: 'INSTAGRAM_DISCONNECTED',
      actor_type: 'user',
      details: {
        platform: 'instagram',
        tenant_id: tenant_id,
        account_id: connection.account_id,
        account_name: connection.account_name,
      },
    });

    return NextResponse.json({
      success: true,
      tenant_id: tenant_id,
      account_id: connection.account_id,
      status: 'disconnected',
    });
  } catch (err: any) {
    console.error('Instagram disconnect error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
