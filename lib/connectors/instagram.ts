import { PlatformConnector, WebhookEventPayload, SendMessageOptions, SendCommentReplyOptions } from './types';
import { verifyMetaSignature } from '../security/signatures';
import crypto from 'crypto';

export type WebhookParseDiagnostic = (reasonCode: string) => void;

type WebhookRecord = Record<string, any>;

function isWebhookRecord(value: unknown): value is WebhookRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asWebhookId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeWebhookTimestamp(
  value: unknown,
  unit: 'auto' | 'seconds' = 'auto',
): { idempotencyValue: number | string; iso: string } | null {
  const isMissing = value === undefined || value === null || value === '';
  const numericValue = isMissing
    ? Date.now()
    : typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;

  if (!Number.isFinite(numericValue)) return null;

  const timestampMs = unit === 'seconds' || (unit === 'auto' && Math.abs(numericValue) < 100_000_000_000)
    ? numericValue * 1000
    : numericValue;
  const date = new Date(timestampMs);

  if (Number.isNaN(date.getTime())) return null;

  return {
    idempotencyValue: isMissing ? numericValue : (value as number | string),
    iso: date.toISOString(),
  };
}

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

  parseWebhookPayload(body: any, onIgnored?: WebhookParseDiagnostic): WebhookEventPayload[] {
    const events: WebhookEventPayload[] = [];
    if (!isWebhookRecord(body) || body.object !== 'instagram') {
      onIgnored?.('UNSUPPORTED_OBJECT');
      return events;
    }

    if (body.entry === undefined || body.entry === null) {
      onIgnored?.('UNSUPPORTED_EVENT');
      return events;
    }
    if (!Array.isArray(body.entry)) {
      onIgnored?.('INVALID_ENTRY_SHAPE');
      return events;
    }

    const entries = body.entry;
    for (const entry of entries) {
      if (!isWebhookRecord(entry)) {
        onIgnored?.('INVALID_ENTRY_SHAPE');
        continue;
      }

      const entryEventStart = events.length;
      const entryAccountId = asWebhookId(entry.id);

      // 1. Direct Messages via entry.messaging
      if (entry.messaging !== undefined && entry.messaging !== null && !Array.isArray(entry.messaging)) {
        onIgnored?.('INVALID_MESSAGING_SHAPE');
      } else if (Array.isArray(entry.messaging)) {
        for (const msg of entry.messaging) {
          if (!isWebhookRecord(msg) || !isWebhookRecord(msg.message) || typeof msg.message.text !== 'string' || !msg.message.text) {
            onIgnored?.('NON_TEXT_MESSAGE');
            continue;
          }

          const timestampValue = msg.timestamp === undefined ? Date.now() : msg.timestamp;
          const timestamp = normalizeWebhookTimestamp(timestampValue);
          if (!timestamp) {
            onIgnored?.('INVALID_TIMESTAMP');
            continue;
          }

          const recipientId = isWebhookRecord(msg.recipient) ? asWebhookId(msg.recipient.id) || entryAccountId : entryAccountId;
          const senderId = isWebhookRecord(msg.sender) ? asWebhookId(msg.sender.id) || 'unknown' : 'unknown';
          const explicitMid = asWebhookId(msg.message.mid) || asWebhookId(msg.mid) || asWebhookId(msg.message_id);
          const externalId = explicitMid && String(explicitMid) !== entryAccountId && String(explicitMid) !== senderId
            ? String(explicitMid)
            : generateStableIdempotencyKey('ig_msg', senderId, recipientId, timestamp.idempotencyValue, msg.message.text);

          events.push({
            platform: 'instagram',
            eventType: 'message',
            externalId,
            senderId,
            senderName: isWebhookRecord(msg.sender) && typeof msg.sender.username === 'string' && msg.sender.username
              ? msg.sender.username
              : `IG_User_${senderId.slice(-4)}`,
            recipientId,
            content: msg.message.text,
            timestamp: timestamp.iso,
            rawPayload: msg,
          });
        }
      }

      // 2. Changes array (comments or messages field changes)
      if (entry.changes !== undefined && entry.changes !== null && !Array.isArray(entry.changes)) {
        onIgnored?.('INVALID_CHANGES_SHAPE');
      } else if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (!isWebhookRecord(change)) {
            onIgnored?.('INVALID_CHANGE_SHAPE');
            continue;
          }

          // A. Comments
          if (change.field === 'comments' && isWebhookRecord(change.value)) {
            const val = change.value;
            const commentId = asWebhookId(val.id) || asWebhookId(val.comment_id);
            const timestampValue = val.created_time === undefined ? Date.now() : val.created_time;
            const timestamp = normalizeWebhookTimestamp(timestampValue, 'seconds');
            if (!timestamp) {
              onIgnored?.('INVALID_TIMESTAMP');
              continue;
            }
            const fromId = isWebhookRecord(val.from) ? asWebhookId(val.from.id) : undefined;
            const externalId = commentId && String(commentId) !== entryAccountId
              ? String(commentId)
              : generateStableIdempotencyKey('ig_cmt', fromId || 'unk', entryAccountId, timestamp.idempotencyValue, typeof val.text === 'string' ? val.text : '');

            events.push({
              platform: 'instagram',
              eventType: 'comment',
              externalId,
              senderId: fromId || 'unknown',
              senderName: isWebhookRecord(val.from) && typeof val.from.username === 'string' && val.from.username
                ? val.from.username
                : 'IG_Commenter',
              recipientId: entryAccountId,
              content: typeof val.text === 'string' ? val.text : '',
              mediaId: isWebhookRecord(val.media) ? asWebhookId(val.media.id) : undefined,
              timestamp: timestamp.iso,
              rawPayload: val,
            });
          } else if (change.field === 'comments') {
            onIgnored?.('INVALID_CHANGE_SHAPE');
          }

          // B. Messages field in changes
          else if (change.field === 'messages' || change.field === 'messaging') {
            const items = Array.isArray(change.value) ? change.value : [change.value];
            if (items.length === 0) onIgnored?.('UNSUPPORTED_EVENT');
            for (const item of items) {
              if (!isWebhookRecord(item)) {
                onIgnored?.('INVALID_MESSAGE_SHAPE');
                continue;
              }
              const msgData = isWebhookRecord(item.message) ? item.message : item;
              if (typeof msgData.text !== 'string' || !msgData.text) {
                onIgnored?.('NON_TEXT_MESSAGE');
                continue;
              }

              const timestampValue = item.timestamp === undefined ? Date.now() : item.timestamp;
              const timestamp = normalizeWebhookTimestamp(timestampValue);
              if (!timestamp) {
                onIgnored?.('INVALID_TIMESTAMP');
                continue;
              }

              const recipientId = isWebhookRecord(item.recipient) ? asWebhookId(item.recipient.id) || entryAccountId : entryAccountId;
              const senderId = isWebhookRecord(item.sender) ? asWebhookId(item.sender.id) || 'unknown' : 'unknown';
              const explicitMid = asWebhookId(msgData.mid) || asWebhookId(item.mid) || asWebhookId(msgData.message_id);
              const externalId = explicitMid && String(explicitMid) !== entryAccountId && String(explicitMid) !== senderId
                ? String(explicitMid)
                : generateStableIdempotencyKey('ig_msg', senderId, recipientId, timestamp.idempotencyValue, msgData.text);

              events.push({
                platform: 'instagram',
                eventType: 'message',
                externalId,
                senderId,
                senderName: isWebhookRecord(item.sender) && typeof item.sender.username === 'string' && item.sender.username
                  ? item.sender.username
                  : `IG_User_${senderId.slice(-4)}`,
                recipientId,
                content: msgData.text,
                timestamp: timestamp.iso,
                rawPayload: item,
              });
            }
          } else {
            onIgnored?.('UNSUPPORTED_EVENT');
          }
        }
      }

      if (events.length === entryEventStart &&
        ((!Array.isArray(entry.messaging) || entry.messaging.length === 0) &&
          (!Array.isArray(entry.changes) || entry.changes.length === 0))) {
        onIgnored?.('UNSUPPORTED_EVENT');
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
        console.info('[IG-WEBHOOK]', JSON.stringify({
          event: 'IG_WEBHOOK_MOCK_SEND',
          platform: 'instagram',
          channel: 'dm',
          recipient_id_hash: crypto.createHash('sha256').update(options.recipientId).digest('hex').slice(0, 8),
        }));
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
        console.info('[IG-WEBHOOK]', JSON.stringify({
          event: 'IG_WEBHOOK_MOCK_SEND',
          platform: 'instagram',
          channel: 'comment',
          comment_id_hash: crypto.createHash('sha256').update(options.commentId).digest('hex').slice(0, 8),
        }));
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
