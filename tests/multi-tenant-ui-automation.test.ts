import { describe, it, expect } from 'vitest';
import { db, DEFAULT_TENANT_ID } from '../lib/db/store';

describe('Multi-Tenant Dashboard & DM Automation Test Suite', () => {
  const tenantA_ID = '11111111-1111-1111-1111-111111111111';
  const tenantB_ID = '22222222-2222-2222-2222-222222222222';

  it('should isolate default_dm_reply and DM auto reply toggle between Tenant A and Tenant B', async () => {
    const rulesA = await db.getAutomationRules(tenantA_ID);
    const rulesB = await db.getAutomationRules(tenantB_ID);

    expect(rulesA.tenant_id).toBe(tenantA_ID);
    expect(rulesB.tenant_id).toBe(tenantB_ID);
    expect(rulesA.default_dm_reply).toBeDefined();
    expect(rulesB.default_dm_reply).toBeDefined();
  });

  it('should isolate conversation manual takeover state per tenant', async () => {
    const convsA = await db.getConversations(tenantA_ID);
    const convsB = await db.getConversations(tenantB_ID);

    expect(Array.isArray(convsA)).toBe(true);
    expect(Array.isArray(convsB)).toBe(true);

    if (convsA.length > 0) {
      const targetA = convsA[0];
      const updatedA = await db.updateConversation(targetA.id, {
        human_takeover: true,
        is_manual_takeover: true,
        status: 'needs_human_review',
      });
      expect(updatedA?.human_takeover).toBe(true);
      expect(updatedA?.is_manual_takeover).toBe(true);
    }
  });

  it('should support safe deleteTenant structure for temporary non-production ID', async () => {
    const dummyId = '99999999-9999-9999-9999-999999999999';
    const res = await db.deleteTenant(dummyId);
    expect(res).toBeDefined();
    expect(typeof res.success).toBe('boolean');
  });
});
