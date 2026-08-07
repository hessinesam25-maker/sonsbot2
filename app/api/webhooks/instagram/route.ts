import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyMetaWebhookChallenge } from '@/lib/security/signatures';
import { InstagramConnector } from '@/lib/connectors/instagram';
import { generateAIReply } from '@/lib/ai/engine';
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
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    // 1. Validate HMAC signature in production or whenever INSTAGRAM_APP_SECRET is set
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (appSecret || process.env.NODE_ENV === 'production') {
      const isValid = connector.verifySignature(rawBody, signature);
      if (!isValid) {
        await db.addAuditLog({
          event_type: 'WEBHOOK_INVALID_SIGNATURE',
          actor_type: 'webhook',
          details: { platform: 'instagram', signatureHeader: signature },
        });
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const events = connector.parseWebhookPayload(payload);

    const allConnections = await db.getConnections();
    const igConnections = allConnections.filter(c => c.platform === 'instagram' && c.is_active);

    if (igConnections.length === 0) {
      console.warn('Rejected webhook: No active Instagram platform connection found.');
      return NextResponse.json({ error: 'Disconnected or unknown platform account' }, { status: 403 });
    }

    for (const event of events) {
      // Find exact tenant connection matching the Instagram account recipient or entry ID
      const targetConn = igConnections.find(c => c.account_id === (event.rawPayload?.recipient?.id || event.rawPayload?.media?.owner?.id)) || igConnections[0];

      if (!targetConn) {
        console.warn(`No matching platform connection for Instagram event from ${event.senderId}`);
        continue;
      }

      // Prevent bot from replying to its own outgoing messages (message echoes)
      if (event.senderId === targetConn.account_id) {
        continue;
      }

      const authoritativeTenantId = targetConn.tenant_id;
      const decryptedToken = decryptToken(targetConn.access_token_encrypted);

      // Concrete Database-level Webhook Idempotency Check
      const backend = getBackendSupabaseClient();
      const { error: idempotencyErr } = await backend
        .from('processed_webhook_events')
        .insert({
          tenant_id: authoritativeTenantId,
          platform: 'instagram',
          event_id: event.externalId,
        });

      if (idempotencyErr && (idempotencyErr.code === '23505' || idempotencyErr.message?.includes('unique constraint'))) {
        console.log(`[Idempotency] Skipping duplicate webhook event: ${event.externalId} for tenant: ${authoritativeTenantId}`);
        continue;
      }

      const kb = await db.getKnowledgeBase(authoritativeTenantId);
      const menu = await db.getMenu(authoritativeTenantId);
      const rules = await db.getAutomationRules(authoritativeTenantId);
      const sanitizedText = sanitizeInput(event.content);

      if (event.eventType === 'message') {
        let conversations = await db.getConversations(authoritativeTenantId);

        let existingMessages = [];
        let conv = conversations.find(c => c.external_id === event.senderId || c.customer_id === event.senderId);
        if (conv) {
          existingMessages = await db.getMessages(conv.id);
          const alreadyProcessed = existingMessages.some(m => m.external_message_id === event.externalId);
          if (alreadyProcessed) {
            console.log(`Skipping duplicate webhook DM event: ${event.externalId}`);
            continue;
          }
        } else {
          conv = {
            id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
            created_at: new Date().toISOString(),
          };
        }

        // Add incoming customer message under authoritative tenant
        await db.addMessage({
          conversation_id: conv.id,
          tenant_id: authoritativeTenantId,
          sender_type: 'customer',
          external_message_id: event.externalId,
          content: event.content,
          sanitized_content: sanitizedText,
          status: 'received',
        });

        // Run AI Engine if Human Takeover is disabled & Auto-reply is enabled
        if (!conv.human_takeover && conv.auto_reply_enabled) {
          const aiResponse = generateAIReply(sanitizedText, 'dm', kb, menu, rules);

          await db.updateConversation(conv.id, { customer_language: aiResponse.detectedLanguage });

          if (aiResponse.requiresHumanReview || !aiResponse.isSafeForAutoReply) {
            await db.updateConversation(conv.id, { 
              status: 'needs_human_review',
              human_takeover: true,
            });

            await db.addMessage({
              conversation_id: conv.id,
              tenant_id: authoritativeTenantId,
              sender_type: 'ai',
              content: aiResponse.suggestedReply,
              sanitized_content: aiResponse.suggestedReply,
              ai_confidence: aiResponse.confidenceScore,
              ai_suggested_reply: aiResponse.suggestedReply,
              status: 'flagged_for_review',
            });

            await db.addAuditLog({
              tenant_id: authoritativeTenantId,
              event_type: 'CONVERSATION_FLAGGED_HUMAN_REVIEW',
              actor_type: 'ai',
              details: { conversation_id: conv.id, reason: aiResponse.reason, confidence: aiResponse.confidenceScore },
            });
          } else {
            // Attempt outgoing message through Instagram Graph API with decrypted token
            const sendResult = await connector.sendDirectMessage({
              recipientId: conv.external_id,
              content: aiResponse.suggestedReply,
              accessToken: decryptedToken,
            });

            if (sendResult.success) {
              await db.addMessage({
                conversation_id: conv.id,
                tenant_id: authoritativeTenantId,
                sender_type: 'ai',
                external_message_id: sendResult.messageId,
                content: aiResponse.suggestedReply,
                sanitized_content: aiResponse.suggestedReply,
                ai_confidence: aiResponse.confidenceScore,
                status: 'auto_replied',
              });

              await db.addAuditLog({
                tenant_id: authoritativeTenantId,
                event_type: 'AI_AUTO_REPLY_SENT',
                actor_type: 'ai',
                details: { conversation_id: conv.id, language: aiResponse.detectedLanguage, confidence: aiResponse.confidenceScore },
              });
            } else {
              await db.updateConversation(conv.id, { 
                status: 'needs_human_review',
                human_takeover: true,
              });

              await db.addMessage({
                conversation_id: conv.id,
                tenant_id: authoritativeTenantId,
                sender_type: 'ai',
                content: aiResponse.suggestedReply,
                sanitized_content: aiResponse.suggestedReply,
                ai_confidence: aiResponse.confidenceScore,
                status: 'flagged_for_review',
              });

              await db.addAuditLog({
                tenant_id: authoritativeTenantId,
                event_type: 'AI_AUTO_REPLY_FAILED',
                actor_type: 'ai',
                details: { conversation_id: conv.id, error: sendResult.error || 'Instagram API request failed' },
              });
            }
          }
        }
      } else if (event.eventType === 'comment') {
        const existingComments = await db.getComments(authoritativeTenantId);
        const alreadyProcessed = existingComments.some(c => c.external_comment_id === event.externalId);
        if (alreadyProcessed) {
          console.log(`Skipping duplicate webhook comment event: ${event.externalId}`);
          continue;
        }

        const aiResponse = generateAIReply(sanitizedText, 'comment', kb, menu, rules);
        let isAutoReplied = false;
        let replyContent = aiResponse.suggestedReply;

        if (aiResponse.isSafeForAutoReply && !aiResponse.requiresHumanReview) {
          const sendResult = await connector.sendCommentReply({
            commentId: event.externalId,
            content: replyContent,
            accessToken: decryptedToken,
          });

          if (sendResult.success) {
            isAutoReplied = true;
          }
        }

        await db.addComment({
          tenant_id: authoritativeTenantId,
          platform: 'instagram',
          external_comment_id: event.externalId,
          media_id: event.mediaId || 'media_unknown',
          media_type: 'post',
          author_username: event.senderName,
          content: event.content,
          classification: aiResponse.classification,
          auto_replied: isAutoReplied,
          reply_content: isAutoReplied ? replyContent : undefined,
          is_hidden: aiResponse.classification === 'spam' && rules.hide_spam,
        });

        await db.addAuditLog({
          tenant_id: authoritativeTenantId,
          event_type: 'COMMENT_PROCESSED',
          actor_type: 'webhook',
          details: { comment_id: event.externalId, classification: aiResponse.classification, auto_replied: isAutoReplied },
        });
      }
    }

    return NextResponse.json({ success: true, processedEvents: events.length }, { status: 200 });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
