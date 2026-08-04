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

    // 1. Verify tenant exists
    const { data: tenant, error: tenantErr } = await backend
      .from('tenants')
      .select('id, name')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: 'Invalid or non-existent tenant ID' }, { status: 404 });
    }

    // 2. Generate cryptographically secure state hash
    const stateToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // 3. Store state in oauth_states
    const { error: stateErr } = await backend
      .from('oauth_states')
      .insert({
        tenant_id: tenantId,
        platform: 'instagram',
        state_hash: stateToken,
        expires_at: expiresAt,
      });

    if (stateErr) {
      console.error('Failed to store OAuth state:', stateErr);
      return NextResponse.json({ error: 'Failed to generate secure OAuth state' }, { status: 500 });
    }

    // 4. Construct official Meta Authorization URL
    const appId = process.env.META_APP_ID || '8910237491023';
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/instagram/callback`;
    const scopes = [
      'instagram_basic',
      'instagram_manage_messages',
      'instagram_manage_comments',
      'pages_manage_metadata',
      'pages_read_engagement'
    ].join(',');

    const metaAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${stateToken}`;

    return NextResponse.json({ url: metaAuthUrl, state: stateToken, tenant_id: tenantId });
  } catch (err: any) {
    console.error('Meta OAuth Initiation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
