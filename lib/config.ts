/**
 Environment Variable Validation Module
 Enforces strict presence of required INSTAGRAM_* environment variables for production/local runtime.
 Fails clearly with actionable errors if required variables are missing.
 */

export interface AppConfig {
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  encryptionKey: string;
  aiProvider: 'openai' | 'gemini' | 'mock';
  openaiApiKey?: string;
  geminiApiKey?: string;
  instagramAppId: string;
  instagramAppSecret: string;
  instagramWebhookVerifyToken: string;
  instagramOAuthRedirectUri: string;
  instagramGraphApiVersion: string;
}

export function validateEnvironment(): AppConfig {
  const missingVars: string[] = [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ofxxrgtzlxkxrsglibqk.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHhyZ3R6bHhreHJzZ2xpYnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTY5MzYsImV4cCI6MjEwMDk5MjkzNn0.kVD_knCypKiT6p4jMIdA1vkegtmRS5XPH6axG6-asqw';

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;

  const instagramAppId = process.env.INSTAGRAM_APP_ID;
  const instagramAppSecret = process.env.INSTAGRAM_APP_SECRET;
  const instagramWebhookVerifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  const instagramOAuthRedirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI || `${appUrl}/api/auth/instagram/callback`;
  const instagramGraphApiVersion = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v20.0';

  if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!encryptionKey) missingVars.push('TOKEN_ENCRYPTION_KEY / ENCRYPTION_KEY');
  if (!instagramAppId) missingVars.push('INSTAGRAM_APP_ID');
  if (!instagramAppSecret) missingVars.push('INSTAGRAM_APP_SECRET');
  if (!instagramWebhookVerifyToken) missingVars.push('INSTAGRAM_WEBHOOK_VERIFY_TOKEN');

  if (missingVars.length > 0) {
    throw new Error(
      `[FATAL CONFIG ERROR] Missing required environment variables:\n - ${missingVars.join('\n - ')}\n` +
      `Please configure these variables in your environment configuration.`
    );
  }

  const aiProvider = (process.env.AI_PROVIDER as any) || 'openai';

  return {
    appUrl,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey: supabaseServiceRoleKey || supabaseAnonKey,
    encryptionKey: encryptionKey!,
    aiProvider,
    openaiApiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    instagramAppId: instagramAppId!,
    instagramAppSecret: instagramAppSecret!,
    instagramWebhookVerifyToken: instagramWebhookVerifyToken!,
    instagramOAuthRedirectUri,
    instagramGraphApiVersion,
  };
}
