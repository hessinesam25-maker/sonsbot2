import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';
import { ParsedMenuItem } from '@/lib/menu/parser';

export const dynamic = 'force-dynamic';

async function authenticateAndAuthorize(req: NextRequest, targetTenantId?: string) {
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
    return { status: 403, error: 'Forbidden: Cross-tenant import access denied.' };
  }

  if (tenantUser.role === 'support_agent') {
    return { status: 403, error: 'Forbidden: Support agents are not permitted to import menu items.' };
  }

  return { isPlatformAdmin: false, tenantId: tenantUser.tenant_id, role: tenantUser.role };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestedTenantId = body.tenantId || body.tenant_id;
    const rawItems: ParsedMenuItem[] = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'No menu items provided for import.' }, { status: 400 });
    }

    const authResult = await authenticateAndAuthorize(req, requestedTenantId);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const targetTenantId = authResult.isPlatformAdmin ? (requestedTenantId || authResult.tenantId) : authResult.tenantId;

    if (!targetTenantId) {
      return NextResponse.json({ error: 'tenantId parameter is required.' }, { status: 400 });
    }

    const ssrClient = createServerSupabaseClient(req);
    const backend = getBackendSupabaseClient();
    const dbClient = backend;

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const createdOrUpdatedItems: any[] = [];

    for (const item of rawItems) {
      // Skip if explicitly excluded by user
      if (item.selected === false) {
        skippedCount++;
        continue;
      }

      const action = item.duplicateAction || (item.isDuplicate ? 'skip' : 'import_new');

      if (action === 'skip') {
        skippedCount++;
        continue;
      }

      if (action === 'update' && item.duplicateOfId) {
        try {
          const updated = await db.updateMenuItem(item.duplicateOfId, {
            name: item.name,
            category: item.category,
            price: Number(item.price),
            description: item.description || '',
            ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
            approved_allergens: Array.isArray(item.approved_allergens) ? item.approved_allergens : [],
            is_vegetarian: Boolean(item.is_vegetarian),
            is_vegan: Boolean(item.is_vegan),
            is_available: item.is_available ?? true,
          }, dbClient);
          if (updated) {
            updatedCount++;
            createdOrUpdatedItems.push(updated);
          } else {
            failedCount++;
          }
        } catch (err) {
          console.error('[MENU_IMPORT_UPDATE_ERROR]', err);
          failedCount++;
        }
      } else {
        // Import as new item (omit temporary string IDs so DB generates valid UUIDs)
        try {
          const created = await db.addMenuItem({
            tenant_id: targetTenantId,
            category: item.category || 'General',
            name: item.name,
            price: Number(item.price),
            description: item.description || '',
            ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
            approved_allergens: Array.isArray(item.approved_allergens) ? item.approved_allergens : [],
            is_vegetarian: Boolean(item.is_vegetarian),
            is_vegan: Boolean(item.is_vegan),
            is_available: item.is_available ?? true,
          }, targetTenantId, dbClient);

          if (created) {
            importedCount++;
            createdOrUpdatedItems.push(created);
          } else {
            failedCount++;
          }
        } catch (err) {
          console.error('[MENU_IMPORT_INSERT_ERROR]', err);
          failedCount++;
        }
      }
    }

    await db.addAuditLog({
      event_type: 'MENU_IMPORTED',
      actor_type: 'user',
      tenant_id: targetTenantId,
      details: {
        totalReceived: rawItems.length,
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
      },
    });

    return NextResponse.json({
      success: true,
      count: {
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
      },
      items: createdOrUpdatedItems,
    });
  } catch (error: any) {
    console.error('Error in batch menu import endpoint:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error during menu import.',
    }, { status: 500 });
  }
}
