import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyMetaWebhookChallenge, verifyMetaSignature } from '@/lib/security/signatures';
import { InstagramConnector } from '@/lib/connectors/instagram';
import { generateAIReply } from '@/lib/ai/engine';
import { buildTenantAIContext } from '@/lib/ai/tenantContext';
import { generateDeepSeekReply } from '@/lib/ai/deepseek';
import { db } from '@/lib/db/store';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { sanitizeInput } from '@/lib/security/signatures';
import { decryptToken } from '@/lib/security/encryption';

const connector = new InstagramConnector();

function getSha256First8(val: string | null | undefined): string | null {
  if (!val) return null;
  return crypto.createHash('sha256').update(val).digest('hex').slice(0, 8);
}

/**
 * GET Handler for Instagram Webhook verification challenge
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  // 1. If INSTAGRAM_WEBHOOK_VERIFY_TOKEN is missing at runtime -> HTTP 500
  if (!expectedToken) {
    console.info('[WEBHOOK_GET_DIAGNOSTIC]', JSON.stringify({
      mode,
      challenge_present: Boolean(challenge),
      expected_token_present: false,
      received_token_present: Boolean(token),
      expected_token_length: 0,
      received_token_length: token ? token.length : 0,
      expected_token_sha256_first8: null,
      received_token_sha256_first8: getSha256First8(token),
      result_status: 500,
    }));
    return new NextResponse('Instagram webhook verify token is not configured', { status: 500 });
  }

  // 2. If required query params are missing -> HTTP 400
  if (!mode || !token || !challenge) {
    console.info('[WEBHOOK_GET_DIAGNOSTIC]', JSON.stringify({
      mode,
      challenge_present: Boolean(challenge),
      expected_token_present: true,
      received_token_present: Boolean(token),
      expected_token_length: expectedToken.length,
      received_token_length: token ? token.length : 0,
      expected_token_sha256_first8: getSha256First8(expectedToken),
      received_token_sha256_first8: getSha256First8(token),
      result_status: 400,
    }));
    return new NextResponse('Bad Request: Missing required query parameters', { status: 400 });
  }

  // 3. Verify challenge against expected token
  const verification = verifyMetaWebhookChallenge(mode, token, challenge, expectedToken);

  if (verification.success && verification.challenge) {
    console.info('[WEBHOOK_GET_DIAGNOSTIC]', JSON.stringify({
      mode,
      challenge_present: true,
      expected_token_present: true,
      received_token_present: true,
      expected_token_length: expectedToken.length,
      received_token_length: token.length,
      expected_token_sha256_first8: getSha256First8(expectedToken),
      received_token_sha256_first8: getSha256First8(token),
      result_status: 200,
    }));

    await db.addAuditLog({
      event_type: 'WEBHOOK_CHALLENGE_VERIFIED',
      actor_type: 'webhook',
      details: { platform: 'instagram', mode, timestamp: new Date().toISOString() },
    });
    return new NextResponse(verification.challenge, { status: 200 });
  }

  // 4. Token or mode mismatch -> HTTP 403
  console.info('[WEBHOOK_GET_DIAGNOSTIC]', JSON.stringify({
    mode,
    challenge_present: true,
    expected_token_present: true,
    received_token_present: true,
    expected_token_length: expectedToken.length,
    received_token_length: token.length,
    expected_token_sha256_first8: getSha256First8(expectedToken),
    received_token_sha256_first8: getSha256First8(token),
    result_status: 403,
  }));
  return new NextResponse('Forbidden: Invalid verify token', { status: 403 });
}

/**
 * POST Handler for Instagram Message & Comment Webhooks
 */
