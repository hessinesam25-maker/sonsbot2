import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export async function GET() {
  const kb = await db.getKnowledgeBase();
  return NextResponse.json(kb);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const updated = await db.updateKnowledgeBase(body);

  await db.addAuditLog({
    event_type: 'KNOWLEDGE_BASE_UPDATED',
    actor_type: 'user',
    details: { fields_updated: Object.keys(body) },
  });

  return NextResponse.json(updated);
}

