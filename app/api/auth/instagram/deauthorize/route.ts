import { NextRequest, NextResponse } from 'next/server';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function parseSignedRequest(signedRequest: string, appSecret: string): { user_id?: string; algorithm?: string; issued_at?: number } | null {
  try {
    const parts = signedRequest.split('.');
    if (parts.length !== 2) return null;

    const [encodedSig, payload] = parts;

    // Base64URL decode signature
    const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    // Calculate expected signature
    const expectedSig = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest();

    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
      return null;
    }

    // Base64URL decode payload JSON
    const jsonStr = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('Failed to parse signed_request:', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    let signedRequest: string | null = null;

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      signedRequest = formData.get('signed_request') as string;
    } else {
      const body = await req.json().catch(() => ({}));
      signedRequest = body.signed_request || null;
    }

    if (!signedRequest) {
      return NextResponse.json({ error: 'signed_request parameter is required' }, { status: 400 });
    }

    let parsed: { user_id?: string; algorithm?: string; issued_at?: number } | null = null;
    if (appSecret) {
      parsed = parseSignedRequest(signedRequest, appSecret);
      if (!parsed) {
        return NextResponse.json({ error: 'Invalid signed_request signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'test') {
      // Test mode mock fallback
      try {
        const parts = signedRequest.split('.');
        const payloadStr = Buffer.from(parts[1] || parts[0], 'base64').toString('utf8');
        parsed = JSON.parse(payloadStr);
      } catch {
        parsed = { user_id: 'test_ig_user_123' };
      }
    }

    if (!parsed || !parsed.user_id) {
      return NextResponse.json({ error: 'Missing user_id in signed_request' }, { status: 400 });
    }

    const userId = String(parsed.user_id);
    const backend = getBackendSupabaseClient();

    // 1. Fetch matching active platform connection
    const { data: connections } = await backend
      .from('platform_connections')
      .select('id, tenant_id, account_id, account_name')
      .eq('account_id', userId)
      .eq('platform', 'instagram');

    if (connections && connections.length > 0) {
      for (const conn of connections) {
        await backend
          .from('platform_connections')
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id);

        await db.addAuditLog({
          tenant_id: conn.tenant_id,
          event_type: 'INSTAGRAM_DEAUTHORIZED',
          actor_type: 'system',
          details: {
            platform: 'instagram',
            account_id: userId,
            account_name: conn.account_name,
            reason: 'User deauthorized application in Instagram settings',
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      status: 'deauthorized',
    });
  } catch (err: any) {
    console.error('Instagram deauthorization error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
