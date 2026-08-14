import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';
import { AutomationRules } from '@/lib/db/types';

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
    return { isPlatformAdmin: true, tenantId: targetTenantId || tenantUser?.tenant_id || '1029a20d-1342-42fa-87c2-c0fef3cceeaf' };
  }

  if (!tenantUser) {
    return { status: 403, error: 'Forbidden: No tenant user mapping found.' };
  }

  if (targetTenantId && targetTenantId !== tenantUser.tenant_id) {
    return { status: 403, error: 'Forbidden: Cross-tenant access denied.' };
  }

  if (isWriteOperation) {
    if (tenantUser.role === 'support_agent') {
      return { status: 403, error: 'Forbidden: Support agents are not permitted to update automation rules.' };
    }
    if (tenantUser.role !== 'owner' && tenantUser.role !== 'manager') {
      return { status: 403, error: 'Forbidden: Insufficient permissions to update automation rules.' };
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

    const tenantId = authResult.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
    }

    const rules = await db.getAutomationRules(tenantId);
    return NextResponse.json(rules);
  } catch (err: any) {
    console.error('[GET_AUTOMATION_RULES_API_ERROR]', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const requestedTenantId = body.tenantId || body.tenant_id || undefined;

    const authResult = await authenticateAndAuthorize(req, requestedTenantId, true);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const tenantId = authResult.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
    }

    // Explicitly build DB payload with valid database columns ONLY (never spread tenantId)
    const dbPayload: Partial<AutomationRules> = {};

    if (body.static_dm_enabled !== undefined) {
      dbPayload.static_dm_enabled = Boolean(body.static_dm_enabled);
    } else if (body.staticDmEnabled !== undefined) {
      dbPayload.static_dm_enabled = Boolean(body.staticDmEnabled);
    }

    if (body.static_comment_enabled !== undefined) {
      dbPayload.static_comment_enabled = Boolean(body.static_comment_enabled);
    } else if (body.staticCommentEnabled !== undefined) {
      dbPayload.static_comment_enabled = Boolean(body.staticCommentEnabled);
    }

    if (body.default_dm_reply !== undefined) {
      dbPayload.default_dm_reply = body.default_dm_reply;
    } else if (body.defaultDmReply !== undefined) {
      dbPayload.default_dm_reply = body.defaultDmReply;
    }

    if (body.default_comment_reply !== undefined) {
      dbPayload.default_comment_reply = body.default_comment_reply;
    } else if (body.defaultCommentReply !== undefined) {
      dbPayload.default_comment_reply = body.defaultCommentReply;
    }

    if (body.min_confidence_score !== undefined) dbPayload.min_confidence_score = body.min_confidence_score;
    if (body.max_public_replies_per_hour !== undefined) dbPayload.max_public_replies_per_hour = body.max_public_replies_per_hour;
    if (body.auto_reply_positive_comments !== undefined) dbPayload.auto_reply_positive_comments = body.auto_reply_positive_comments;
    if (body.auto_reply_factual_questions !== undefined) dbPayload.auto_reply_factual_questions = body.auto_reply_factual_questions;
    if (body.never_reply_complaints !== undefined) dbPayload.never_reply_complaints = body.never_reply_complaints;
    if (body.hide_spam !== undefined) dbPayload.hide_spam = body.hide_spam;
    if (body.ai_tone !== undefined) dbPayload.ai_tone = body.ai_tone;

    await db.updateAutomationRules(dbPayload, tenantId);

    // Re-fetch persisted row from database to enforce ground truth
    const verified = await db.getAutomationRules(tenantId);

    await db.addAuditLog({
      tenant_id: tenantId,
      event_type: 'AUTOMATION_RULES_UPDATED',
      actor_type: 'user',
      details: {
        static_dm_enabled: verified?.static_dm_enabled,
        default_dm_reply: verified?.default_dm_reply,
        static_comment_enabled: verified?.static_comment_enabled,
        default_comment_reply: verified?.default_comment_reply,
      },
    });

    return NextResponse.json(verified);
  } catch (err: any) {
    console.error('[PUT_AUTOMATION_RULES_API_ERROR]', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
