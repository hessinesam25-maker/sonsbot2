import { createClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from './supabase-ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ofxxrgtzlxkxrsglibqk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHhyZ3R6bHhreHJzZ2xpYnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTY5MzYsImV4cCI6MjEwMDk5MjkzNn0.kVD_knCypKiT6p4jMIdA1vkegtmRS5XPH6axG6-asqw';

/**
 * Frontend Client - Uses @supabase/ssr Browser Client
 */
export const supabaseFrontend = createBrowserSupabaseClient();

type KeyType = 'sb_secret' | 'sb_publishable' | 'legacy_jwt' | 'other' | 'missing';

function getKeyType(keyVal: string | undefined | null): KeyType {
  if (!keyVal || keyVal.trim().length === 0) return 'missing';
  const k = keyVal.trim();
  if (k.startsWith('sb_secret_')) return 'sb_secret';
  if (k.startsWith('sb_publishable_')) return 'sb_publishable';
  if (k.startsWith('eyJ')) return 'legacy_jwt';
  return 'other';
}

function getProjectRef(urlStr: string | undefined | null): string | null {
  if (!urlStr) return null;
  try {
    const host = new URL(urlStr).hostname;
    const parts = host.split('.');
    return parts.length >= 3 ? parts[0] : host;
  } catch {
    return null;
  }
}

function getJwtRole(keyVal: string | undefined | null): string | null {
  if (!keyVal || typeof keyVal !== 'string') return null;
  const parts = keyVal.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    return payload.role || null;
  } catch {
    return null;
  }
}

/**
 * Backend Client - Uses Service Role Key / Secret Key strictly on server-side / API routes
 */
export function getBackendSupabaseClient() {
  const envSonsbotSecret = process.env.SONSBOT_SUPABASE_SECRET;
  const envSecretKey = process.env.SUPABASE_SECRET_KEY;
  const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const sonsbotSecretPresent = Boolean(envSonsbotSecret && envSonsbotSecret.trim().length > 0);
  const secretKeyPresent = Boolean(envSecretKey && envSecretKey.trim().length > 0);
  const legacyServiceKeyPresent = Boolean(envServiceKey && envServiceKey.trim().length > 0);

  let selectedKey: string;
  let selectedKeySource: 'sonsbot_supabase_secret' | 'supabase_secret_key' | 'service_role_env' | 'anon_fallback';

  if (sonsbotSecretPresent) {
    selectedKey = envSonsbotSecret!.trim();
    selectedKeySource = 'sonsbot_supabase_secret';
  } else if (secretKeyPresent) {
    selectedKey = envSecretKey!.trim();
    selectedKeySource = 'supabase_secret_key';
  } else if (legacyServiceKeyPresent) {
    selectedKey = envServiceKey!.trim();
    selectedKeySource = 'service_role_env';
  } else {
    selectedKey = (supabaseAnonKey || '').trim();
    selectedKeySource = 'anon_fallback';
  }

  console.log('[SUPABASE-DEBUG] BACKEND_CLIENT_CONFIG', JSON.stringify({
    sonsbot_secret_present: sonsbotSecretPresent,
    sonsbot_secret_type: getKeyType(envSonsbotSecret),
    secret_key_present: secretKeyPresent,
    secret_key_type: getKeyType(envSecretKey),
    legacy_service_key_present: legacyServiceKeyPresent,
    legacy_service_key_type: getKeyType(envServiceKey),
    anon_key_present: Boolean(supabaseAnonKey && supabaseAnonKey.trim().length > 0),
    anon_key_type: getKeyType(supabaseAnonKey),
    selected_key_source: selectedKeySource,
    supabase_project_ref: getProjectRef(supabaseUrl)
  }));

  const jwtRole = getJwtRole(selectedKey);

  if (selectedKeySource === 'anon_fallback' || jwtRole === 'anon') {
    console.warn('[SUPABASE-WARN] Backend client operating with anon role key! RLS-protected tables (e.g. platform_connections) will return 0 rows. Configure SONSBOT_SUPABASE_SECRET or SUPABASE_SERVICE_ROLE_KEY in Hostinger environment.');
  }

  return createClient(supabaseUrl, selectedKey.trim());
}



