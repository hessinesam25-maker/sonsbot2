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
    // Check if platform admin
    const { data: adminCheck } = await backend
      .from('platform_admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (adminCheck) {
      isPlatformAdmin = true;
    } else {
      // Check tenant user role & tenant_id
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
    // Support test headers for unit & integration testing
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

  // Authorization checks
  if (isPlatformAdmin) {
    // Platform admin can read/write any tenant
    return { isPlatformAdmin: true, tenantId: targetTenantId || tenantUser?.tenant_id };
  }

  if (!tenantUser) {
    return { status: 403, error: 'Forbidden: No tenant user mapping found.' };
  }

  // Normal tenant user checks
  if (targetTenantId && targetTenantId !== tenantUser.tenant_id) {
    return { status: 403, error: 'Forbidden: Cross-tenant access denied.' };
  }

  if (isWriteOperation) {
    if (tenantUser.role === 'support_agent') {
      return { status: 403, error: 'Forbidden: Support agents are not permitted to update AI settings.' };
    }
    if (tenantUser.role !== 'owner' && tenantUser.role !== 'manager') {
      return { status: 403, error: 'Forbidden: Insufficient permissions to update AI settings.' };
    }
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

    const settings = await db.getAISettings(tenantId);
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error fetching AI settings:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch AI settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const requestedTenantId = body.tenant_id;

    const authResult = await authenticateAndAuthorize(req, requestedTenantId, true);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const targetTenantId = authResult.isPlatformAdmin ? (requestedTenantId || authResult.tenantId) : authResult.tenantId;

    if (!targetTenantId) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    const dbPayload: Partial<import('@/lib/db/types').AISettings> = {};
    if (body.ai_enabled !== undefined) dbPayload.ai_enabled = Boolean(body.ai_enabled);
    if (body.primary_language !== undefined) dbPayload.primary_language = String(body.primary_language);
    if (body.tone !== undefined) dbPayload.tone = body.tone;
    if (body.reply_length !== undefined) dbPayload.reply_length = body.reply_length;
    if (body.emoji_usage !== undefined) dbPayload.emoji_usage = body.emoji_usage;
    if (body.custom_instructions !== undefined) dbPayload.custom_instructions = String(body.custom_instructions);
    if (body.reply_to_dms !== undefined) dbPayload.reply_to_dms = Boolean(body.reply_to_dms);
    if (body.reply_to_comments !== undefined) dbPayload.reply_to_comments = Boolean(body.reply_to_comments);
    if (body.use_knowledge_base !== undefined) dbPayload.use_knowledge_base = Boolean(body.use_knowledge_base);
    if (body.fallback_behavior !== undefined) dbPayload.fallback_behavior = body.fallback_behavior;

    await db.updateAISettings(dbPayload, targetTenantId);

    // Re-fetch persisted row from server database to enforce DB truth
    const verified = await db.getAISettings(targetTenantId);

    await db.addAuditLog({
      event_type: 'AI_SETTINGS_UPDATED',
      actor_type: 'user',
      tenant_id: targetTenantId,
      details: { 
        ai_enabled: verified?.ai_enabled, 
        tone: verified?.tone, 
        primary_language: verified?.primary_language 
      },
    });

    return NextResponse.json(verified);
  } catch (error: any) {
    console.error('Error updating AI settings:', error);
    return NextResponse.json({ error: error.message || 'Failed to update AI settings' }, { status: 500 });
  }
}
