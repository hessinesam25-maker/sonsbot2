import { db } from '../db/store';
import { AISettings } from '../db/types';
import { retrieveRelevantTenantData, RetrievedContextData } from './retrieval';
import { buildTenantMessages, calculateMaxTokens } from './promptBuilder';
import { DeepSeekChatMessage } from './deepseek';

export interface TenantAIContextResult {
  tenantId: string;
  aiEnabled: boolean;
  settings: AISettings;
  retrievedData: RetrievedContextData;
  messages: DeepSeekChatMessage[];
  maxTokens: number;
}

/**
 * Server-only service responsible for building the AI context for a tenant.
 */
export async function buildTenantAIContext(params: {
  tenantId: string;
  customerMessage: string;
  conversationId?: string;
}): Promise<TenantAIContextResult> {
  const { tenantId, customerMessage, conversationId } = params;

  // 1. Load tenant AI Settings
  const settings = await db.getAISettings(tenantId);

  // 2. Load tenant Knowledge Base & Menu
  const kb = await db.getKnowledgeBase(tenantId);
  const menu = await db.getMenu(tenantId);

  // 3. Load recent conversation history (if conversationId provided)
  let conversationHistory: Array<{ sender: 'customer' | 'ai'; content: string }> = [];
  if (conversationId) {
    try {
      const rawMessages = await db.getMessages(conversationId);
      if (rawMessages && rawMessages.length > 0) {
        // Take last 6 messages excluding the current new incoming message
        conversationHistory = rawMessages
          .slice(-7, -1)
          .map(m => ({
            sender: m.sender_type === 'customer' ? 'customer' : 'ai',
            content: m.sanitized_content || m.content || '',
          }));
      }
    } catch (err) {
      console.warn('[AI_CONTEXT_CONVERSATION_LOAD_WARN]', err);
    }
  }

  // 4. Retrieve relevant KB facts and menu items
  const retrievedData = retrieveRelevantTenantData(customerMessage, kb, menu);

  // 5. Build structured prompt messages
  const messages = buildTenantMessages({
    settings,
    retrievedData,
    conversationHistory,
    currentMessage: customerMessage,
  });

  // 6. Output token limits based on reply_length setting
  const maxTokens = calculateMaxTokens(settings.reply_length);

  return {
    tenantId,
    aiEnabled: Boolean(settings.ai_enabled),
    settings,
    retrievedData,
    messages,
    maxTokens,
  };
}
