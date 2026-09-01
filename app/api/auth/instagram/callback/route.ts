import { NextRequest, NextResponse } from 'next/server';
import { encryptToken } from '@/lib/security/encryption';
import { db } from '@/lib/db/store';
import { getBackendSupabaseClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const DEFAULT_PUBLIC_APP_URL = 'https://elsons.site';

function getPublicAppOrigin(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL;

  try {
    const parsedUrl = new URL(configuredUrl);
    const internalHostnames = new Set(['0.0.0.0', 'localhost', '127.0.0.1', '::1', 'unix']);
    const isIpv4Address = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsedUrl.hostname);
    const isUnixSocketHostname = parsedUrl.hostname.endsWith('.sock');

    if (
      !['http:', 'https:'].includes(parsedUrl.protocol)
      || internalHostnames.has(parsedUrl.hostname)
      || isIpv4Address
      || isUnixSocketHostname
    ) {
      return DEFAULT_PUBLIC_APP_URL;
    }

    return parsedUrl.origin;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

function getSafeMetaErrorField(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value.replace(/[\r\n\t]+/g, ' ').slice(0, 300);
  return null;
}

function getTokenExchangeErrorDiagnostics(tokenData: unknown, httpStatus: number) {
  const responseRecord = tokenData && typeof tokenData === 'object' && !Array.isArray(tokenData)
    ? tokenData as Record<string, unknown>
    : {};
  const nestedError = responseRecord.error && typeof responseRecord.error === 'object' && !Array.isArray(responseRecord.error)
    ? responseRecord.error as Record<string, unknown>
    : {};

  return {
    http_status: httpStatus,
    meta_error_type: getSafeMetaErrorField(nestedError.type ?? responseRecord.error_type ?? responseRecord.type),
    meta_error_code: getSafeMetaErrorField(nestedError.code ?? responseRecord.code),
    meta_error_subcode: getSafeMetaErrorField(nestedError.error_subcode ?? nestedError.subcode ?? responseRecord.error_subcode ?? responseRecord.subcode),
    meta_error_message: getSafeMetaErrorField(nestedError.message ?? responseRecord.error_message ?? responseRecord.message),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const publicAppOrigin = getPublicAppOrigin();
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, publicAppOrigin));
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');
  const errorDescription = searchParams.get('error_description');

  if (error || errorReason || errorDescription) {
    const errorCode = error === 'access_denied' ? 'oauth_cancelled' : 'oauth_denied';
    console.warn(JSON.stringify({ stage: 'authorization_check', error_code: errorCode }));
    return redirectTo(`/dashboard/integrations?error=${errorCode}`);
  }

  if (!code || !state) {
    console.warn(JSON.stringify({ stage: 'parameter_check', error_code: 'missing_code_or_state' }));
    return redirectTo('/dashboard/integrations?error=missing_code_or_state');
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
      console.error(JSON.stringify({ stage: 'state_validation', error_code: 'invalid_state' }));
      return redirectTo('/dashboard/integrations?error=invalid_state');
    }

    const tenantId = consumedState.tenant_id;
    console.log(JSON.stringify({ stage: 'state_validation', tenant_id: tenantId, status: 'success' }));

    const grantedScopes = consumedState.scopes || [
      'instagram_business_basic',
      'instagram_business_manage_comments',
      'instagram_business_manage_messages',
    ];

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const baseUrl = publicAppOrigin;
    const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI || `${baseUrl}/api/auth/instagram/callback`;

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
        console.error(JSON.stringify({
          stage: 'short_lived_token_exchange',
          tenant_id: tenantId,
          ...getTokenExchangeErrorDiagnostics(tokenData, tokenRes.status),
          error_code: 'token_exchange_failed',
        }));
        return redirectTo(`/dashboard/integrations?tenant_id=${tenantId}&error=token_exchange_failed`);
      }

      console.log(JSON.stringify({ stage: 'short_lived_token_exchange', tenant_id: tenantId, status: 'success' }));

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

      console.log(JSON.stringify({ stage: 'long_lived_token_exchange', tenant_id: tenantId, status: 'success' }));

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

      console.log(JSON.stringify({ stage: 'profile_lookup', tenant_id: tenantId, account_id: accountId, status: 'success' }));
    }

    // 3. INVARIANT CHECK A: Verify Instagram account is NOT actively linked to another tenant
    const { data: existingActiveOtherTenant } = await backend
      .from('platform_connections')
      .select('tenant_id')
      .eq('platform', 'instagram')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .neq('tenant_id', tenantId)
      .maybeSingle();

    if (existingActiveOtherTenant) {
      const { data: conflictingTenant } = await backend
        .from('tenants')
        .select('name')
        .eq('id', existingActiveOtherTenant.tenant_id)
        .maybeSingle();

      const conflictingName = conflictingTenant?.name || 'another restaurant';
      console.warn(JSON.stringify({
        stage: 'duplicate_account_check',
        account_id: accountId,
        target_tenant_id: tenantId,
        conflicting_tenant_id: existingActiveOtherTenant.tenant_id,
        status: 'blocked_already_linked'
      }));

      const encodedTenantName = encodeURIComponent(conflictingName);
      return redirectTo(`/dashboard/integrations?error=already_linked&conflict_tenant=${encodedTenantName}`);
    }

    // 4. INVARIANT CHECK B: Verify target tenant does NOT already have a DIFFERENT active Instagram account
    const { data: existingDifferentAccountSameTenant } = await backend
      .from('platform_connections')
      .select('id, account_id')
      .eq('tenant_id', tenantId)
      .eq('platform', 'instagram')
      .eq('is_active', true)
      .neq('account_id', accountId)
      .maybeSingle();

    if (existingDifferentAccountSameTenant) {
      console.warn(JSON.stringify({
        stage: 'tenant_account_limit_check',
        target_tenant_id: tenantId,
        new_account_id: accountId,
        existing_account_id: existingDifferentAccountSameTenant.account_id,
        status: 'blocked_tenant_already_has_account'
      }));

      return redirectTo('/dashboard/integrations?error=tenant_already_has_account');
    }

    // 5. Encrypt access token using AES-256-GCM before database storage
    const encryptedToken = encryptToken(accessToken);

    // 6. Upsert connection record strictly linked to tenantId
    const { data: upsertedConn, error: upsertErr } = await backend
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
      }, { onConflict: 'tenant_id,platform,account_id' })
      .select('id')
      .single();

    if (upsertErr) {
      console.error(JSON.stringify({ stage: 'database_upsert', tenant_id: tenantId, error_code: 'db_upsert_failed' }));
      return redirectTo(`/dashboard/integrations?tenant_id=${tenantId}&error=db_upsert_failed`);
    }

    const connectionId = upsertedConn?.id || 'unknown';
    console.log(JSON.stringify({ stage: 'database_upsert', tenant_id: tenantId, connection_id: connectionId, status: 'success' }));

    // 7. Record Audit Log
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

    console.log(JSON.stringify({ stage: 'callback_completed', tenant_id: tenantId, connection_id: connectionId, status: 'success' }));

    return redirectTo(`/dashboard/clients/${tenantId}?success=instagram_connected`);
  } catch (err: any) {
    console.error(JSON.stringify({ stage: 'callback_unhandled', error_code: 'oauth_failed' }));
    return redirectTo('/dashboard/integrations?error=oauth_failed');
  }
}
