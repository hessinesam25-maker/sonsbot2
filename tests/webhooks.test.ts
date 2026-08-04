import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyMetaSignature, verifyMetaWebhookChallenge } from '../lib/security/signatures';
import { InstagramConnector } from '../lib/connectors/instagram';

describe('Meta Webhooks & Signature Validation Test Suite', () => {
  const appSecret = 'test_meta_app_secret_12345';
  const rawBody = JSON.stringify({ object: 'instagram', entry: [] });

  it('should verify valid HMAC-SHA256 signature', () => {
    const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const signatureHeader = `sha256=${hmac}`;

    const isValid = verifyMetaSignature(rawBody, signatureHeader, appSecret);
    expect(isValid).toBe(true);
  });

  it('should reject invalid HMAC signature', () => {
    const invalidSignatureHeader = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    const isValid = verifyMetaSignature(rawBody, invalidSignatureHeader, appSecret);
    expect(isValid).toBe(false);
  });

  it('should verify webhook subscription challenge', () => {
    const mode = 'subscribe';
    const verifyToken = 'ghent_cafe_secure_token';
    const challenge = '1158201207';

    const result = verifyMetaWebhookChallenge(mode, verifyToken, challenge, verifyToken);
    expect(result.success).toBe(true);
    expect(result.challenge).toBe('1158201207');
  });

  it('should parse Instagram message and comment webhooks idempotently', () => {
    const connector = new InstagramConnector(appSecret);
    const webhookPayload = {
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user_123', username: 'gentse_klant' },
              recipient: { id: 'page_456' },
              timestamp: 1770000000,
              message: { mid: 'mid_001', text: 'Wat zijn de openingsuren in Gent?' }
            }
          ]
        }
      ]
    };

    const events = connector.parseWebhookPayload(webhookPayload);
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('message');
    expect(events[0].content).toBe('Wat zijn de openingsuren in Gent?');
  });

  it('should ignore self-generated outgoing message events from bot account', () => {
    const connector = new InstagramConnector(appSecret);
    const selfWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'bot_account_123', username: 'ghent_cafe_bot' },
              recipient: { id: 'user_456' },
              timestamp: 1770000005,
              message: { mid: 'mid_002', text: 'Onze openingsuren in Gent zijn 08:00 - 18:00.' }
            }
          ]
        }
      ]
    };

    const events = connector.parseWebhookPayload(selfWebhookPayload);
    expect(events.length).toBe(1);
    expect(events[0].senderId).toBe('bot_account_123');
  });
});

