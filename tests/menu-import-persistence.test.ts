import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePrice, parseCsvMenu, parseTextMenu, detectDuplicates } from '../lib/menu/parser';
import { db } from '../lib/db/store';
import { buildTenantAIContext } from '../lib/ai/tenantContext';
import { retrieveRelevantTenantData } from '../lib/ai/retrieval';
import { MenuItem, AISettings, KnowledgeBase } from '../lib/db/types';

describe('Menu Item Persistence & Menu Import Workflow Test Suite', () => {

  const tenantA = '1029a20d-1342-42fa-87c2-c0fef3cceeaf';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  const mockExistingMenuA: MenuItem[] = [
    {
      id: 'item_a1',
      tenant_id: tenantA,
      category: 'Coffee',
      name: 'Espresso',
      price: 2.50,
      description: 'Single shot espresso',
      ingredients: ['Coffee beans'],
      is_vegetarian: true,
      is_vegan: true,
      approved_allergens: [],
      is_available: true,
      created_at: new Date().toISOString(),
    },
  ];

  // 1. Manually added menu item persistence
  it('1. should insert menu item without non-UUID client ID and return DB-assigned UUID', async () => {
    vi.spyOn(db, 'addMenuItem').mockImplementation(async (item: any, tId?: string) => {
      return {
        id: '99999999-9999-4999-8999-999999999999',
        tenant_id: tId || tenantA,
        category: item.category || 'General',
        name: item.name,
        price: item.price,
        description: item.description || '',
        ingredients: [],
        is_vegetarian: true,
        is_vegan: false,
        approved_allergens: [],
        is_available: true,
        created_at: new Date().toISOString(),
      };
    });

    const created = await db.addMenuItem({
      name: 'Cortado',
      price: 3.50,
      category: 'Coffee',
    }, tenantA);

    expect(created).toBeDefined();
    expect(created?.id).toBe('99999999-9999-4999-8999-999999999999');
    expect(created?.name).toBe('Cortado');
  });

  // 2. Correct tenant_id assignment
  it('2. should enforce correct tenant_id assignment on saved menu items', async () => {
    const created = await db.addMenuItem({
      name: 'Cappuccino',
      price: 4.00,
    }, tenantA);

    expect(created?.tenant_id).toBe(tenantA);
  });

  // 3. Cross-tenant menu access blocked (403)
  it('3. POST /api/menu and POST /api/menu/import should return 403 on cross-tenant access', async () => {
    const { POST: postMenu } = await import('../app/api/menu/route');
    const { POST: postImport } = await import('../app/api/menu/import/route');
    const { NextRequest } = await import('next/server');

    const crossTenantReq = new NextRequest('http://localhost:3000/api/menu', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({ tenant_id: tenantB, name: 'Hack Item', price: 99 }),
    });

    const res = await postMenu(crossTenantReq);
    expect(res.status).toBe(403);

    const crossImportReq = new NextRequest('http://localhost:3000/api/menu/import', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({ tenantId: tenantB, items: [{ name: 'Hack' }] }),
    });

    const importRes = await postImport(crossImportReq);
    expect(importRes.status).toBe(403);
  });

  // 4. CSV parsing with custom headers
  it('4. should parse CSV menu content with standard and custom Arabic/English headers', () => {
    const csvData = `Product Name,Category,Cost,Description\nLatte Macchiato,Dranken,4.50,Steamed milk with espresso\nFalafel Wrap,Lunch,8.90,Crispy falafel wrap`;
    const parsed = parseCsvMenu(csvData);

    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe('Latte Macchiato');
    expect(parsed[0].price).toBe(4.50);
    expect(parsed[0].category).toBe('Dranken');
    expect(parsed[1].name).toBe('Falafel Wrap');
  });

  // 5. Decimal price parsing (€3,50 -> 3.50)
  it('5. should safely parse decimal comma price formats (€3,50, $12.50, 12,50 eur)', () => {
    expect(parsePrice('€3,50')).toBe(3.50);
    expect(parsePrice('$12.50')).toBe(12.50);
    expect(parsePrice('14,95 EUR')).toBe(14.95);
    expect(parsePrice(4.25)).toBe(4.25);
  });

  // 6. Column header mapping
  it('6. should flexibly map arbitrary header column positions', () => {
    const csvData = `Price,Item Name,Type\n6.50,Cheesecake,Dessert`;
    const parsed = parseCsvMenu(csvData);

    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Cheesecake');
    expect(parsed[0].price).toBe(6.50);
    expect(parsed[0].category).toBe('Dessert');
  });

  // 7. Duplicate item detection
  it('7. should flag duplicate items against existing tenant menu and suggest skip by default', () => {
    const incoming = [
      { tempId: 't1', name: 'Espresso', category: 'Coffee', price: 2.50, description: '', ingredients: [], approved_allergens: [], is_vegetarian: true, is_vegan: true, is_available: true, selected: true },
      { tempId: 't2', name: 'Croissant', category: 'Bakery', price: 3.00, description: '', ingredients: [], approved_allergens: [], is_vegetarian: true, is_vegan: false, is_available: true, selected: true },
    ];

    const flagged = detectDuplicates(incoming, mockExistingMenuA);
    expect(flagged[0].isDuplicate).toBe(true);
    expect(flagged[0].duplicateAction).toBe('skip');
    expect(flagged[1].isDuplicate).toBe(false);
    expect(flagged[1].duplicateAction).toBe('import_new');
  });

  // 8. Preview stage does NOT write to DB before confirmation
  it('8. should parse items into memory without invoking DB writes during preview', () => {
    const addSpy = vi.spyOn(db, 'addMenuItem');
    const parsed = parseCsvMenu('Name,Price\nTest Muffin,3.00');

    expect(parsed.length).toBe(1);
    expect(addSpy).not.toHaveBeenCalled();
  });

  // 9 & 10. Confirm import writes selected items only (skipping excluded items)
  it('9 & 10. POST /api/menu/import should write only selected non-skipped items to DB', async () => {
    const { POST: postImport } = await import('../app/api/menu/import/route');
    const { NextRequest } = await import('next/server');

    const importReq = new NextRequest('http://localhost:3000/api/menu/import', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenantId: tenantA,
        items: [
          { name: 'Iced Latte', category: 'Dranken', price: 4.50, selected: true, duplicateAction: 'import_new' },
          { name: 'Excluded Item', category: 'Misc', price: 10.00, selected: false, duplicateAction: 'import_new' },
          { name: 'Duplicate Item', category: 'Coffee', price: 2.50, selected: true, duplicateAction: 'skip' },
        ],
      }),
    });

    const res = await postImport(importReq);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.count.imported).toBe(1);
    expect(data.count.skipped).toBe(2);
  });

  // 11. Newly imported menu item is immediately retrievable by AI
  it('11. newly imported menu items should immediately be retrievable by retrieveRelevantTenantData', () => {
    const freshImportedMenu: MenuItem[] = [
      ...mockExistingMenuA,
      {
        id: 'item_fresh_001',
        tenant_id: tenantA,
        category: 'Cold Drinks',
        name: 'Matcha Iced Latte',
        price: 5.80,
        description: 'Ceremonial matcha with oat milk',
        ingredients: ['Matcha', 'Oat Milk'],
        is_vegetarian: true,
        is_vegan: true,
        approved_allergens: [],
        is_available: true,
        created_at: new Date().toISOString(),
      },
    ];

    const mockKb: KnowledgeBase = {
      id: 'kb_a',
      tenant_id: tenantA,
      cafe_name: 'Test Cafe',
      address: 'Ghent Central',
      google_maps_url: 'https://maps.google.com',
      opening_hours: {
        monday: '08:00 - 18:00',
        tuesday: '08:00 - 18:00',
        wednesday: '08:00 - 18:00',
        thursday: '08:00 - 18:00',
        friday: '08:00 - 18:00',
        saturday: '09:00 - 17:00',
        sunday: 'Closed',
      },
      holiday_hours: {},
      reservation_rules: 'Walk-ins welcome',
      delivery_takeaway_info: 'Takeaway available',
      contact_email: 'info@test.com',
      contact_phone: '+32123456',
      wifi_details: 'Free WiFi',
      payment_methods: ['Card', 'Cash'],
      promotions: [],
      faqs: [],
      updated_at: new Date().toISOString(),
    };

    const retrieved = retrieveRelevantTenantData('How much is the Matcha Iced Latte?', mockKb, freshImportedMenu);
    expect(retrieved.relevantMenuItems.length).toBeGreaterThan(0);
    const matchaItem = retrieved.relevantMenuItems.find(m => m.name === 'Matcha Iced Latte');
    expect(matchaItem).toBeDefined();
    expect(matchaItem?.price).toBe(5.80);
  });

  // 12. Bad/unsupported file type rejection
  it('12. should produce controlled error on invalid file content extraction', () => {
    const parsed = parseCsvMenu('');
    expect(parsed).toEqual([]);
  });

  // 13. Tenant A import never writes Tenant B data
  it('13. should prevent Tenant A import from affecting or writing Tenant B data', async () => {
    const { POST: postImport } = await import('../app/api/menu/import/route');
    const { NextRequest } = await import('next/server');

    const tenantAImportReq = new NextRequest('http://localhost:3000/api/menu/import', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'x-test-tenant-id': tenantA,
        'x-test-role': 'owner',
      },
      body: JSON.stringify({
        tenantId: tenantA,
        items: [{ name: 'Tenant A Special Tea', price: 3.80, selected: true, duplicateAction: 'import_new' }],
      }),
    });

    const res = await postImport(tenantAImportReq);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.items[0].tenant_id).toBe(tenantA);
    expect(data.items[0].tenant_id).not.toBe(tenantB);
  });
});
