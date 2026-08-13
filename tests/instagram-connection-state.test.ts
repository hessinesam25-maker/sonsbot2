import { describe, it, expect } from 'vitest';
import { getNormalizedInstagramState } from '../lib/db/store';
import { PlatformConnection } from '../lib/db/types';

describe('Phase 2: Instagram Connection State Cleanup Test Suite', () => {
  const tenantA_ID = '11111111-1111-1111-1111-111111111111'; // Café De Gentse Draak
  const tenantB_ID = '22222222-2222-2222-2222-222222222222'; // Café Het Gravensteen (no connection)
  const picaBeans_ID = '48a68bd0-8d93-4616-8efe-80cd5304d5c3'; // pica beans
  const tester_ID = '1029a20d-1342-42fa-87c2-c0fef3cceeaf'; // tester (inactive connection)

  it('1. active connection => Connected', () => {
    const mockConns: PlatformConnection[] = [
      {
        id: 'conn_1',
        tenant_id: tenantA_ID,
        platform: 'instagram',
        account_id: '17841448075798336',
        account_name: 'allthingisgood',
        access_token_encrypted: 'enc_token_123',
        permissions: ['instagram_basic', 'instagram_manage_messages'],
        is_active: true,
        created_at: '2026-08-06T15:40:30.840Z',
        updated_at: '2026-08-06T15:40:30.578Z',
      },
    ];

    const state = getNormalizedInstagramState(mockConns);
    expect(state.connected).toBe(true);
    expect(state.status).toBe('connected');
    expect(state.connectionId).toBe('conn_1');
    expect(state.username).toBe('allthingisgood');
    expect(state.formattedUsername).toBe('@allthingisgood');
  });

  it('2. no connection => Disconnected', () => {
    const state = getNormalizedInstagramState([]);
    expect(state.connected).toBe(false);
    expect(state.status).toBe('disconnected');
    expect(state.username).toBeUndefined();
    expect(state.formattedUsername).toBeUndefined();
  });

  it('3. inactive connection => Disconnected', () => {
    const mockConns: PlatformConnection[] = [
      {
        id: 'conn_inactive',
        tenant_id: tester_ID,
        platform: 'instagram',
        account_id: '17841448075798336',
        account_name: 'allthingisgood',
        access_token_encrypted: 'enc_token_123',
        permissions: ['instagram_basic'],
        is_active: false,
        created_at: '2026-08-06T15:16:17.260Z',
        updated_at: '2026-08-12T22:00:15.177Z',
      },
    ];

    const state = getNormalizedInstagramState(mockConns);
    expect(state.connected).toBe(false);
    expect(state.status).toBe('disconnected');
  });

  it('4. username displays correctly and selects newest active row when multiple exist', () => {
    const mockConns: PlatformConnection[] = [
      {
        id: 'old_placeholder',
        tenant_id: picaBeans_ID,
        platform: 'instagram',
        account_id: 'ig_acc_684356',
        account_name: 'Instagram Professional Account',
        access_token_encrypted: 'enc_token_123',
        permissions: ['instagram_basic'],
        is_active: true,
        created_at: '2026-08-05T21:51:24.447Z',
        updated_at: '2026-08-05T21:51:24.357Z',
      },
      {
        id: 'new_active',
        tenant_id: picaBeans_ID,
        platform: 'instagram',
        account_id: '17841447229729431',
        account_name: 'pica_beans_gent',
        access_token_encrypted: 'enc_token_456',
        permissions: ['instagram_basic'],
        is_active: true,
        created_at: '2026-08-05T22:54:27.321Z',
        updated_at: '2026-08-06T00:34:02.584Z',
      },
    ];

    const state = getNormalizedInstagramState(mockConns);
    expect(state.connected).toBe(true);
    expect(state.connectionId).toBe('new_active');
    expect(state.username).toBe('pica_beans_gent');
    expect(state.formattedUsername).toBe('@pica_beans_gent');
    expect(state.hasPlaceholderUsername).toBe(false);
  });

  it('5. missing username / placeholder uses fallback indicator', () => {
    const mockConns: PlatformConnection[] = [
      {
        id: 'placeholder_only',
        tenant_id: 'tenant_placeholder',
        platform: 'instagram',
        account_id: 'ig_123',
        account_name: 'Instagram Professional Account',
        access_token_encrypted: 'enc_token_123',
        permissions: ['instagram_basic'],
        is_active: true,
        created_at: '2026-08-05T21:51:24.447Z',
        updated_at: '2026-08-05T21:51:24.357Z',
      },
    ];

    const state = getNormalizedInstagramState(mockConns);
    expect(state.connected).toBe(true);
    expect(state.hasPlaceholderUsername).toBe(true);
    expect(state.username).toBeUndefined();
    expect(state.formattedUsername).toBeUndefined();
  });

  it('6. no duplicated @@ in formatted username', () => {
    const mockConns: PlatformConnection[] = [
      {
        id: 'conn_double_at',
        tenant_id: tenantA_ID,
        platform: 'instagram',
        account_id: '17841400012345678',
        account_name: '@gentsecafe_official',
        access_token_encrypted: 'enc_token_123',
        permissions: ['instagram_basic'],
        is_active: true,
        created_at: '2026-07-30T14:28:38.000Z',
        updated_at: '2026-07-30T14:28:38.000Z',
      },
    ];

    const state = getNormalizedInstagramState(mockConns);
    expect(state.username).toBe('gentsecafe_official');
    expect(state.formattedUsername).toBe('@gentsecafe_official');
    expect(state.formattedUsername).not.toContain('@@');
  });

  it('7. disconnected tenant cannot appear operationally ready for auto-reply', () => {
    const disconnectedConns: PlatformConnection[] = [];
    const stateB = getNormalizedInstagramState(disconnectedConns);
    expect(stateB.connected).toBe(false);
    expect(stateB.status).toBe('disconnected');
  });

  it('8. tenant switching does not leak previous tenant state', () => {
    const connsA: PlatformConnection[] = [
      {
        id: 'conn_a',
        tenant_id: tenantA_ID,
        platform: 'instagram',
        account_id: '17841448075798336',
        account_name: 'allthingisgood',
        access_token_encrypted: 'enc_token_123',
        permissions: ['instagram_basic'],
        is_active: true,
        created_at: '2026-08-06T15:40:30.840Z',
        updated_at: '2026-08-06T15:40:30.840Z',
      },
    ];
    const connsB: PlatformConnection[] = [];

    const stateA = getNormalizedInstagramState(connsA);
    const stateB = getNormalizedInstagramState(connsB);

    expect(stateA.connected).toBe(true);
    expect(stateB.connected).toBe(false);
    expect(stateA.username).not.toEqual(stateB.username);
  });
});
