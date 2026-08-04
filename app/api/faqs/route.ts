import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId') || undefined;

  const faqs = await db.getFAQs(tenantId);
  return NextResponse.json(faqs);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, title, questionText, answerText, locale, keywords, priority } = body;

    const newFAQ = await db.addFAQ({
      tenant_id: tenant_id || '11111111-1111-1111-1111-111111111111',
      title: title || 'New FAQ',
      question: { [locale || 'nl']: questionText || '' },
      answer: { [locale || 'nl']: answerText || '' },
      locale: locale || 'nl',
      keywords: Array.isArray(keywords) ? keywords : (keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      priority: Number(priority) || 0,
      is_enabled: true,
    });

    await db.addAuditLog({
      event_type: 'FAQ_ADDED',
      actor_type: 'user',
      details: { faq_id: newFAQ?.id, title: newFAQ?.title, tenant_id },
    });

    return NextResponse.json(newFAQ, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
