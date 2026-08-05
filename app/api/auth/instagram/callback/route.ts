import { NextRequest, NextResponse } from 'next/server';
import { encryptToken } from '@/lib/security/encryption';
import { db } from '@/lib/db/store';
import { getBackendSupabaseClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');
  const errorDescription = searchParams.get('error_description');

  if (error || errorReason || errorDescription) {
    console.warn(`Instagram OAuth authorization denied or failed: ${error || errorReason} - ${errorDescription}`);
    const errorCode = error === 'access_denied' ? 'oauth_cancelled' : 'oauth_denied';
    return NextResponse.redirect(new URL(`/dashboard/integrations?error=${errorCode}`, req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=missing_code_or_state', req.url));
  }

  try {
    const backend = getBackendSupabaseClient();

    // 1. Atomic OAuth state consumption: single atomic DELETE ... RETURNING * query
    const { data: consumedState, error: stateErr } = await backend
      .from('oauth_states')
      .delete()
      .eq('state_hash', state)
      .gt('expires_at', new Date().toISOString())
      .select()
      .single();

    if (stateErr || !consumedState) {
      console.error('Invalid, expired, or already-consumed OAuth state received:', state);
      return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_state', req.url));
    }

    const tenantId = consumedState.tenant_id;
    const grantedScopes = consumedState.scopes || [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
    ];

    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI || 
                        process.env.META_OAUTH_REDIRECT_URI || 
                        `${baseUrl}/api/auth/instagram/callback`;

    let accessToken = 'token_ig_auth_' + Date.now();
    let accountId = 'ig_acc_' + Date.now().toString().slice(-6);
    let accountName = 'Instagram Professional Account';
    let expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // Default 60 days

    // 2. Exchange authorization code server-side if Instagram API credentials configured
    if (appId && appSecret) {
      // Step A: Short-lived access token exchange via api.instagram.com
      const tokenBody = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code,
      });

      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        console.error('Instagram short-lived token exchange failed:', tokenData);
        return NextResponse.redirect(new URL('/dashboard/integrations?error=token_exchange_failed', req.url));
      }

      const shortLivedToken = tokenData.access_token;
      if (tokenData.user_id) {
        accountId = String(tokenData.user_id);
      }

      // Step B: Exchange short-lived token for long-lived Instagram User access token via graph.instagram.com
      const longLivedRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`
      );
      const longLivedData = await longLivedRes.json();

      if (longLivedData.access_token) {
        accessToken = longLivedData.access_token;
        if (longLivedData.expires_in) {
          expiresAt = new Date(Date.now() + longLivedData.expires_in * 1000).toISOString();
        }
      } else {
        accessToken = shortLivedToken;
      }

      // Step C: Retrieve authenticated Instagram profile identity from graph.instagram.com
      const profileRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username,user_id,account_type&access_token=${accessToken}`
      );
      const profileData = await profileRes.json();

      if (profileData.username) {
        accountName = profileData.username;
      }
      if (profileData.id || profileData.user_id) {
        accountId = String(profileData.user_id || profileData.id);
      }
    }

    // 3. Encrypt access token using AES-256-GCM before database storage
    const encryptedToken = encryptToken(accessToken);

    // 4. Upsert connection record strictly linked to tenantId
    await backend
      .from('platform_connections')
      .upsert({
        tenant_id: tenantId,
        platform: 'instagram',
        account_id: accountId,
        account_name: accountName,
        access_token_encrypted: encryptedToken,
        is_active: true,
        permissions: grantedScopes,
        token_expires_at: expiresAt,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,platform,account_id' });

    // 5. Record Audit Log
    await db.addAuditLog({
      tenant_id: tenantId,
      event_type: 'INSTAGRAM_LOGIN_CONNECTED',
      actor_type: 'user',
      details: { 
        platform: 'instagram', 
        tenant_id: tenantId, 
        account_id: accountId,
        account_name: accountName,
        encrypted_storage: true 
      },
    });

    return NextResponse.redirect(new URL(`/dashboard/clients/${tenantId}?success=instagram_connected`, req.url));
  } catch (err: any) {
    console.error('Instagram OAuth Callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/integrations?error=oauth_failed', req.url));
  }
}
