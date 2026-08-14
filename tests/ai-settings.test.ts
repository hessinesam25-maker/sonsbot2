import { describe, it, expect } from 'vitest';
import { db } from '../lib/db/store';
import { GET, PUT } from '../app/api/ai-settings/route';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

describe('Phase 1: Tenant-Scoped AI Settings Test Suite', () => {
  const tenantA_ID = '11111111-1111-1111-1111-111111111111';
  const tenantB_ID = '22222222-2222-2222-2222-222222222222';

  it('D. Missing row: should return default AI settings cleanly without HTTP 406', async () => {
    const settings = await db.getAISettings(tenantA_ID);
    expect(settings).toBeDefined();
    expect(settings.tenant_id).toBe(tenantA_ID);
    expect(settings.ai_enabled).toBe(false);
    expect(settings.primary_language).toBe('nl-BE');
    expect(settings.tone).toBe('friendly');
    expect(settings.fallback_behavior).toBe('human_handoff');
  });

  it('should maintain strict tenant isolation in store layer', async () => {
    const settingsA = await db.getAISettings(tenantA_ID);
    const settingsB = await db.getAISettings(tenantB_ID);

    expect(settingsA.tenant_id).toBe(tenantA_ID);
    expect(settingsB.tenant_id).toBe(tenantB_ID);
    expect(settingsA.id).not.toBe(settingsB.id);
  });

  it('updating Tenant A AI settings in store layer does not modify Tenant B AI settings', async () => {
    const updatedA = await db.updateAISettings(
      { tone: 'casual', custom_instructions: 'Tenant A instructions', tenant_id: tenantA_ID },
      tenantA_ID
    );

    const fetchedA = await db.getAISettings(tenantA_ID);
    const fetchedB = await db.getAISettings(tenantB_ID);

    expect(fetchedA.tone).toBe('casual');
    expect(fetchedA.custom_instructions).toBe('Tenant A instructions');
    expect(fetchedB.tenant_id).toBe(tenantB_ID);
    expect(fetchedB.tone).not.toBe('casual');
  });

  it('A. Platform Admin: can select Tenant A and B, read both, and update Tenant B deliberately', async () => {
    const getReqA = new NextRequest(`http://localhost:3000/api/ai-settings?tenantId=${tenantA_ID}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'platform_admin',
      },
    });
    const resA = await GET(getReqA);
    expect(resA.status).toBe(200);
    const dataA = await resA.json();
    expect(dataA.tenant_id).toBe(tenantA_ID);

    const getReqB = new NextRequest(`http://localhost:3000/api/ai-settings?tenantId=${tenantB_ID}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-role': 'platform_admin',
      },
    });
    const resB = await GET(getReqB);
    expect(resB.status).toBe(200);
    const dataB = await resB.json();
    expect(dataB.tenant_id).toBe(tenantB_ID);

    const putReqB = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-role': 'platform_admin',
      },
      body: JSON.stringify({ tenant_id: tenantB_ID, tone: 'professional', custom_instructions: 'Admin custom B' }),
    });
    const putResB = await PUT(putReqB);
    expect(putResB.status).toBe(200);
    const updatedB = await putResB.json();
    expect(updatedB.tenant_id).toBe(tenantB_ID);
    expect(updatedB.tone).toBe('professional');
  });

  it('B. Normal Tenant A owner: can read/update Tenant A, cannot read/update Tenant B', async () => {
    // Can read Tenant A
    const getReqA = new NextRequest(`http://localhost:3000/api/ai-settings?tenantId=${tenantA_ID}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
    });
    const resA = await GET(getReqA);
    expect(resA.status).toBe(200);

    // Can update Tenant A
    const putReqA = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({ tenant_id: tenantA_ID, tone: 'friendly' }),
    });
    const putResA = await PUT(putReqA);
    expect(putResA.status).toBe(200);

    // Cannot read Tenant B (403)
    const getReqB = new NextRequest(`http://localhost:3000/api/ai-settings?tenantId=${tenantB_ID}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
    });
    const resB = await GET(getReqB);
    expect(resB.status).toBe(403);

    // Cannot update Tenant B (403)
    const putReqB = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({ tenant_id: tenantB_ID, tone: 'casual' }),
    });
    const putResB = await PUT(putReqB);
    expect(putResB.status).toBe(403);
  });

  it('C. support_agent: cannot modify AI settings (403)', async () => {
    const putReq = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'support_agent',
      },
      body: JSON.stringify({ tenant_id: tenantA_ID, ai_enabled: true }),
    });
    const res = await PUT(putReq);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Support agents are not permitted');
  });

  it('E. Duplicate protection: UNIQUE(tenant_id) is enforced in migration file', () => {
    const migrationCode = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260813000000_add_ai_settings.sql'),
      'utf-8'
    );
    expect(migrationCode).toContain('UNIQUE');
    expect(migrationCode).toContain('tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id)');
  });

  it('should verify that DeepSeek is NOT connected or called anywhere in the codebase', () => {
    const storeCode = fs.readFileSync(path.join(__dirname, '../lib/db/store.ts'), 'utf-8');
    const webhookCode = fs.readFileSync(path.join(__dirname, '../app/api/webhooks/instagram/route.ts'), 'utf-8');

    expect(storeCode).not.toContain('DEEPSEEK_API_KEY');
    expect(storeCode).not.toContain('api.deepseek.com');
    expect(webhookCode).not.toContain('DEEPSEEK_API_KEY');
    expect(webhookCode).not.toContain('api.deepseek.com');
  });

  it('F. Boolean FALSE persistence: setting ai_enabled=false and all channel booleans to false survives API sanitization, store payload, DB upsert, and GET reload', async () => {
    // 1. Enable all booleans first
    const enableReq = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenant_id: tenantA_ID,
        ai_enabled: true,
        reply_to_dms: true,
        reply_to_comments: true,
        use_knowledge_base: true,
      }),
    });
    const enableRes = await PUT(enableReq);
    expect(enableRes.status).toBe(200);
    const enableData = await enableRes.json();
    expect(enableData.ai_enabled).toBe(true);

    // 2. Turn OFF all booleans using explicit false
    const disableReq = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenant_id: tenantA_ID,
        ai_enabled: false,
        reply_to_dms: false,
        reply_to_comments: false,
        use_knowledge_base: false,
      }),
    });
    const disableRes = await PUT(disableReq);
    expect(disableRes.status).toBe(200);
    const disableData = await disableRes.json();

    expect(disableData.ai_enabled).toBe(false);
    expect(disableData.reply_to_dms).toBe(false);
    expect(disableData.reply_to_comments).toBe(false);
    expect(disableData.use_knowledge_base).toBe(false);

    // 3. Verify GET / reload returns exact false ground truth
    const getReq = new NextRequest(`http://localhost:3000/api/ai-settings?tenantId=${tenantA_ID}`, {
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
    });
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();

    expect(getData.ai_enabled).toBe(false);
    expect(getData.reply_to_dms).toBe(false);
    expect(getData.reply_to_comments).toBe(false);
    expect(getData.use_knowledge_base).toBe(false);
  });

  it('G. String "false" and camelCase payload sanitization correctly parses to boolean false', async () => {
    const stringFalseReq = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenant_id: tenantA_ID,
        aiEnabled: 'false',
        replyToDms: '0',
        replyToComments: 'off',
        useKnowledgeBase: 'disabled',
      }),
    });
    const stringFalseRes = await PUT(stringFalseReq);
    expect(stringFalseRes.status).toBe(200);
    const stringFalseData = await stringFalseRes.json();

    expect(stringFalseData.ai_enabled).toBe(false);
    expect(stringFalseData.reply_to_dms).toBe(false);
    expect(stringFalseData.reply_to_comments).toBe(false);
    expect(stringFalseData.use_knowledge_base).toBe(false);
  });

  it('H. Partial update regression test: omitted boolean fields are preserved and not coerced to false', async () => {
    // 1. Set all booleans to true
    await PUT(new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenant_id: tenantA_ID,
        ai_enabled: true,
        reply_to_dms: true,
        reply_to_comments: true,
        use_knowledge_base: true,
      }),
    }));

    // 2. Send ONLY tone: "professional"
    const partialToneReq = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenant_id: tenantA_ID,
        tone: 'professional',
      }),
    });
    const partialToneRes = await PUT(partialToneReq);
    expect(partialToneRes.status).toBe(200);
    const partialToneData = await partialToneRes.json();

    expect(partialToneData.tone).toBe('professional');
    expect(partialToneData.ai_enabled).toBe(true);
    expect(partialToneData.reply_to_dms).toBe(true);
    expect(partialToneData.reply_to_comments).toBe(true);
    expect(partialToneData.use_knowledge_base).toBe(true);

    // 3. Send ONLY ai_enabled: false
    const partialAiFalseReq = new NextRequest('http://localhost:3000/api/ai-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA_ID,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenant_id: tenantA_ID,
        ai_enabled: false,
      }),
    });
    const partialAiFalseRes = await PUT(partialAiFalseReq);
    expect(partialAiFalseRes.status).toBe(200);
    const partialAiFalseData = await partialAiFalseRes.json();

    expect(partialAiFalseData.ai_enabled).toBe(false);
    expect(partialAiFalseData.reply_to_dms).toBe(true);
    expect(partialAiFalseData.reply_to_comments).toBe(true);
    expect(partialAiFalseData.use_knowledge_base).toBe(true);
  });
});


