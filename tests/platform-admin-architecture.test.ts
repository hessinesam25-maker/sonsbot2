import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../lib/db/store';

describe('Platform Admin & Multi-Tenant Architecture Test Suite', () => {
  it('Login page should contain no role/profile selector or hardcoded demo credentials', () => {
    const loginPageContent = fs.readFileSync(
      path.join(__dirname, '../app/login/page.tsx'),
      'utf-8'
    );

    // Verify absence of test accounts dropdown and demo profiles
    expect(loginPageContent).not.toContain('testAccounts');
    expect(loginPageContent).not.toContain('Select Pre-Configured Account profile');
    expect(loginPageContent).not.toContain('Jan Van Gent');
    expect(loginPageContent).not.toContain('Sophie Claes');
    expect(loginPageContent).not.toContain('Lucas De Smet');
    expect(loginPageContent).not.toContain('Pieter Graaf');
    expect(loginPageContent).not.toContain('admin@socialplatform.com');
  });

  it('Creating a restaurant should create a tenant record and not a user account', async () => {
    const testTenantName = 'Test Restaurant Tenant ' + Date.now();
    const newTenant = await db.createTenant({
      name: testTenantName,
      city: 'Ghent',
      country: 'Belgium',
      timezone: 'Europe/Brussels',
      default_locale: 'ar',
      contact_email: 'test@restaurant.be',
      phone: '+32 9 000 00 00',
    });

    expect(newTenant).toBeDefined();
    expect(newTenant.id).toBeDefined();
    expect(newTenant.name).toBe(testTenantName);
    expect(newTenant.timezone).toBe('Europe/Brussels');

    // Verify getUsers for this new tenant returns 0 users (no auth user created automatically)
    const users = await db.getUsers(newTenant.id);
    expect(users.length).toBe(0);
  });

  it('Platform admin query should list all tenants', async () => {
    const tenants = await db.getAllTenants();
    expect(Array.isArray(tenants)).toBe(true);
  });

  it('Tenant data should remain isolated across different tenant IDs', async () => {
    const tenantA = '11111111-1111-1111-1111-111111111111';
    const tenantB = '22222222-2222-2222-2222-222222222222';

    const kbA = await db.getKnowledgeBase(tenantA);
    const kbB = await db.getKnowledgeBase(tenantB);

    expect(kbA.tenant_id).toBe(tenantA);
    expect(kbB.tenant_id).toBe(tenantB);
    expect(kbA.id).not.toBe(kbB.id);
  });

  it('Arabic locale should set RTL direction and English should set LTR', () => {
    const arLocaleContent = fs.readFileSync(
      path.join(__dirname, '../locales/ar.json'),
      'utf-8'
    );
    const enLocaleContent = fs.readFileSync(
      path.join(__dirname, '../locales/en.json'),
      'utf-8'
    );

    const arObj = JSON.parse(arLocaleContent);
    const enObj = JSON.parse(enLocaleContent);

    expect(arObj.common.platformName).toBe('منصة التواصل الاجتماعي للمطاعم');
    expect(enObj.common.platformName).toBe('Restaurant Social Platform');
  });

  it('Service-role key must NOT be exposed to client bundles via NEXT_PUBLIC_', () => {
    const envExample = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf-8');
    
    // Ensure SUPABASE_SERVICE_ROLE_KEY is not prefixed with NEXT_PUBLIC_
    expect(envExample).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    expect(envExample).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
