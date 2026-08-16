import crypto from 'crypto';
import { db } from '../db/store';
import { AIDecisionTrace, TraceStage, TraceFailureCategory, TraceFinalOutcome, ChannelType } from '../db/types';

/**
 * Sanitizes error and diagnostic strings before persisting to ensure no
 * tokens, API keys, encryption secrets, or full payloads leak into traces.
 */
export function sanitizeTraceError(rawError: string | null | undefined): string | null {
  if (!rawError || typeof rawError !== 'string') return null;

  let sanitized = rawError
    // Strip Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    // Strip URL access tokens or keys
    .replace(/([?&](?:access_token|key|api_key|token)=)[^&\s]+/gi, '$1[REDACTED]')
    // Strip 32+ char hex strings (keys/secrets)
    .replace(/\b[0-9a-fA-F]{32,64}\b/g, '[REDACTED_SECRET]')
    // Strip basic authorization header values
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');

  // Limit length to 255 chars to prevent system prompt / payload leakage
  if (sanitized.length > 255) {
    sanitized = sanitized.slice(0, 252) + '...';
  }

  return sanitized.trim();
}

/**
 * Validates that a conversation belongs to the target tenant before linking.
 * Returns the conversationId if valid, or null to fail-closed.
 */
export async function validateTenantConversation(
  conversationId: string | null | undefined,
  tenantId: string,
  trusted: boolean = false
): Promise<string | null> {
  if (!conversationId || !tenantId) return null;
  if (trusted) return conversationId;
  try {
    const exists = await db.verifyConversationExists(conversationId, tenantId);
    return exists ? conversationId : null;
  } catch {
    return null;
  }
}

/**
 * Validates that a message belongs to the target tenant before linking.
 * Returns the messageId if valid, or null to fail-closed.
 */
export async function validateTenantMessage(
  messageId: string | null | undefined,
  tenantId: string,
  trusted: boolean = false
): Promise<string | null> {
  if (!messageId || !tenantId) return null;
  if (trusted) return messageId;
  try {
    const exists = await db.verifyMessageExists(messageId, tenantId);
    return exists ? messageId : null;
  } catch {
    return null;
  }
}

export interface CreateTraceParams {
  traceId?: string;
  tenantId: string;
  platform?: string;
  channelType?: ChannelType;
  externalEventId?: string | null;
  externalMessageId?: string | null;
  conversationId?: string | null;
  incomingMessageId?: string | null;
  processingStage?: TraceStage;
  finalOutcome?: TraceFinalOutcome | null;
  trustedReferences?: boolean;
}

/**
 * Creates an initial AI Decision Trace session for an incoming event.
 * Strictly scopes by tenant_id and validates internal foreign references.
 */
export async function createTraceSession(params: CreateTraceParams): Promise<AIDecisionTrace> {
  const traceId = params.traceId || crypto.randomUUID();
  const now = new Date().toISOString();
  const trusted = Boolean(params.trustedReferences);

  // Validate internal foreign references against target tenant
  const safeConversationId = await validateTenantConversation(params.conversationId, params.tenantId, trusted);
  const safeIncomingMessageId = await validateTenantMessage(params.incomingMessageId, params.tenantId, trusted);

  const initialTrace: Partial<AIDecisionTrace> = {
    id: crypto.randomUUID(),
    trace_id: traceId,
    tenant_id: params.tenantId,
    conversation_id: safeConversationId,
    incoming_message_id: safeIncomingMessageId,
    outgoing_message_id: null,
    external_outgoing_message_id: null,
    platform: params.platform || 'instagram',
    external_event_id: params.externalEventId || null,
    external_message_id: params.externalMessageId || null,
    channel_type: params.channelType || 'dm',
    processing_stage: params.processingStage || 'EVENT_PARSED',
    final_outcome: params.finalOutcome || null, // NULL while processing is active

    // V2 forward-compatible null fields
    detected_language: null,
    language_confidence: null,
    intent: null,
    normalized_question: null,
    needs_business_data: null,
    needs_conversation_context: null,
    risk_level: null,
    search_query: null,
    verification_status: null,

    retrieval_summary: null,
    retrieval_result_count: 0,

    ai_provider: 'deepseek',
    ai_model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    generation_attempted: false,
    generation_success: null,
    generation_latency_ms: null,
    tokens_prompt: null,
    tokens_completion: null,
    tokens_total: null,

    fallback_used: false,
    fallback_reason: null,
    fallback_type: null,

    meta_send_attempted: false,
    meta_send_success: null,
    meta_http_status: null,
    meta_error_code: null,
    meta_error_type: null,
    meta_error_subcode: null,

    failure_category: null,
    failure_reason: null,

    history_message_count: 0,
    total_latency_ms: 0,

    created_at: now,
    updated_at: now,
  };

  try {
    const created = await db.createAIDecisionTrace(initialTrace);
    return created || (initialTrace as AIDecisionTrace);
  } catch (err: any) {
    console.warn('[TRACE_CREATE_SESSION_WARN]', err?.message || err);
    return initialTrace as AIDecisionTrace;
  }
}

