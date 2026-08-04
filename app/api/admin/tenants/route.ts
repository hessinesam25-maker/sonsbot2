import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { getBackendSupabaseClient } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const tenants = await db.getAllTenants();
    return NextResponse.json(tenants);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      name, 
      slug, 
      address, 
      city, 
      country, 
      default_locale, 
      timezone, 
      contact_email, 
      phone, 
      logo_url 
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Restaurant name is required' }, { status: 400 });
    }

    const targetTimezone = timezone || (country?.toLowerCase() === 'belgium' || city?.toLowerCase() === 'ghent' ? 'Europe/Brussels' : 'Europe/Brussels');

    // Create Tenant Record ONLY in Supabase (No Auth user created)
    const newTenant = await db.createTenant({
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      address: address || 'Main Address',
      city: city || 'Ghent',
      country: country || 'Belgium',
      default_locale: default_locale || 'ar',
      timezone: targetTimezone,
      contact_email: contact_email || '',
      phone: phone || '',
      logo_url: logo_url || '',
      is_active: true,
    });

    const backend = getBackendSupabaseClient();

    // Initialize default Knowledge Base & Automation Rules for new tenant
    await backend.from('knowledge_base').upsert({
      tenant_id: newTenant.id,
      cafe_name: name,
      address: `${address || 'Main Address'}, ${city || 'Ghent'}`,
      google_maps_url: `https://maps.google.com/?q=${encodeURIComponent(name)}`,
      opening_hours: { monday: '08:00 - 18:00', tuesday: '08:00 - 18:00', wednesday: '08:00 - 18:00', thursday: '08:00 - 18:00', friday: '08:00 - 20:00', saturday: '09:00 - 20:00', sunday: '09:00 - 18:00' },
      holiday_hours: {},
      reservation_rules: 'Reservations available online or by phone.',
      delivery_takeaway_info: 'Takeaway available.',
      contact_email: contact_email || '',
      contact_phone: phone || '',
      wifi_details: 'Free Guest WiFi',
      payment_methods: ['Bancontact', 'Visa', 'Cash'],
      promotions: [],
      faqs: [],
    });

    await backend.from('automation_rules').upsert({
      tenant_id: newTenant.id,
      min_confidence_score: 0.85,
      max_public_replies_per_hour: 20,
      auto_reply_positive_comments: true,
      auto_reply_factual_questions: true,
      never_reply_complaints: true,
      hide_spam: true,
      ai_tone: 'friendly_warm',
    });

    await db.addAuditLog({
      tenant_id: newTenant.id,
      event_type: 'TENANT_CREATED_BY_ADMIN',
      actor_type: 'user',
      details: { tenant_id: newTenant.id, name, contact_email },
    });

    return NextResponse.json(newTenant, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
