import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as extractHandler } from '../app/api/menu/extract/route';
import { POST as importHandler } from '../app/api/menu/import/route';
import { GET as getMenuHandler, POST as createMenuHandler } from '../app/api/menu/route';
import { NextRequest } from 'next/server';
import { db } from '../lib/db/store';
import { retrieveRelevantTenantData } from '../lib/ai/retrieval';

(process.env as any).NODE_ENV = 'test';

describe('Menu Import Persistence & AI Immediate Readiness Test Suite', () => {
  const TESTER_TENANT_ID = '1029a20d-1342-42fa-87c2-c0fef3cceeaf';
  const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
  const inMemoryDb: Map<string, any[]> = new Map();

  beforeEach(() => {
    inMemoryDb.clear();
    inMemoryDb.set(TESTER_TENANT_ID, []);
    inMemoryDb.set(OTHER_TENANT_ID, []);

    // Mock db store methods to simulate DB operations with valid UUID generation
    vi.spyOn(db, 'getMenu').mockImplementation(async (tenantId?: string) => {
      const target = tenantId || TESTER_TENANT_ID;
      return inMemoryDb.get(target) || [];
    });

    vi.spyOn(db, 'addMenuItem').mockImplementation(async (item: any, tenantId?: string) => {
      const tId = item.tenant_id || tenantId || TESTER_TENANT_ID;
      const id = `f47ac10b-58cc-4372-a567-0e02b2c3d4e${(inMemoryDb.get(tId)?.length || 0) + 1}`;
      const newItem = {
        id,
        tenant_id: tId,
        category: item.category || 'General',
        name: item.name,
        price: Number(item.price),
        description: item.description || '',
        ingredients: item.ingredients || [],
        approved_allergens: item.approved_allergens || [],
        is_vegetarian: item.is_vegetarian ?? false,
        is_vegan: item.is_vegan ?? false,
        is_available: item.is_available ?? true,
        created_at: new Date().toISOString(),
      };
      const existing = inMemoryDb.get(tId) || [];
      existing.push(newItem);
      inMemoryDb.set(tId, existing);
      return newItem;
    });

    vi.spyOn(db, 'updateMenuItem').mockImplementation(async (id: string, updates: any) => {
      Array.from(inMemoryDb.entries()).forEach(([_, items]) => {
        const index = items.findIndex((itemObj: any) => itemObj.id === id);
        if (index !== -1) {
          items[index] = { ...items[index], ...updates };
        }
      });
      return null;
    });
  });

  it('TEST A: CSV import extracts preview, persists valid UUID rows, and reloads via GET /api/menu', async () => {
    const csvContent = `Product Name,Category,Cost,Description
Flat White,Coffee,4.20,Double espresso with microfoam
Avocado Toast,Breakfast,11.50,Sourdough toast
Matcha Latte,Drinks,5.50,Ceremonial matcha`;

    const csvBlob = new Blob([csvContent], { type: 'text/csv' });
    const csvFile = new File([csvBlob], 'menu.csv', { type: 'text/csv' });

    const headers = new Headers();
    headers.set('Authorization', 'Bearer test_token');
    headers.set('x-test-tenant-id', TESTER_TENANT_ID);
    headers.set('x-test-role', 'owner');

    const extractFormData = new FormData();
    extractFormData.append('file', csvFile);
    extractFormData.append('tenantId', TESTER_TENANT_ID);

    // 1. Extract Preview
    const extractReq = new NextRequest('http://localhost:3000/api/menu/extract', {
      method: 'POST',
      headers,
      body: extractFormData,
    });

    const extractRes = await extractHandler(extractReq);
    expect(extractRes.status).toBe(200);
    const extractData = await extractRes.json();
    expect(extractData.success).toBe(true);
    expect(extractData.count).toBe(3);
    expect(extractData.items).toHaveLength(3);

    // 2. Confirm Import
    const importReq = new NextRequest('http://localhost:3000/api/menu/import', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenantId: TESTER_TENANT_ID,
        items: extractData.items,
      }),
    });

    const importRes = await importHandler(importReq);
    expect(importRes.status).toBe(200);
    const importData = await importRes.json();
    expect(importData.count.imported).toBe(3);
    expect(importData.count.failed).toBe(0);

    // 3. Reload menu via GET /api/menu
    const getReq = new NextRequest(`http://localhost:3000/api/menu?tenantId=${TESTER_TENANT_ID}`, {
      method: 'GET',
      headers,
    });

    const getRes = await getMenuHandler(getReq);
    expect(getRes.status).toBe(200);
    const persistedMenu = await getRes.json();

    expect(persistedMenu).toHaveLength(3);
    expect(persistedMenu[0].name).toBe('Flat White');
    expect(persistedMenu[0].price).toBe(4.2);
    expect(persistedMenu[0].tenant_id).toBe(TESTER_TENANT_ID);
    // Verify valid UUID format
    expect(persistedMenu[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('TEST B: Text PDF import extracts preview, persists rows to DB, and enforces tenant isolation', async () => {
    const pdfBuffer = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 120 >> stream
BT /F1 12 Tf 50 750 Td (Cappuccino 3.80) Tj 0 -20 Td (Espresso 2.50) Tj 0 -20 Td (Tiramisu 5.50) Tj ET
endstream endobj
xref 0 6 0000000000 65535 f trailer << /Size 6 /Root 1 0 R >> startxref 350 %%EOF`);

    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'menu.pdf', { type: 'application/pdf' });

    const headers = new Headers();
    headers.set('Authorization', 'Bearer test_token');
    headers.set('x-test-tenant-id', TESTER_TENANT_ID);
    headers.set('x-test-role', 'owner');

    const extractFormData = new FormData();
    extractFormData.append('file', pdfFile);
    extractFormData.append('tenantId', TESTER_TENANT_ID);

    const extractReq = new NextRequest('http://localhost:3000/api/menu/extract', {
      method: 'POST',
      headers,
      body: extractFormData,
    });

    const extractRes = await extractHandler(extractReq);
    expect(extractRes.status).toBe(200);
    const extractData = await extractRes.json();
    expect(extractData.count).toBe(3);

    // Confirm Import
    const importReq = new NextRequest('http://localhost:3000/api/menu/import', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenantId: TESTER_TENANT_ID,
        items: extractData.items,
      }),
    });

    const importRes = await importHandler(importReq);
    expect(importRes.status).toBe(200);

    // Verify tenant isolation (Other tenant gets 0 rows)
    const otherHeaders = new Headers();
    otherHeaders.set('Authorization', 'Bearer test_token');
    otherHeaders.set('x-test-tenant-id', OTHER_TENANT_ID);
    otherHeaders.set('x-test-role', 'owner');

    const otherGetReq = new NextRequest(`http://localhost:3000/api/menu?tenantId=${OTHER_TENANT_ID}`, {
      method: 'GET',
      headers: otherHeaders,
    });

    const otherGetRes = await getMenuHandler(otherGetReq);
    const otherMenu = await otherGetRes.json();
    expect(otherMenu).toHaveLength(0);
  });

  it('TEST C: Scanned PDF returns exact user message without OCR crash', async () => {
    const scannedPdfBuffer = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 0 >> stream
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000210 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
260
%%EOF`);
    const pdfBlob = new Blob([scannedPdfBuffer], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'scanned.pdf', { type: 'application/pdf' });

    const headers = new Headers();
    headers.set('Authorization', 'Bearer test_token');
    headers.set('x-test-tenant-id', TESTER_TENANT_ID);

    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('tenantId', TESTER_TENANT_ID);

    const req = new NextRequest('http://localhost:3000/api/menu/extract', {
      method: 'POST',
      headers,
      body: formData,
    });

    const res = await extractHandler(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain('This PDF is scanned/image-based');
  });

  it('TEST D: AI Immediate Readiness reads imported menu items and returns exact price', async () => {
    const importedMenu = [
      { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d4e1', name: 'Flat White', price: 4.20, category: 'Coffee', is_available: true },
      { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d4e2', name: 'Avocado Toast', price: 11.50, category: 'Breakfast', is_available: true },
    ];

    const mockKb = {
      id: 'kb_tester',
      tenant_id: TESTER_TENANT_ID,
      cafe_name: 'All Things Good',
      address: 'Ghent Central',
      google_maps_url: '',
      opening_hours: {},
      holiday_hours: {},
      reservation_rules: '',
      delivery_takeaway_info: '',
      contact_email: '',
      contact_phone: '',
      wifi_details: '',
      payment_methods: [],
      promotions: [],
      faqs: [],
      updated_at: new Date().toISOString(),
    };

    const retrieved = retrieveRelevantTenantData('How much is the Flat White?', mockKb as any, importedMenu as any);
    expect(retrieved.relevantMenuItems.length).toBeGreaterThanOrEqual(1);

    const matched = retrieved.relevantMenuItems.find(m => m.name === 'Flat White');
    expect(matched).toBeDefined();
    expect(matched?.price).toBe(4.20);
  });
});
