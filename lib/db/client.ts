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

/**
 * Backend Client - Uses Service Role Key strictly on server-side / API routes
 */
export function getBackendSupabaseClient() {
  const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceKeyPresent = Boolean(envServiceKey && envServiceKey.trim().length > 0);
  const serviceKey = envServiceKey || supabaseAnonKey;
  const selectedKeySource = serviceKeyPresent ? 'service_role_env' : 'anon_fallback';

  console.log('[SUPABASE-DEBUG] BACKEND_CLIENT_CONFIG', JSON.stringify({
    service_key_present: serviceKeyPresent,
    service_key_type: getKeyType(envServiceKey),
    anon_key_present: Boolean(supabaseAnonKey && supabaseAnonKey.trim().length > 0),
    anon_key_type: getKeyType(supabaseAnonKey),
    selected_key_source: selectedKeySource,
    supabase_project_ref: getProjectRef(supabaseUrl)
  }));

  return createClient(supabaseUrl, serviceKey);
}

