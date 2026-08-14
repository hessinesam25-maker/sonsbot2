import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { buildTenantAIContext } from '@/lib/ai/tenantContext';
import { generateDeepSeekReply } from '@/lib/ai/deepseek';

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
    return { status: 401, error: 'Unauthorized: Valid authentication session required.' };
  }

  if (isPlatformAdmin) {
    return { isPlatformAdmin: true, tenantId: targetTenantId || tenantUser?.tenant_id };
  }

  if (!tenantUser) {
    return { status: 403, error: 'Forbidden: No tenant user mapping found.' };
  }

  if (targetTenantId && targetTenantId !== tenantUser.tenant_id) {
    return { status: 403, error: 'Forbidden: Cross-tenant test access denied.' };
  }

  return { isPlatformAdmin: false, tenantId: tenantUser.tenant_id, role: tenantUser.role };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestedTenantId = body.tenantId || body.tenant_id;
    const testMessage = body.message;

    if (!testMessage || typeof testMessage !== 'string' || testMessage.trim().length === 0) {
      return NextResponse.json({ error: 'Test message is required.' }, { status: 400 });
    }

    const authResult = await authenticateAndAuthorize(req, requestedTenantId);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const targetTenantId = authResult.isPlatformAdmin ? (requestedTenantId || authResult.tenantId) : authResult.tenantId;

    if (!targetTenantId) {
      return NextResponse.json({ error: 'tenantId parameter is required.' }, { status: 400 });
    }

    // Build tenant AI context using real tenant AI settings, KB, and Menu
    const aiContext = await buildTenantAIContext({
      tenantId: targetTenantId,
      customerMessage: testMessage.trim(),
    });

    const activeModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

    // Execute safe server-side DeepSeek completion (No Instagram message sent)
    const deepSeekRes = await generateDeepSeekReply(aiContext.messages, {
      maxTokens: aiContext.maxTokens,
    });

    const hasKbTopics = aiContext.retrievedData.retrievalMetadata.kbTopicsMatched.length > 0;
    const menuCount = aiContext.retrievedData.retrievalMetadata.menuItemsMatchedCount;

    if (!deepSeekRes.success) {
      return NextResponse.json({
        success: false,
        reply: null,
        model: activeModel,
        retrievedSources: {
          knowledgeBase: hasKbTopics,
          menuItemsMatched: menuCount,
        },
        error: deepSeekRes.error || 'DeepSeek API generation failed.',
      }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      reply: deepSeekRes.content,
      model: activeModel,
      retrievedSources: {
        knowledgeBase: hasKbTopics,
        menuItemsMatched: menuCount,
      },
      usage: deepSeekRes.usage ? {
        inputTokens: deepSeekRes.usage.promptTokens,
        outputTokens: deepSeekRes.usage.completionTokens,
      } : undefined,
    });
  } catch (error: any) {
    console.error('Error in AI test endpoint:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error during AI test.',
    }, { status: 500 });
  }
}