/**
 * Updates an ongoing trace session with new execution metadata.
 * Strictly scopes by tenant_id, validates foreign references, and sanitizes error reasons.
 */
export async function updateTraceSession(
  traceId: string,
  tenantId: string,
  updates: Partial<AIDecisionTrace>,
  options?: { trustedReferences?: boolean }
): Promise<AIDecisionTrace | null> {
  if (!traceId || !tenantId) return null;

  try {
    const sanitizedUpdates = { ...updates };
    const trusted = Boolean(options?.trustedReferences);

    if (sanitizedUpdates.failure_reason) {
      sanitizedUpdates.failure_reason = sanitizeTraceError(sanitizedUpdates.failure_reason);
    }
    if (sanitizedUpdates.fallback_reason) {
      sanitizedUpdates.fallback_reason = sanitizeTraceError(sanitizedUpdates.fallback_reason);
    }

    // Validate internal foreign references if provided in updates
    if (sanitizedUpdates.conversation_id !== undefined) {
      sanitizedUpdates.conversation_id = await validateTenantConversation(sanitizedUpdates.conversation_id, tenantId, trusted);
    }
    if (sanitizedUpdates.incoming_message_id !== undefined) {
      sanitizedUpdates.incoming_message_id = await validateTenantMessage(sanitizedUpdates.incoming_message_id, tenantId, trusted);
    }
    if (sanitizedUpdates.outgoing_message_id !== undefined) {
      sanitizedUpdates.outgoing_message_id = await validateTenantMessage(sanitizedUpdates.outgoing_message_id, tenantId, trusted);
    }

    return await db.updateAIDecisionTrace(traceId, sanitizedUpdates, tenantId);
  } catch (err: any) {
    console.warn('[TRACE_UPDATE_SESSION_WARN]', err?.message || err);
    return null;
  }
}

/**
 * Finds a trace by trace_id within a specific tenant.
 */
export async function getTraceById(traceId: string, tenantId: string): Promise<AIDecisionTrace | null> {
  if (!traceId || !tenantId) return null;
  return db.getAIDecisionTrace(traceId, tenantId);
}

/**
 * Finds all traces for a specific conversation within a tenant.
 */
export async function getTracesByConversationId(conversationId: string, tenantId: string): Promise<AIDecisionTrace[]> {
  if (!conversationId || !tenantId) return [];
  const traces = await db.getAIDecisionTraces(tenantId);
  return traces.filter(t => t.conversation_id === conversationId);
}

/**
 * Finds a trace by external_event_id within a tenant.
 */
export async function getTraceByEventId(externalEventId: string, tenantId: string): Promise<AIDecisionTrace | null> {
  if (!externalEventId || !tenantId) return null;
  const traces = await db.getAIDecisionTraces(tenantId);
  return traces.find(t => t.external_event_id === externalEventId) || null;
}

/**
 * Finds a trace by incoming_message_id within a tenant.
 */
export async function getTraceByIncomingMessageId(incomingMessageId: string, tenantId: string): Promise<AIDecisionTrace | null> {
  if (!incomingMessageId || !tenantId) return null;
  const traces = await db.getAIDecisionTraces(tenantId);
  return traces.find(t => t.incoming_message_id === incomingMessageId) || null;
}
