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
      console.warn(JSON.stringify({ stage: 'disconnect_auth', tenant_id, error_code: 'unauthorized' }));
      return NextResponse.json({ 
        error: 'Unauthorized: Valid server-side session required to disconnect Instagram account.' 
      }, { status: 401 });
    }

    // 2. Fetch existing Instagram connections without unsafe .single()
    const { data: connections, error: connErr } = await backend
      .from('platform_connections')
      .select('id, account_id, account_name, tenant_id, is_active')
      .eq('tenant_id', tenant_id)
      .eq('platform', 'instagram');

    if (connErr) {
      console.error(JSON.stringify({ stage: 'disconnect_fetch', tenant_id, error_code: 'db_query_failed' }));
      return NextResponse.json({ error: 'Failed to query Instagram connection.' }, { status: 500 });
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'No active Instagram connection found for this tenant.' }, { status: 404 });
    }

    const activeConnections = connections.filter(c => c.is_active);

    if (activeConnections.length === 0) {
      return NextResponse.json({ error: 'No active Instagram connection found for this tenant.' }, { status: 404 });
    }

    if (activeConnections.length > 1) {
      console.warn(JSON.stringify({ stage: 'disconnect_fetch', tenant_id, duplicate_count: activeConnections.length }));
    }

    const targetConnection = activeConnections[0];

    // Ensure tenant match
    if (targetConnection.tenant_id !== tenant_id) {
      console.error(JSON.stringify({ stage: 'disconnect_tenant_check', tenant_id, error_code: 'tenant_isolation_violation' }));
      return NextResponse.json({ error: 'Tenant isolation violation' }, { status: 403 });
    }

    // 3. Deactivate all active connections strictly for target tenant & platform
    const { error: updateErr } = await backend
      .from('platform_connections')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id)
      .eq('platform', 'instagram');

    if (updateErr) {
      console.error(JSON.stringify({ stage: 'disconnect_update', tenant_id, error_code: 'db_update_failed' }));
      return NextResponse.json({ error: 'Failed to disconnect Instagram connection.' }, { status: 500 });
    }

    console.log(JSON.stringify({ stage: 'disconnect_success', tenant_id, connection_id: targetConnection.id, account_id: targetConnection.account_id }));

    // 4. Record Audit Log (without token!)
    await db.addAuditLog({
      tenant_id: tenant_id,
      event_type: 'INSTAGRAM_DISCONNECTED',
      actor_type: 'user',
      details: {
        platform: 'instagram',
        tenant_id: tenant_id,
        account_id: targetConnection.account_id,
        account_name: targetConnection.account_name,
      },
    });

    return NextResponse.json({
      success: true,
      tenant_id: tenant_id,
      account_id: targetConnection.account_id,
      status: 'disconnected',
    });
  } catch (err: any) {
    console.error(JSON.stringify({ stage: 'disconnect_unhandled', error_code: 'internal_error' }));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