export async function POST(req: NextRequest) {
  try {
    const arrayBuffer = await req.arrayBuffer();
    const rawBodyBuffer = Buffer.from(arrayBuffer);
    const rawBodyText = rawBodyBuffer.toString('utf8');
    const signature = req.headers.get('x-hub-signature-256');

    // 1. Validate HMAC signature in production or whenever INSTAGRAM_APP_SECRET is set
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (appSecret || process.env.NODE_ENV === 'production') {
      const textIsValid = connector.verifySignature(rawBodyText, signature);
      if (!textIsValid) {
        await db.addAuditLog({
          event_type: 'WEBHOOK_INVALID_SIGNATURE',
          actor_type: 'webhook',
          details: { platform: 'instagram', signatureHeader: signature },
        });
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBodyText);
    } catch {
      // payload parsed empty or invalid
    }

    const events = connector.parseWebhookPayload(payload);
    const allConnections = await db.getConnections();
    const igConnections = allConnections.filter(c => c.platform === 'instagram' && c.is_active);

    const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || 'production';

    console.info('[WEBHOOK_POST_DIAGNOSTIC]', JSON.stringify({
      commit_sha: commitSha,
      webhook_object_type: payload?.object || 'unknown',
      events_count: events.length,
      active_connections_count: igConnections.length,
    }));

    if (igConnections.length === 0) {
      console.warn('Rejected webhook: No active Instagram platform connection found.');
      return NextResponse.json({ error: 'Disconnected or unknown platform account' }, { status: 403 });
    }

    for (const event of events) {
      const recipientAccountId = event.recipientId || event.rawPayload?.recipient?.id || event.rawPayload?.media?.owner?.id;

      // Find exact tenant connection matching account_id, or default to igConnections[0] if single connection exists
      const targetConn = (recipientAccountId ? igConnections.find(c => c.account_id === recipientAccountId) : undefined) ||
        (igConnections.length === 1 ? igConnections[0] : undefined);

      if (!targetConn) {
        console.info('[WEBHOOK_EVENT_DIAGNOSTIC]', JSON.stringify({
          webhook_object_type: payload?.object || 'unknown',
          event_field_type: event.eventType,
          entry_account_id: recipientAccountId || 'unknown',
          sender_id_present: Boolean(event.senderId),
          recipient_id_present: Boolean(event.recipientId),
          connection_found: false,
          tenant_id_present: false,
          conversation_created: false,
          message_inserted: false,
          ignored_reason: 'No matching active platform connection found for account ID',
        }));
        continue;
      }

      // Prevent bot from replying to its own outgoing messages (message echoes)
      if (event.senderId === targetConn.account_id) {
        console.info('[WEBHOOK_EVENT_DIAGNOSTIC]', JSON.stringify({
          webhook_object_type: payload?.object || 'unknown',
          event_field_type: event.eventType,
          entry_account_id: recipientAccountId || targetConn.account_id,
          sender_id_present: Boolean(event.senderId),
          recipient_id_present: Boolean(event.recipientId),
          connection_found: true,
          tenant_id_present: Boolean(targetConn.tenant_id),
          conversation_created: false,
          message_inserted: false,
          ignored_reason: 'Self-generated outgoing message echo from bot account',
        }));
        continue;
      }

      const authoritativeTenantId = targetConn.tenant_id;
      let decryptedToken: string | null = null;
      let tokenDecryptionSucceeded = false;

      try {
        decryptedToken = decryptToken(targetConn.access_token_encrypted);
        tokenDecryptionSucceeded = Boolean(decryptedToken);
      } catch (err: any) {
        tokenDecryptionSucceeded = false;
      }

      // Concrete Database-level Webhook Idempotency Check
      const backend = getBackendSupabaseClient();
      const { error: idempotencyErr } = await backend
        .from('processed_webhook_events')
        .insert({
          tenant_id: authoritativeTenantId,
          platform: 'instagram',
          event_id: event.externalId,
        });

      const keySource = event.externalId.startsWith('ig_msg_') || event.externalId.startsWith('ig_cmt_')
        ? 'generated_unique_key'
        : 'meta_mid';

      const isDuplicateByEvent = Boolean(idempotencyErr && (idempotencyErr.code === '23505' || idempotencyErr.message?.includes('unique constraint')));

      console.info('[IDEMPOTENCY_DIAGNOSTIC]', JSON.stringify({
        sender_id_present: Boolean(event.senderId),
        message_mid_present: keySource === 'meta_mid',
        generated_idempotency_key_source: keySource,
        event_id: event.externalId,
        duplicate_detected: isDuplicateByEvent,
        duplicate_reason: isDuplicateByEvent ? 'Duplicate event_id skipped by processed_webhook_events table' : null,
      }));

      if (isDuplicateByEvent) {
        console.info('[WEBHOOK_EVENT_DIAGNOSTIC]', JSON.stringify({
          webhook_object_type: payload?.object || 'unknown',
          event_field_type: event.eventType,
          entry_account_id: recipientAccountId || targetConn.account_id,
          sender_id_present: Boolean(event.senderId),
          recipient_id_present: Boolean(event.recipientId),
          connection_found: true,
          tenant_id_present: Boolean(authoritativeTenantId),
          conversation_created: false,
          message_inserted: false,
          ignored_reason: 'Duplicate event_id skipped by idempotency check',
        }));
        continue;
      }

      const kb = await db.getKnowledgeBase(authoritativeTenantId);
      const menu = await db.getMenu(authoritativeTenantId);
      const rules = await db.getAutomationRules(authoritativeTenantId);
      const sanitizedText = sanitizeInput(event.content);

      if (event.eventType === 'message') {
        const conversations = await db.getConversations(authoritativeTenantId);

        let existingMessages: any[] = [];
        let conv = conversations.find(c => c.external_id === event.senderId || c.customer_id === event.senderId) || null;
        const conversationLookupFound = Boolean(conv);
        let conversationCreateAttempted = false;
        let conversationCreateSucceeded = false;
        let convCreateError: string | null = null;

        if (conv) {
          existingMessages = await db.getMessages(conv.id);
          const alreadyProcessed = existingMessages.some(m => m.external_message_id === event.externalId);
          if (alreadyProcessed) {
            console.info('[IDEMPOTENCY_DIAGNOSTIC]', JSON.stringify({
              sender_id_present: Boolean(event.senderId),
              message_mid_present: keySource === 'meta_mid',
              generated_idempotency_key_source: keySource,
              event_id: event.externalId,
              duplicate_detected: true,
              duplicate_reason: 'Duplicate DM message ID already processed in messages table',
            }));

            console.info('[WEBHOOK_EVENT_DIAGNOSTIC]', JSON.stringify({
              webhook_object_type: payload?.object || 'unknown',
              event_field_type: event.eventType,
              entry_account_id: recipientAccountId || targetConn.account_id,
              sender_id_present: Boolean(event.senderId),
              recipient_id_present: Boolean(event.recipientId),
              connection_found: true,
              tenant_id_present: Boolean(authoritativeTenantId),
              conversation_created: false,
              message_inserted: false,
              ignored_reason: 'Duplicate DM message ID already processed',
            }));
            continue;
          }
        } else {
          conversationCreateAttempted = true;
          try {
            // Persist new conversation to Supabase DB so Foreign Key constraints succeed
            conv = await db.createConversation({
              id: crypto.randomUUID(),
              tenant_id: authoritativeTenantId,
              platform: 'instagram',
              channel_type: 'dm',
              external_id: event.senderId,
              customer_id: event.senderId,
              customer_name: event.senderName,
              customer_language: 'nl',
              status: 'open',
              human_takeover: false,
              auto_reply_enabled: true,
              last_message_at: new Date().toISOString(),
            });
            conversationCreateSucceeded = Boolean(conv);
          } catch (err: any) {
            convCreateError = err?.message ? err.message.slice(0, 100) : 'createConversation_failed';
            conversationCreateSucceeded = false;
          }
        }

        // Verify conversation row actually exists in Supabase DB before inserting message
        const convExistsInDb = conv ? await db.verifyConversationExists(conv.id, authoritativeTenantId) : false;

        if (!conv || !convExistsInDb) {
          console.error('[CONVERSATION_PERSISTENCE_DIAGNOSTIC]', JSON.stringify({
            conversation_lookup_found: conversationLookupFound,
            conversation_create_attempted: conversationCreateAttempted,
            conversation_create_succeeded: conversationCreateSucceeded,
            conversation_id_present: Boolean(conv?.id),
            conversation_exists_in_db_before_message_insert: false,
            customer_message_inserted: false,
            bot_message_inserted: false,
            db_error_code: 'MISSING_CONVERSATION_DB_ROW',
            db_constraint: 'messages_conversation_id_fkey',
          }));
          continue;
        }

        // Add incoming customer message under authoritative tenant
        let insertedMsg: any = null;
        let msgInsertError: string | null = null;
        try {
          insertedMsg = await db.addMessage({
            conversation_id: conv.id,
            tenant_id: authoritativeTenantId,
            sender_type: 'customer',
            external_message_id: event.externalId,
            content: event.content,
            sanitized_content: sanitizedText,
            status: 'received',
          });
        } catch (err: any) {
          msgInsertError = err?.message ? err.message.slice(0, 100) : 'addMessage_failed';
        }

        console.info('[MESSAGE_ID_DIAGNOSTIC]', JSON.stringify({
          meta_mid_present: keySource === 'meta_mid',
          external_message_id_source: keySource === 'meta_mid' ? 'message.mid' : 'deterministic_fallback',
          external_message_id_matches_entry_id: String(event.externalId) === String(recipientAccountId || targetConn.account_id),
        }));

        console.info('[CONVERSATION_PERSISTENCE_DIAGNOSTIC]', JSON.stringify({
          conversation_lookup_found: conversationLookupFound,
          conversation_create_attempted: conversationCreateAttempted,
          conversation_create_succeeded: conversationCreateSucceeded,
          conversation_id_present: Boolean(conv.id),
          conversation_exists_in_db_before_message_insert: true,
          customer_message_inserted: Boolean(insertedMsg),
          bot_message_inserted: false,
          db_error_code: insertedMsg ? null : 'CUSTOMER_MESSAGE_INSERT_FAILED',
          db_constraint: insertedMsg ? null : 'messages_conversation_id_fkey',
        }));

        console.info('[WEBHOOK_EVENT_DIAGNOSTIC]', JSON.stringify({
          webhook_object_type: payload?.object || 'unknown',
          event_field_type: event.eventType,
          entry_account_id: recipientAccountId || targetConn.account_id,
          sender_id_present: Boolean(event.senderId),
          recipient_id_present: Boolean(event.recipientId),
          connection_found: true,
          tenant_id_present: Boolean(authoritativeTenantId),
          conversation_created: Boolean(conv),
          message_inserted: Boolean(insertedMsg),
          ignored_reason: null,
        }));

        // Process Instagram Direct Messages using Fixed DM Reply Architecture
        // Reset legacy automated takeover state if not explicitly set by a human operator
        if (conv.human_takeover && !conv.is_manual_takeover) {
          await db.updateConversation(conv.id, {
            human_takeover: false,
            is_manual_takeover: false,
            status: 'open',
          });
          conv.human_takeover = false;
          conv.is_manual_takeover = false;
        }

        const aiSettings = await db.getAISettings(authoritativeTenantId);
        const isAiMasterOn = aiSettings.ai_enabled === true;
        const isAiEnabledForDm = Boolean(isAiMasterOn && conv.auto_reply_enabled && aiSettings.reply_to_dms);
        
        const staticDmEnabled = rules.static_dm_enabled !== undefined && rules.static_dm_enabled !== null 
          ? Boolean(rules.static_dm_enabled) 
          : Boolean(rules.default_dm_reply && rules.default_dm_reply.trim().length > 0);

        const fixedDmReply = (rules.default_dm_reply && rules.default_dm_reply.trim().length > 0) 
          ? rules.default_dm_reply.trim() 
          : null;

        let replyContentToSend: string | null = null;
        let replySourceType: string = 'fixed_dm_reply';

        if (!conv.human_takeover) {
          if (isAiEnabledForDm) {
            try {
              const aiContext = await buildTenantAIContext({
                tenantId: authoritativeTenantId,
                customerMessage: event.content,
                conversationId: conv.id,
              });

              const deepSeekRes = await generateDeepSeekReply(aiContext.messages, {
                maxTokens: aiContext.maxTokens,
              });

              if (deepSeekRes.success && deepSeekRes.content) {
                replyContentToSend = deepSeekRes.content;
                replySourceType = 'deepseek_ai';
              } else {
                console.warn('[AI_REPLY_FALLBACK]', `DeepSeek generation failed: ${deepSeekRes.error}. Checking static DM fallback.`);
                await db.addAuditLog({
                  tenant_id: authoritativeTenantId,
                  event_type: 'AI_AUTO_REPLY_FALLBACK',
                  actor_type: 'ai',
                  details: { conversation_id: conv.id, reason: deepSeekRes.error || 'DeepSeek generation failed' },
                });
                if (staticDmEnabled && fixedDmReply) {
                  replyContentToSend = fixedDmReply;
                  replySourceType = 'fixed_dm_reply';
                }
              }
            } catch (err: any) {
              console.error('[AI_REPLY_EXCEPTION]', err);
              if (staticDmEnabled && fixedDmReply) {
                replyContentToSend = fixedDmReply;
                replySourceType = 'fixed_dm_reply';
              }
            }
          } else if (conv.auto_reply_enabled && staticDmEnabled && fixedDmReply) {
            replyContentToSend = fixedDmReply;
            replySourceType = 'fixed_dm_reply';
          }
        }

        let blockedReason: string | null = null;
        if (conv.human_takeover) {
          blockedReason = 'Human takeover active on conversation';
        } else if (!conv.auto_reply_enabled) {
          blockedReason = 'DM auto-reply disabled on conversation';
        } else if (!replyContentToSend) {
          blockedReason = 'No reply content available';
        }

        const autoSendEligible = !conv.human_takeover && Boolean(replyContentToSend);

        console.info('[DM_AUTO_REPLY_DIAGNOSTIC]', JSON.stringify({
          incoming_dm: true,
          customer_message_inserted: Boolean(insertedMsg),
          dm_auto_reply_enabled: isAiEnabledForDm,
          fixed_reply_configured: Boolean(fixedDmReply),
          ai_reply_generated: replySourceType === 'deepseek_ai',
          auto_send_eligible: autoSendEligible,
          blocked_reason: blockedReason,
        }));

        if (autoSendEligible && replyContentToSend) {
          if (!tokenDecryptionSucceeded || !decryptedToken) {
            console.info('[INSTAGRAM_SEND_DIAGNOSTIC]', JSON.stringify({
              connection_found: true,
              tenant_id_present: Boolean(authoritativeTenantId),
              encrypted_token_present: Boolean(targetConn.access_token_encrypted),
              token_decryption_succeeded: false,
              recipient_id_present: Boolean(conv.external_id),
              recipient_id_source: 'conv.external_id',
              send_attempted: false,
              meta_http_status: null,
              meta_success: false,
              meta_error_code: null,
              meta_error_type: null,
              ignored_reason: 'Token decryption failed',
            }));

            await db.updateConversation(conv.id, { 
              status: 'needs_human_review',
              human_takeover: true,
            });

            await db.addAuditLog({
              tenant_id: authoritativeTenantId,
              event_type: 'AI_AUTO_REPLY_FAILED',
              actor_type: 'ai',
              details: { conversation_id: conv.id, error: 'Token decryption failed' },
            });
            continue;
          }

          // Attempt outgoing message through Instagram Graph API with decrypted token
          const sendResult = await connector.sendDirectMessage({
            recipientId: conv.external_id,
            content: replyContentToSend,
            accessToken: decryptedToken,
          });

          console.info('[INSTAGRAM_SEND_DIAGNOSTIC]', JSON.stringify({
            connection_found: true,
            tenant_id_present: Boolean(authoritativeTenantId),
            encrypted_token_present: true,
            token_decryption_succeeded: true,
            recipient_id_present: Boolean(conv.external_id),
            recipient_id_source: 'conv.external_id',
            send_attempted: true,
            meta_http_status: sendResult.httpStatus || (sendResult.success ? 200 : 500),
            meta_success: sendResult.success,
            meta_error_code: sendResult.errorCode || null,
            meta_error_type: sendResult.errorType || null,
            meta_error_subcode: sendResult.errorSubcode || null,
            meta_error_message: sendResult.error ? sendResult.error.slice(0, 150) : null,
          }));

          if (sendResult.success) {
            await db.addMessage({
              conversation_id: conv.id,
              tenant_id: authoritativeTenantId,
              sender_type: 'ai',
              external_message_id: sendResult.messageId,
              content: replyContentToSend,
              sanitized_content: replyContentToSend,
              ai_confidence: 1.0,
              status: 'auto_replied',
            });

            await db.updateConversation(conv.id, {
              status: 'open',
              last_message_at: new Date().toISOString(),
            });

            await db.addAuditLog({
              tenant_id: authoritativeTenantId,
              event_type: 'AI_AUTO_REPLY_SENT',
              actor_type: 'ai',
              details: { conversation_id: conv.id, type: replySourceType },
            });
          } else {
            // Outbound send failed: record audit log
            await db.addAuditLog({
              tenant_id: authoritativeTenantId,
              event_type: 'AI_AUTO_REPLY_FAILED',
              actor_type: 'ai',
              details: { conversation_id: conv.id, error: sendResult.error || 'Instagram API request failed' },
            });
          }
        }
      } else if (event.eventType === 'comment') {
        const existingComments = await db.getComments(authoritativeTenantId);
        const alreadyProcessed = existingComments.some(c => c.external_comment_id === event.externalId);
        if (alreadyProcessed) {
          console.info('[WEBHOOK_EVENT_DIAGNOSTIC]', JSON.stringify({
            webhook_object_type: payload?.object || 'unknown',
            event_field_type: event.eventType,
            entry_account_id: recipientAccountId || targetConn.account_id,
            sender_id_present: Boolean(event.senderId),
            recipient_id_present: Boolean(event.recipientId),
            connection_found: true,
            tenant_id_present: Boolean(authoritativeTenantId),
            conversation_created: false,
            message_inserted: false,
            ignored_reason: 'Duplicate comment ID already processed',
          }));
          continue;
        }

        const aiSettings = await db.getAISettings(authoritativeTenantId);
        const isAiMasterOn = aiSettings.ai_enabled === true;
        const isAiEnabledForComments = Boolean(isAiMasterOn && aiSettings.reply_to_comments);

        const fixedCommentReply = (rules.default_comment_reply && rules.default_comment_reply.trim().length > 0) 
          ? rules.default_comment_reply.trim() 
          : ((rules.default_dm_reply && rules.default_dm_reply.trim().length > 0) ? rules.default_dm_reply.trim() : null);

        const staticCommentEnabled = rules.static_comment_enabled !== undefined && rules.static_comment_enabled !== null 
          ? Boolean(rules.static_comment_enabled) 
          : Boolean(fixedCommentReply);

        let isAutoReplied = false;
        let replyContent: string | undefined = undefined;
        let replySourceType: 'deepseek_ai' | 'fixed_comment_reply' | 'none' = 'none';
        let classification: any = 'neutral';

        if (isAiEnabledForComments) {
          try {
            const aiContext = await buildTenantAIContext({
              tenantId: authoritativeTenantId,
              customerMessage: event.content,
            });

            const deepSeekRes = await generateDeepSeekReply(aiContext.messages, {
              maxTokens: aiContext.maxTokens,
            });

            if (deepSeekRes.success && deepSeekRes.content) {
              replyContent = deepSeekRes.content;
              classification = 'question';
              replySourceType = 'deepseek_ai';
            } else {
              console.warn('[COMMENT_AI_FALLBACK_WARN]', `DeepSeek generation failed: ${deepSeekRes.error}. Checking static Comment fallback.`);
              await db.addAuditLog({
                tenant_id: authoritativeTenantId,
                event_type: 'AI_AUTO_REPLY_FALLBACK',
                actor_type: 'ai',
                details: { comment_id: event.externalId, reason: deepSeekRes.error || 'DeepSeek generation failed' },
              });
              if (staticCommentEnabled && fixedCommentReply) {
                replyContent = fixedCommentReply;
                replySourceType = 'fixed_comment_reply';
              }
            }
          } catch (err: any) {
            console.warn('[COMMENT_AI_EXCEPTION]', err);
            await db.addAuditLog({
              tenant_id: authoritativeTenantId,
              event_type: 'AI_AUTO_REPLY_FALLBACK',
              actor_type: 'ai',
              details: { comment_id: event.externalId, reason: err?.message || 'AI Context exception' },
            });
            if (staticCommentEnabled && fixedCommentReply) {
              replyContent = fixedCommentReply;
              replySourceType = 'fixed_comment_reply';
            }
          }
        } else if (staticCommentEnabled && fixedCommentReply) {
          replyContent = fixedCommentReply;
          replySourceType = 'fixed_comment_reply';
        }

        let sendResult: any = null;
        if (decryptedToken && replyContent) {
          sendResult = await connector.sendCommentReply({
            commentId: event.externalId,
            content: replyContent,
            accessToken: decryptedToken,
          });

          if (sendResult.success) {
            isAutoReplied = true;
          }
        }

        console.info('[COMMENT_AUTO_REPLY_DIAGNOSTIC]', JSON.stringify({
          incoming_comment: true,
          ai_master_on: isAiMasterOn,
          reply_to_comments: aiSettings.reply_to_comments,
          is_ai_enabled_for_comments: isAiEnabledForComments,
          static_comment_enabled: staticCommentEnabled,
          fixed_reply_configured: Boolean(fixedCommentReply),
          ai_reply_generated: replySourceType === 'deepseek_ai',
          reply_source_type: replySourceType,
          send_attempted: Boolean(sendResult),
          send_success: isAutoReplied,
          send_error: sendResult?.error || null,
        }));

        await db.addComment({
          tenant_id: authoritativeTenantId,
          platform: 'instagram',
          external_comment_id: event.externalId,
          media_id: event.mediaId || 'media_unknown',
          media_type: 'post',
          author_username: event.senderName,
          content: event.content,
          classification,
          auto_replied: isAutoReplied,
          reply_content: isAutoReplied ? replyContent : undefined,
          is_hidden: classification === 'spam' && rules.hide_spam,
        });

        console.info('[WEBHOOK_EVENT_DIAGNOSTIC]', JSON.stringify({
          webhook_object_type: payload?.object || 'unknown',
          event_field_type: event.eventType,
          entry_account_id: recipientAccountId || targetConn.account_id,
          sender_id_present: Boolean(event.senderId),
          recipient_id_present: Boolean(event.recipientId),
          connection_found: true,
          tenant_id_present: Boolean(authoritativeTenantId),
          conversation_created: false,
          message_inserted: false,
          ignored_reason: null,
        }));

        await db.addAuditLog({
          tenant_id: authoritativeTenantId,
          event_type: 'COMMENT_PROCESSED',
          actor_type: 'webhook',
          details: { comment_id: event.externalId, classification, auto_replied: isAutoReplied },
        });
      }
    }

    return NextResponse.json({ success: true, processedEvents: events.length }, { status: 200 });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
