import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';
import { AIDecisionTrace } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

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

  if (isPlatformAdmin) {
    return { isPlatformAdmin: true, tenantId: targetTenantId || tenantUser?.tenant_id };
  }

  if (!tenantUser) {
    return { status: 403, error: 'Forbidden: No tenant user mapping found.' };
  }

  if (targetTenantId && targetTenantId !== tenantUser.tenant_id) {
    return { status: 403, error: 'Forbidden: Cross-tenant access denied.' };
  }

  if (tenantUser.role !== 'owner' && tenantUser.role !== 'manager') {
    return { status: 403, error: 'Forbidden: Insufficient permissions to view AI decision traces.' };
  }

  return { isPlatformAdmin: false, tenantId: tenantUser.tenant_id, role: tenantUser.role };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedTenantId = searchParams.get('tenantId') || undefined;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
    const channel = searchParams.get('channel') || undefined;
    const outcome = searchParams.get('outcome') || undefined;
    const failureCategory = searchParams.get('failureCategory') || undefined;
    const search = searchParams.get('search')?.trim().toLowerCase() || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const authResult = await authenticateAndAuthorize(req, requestedTenantId);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: NO_CACHE_HEADERS });
    }

    const tenantId = authResult.isPlatformAdmin ? (requestedTenantId || authResult.tenantId) : authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId parameter is required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    // Fetch traces strictly scoped to authoritative tenantId
    const rawTraces = await db.getAIDecisionTraces(tenantId, 200);

    // Apply in-memory filtering
    let filtered = rawTraces.filter((trace: AIDecisionTrace) => {
      if (channel && channel !== 'all' && trace.channel_type !== channel) {
        return false;
      }

      if (outcome && outcome !== 'all') {
        if (outcome === 'REPLY_SENT') {
          if (trace.final_outcome !== 'REPLY_SENT') return false;
        } else if (outcome === 'PROCESSING') {
          if (trace.final_outcome !== null && trace.final_outcome !== undefined) return false;
        } else if (outcome === 'FAILED') {
          if (trace.final_outcome !== 'NO_REPLY_META_SEND_FAILED' && 
              trace.final_outcome !== 'NO_REPLY_NO_FALLBACK' && 
              trace.final_outcome !== 'PROCESSING_FAILED') return false;
        } else if (outcome === 'NO_REPLY') {
          if (!trace.final_outcome?.startsWith('NO_REPLY_') || trace.final_outcome === 'NO_REPLY_META_SEND_FAILED') return false;
        }
      }

      if (failureCategory && failureCategory !== 'all' && trace.failure_category !== failureCategory) {
        return false;
      }

      if (search) {
        const matchTraceId = trace.trace_id?.toLowerCase().includes(search);
        const matchExtMsg = trace.external_message_id?.toLowerCase().includes(search);
        const matchExtEvent = trace.external_event_id?.toLowerCase().includes(search);
        const matchConvId = trace.conversation_id?.toLowerCase().includes(search);
        const matchStage = trace.processing_stage?.toLowerCase().includes(search);
        const matchOutcome = trace.final_outcome?.toLowerCase().includes(search);
        const matchReason = trace.failure_reason?.toLowerCase().includes(search);

        if (!matchTraceId && !matchExtMsg && !matchExtEvent && !matchConvId && !matchStage && !matchOutcome && !matchReason) {
          return false;
        }
      }

      if (startDate) {
        const traceTime = new Date(trace.created_at).getTime();
        const startTime = new Date(startDate).getTime();
        if (!isNaN(startTime) && traceTime < startTime) return false;
      }

      if (endDate) {
        const traceTime = new Date(trace.created_at).getTime();
        const endTime = new Date(endDate).getTime();
        if (!isNaN(endTime) && traceTime > endTime) return false;
      }

      return true;
    });

    // Compute summary metrics for the scoped tenant and selection
    const totalEvents = rawTraces.length;
    const repliesSent = rawTraces.filter((t: AIDecisionTrace) => t.final_outcome === 'REPLY_SENT').length;
    const noReplies = rawTraces.filter((t: AIDecisionTrace) => t.final_outcome && t.final_outcome.startsWith('NO_REPLY_') && t.final_outcome !== 'NO_REPLY_META_SEND_FAILED').length;
    const failedSends = rawTraces.filter((t: AIDecisionTrace) => t.final_outcome === 'NO_REPLY_META_SEND_FAILED' || t.final_outcome === 'PROCESSING_FAILED' || t.final_outcome === 'NO_REPLY_NO_FALLBACK').length;
    const completedTracesWithLatency = rawTraces.filter((t: AIDecisionTrace) => t.total_latency_ms && t.total_latency_ms > 0);
    const avgLatencyMs = completedTracesWithLatency.length > 0
      ? Math.round(completedTracesWithLatency.reduce((acc: number, t: AIDecisionTrace) => acc + (t.total_latency_ms || 0), 0) / completedTracesWithLatency.length)
      : 0;

    const pagedTraces = filtered.slice(0, limit);

    return NextResponse.json({
      success: true,
      traces: pagedTraces,
      summary: {
        totalEvents,
        repliesSent,
        noReplies,
        failedSends,
        avgLatencyMs,
      },
    }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    console.error('[AI_LOGS_API_ERROR]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch AI decision traces' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
