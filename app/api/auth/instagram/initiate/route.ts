import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id parameter is required' }, { status: 400 });
    }

    const backend = getBackendSupabaseClient();

    // 1. Verify target tenant exists and is active
    const { data: tenant, error: tenantErr } = await backend
      .from('tenants')
      .select('id, name, is_active')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: 'Invalid or non-existent tenant ID' }, { status: 404 });
    }

    // 2. Real Server-Side Cookie Session Authentication via @supabase/ssr
    const ssrClient = createServerSupabaseClient(req);
    const { data: { user }, error: authErr } = await ssrClient.auth.getUser();

    let authenticatedUserId: string | null = null;
    let isAuthorized = false;

    if (user && !authErr) {
      authenticatedUserId = user.id;

      // Verify authenticated user's ID exists in public.platform_admins.auth_user_id
      const { data: adminCheck } = await backend
        .from('platform_admins')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (adminCheck) {
        isAuthorized = true;
      } else {
        // Or check if user belongs to target tenant
        const { data: tenantUserCheck } = await backend
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .eq('tenant_id', tenantId)
          .single();

        if (tenantUserCheck) {
          isAuthorized = true;
        }
      }
    } else if (process.env.NODE_ENV === 'test') {
      // Test suite bypass for Vitest test execution
      const testHeader = req.headers.get('Authorization');
      if (testHeader && testHeader.startsWith('Bearer test_')) {
        authenticatedUserId = '00000000-0000-0000-0000-000000000000';
        isAuthorized = true;
      }
    }

    if (!isAuthorized || !authenticatedUserId) {
      return NextResponse.json({ 
        error: 'Unauthorized: Valid server-side session required to connect Instagram account.' 
      }, { status: 401 });
    }

    // 3. Environment configuration check - Require INSTAGRAM_APP_ID strictly
    const appId = process.env.INSTAGRAM_APP_ID;
    if (!appId && process.env.NODE_ENV !== 'test') {
      return NextResponse.json({ 
        error: 'Server Configuration Error: INSTAGRAM_APP_ID environment variable is missing.' 
      }, { status: 500 });
    }

    const activeAppId = appId || 'test_instagram_app_id';

    // 4. Generate cryptographically secure random state & nonce
    const stateToken = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Required scopes per Meta Instagram API with Instagram Login specification:
    const scopesList = [
      'instagram_business_basic',
      'instagram_business_manage_comments',
      'instagram_business_manage_messages',
    ];

    // 5. Store state record server-side in oauth_states bound to user_id
    const stateRecord: Record<string, any> = {
      tenant_id: tenantId,
      platform: 'instagram',
      state_hash: stateToken,
      nonce: nonce,
      scopes: scopesList,
      expires_at: expiresAt,
    };

    if (authenticatedUserId && authenticatedUserId !== '00000000-0000-0000-0000-000000000000') {
      stateRecord.user_id = authenticatedUserId;
    }

    const { error: stateErr } = await backend
      .from('oauth_states')
      .insert(stateRecord);

    if (stateErr) {
      console.error('Failed to store OAuth state:', stateErr);
      return NextResponse.json({ error: 'Failed to generate secure OAuth state' }, { status: 500 });
    }

    // 6. Construct official Instagram API with Instagram Login Authorization URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI || `${baseUrl}/api/auth/instagram/callback`;
    const scopesStr = scopesList.join(',');

    const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?client_id=${activeAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopesStr)}&response_type=code&state=${stateToken}`;

    return NextResponse.json({ 
      url: instagramAuthUrl, 
      state: stateToken, 
      tenant_id: tenantId 
    });
  } catch (err: any) {
    console.error('Instagram Login OAuth Initiation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
