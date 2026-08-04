import crypto from 'crypto';

/**
 * Validates Meta (Instagram) webhook signature (`sha256=<signature>`)
 * against raw payload and Meta App Secret.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedSignature = parts[1];
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(rawBody);
  const calculatedSignature = hmac.digest('hex');

  // Constant time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(calculatedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Validates Meta Webhook Challenge (`hub.verify_token` matching configured verify token)
 */
export function verifyMetaWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expectedVerifyToken: string
): { success: boolean; challenge?: string } {
  if (mode === 'subscribe' && token === expectedVerifyToken && challenge) {
    return { success: true, challenge };
  }
  return { success: false };
}

/**
 * Input Sanitizer to neutralize prompt injection attacks and strip dangerous controls
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';

  return input
    .trim()
    // Neutralize prompt override keyphrases
    .replace(/(system prompt|ignore previous instructions|reveal secret|show token|act as|override rules)/gi, '[FILTERED]')
    // Remove control characters except standard whitespace
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
