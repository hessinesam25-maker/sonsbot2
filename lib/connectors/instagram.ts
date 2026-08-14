import { PlatformConnector, WebhookEventPayload, SendMessageOptions, SendCommentReplyOptions } from './types';
import { verifyMetaSignature } from '../security/signatures';
import crypto from 'crypto';

function generateStableIdempotencyKey(
  prefix: 'ig_msg' | 'ig_cmt',
  senderId: string,
  recipientId: string | undefined,
  timestamp: number | string,
  content: string
): string {
  const hashInput = `${prefix}:${senderId}:${recipientId || ''}:${timestamp}:${content}`;
  const hashHex = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  return `${prefix}_det_${senderId}_${hashHex}`;
}

export class InstagramConnector implements PlatformConnector {
  platform: 'instagram' = 'instagram';
  private appSecret: string;
  private apiVersion: string;

  constructor(appSecret?: string) {
    this.appSecret = appSecret || process.env.INSTAGRAM_APP_SECRET || '';
    this.apiVersion = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v20.0';
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
      const entryAccountId = entry.id ? String(entry.id) : undefined;

      // 1. Direct Messages via entry.messaging
      if (entry.messaging && Array.isArray(entry.messaging)) {
        for (const msg of entry.messaging) {
          if (msg && msg.message && msg.message.text) {
            const recipientId = msg.recipient?.id ? String(msg.recipient.id) : entryAccountId;
            const senderId = String(msg.sender?.id || 'unknown');
            const timestampMs = msg.timestamp || Date.now();
            const explicitMid = msg.message.mid || msg.mid || msg.message_id;
            const externalId = explicitMid && String(explicitMid) !== entryAccountId && String(explicitMid) !== senderId
              ? String(explicitMid)
              : generateStableIdempotencyKey('ig_msg', senderId, recipientId, timestampMs, msg.message.text);

            events.push({
              platform: 'instagram',
              eventType: 'message',
              externalId,
              senderId,
              senderName: msg.sender?.username || `IG_User_${senderId.slice(-4)}`,
              recipientId,
              content: msg.message.text,
              timestamp: new Date(timestampMs).toISOString(),
              rawPayload: msg,
            });
          }
        }
      }

      // 2. Changes array (comments or messages field changes)
      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (!change) continue;

          // A. Comments
          if (change.field === 'comments' && change.value) {
            const val = change.value;
            const commentId = val.id || val.comment_id;
            const externalId = commentId && String(commentId) !== entryAccountId
              ? String(commentId)
              : generateStableIdempotencyKey('ig_cmt', val.from?.id || 'unk', entryAccountId, val.created_time || Date.now(), val.text || '');

            events.push({
              platform: 'instagram',
              eventType: 'comment',
              externalId,
              senderId: val.from ? String(val.from.id) : 'unknown',
              senderName: val.from ? val.from.username : 'IG_Commenter',
              recipientId: entryAccountId,
              content: val.text || '',
              mediaId: val.media ? String(val.media.id) : undefined,
              timestamp: new Date(val.created_time ? val.created_time * 1000 : Date.now()).toISOString(),
              rawPayload: val,
            });
          }

          // B. Messages field in changes
          if ((change.field === 'messages' || change.field === 'messaging') && change.value) {
            const items = Array.isArray(change.value) ? change.value : [change.value];
            for (const item of items) {
              if (!item) continue;
              const msgData = item.message || item;
              if (msgData && msgData.text) {
                const recipientId = item.recipient?.id ? String(item.recipient.id) : entryAccountId;
                const senderId = String(item.sender?.id || 'unknown');
                const timestampMs = item.timestamp || Date.now();
                const explicitMid = msgData.mid || item.mid || msgData.message_id;
                const externalId = explicitMid && String(explicitMid) !== entryAccountId && String(explicitMid) !== senderId
                  ? String(explicitMid)
                  : generateStableIdempotencyKey('ig_msg', senderId, recipientId, timestampMs, msgData.text);

                events.push({
                  platform: 'instagram',
                  eventType: 'message',
                  externalId,
                  senderId,
                  senderName: item.sender?.username || `IG_User_${senderId.slice(-4)}`,
                  recipientId,
                  content: msgData.text,
                  timestamp: new Date(timestampMs).toISOString(),
                  rawPayload: item,
                });
              }
            }
          }
        }
      }
    }

    return events;
  }

  /**
   * Refresh long-lived Instagram User Access Token via graph.instagram.com
   */
  async refreshLongLivedToken(currentAccessToken: string): Promise<{ success: boolean; accessToken?: string; expiresIn?: number; error?: string }> {
    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentAccessToken}`;

    try {
      if (!currentAccessToken || currentAccessToken.includes('mock')) {
        return { success: true, accessToken: currentAccessToken, expiresIn: 5184000 };
      }

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.access_token) {
        return { success: false, error: data.error?.message || 'Token refresh failed' };
      }

      return {
        success: true,
        accessToken: data.access_token,
        expiresIn: data.expires_in || 5184000,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during token refresh' };
    }
  }

  async sendDirectMessage(options: SendMessageOptions): Promise<{
    success: boolean;
    messageId?: string;
    recipientId?: string;
    httpStatus?: number;
    errorCode?: number;
    errorType?: string;
    errorSubcode?: number;
    error?: string;
  }> {
    const url = `https://graph.instagram.com/${this.apiVersion}/me/messages?access_token=${encodeURIComponent(options.accessToken)}`;

    try {
      if (!options.accessToken || options.accessToken.includes('mock')) {
        console.log(`[InstagramConnector] Mock DM sent to ${options.recipientId}: ${options.content}`);
        return {
          success: true,
          messageId: `mock_ig_msg_${Date.now()}`,
          recipientId: options.recipientId,
          httpStatus: 200,
        };
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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          httpStatus: res.status,
          errorCode: data.error?.code,
          errorType: data.error?.type,
          errorSubcode: data.error?.error_subcode,
          error: data.error?.message || `Instagram Graph API request failed with status ${res.status}`,
        };
      }

      return {
        success: true,
        messageId: data.message_id || data.id || `ig_msg_${Date.now()}`,
        recipientId: data.recipient_id || options.recipientId,
        httpStatus: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        httpStatus: 500,
        error: err.message || 'Network error during Instagram DM send',
      };
    }
  }

  async sendCommentReply(options: SendCommentReplyOptions): Promise<{
    success: boolean;
    replyId?: string;
    httpStatus?: number;
    errorCode?: number;
    errorType?: string;
    errorSubcode?: number;
    error?: string;
  }> {
    const url = `https://graph.instagram.com/${this.apiVersion}/${options.commentId}/replies`;

    try {
      if (!options.accessToken || options.accessToken.includes('mock')) {
        console.log(`[InstagramConnector] Mock Comment reply to ${options.commentId}: ${options.content}`);
        return { success: true, replyId: `mock_ig_rpl_${Date.now()}`, httpStatus: 200 };
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          httpStatus: res.status,
          errorCode: data.error?.code,
          errorType: data.error?.type,
          errorSubcode: data.error?.error_subcode,
          error: data.error?.message || `Instagram Graph API comment reply failed with status ${res.status}`,
        };
      }

      return { success: true, replyId: data.id, httpStatus: res.status };
    } catch (err: any) {
      return { success: false, httpStatus: 500, error: err.message || 'Network error' };
    }
  }
}
