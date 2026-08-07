export interface WebhookEventPayload {
  platform: 'instagram' | 'tiktok';
  eventType: 'message' | 'comment';
  externalId: string;
  senderId: string;
  senderName: string;
  recipientId?: string;
  content: string;
  timestamp: string;
  mediaId?: string;
  rawPayload: any;
}

export interface SendMessageOptions {
  recipientId: string;
  content: string;
  accessToken: string;
}

export interface SendCommentReplyOptions {
  commentId: string;
  content: string;
  accessToken: string;
}

export interface PlatformConnector {
  platform: 'instagram' | 'tiktok';
  
  /**
   * Validates incoming webhook signature
   */
  verifySignature(rawBody: string | Buffer, signatureHeader: string | null): boolean;

  /**
   * Parses raw webhook payload into standardized WebhookEventPayload
   */
  parseWebhookPayload(body: any): WebhookEventPayload[];

  /**
   * Sends a direct message to a customer
   */
  sendDirectMessage(options: SendMessageOptions): Promise<{ success: boolean; messageId?: string; error?: string }>;

  /**
   * Replies to a public comment on a post/Reel
   */
  sendCommentReply(options: SendCommentReplyOptions): Promise<{ success: boolean; replyId?: string; error?: string }>;
}
