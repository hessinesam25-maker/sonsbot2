export type UserRole = 'owner' | 'manager' | 'support_agent';

export type PlatformType = 'instagram' | 'tiktok';

export type ChannelType = 'dm' | 'comment';

export type ConversationStatus = 'open' | 'needs_human_review' | 'resolved';

export type SenderType = 'customer' | 'ai' | 'agent';

export type MessageStatus = 'received' | 'auto_replied' | 'manually_replied' | 'flagged_for_review';

export type CommentClassification = 
  | 'question'
  | 'positive'
  | 'neutral'
  | 'complaint'
  | 'spam'
  | 'abuse'
  | 'collaboration'
  | 'needs_review';

export type CustomerLanguage = 'nl' | 'en' | 'fr' | 'ar';

export interface Tenant {
  id: string;
  name: string;
  slug?: string;
  address: string;
  city: string;
  country: string;
  default_locale: CustomerLanguage;
  timezone?: string;
  contact_email?: string;
  phone?: string;
  logo_url?: string;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformAdmin {
  id: string;
  auth_user_id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface FAQ {
  id: string;
  tenant_id: string;
  title: string;
  question: Record<string, string>;
  answer: Record<string, string>;
  locale: CustomerLanguage;
  keywords: string[];
  priority: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  tenant_id: string;
  storage_path: string;
  media_type: 'image' | 'video';
  mime_type: string;
  size_bytes: number;
  metadata: Record<string, any>;
  created_by?: string;
  created_at: string;
}

export type PublishingContentType = 'image' | 'video' | 'carousel' | 'reel' | 'story';
export type PublishingStatus = 'draft' | 'scheduled' | 'processing' | 'publishing' | 'published' | 'failed' | 'cancelled';

export interface PublishingJob {
  id: string;
  tenant_id: string;
  platform_connection_id?: string;
  content_type: PublishingContentType;
  caption: string;
  scheduled_for?: string;
  timezone: string;
  status: PublishingStatus;
  external_container_id?: string;
  external_media_id?: string;
  error_code?: string;
  safe_error_message?: string;
  attempts: number;
  created_by?: string;
  created_at: string;
  published_at?: string;
}

export interface GoogleConnection {
  id: string;
  tenant_id: string;
  account_id: string;
  location_id: string;
  location_name: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at?: string;
  is_active: boolean;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OAuthState {
  id: string;
  tenant_id: string;
  platform: 'instagram' | 'google' | 'tiktok';
  state_hash: string;
  user_id?: string;
  nonce?: string;
  scopes?: string[];
  expires_at: string;
  created_at: string;
}



export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface PlatformConnection {
  id: string;
  tenant_id: string;
  platform: PlatformType;
  account_id: string;
  account_name: string;
  access_token_encrypted: string;
  token_expires_at?: string;
  is_active: boolean;
  permissions: string[];
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OpeningHours {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

export interface FAQItem {
  id: string;
  question: Record<CustomerLanguage, string>;
  answer: Record<CustomerLanguage, string>;
}

export interface KnowledgeBase {
  id: string;
  tenant_id: string;
  cafe_name: string;
  address: string;
  google_maps_url: string;
  opening_hours: OpeningHours;
  holiday_hours: Record<string, string>;
  reservation_rules: string;
  delivery_takeaway_info: string;
  contact_email: string;
  contact_phone: string;
  wifi_details: string;
  payment_methods: string[];
  promotions: string[];
  faqs: FAQItem[];
  updated_at: string;
}

export interface MenuItem {
  id: string;
  tenant_id: string;
  category: string;
  name: string;
  price: number;
  description: string;
  ingredients: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  approved_allergens: string[];
  is_available: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  platform: PlatformType;
  channel_type: ChannelType;
  external_id: string;
  customer_id: string;
  customer_name: string;
  customer_language: CustomerLanguage;
  status: ConversationStatus;
  human_takeover: boolean;
  is_manual_takeover?: boolean;
  auto_reply_enabled: boolean;
  assigned_to?: string;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  tenant_id: string;
  sender_type: SenderType;
  external_message_id?: string;
  content: string;
  sanitized_content: string;
  ai_confidence?: number;
  ai_suggested_reply?: string;
  status: MessageStatus;
  created_at: string;
}

export interface Comment {
  id: string;
  tenant_id: string;
  platform: PlatformType;
  external_comment_id: string;
  media_id: string;
  media_type: string;
  author_username: string;
  content: string;
  classification: CommentClassification;
  auto_replied: boolean;
  reply_content?: string;
  is_hidden: boolean;
  created_at: string;
}

export interface AutomationRules {
  id: string;
  tenant_id: string;
  min_confidence_score: number;
  max_public_replies_per_hour: number;
  auto_reply_positive_comments: boolean;
  auto_reply_factual_questions: boolean;
  never_reply_complaints: boolean;
  hide_spam: boolean;
  ai_tone: string;
  default_dm_reply?: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  event_type: string;
  actor_type: 'system' | 'ai' | 'webhook' | 'user';
  actor_id?: string;
  details: Record<string, any>;
  created_at: string;
}

export type AITone = 'friendly' | 'professional' | 'casual';
export type AIReplyLength = 'very_short' | 'short' | 'normal';
export type AIEmojiUsage = 'none' | 'low' | 'normal';
export type AIFallbackBehavior = 'human_handoff' | 'fallback_message';

export interface AISettings {
  id: string;
  tenant_id: string;
  ai_enabled: boolean;
  primary_language: string;
  tone: AITone;
  reply_length: AIReplyLength;
  emoji_usage: AIEmojiUsage;
  custom_instructions: string;
  reply_to_dms: boolean;
  reply_to_comments: boolean;
  use_knowledge_base: boolean;
  fallback_behavior: AIFallbackBehavior;
  created_at: string;
  updated_at: string;
}

export interface InstagramConnectionState {
  connected: boolean;
  connectionId?: string;
  username?: string;
  formattedUsername?: string;
  instagramUserId?: string;
  status: 'connected' | 'disconnected';
  updatedAt?: string;
  hasPlaceholderUsername: boolean;
}


