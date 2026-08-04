import { describe, it, expect } from 'vitest';
import { db, DEFAULT_TENANT_ID } from '../lib/db/store';

describe('Multi-Tenant Data Isolation & Platform Admin Security Test Suite', () => {
  const tenantA_ID = '11111111-1111-1111-1111-111111111111';
  const tenantB_ID = '22222222-2222-2222-2222-222222222222';

  it('should isolate Tenant A knowledge base from Tenant B', async () => {
    const kbA = await db.getKnowledgeBase(tenantA_ID);
    const kbB = await db.getKnowledgeBase(tenantB_ID);

    expect(kbA.tenant_id).toBe(tenantA_ID);
    expect(kbB.tenant_id).toBe(tenantB_ID);
    expect(kbA.id).not.toBe(kbB.id);
  });

  it('should isolate Tenant A automation rules from Tenant B', async () => {
    const rulesA = await db.getAutomationRules(tenantA_ID);
    const rulesB = await db.getAutomationRules(tenantB_ID);

    expect(rulesA.tenant_id).toBe(tenantA_ID);
    expect(rulesB.tenant_id).toBe(tenantB_ID);
    expect(rulesA.id).not.toBe(rulesB.id);
  });

  it('should list all tenants for platform admin query', async () => {
    const tenants = await db.getAllTenants();
    expect(Array.isArray(tenants)).toBe(true);
  });
});
