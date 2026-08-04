import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const conv = await db.getConversationById(params.id);
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const messages = await db.getMessages(params.id);
  return NextResponse.json({ conversation: conv, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const updated = await db.updateConversation(params.id, body);

  if (!updated) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (body.human_takeover !== undefined) {
    await db.addAuditLog({
      event_type: body.human_takeover ? 'HUMAN_TAKEOVER_ENABLED' : 'HUMAN_TAKEOVER_DISABLED',
      actor_type: 'user',
      details: { conversation_id: params.id, updated_by: 'Support Agent' },
    });
  }

  return NextResponse.json(updated);
}

