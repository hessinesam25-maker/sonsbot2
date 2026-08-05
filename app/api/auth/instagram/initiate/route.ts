import { NextRequest, NextResponse } from 'next/server';
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

    // 1. Verify tenant exists and is active
    const { data: tenant, error: tenantErr } = await backend
      .from('tenants')
      .select('id, name')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: 'Invalid or non-existent tenant ID' }, { status: 404 });
    }

    // 2. Authenticate requester if Authorization header is provided
    let userId: string | undefined = undefined;
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await backend.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    // 3. Generate cryptographically secure state hash and nonce
    const stateToken = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    const scopesList = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
    ];

    if (searchParams.get('enable_publishing') === 'true') {
      scopesList.push('instagram_business_content_publish');
    }

    // 4. Store state in oauth_states table
    const stateRecord: Record<string, any> = {
      tenant_id: tenantId,
      platform: 'instagram',
      state_hash: stateToken,
      nonce: nonce,
      scopes: scopesList,
      expires_at: expiresAt,
    };

    if (userId) {
      stateRecord.user_id = userId;
    }

    const { error: stateErr } = await backend
      .from('oauth_states')
      .insert(stateRecord);

    if (stateErr) {
      console.error('Failed to store OAuth state:', stateErr);
      return NextResponse.json({ error: 'Failed to generate secure OAuth state' }, { status: 500 });
    }

    // 5. Construct official Instagram API with Instagram Login Authorization URL
    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '8910237491023';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI || 
                        process.env.META_OAUTH_REDIRECT_URI || 
                        `${baseUrl}/api/auth/instagram/callback`;

    const scopesStr = scopesList.join(',');

    const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopesStr)}&response_type=code&state=${stateToken}`;

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
