import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { InstagramConnector } from '@/lib/connectors/instagram';
import { sanitizeInput } from '@/lib/security/signatures';
import { decryptToken } from '@/lib/security/encryption';

const instagramConnector = new InstagramConnector();

export async function POST(req: NextRequest) {
  try {
    const { conversationId, content, senderType } = await req.json();

    const conv = await db.getConversationById(conversationId);
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const sanitized = sanitizeInput(content);

    const newMsg = await db.addMessage({
      conversation_id: conversationId,
      tenant_id: conv.tenant_id,
      sender_type: senderType || 'agent',
      content: content,
      sanitized_content: sanitized,
      status: 'manually_replied',
    });

    await db.updateConversation(conversationId, {
      last_message_at: new Date().toISOString(),
    });

    if (conv.platform === 'instagram') {
      const connections = await db.getConnections();
      const conn = connections.find(c => c.platform === 'instagram' && c.is_active);
      if (conn) {
        const decryptedToken = decryptToken(conn.access_token_encrypted);
        await instagramConnector.sendDirectMessage({
          recipientId: conv.external_id,
          content: content,
          accessToken: decryptedToken,
        });
      }
    }

    await db.addAuditLog({
      event_type: 'MANUAL_REPLY_SENT',
      actor_type: 'user',
      details: { conversation_id: conversationId, recipient: conv.customer_name },
    });

    return NextResponse.json(newMsg, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

