import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { InstagramConnector } from '@/lib/connectors/instagram';
import { decryptToken } from '@/lib/security/encryption';

const instagramConnector = new InstagramConnector();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const comments = await db.getComments();
  const comment = comments.find(c => c.id === params.id);

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  if (body.replyContent) {
    const connections = await db.getConnections();
    const conn = connections.find(c => c.platform === 'instagram' && c.is_active);
    if (conn) {
      const decryptedToken = decryptToken(conn.access_token_encrypted);
      await instagramConnector.sendCommentReply({
        commentId: comment.external_comment_id,
        content: body.replyContent,
        accessToken: decryptedToken,
      });
    }

    body.auto_replied = true;
    body.reply_content = body.replyContent;
  }

  const updated = await db.updateComment(params.id, body);

  await db.addAuditLog({
    event_type: 'COMMENT_UPDATED',
    actor_type: 'user',
    details: { comment_id: params.id, changes: Object.keys(body) },
  });

  return NextResponse.json(updated);
}

