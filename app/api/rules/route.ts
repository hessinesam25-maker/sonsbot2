import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export async function GET() {
  const rules = await db.getAutomationRules();
  return NextResponse.json(rules);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const updated = await db.updateAutomationRules(body);

  await db.addAuditLog({
    event_type: 'AUTOMATION_RULES_UPDATED',
    actor_type: 'user',
    details: { min_confidence: updated?.min_confidence_score, tone: updated?.ai_tone },
  });

  return NextResponse.json(updated);
}
