import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

async function authenticateAndAuthorize(req: NextRequest, targetTenantId?: string, isWriteOperation: boolean = false) {
  const backend = getBackendSupabaseClient();
  const ssrClient = createServerSupabaseClient(req);

  let isPlatformAdmin = false;
  let tenantUser: { tenant_id: string; role: string } | null = null;
  let isAuthenticated = false;

  const { data: { user }, error: authErr } = await ssrClient.auth.getUser();

  if (user && !authErr) {
    isAuthenticated = true;
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
        tenantUser = userCheck;
      }
    }
  } else if (process.env.NODE_ENV === 'test') {
    const testRole = req.headers.get('x-test-role');
    const testTenantId = req.headers.get('x-test-tenant-id');
    const authHeader = req.headers.get('Authorization');

    if (authHeader && authHeader.startsWith('Bearer test_')) {
      isAuthenticated = true;
      if (testRole === 'platform_admin') {
        isPlatformAdmin = true;
      } else if (testTenantId) {
        tenantUser = {
          tenant_id: testTenantId,
          role: testRole || 'owner',
        };
      }
    }
  }

  if (!isAuthenticated) {
    return { status: 401, error: 'Unauthorized: Valid authentication required.' };
  }

  if (isPlatformAdmin) {
    return { isPlatformAdmin: true, tenantId: targetTenantId || tenantUser?.tenant_id };
  }

  if (!tenantUser) {
    return { status: 403, error: 'Forbidden: No tenant user mapping found.' };
  }

  if (targetTenantId && targetTenantId !== tenantUser.tenant_id) {
    return { status: 403, error: 'Forbidden: Cross-tenant access denied.' };
  }

  if (isWriteOperation && tenantUser.role === 'support_agent') {
    return { status: 403, error: 'Forbidden: Support agents cannot modify menu items.' };
  }

  return { isPlatformAdmin: false, tenantId: tenantUser.tenant_id, role: tenantUser.role };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedTenantId = searchParams.get('tenantId') || undefined;

    const authResult = await authenticateAndAuthorize(req, requestedTenantId, false);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const tenantId = authResult.isPlatformAdmin ? (requestedTenantId || authResult.tenantId) : authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId parameter is required' }, { status: 400 });
    }

    const ssrClient = createServerSupabaseClient(req);
    const backend = getBackendSupabaseClient();
    const dbClient = backend;

    const menu = await db.getMenu(tenantId, dbClient);
    return NextResponse.json(menu);
  } catch (error: any) {
    console.error('Error fetching menu items:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch menu items' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requestedTenantId = body.tenant_id || body.tenantId;

    const authResult = await authenticateAndAuthorize(req, requestedTenantId, true);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const targetTenantId = authResult.isPlatformAdmin ? (requestedTenantId || authResult.tenantId) : authResult.tenantId;

    if (!targetTenantId) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    const ssrClient = createServerSupabaseClient(req);
    const backend = getBackendSupabaseClient();
    const dbClient = backend;

    const newItem = await db.addMenuItem(body, targetTenantId, dbClient);

    if (!newItem) {
      return NextResponse.json({ error: 'Failed to create menu item in database.' }, { status: 500 });
    }

    await db.addAuditLog({
      event_type: 'MENU_ITEM_ADDED',
      actor_type: 'user',
      tenant_id: targetTenantId,
      details: { id: newItem.id, name: newItem.name, category: newItem.category, price: newItem.price },
    });

    return NextResponse.json(newItem, { status: 201 });
  } catch (error: any) {
    console.error('Error creating menu item:', error);
    return NextResponse.json({ error: error.message || 'Failed to create menu item' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Menu item id is required' }, { status: 400 });
    }

    const requestedTenantId = updates.tenant_id || updates.tenantId;
    const authResult = await authenticateAndAuthorize(req, requestedTenantId, true);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const ssrClient = createServerSupabaseClient(req);
    const backend = getBackendSupabaseClient();
    const dbClient = backend;

    const updated = await db.updateMenuItem(id, updates, dbClient);

    await db.addAuditLog({
      event_type: 'MENU_ITEM_UPDATED',
      actor_type: 'user',
      tenant_id: authResult.tenantId,
      details: { id, name: updated?.name },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating menu item:', error);
    return NextResponse.json({ error: error.message || 'Failed to update menu item' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const requestedTenantId = searchParams.get('tenantId') || undefined;

    if (!id) {
      return NextResponse.json({ error: 'Missing menu item id' }, { status: 400 });
    }

    const authResult = await authenticateAndAuthorize(req, requestedTenantId, true);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const ssrClient = createServerSupabaseClient(req);
    const backend = getBackendSupabaseClient();
    const dbClient = backend;

    await db.deleteMenuItem(id, dbClient);

    await db.addAuditLog({
      event_type: 'MENU_ITEM_DELETED',
      actor_type: 'user',
      tenant_id: authResult.tenantId,
      details: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting menu item:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete menu item' }, { status: 500 });
  }
}
