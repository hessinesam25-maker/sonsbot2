import { PlatformConnector, WebhookEventPayload, SendMessageOptions, SendCommentReplyOptions } from './types';
import { verifyMetaSignature } from '../security/signatures';

export class InstagramConnector implements PlatformConnector {
  platform: 'instagram' = 'instagram';
  private appSecret: string;
  private apiVersion = 'v19.0';

  constructor(appSecret?: string) {
    this.appSecret = appSecret || process.env.META_APP_SECRET || '';
  }

  verifySignature(rawBody: string | Buffer, signatureHeader: string | null): boolean {
    return verifyMetaSignature(rawBody, signatureHeader, this.appSecret);
  }

  parseWebhookPayload(body: any): WebhookEventPayload[] {
    const events: WebhookEventPayload[] = [];
    if (!body || body.object !== 'instagram') {
      return events;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      // 1. Direct Messages
      if (entry.messaging) {
        for (const msg of entry.messaging) {
          if (msg.message && msg.message.text) {
            events.push({
              platform: 'instagram',
              eventType: 'message',
              externalId: msg.message.mid || `ig_msg_${Date.now()}`,
              senderId: msg.sender.id,
              senderName: msg.sender.username || `IG_User_${msg.sender.id.slice(-4)}`,
              content: msg.message.text,
              timestamp: new Date(msg.timestamp || Date.now()).toISOString(),
              rawPayload: msg,
            });
          }
        }
      }

      // 2. Comments on posts / Reels
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'comments' && change.value) {
            const val = change.value;
            events.push({
              platform: 'instagram',
              eventType: 'comment',
              externalId: val.id || `ig_cmt_${Date.now()}`,
              senderId: val.from ? val.from.id : 'unknown',
              senderName: val.from ? val.from.username : 'IG_Commenter',
              content: val.text || '',
              mediaId: val.media ? val.media.id : undefined,
              timestamp: new Date(val.created_time * 1000 || Date.now()).toISOString(),
              rawPayload: val,
            });
          }
        }
      }
    }

    return events;
  }

  async sendDirectMessage(options: SendMessageOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const url = `https://graph.facebook.com/${this.apiVersion}/me/messages`;

    try {
      // If no valid Meta API token is set, mock successful response in dev mode
      if (!options.accessToken || options.accessToken.includes('mock')) {
        console.log(`[InstagramConnector] Mock DM sent to ${options.recipientId}: ${options.content}`);
        return { success: true, messageId: `mock_ig_msg_${Date.now()}` };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: options.recipientId },
          message: { text: options.content },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Meta API request failed' };
      }

      return { success: true, messageId: data.message_id };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  async sendCommentReply(options: SendCommentReplyOptions): Promise<{ success: boolean; replyId?: string; error?: string }> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${options.commentId}/replies`;

    try {
      if (!options.accessToken || options.accessToken.includes('mock')) {
        console.log(`[InstagramConnector] Mock Comment reply to ${options.commentId}: ${options.content}`);
        return { success: true, replyId: `mock_ig_rpl_${Date.now()}` };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify({
          message: options.content,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Meta API comment reply failed' };
      }

      return { success: true, replyId: data.id };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }
}
