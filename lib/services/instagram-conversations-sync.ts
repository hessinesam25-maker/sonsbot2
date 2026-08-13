import { db } from '@/lib/db/store';
import { decryptToken } from '@/lib/security/encryption';
import { Conversation, Message, CustomerLanguage } from '@/lib/db/types';

export interface ConversationsSyncResult {
  success: boolean;
  tenantId?: string;
  conversationsSynced?: number;
  messagesSynced?: number;
  lastSuccessfulSync?: string;
  error?: string;
}

/**
 * Server-only Instagram Conversations & Messages synchronization service.
 */
export async function syncInstagramConversations(tenantId: string): Promise<ConversationsSyncResult> {
  if (!tenantId) {
    return { success: false, error: 'Tenant ID is required.' };
  }

  try {
    const connections = await db.getConnections(tenantId);
    const igConnection = connections.find(c => c.platform === 'instagram' && c.is_active);

    if (!igConnection) {
      return {
        success: false,
        tenantId,
        error: 'No active Instagram connection found for this tenant.',
      };
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(igConnection.access_token_encrypted);
      if (!accessToken) throw new Error('Empty token');
    } catch {
      return {
        success: false,
        tenantId,
        error: 'Failed to decrypt Instagram access token.',
      };
    }

    const apiVersion = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v20.0';
    let conversationsSynced = 0;
    let messagesSynced = 0;
    const now = new Date().toISOString();

    const url = `https://graph.instagram.com/${apiVersion}/me/conversations?fields=id,updated_time,participants,messages{id,created_time,from,to,message}&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data.error?.message || `Graph API request failed with status ${res.status}`;
      return {
        success: false,
        tenantId,
        error: `Instagram API Error: ${errorMsg}`,
      };
    }

    const rawConversations = data.data || [];

    for (const conv of rawConversations) {
      const participants = conv.participants?.data || [];
      const customerPart = participants.find((p: any) => p.id !== igConnection.account_id) || participants[0] || {};
      const customerName = customerPart.username || 'ig_user';

      // 1. Upsert Conversation
      const convRecord: Partial<Conversation> = {
        tenant_id: tenantId,
        platform: 'instagram',
        external_id: String(conv.id),
        customer_id: String(customerPart.id || conv.id),
        customer_name: customerName,
        customer_language: 'ar' as CustomerLanguage,
        status: 'open',
        human_takeover: false,
        auto_reply_enabled: true,
        last_message_at: conv.updated_time ? new Date(conv.updated_time).toISOString() : now,
        created_at: conv.updated_time ? new Date(conv.updated_time).toISOString() : now,
      };

      const savedConv = await db.upsertConversation(convRecord);
      conversationsSynced++;

      const convDbId = savedConv?.id || `conv_${conv.id}`;

      // 2. Upsert Messages
      const rawMessages = conv.messages?.data || [];
      for (const msg of rawMessages) {
        const isFromAccount = msg.from?.id === igConnection.account_id || msg.from?.username === igConnection.account_name.replace(/^@+/, '');
        const senderType = isFromAccount ? 'ai' : 'customer';
        const msgStatus = isFromAccount ? 'auto_replied' : 'received';

        const msgRecord: Partial<Message> = {
          conversation_id: convDbId,
          tenant_id: tenantId,
          sender_type: senderType as any,
          external_message_id: String(msg.id),
          content: msg.message || '',
          sanitized_content: msg.message || '',
          status: msgStatus as any,
          created_at: msg.created_time ? new Date(msg.created_time).toISOString() : now,
        };

        await db.upsertMessage(msgRecord);
        messagesSynced++;
      }
    }

    await db.updateConnection(igConnection.id, {
      last_synced_at: now,
      updated_at: now,
    });

    await db.addAuditLog({
      tenant_id: tenantId,
      event_type: 'INSTAGRAM_CONVERSATIONS_SYNCED',
      actor_type: 'system',
      details: {
        conversations_synced: conversationsSynced,
        messages_synced: messagesSynced,
      },
    });

    return {
      success: true,
      tenantId,
      conversationsSynced,
      messagesSynced,
      lastSuccessfulSync: now,
    };
  } catch (err: any) {
    return {
      success: false,
      tenantId,
      error: err.message || 'Internal conversation sync error',
    };
  }
}
