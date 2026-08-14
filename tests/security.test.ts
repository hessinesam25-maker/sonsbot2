import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../lib/security/encryption';

describe('Security, Token Encryption & Key Audit Test Suite', () => {
  it('should encrypt and decrypt Meta Graph access tokens correctly using AES-256-GCM', () => {
    const rawToken = 'EAABwz1234567890_meta_long_lived_graph_api_access_token_secret_ghent';
    const encrypted = encryptToken(rawToken);

    expect(encrypted).not.toBe(rawToken);
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3); // iv:authTag:encrypted
    expect(parts[0].length).toBe(24); // 12-byte IV in hex = 24 chars

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  it('should generate a unique random IV for every encryption call', () => {
    const rawToken = 'same_meta_token_secret';
    const encrypted1 = encryptToken(rawToken);
    const encrypted2 = encryptToken(rawToken);

    expect(encrypted1).not.toBe(encrypted2);
    expect(encrypted1.split(':')[0]).not.toBe(encrypted2.split(':')[0]);
  });

  it('should fail decryption if ciphertext or auth tag is tampered with', () => {
    const rawToken = 'secret_token_123';
    const encrypted = encryptToken(rawToken);
    const parts = encrypted.split(':');

    // Tamper with the encrypted ciphertext
    const tamperedCiphertext = parts[0] + ':' + parts[1] + ':' + parts[2].slice(0, -2) + 'ab';
    expect(() => decryptToken(tamperedCiphertext)).toThrow();

    // Tamper with auth tag
    const tamperedAuthTag = parts[0] + ':00000000000000000000000000000000:' + parts[2];
    expect(() => decryptToken(tamperedAuthTag)).toThrow();
  });

  it('should throw error on invalid ciphertext string structure', () => {
    expect(() => decryptToken('invalid_encrypted_data')).toThrow();
  });

  describe('Database RLS & Fail-Closed Security Suite', () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ofxxrgtzlxkxrsglibqk.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHhyZ3R6bHhreHJzZ2xpYnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTY5MzYsImV4cCI6MjEwMDk5MjkzNn0.kVD_knCypKiT6p4jMIdA1vkegtmRS5XPH6axG6-asqw';
    const testerTenantId = '1029a20d-1342-42fa-87c2-c0fef3cceeaf';

    it('anon role CANNOT read ai_settings directly from database', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data, error } = await anonClient.from('ai_settings').select('*');

      expect(data).toBeDefined();
      expect(data?.length).toBe(0);
      expect(error).toBeNull();
    });

    it('anon role CANNOT update ai_settings directly in database', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data, error } = await anonClient
        .from('ai_settings')
        .update({ custom_instructions: 'Hacked by anon' })
        .eq('tenant_id', testerTenantId)
        .select();

      expect(data?.length).toBe(0);
      expect(error).toBeNull();
    });

    it('anon role CANNOT insert ai_settings directly into database', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data, error } = await anonClient.from('ai_settings').insert({
        tenant_id: '00000000-0000-0000-0000-000000000000',
        ai_enabled: true,
      }).select();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('42501');
    });

    it('anon role CANNOT delete ai_settings directly from database', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data, error } = await anonClient
        .from('ai_settings')
        .delete()
        .eq('tenant_id', testerTenantId)
        .select();

      expect(data?.length).toBe(0);
      expect(error).toBeNull();
    });

    it('backend privileged client fails closed when server secret key is missing in production environment', async () => {
      const oldNodeEnv = process.env.NODE_ENV;
      const oldSonsbotSecret = process.env.SONSBOT_SUPABASE_SECRET;
      const oldSecretKey = process.env.SUPABASE_SECRET_KEY;
      const oldServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        (process.env as any).NODE_ENV = 'production';
        delete process.env.SONSBOT_SUPABASE_SECRET;
        delete process.env.SUPABASE_SECRET_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Re-import to bypass module cache if needed
        const { getBackendSupabaseClient } = await import('../lib/db/client');
        expect(() => getBackendSupabaseClient()).toThrow(/Missing or invalid server secret key/);
      } finally {
        (process.env as any).NODE_ENV = oldNodeEnv;
        if (oldSonsbotSecret) process.env.SONSBOT_SUPABASE_SECRET = oldSonsbotSecret;
        if (oldSecretKey) process.env.SUPABASE_SECRET_KEY = oldSecretKey;
        if (oldServiceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY = oldServiceRoleKey;
      }
    });

    it('normal user cross-tenant API write returns 403 Forbidden', async () => {
      const { PUT } = await import('../app/api/ai-settings/route');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/api/ai-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_user_token',
          'x-test-role': 'manager',
          'x-test-tenant-id': 'tenant_A',
        },
        body: JSON.stringify({
          tenant_id: 'tenant_B',
          ai_enabled: true,
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden: Cross-tenant access denied.');
    });

    it('platform admin authorized tenant update succeeds via server API', async () => {
      const { PUT } = await import('../app/api/ai-settings/route');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/api/ai-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_admin_token',
          'x-test-role': 'platform_admin',
          'x-test-tenant-id': testerTenantId,
        },
        body: JSON.stringify({
          tenant_id: testerTenantId,
          ai_enabled: true,
          tone: 'professional',
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ai_enabled).toBe(true);
    });

    it('automation rules API update and persistence succeeds for authorized caller', async () => {
      const { PUT } = await import('../app/api/rules/route');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/api/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_admin_token',
          'x-test-role': 'platform_admin',
          'x-test-tenant-id': testerTenantId,
        },
        body: JSON.stringify({
          tenant_id: testerTenantId,
          static_dm_enabled: true,
          default_dm_reply: 'Vaste DM reply tester',
          static_comment_enabled: false,
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.static_dm_enabled).toBe(true);
    });

    it('/api/rules cross-tenant write returns 403 Forbidden', async () => {
      const { PUT } = await import('../app/api/rules/route');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/api/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_user_token',
          'x-test-role': 'owner',
          'x-test-tenant-id': 'tenant_A',
        },
        body: JSON.stringify({
          tenant_id: 'tenant_B',
          static_dm_enabled: true,
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden: Cross-tenant access denied.');
    });

    it('anon role CANNOT direct insert into automation_rules', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data, error } = await anonClient.from('automation_rules').insert({
        tenant_id: '00000000-0000-0000-0000-000000000000',
        static_dm_enabled: true,
      }).select();

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('42501');
    });
  });
});

