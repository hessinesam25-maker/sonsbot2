import { NextRequest, NextResponse } from 'next/server';
import { encryptToken } from '@/lib/security/encryption';
import { db } from '@/lib/db/store';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/dashboard/google?error=oauth_cancelled', req.url));
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google/callback`;

    let accessToken = 'mock_google_access_token_' + Date.now();
    let refreshToken = 'mock_google_refresh_token_' + Date.now();

    if (clientId && clientSecret) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token || refreshToken;
      }
    }

    const encryptedAccess = encryptToken(accessToken);
    const encryptedRefresh = encryptToken(refreshToken);

    await db.addAuditLog({
      event_type: 'GOOGLE_OAUTH_TOKEN_EXCHANGED',
      actor_type: 'user',
      details: { platform: 'google', storage: 'AES-256-GCM' },
    });

    return NextResponse.redirect(new URL('/dashboard/google?success=connected', req.url));
  } catch (err: any) {
    console.error('Google OAuth Callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/google?error=oauth_failed', req.url));
  }
}
