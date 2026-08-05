# Ghent Café AI Platform - Setup & Deployment Guide

This guide provides step-by-step instructions for setting up the production Meta Developer App (Instagram API with Instagram Login), configuring webhooks, setting up environment variables, and enabling the TikTok connector framework.

---

## 1. Required Environment Variables

Create a `.env.local` or `.env` file in the root of your project using the structure below:

```env
# Application Environment Variables
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_NAME="Restaurant Social Platform"
NEXT_PUBLIC_DEFAULT_LOCALE="nl"

# Database & Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DATABASE_URL=postgresql://postgres:password@localhost:5432/ghent_cafe_db

# Security Keys
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # 32-byte (64 hex characters) AES-256-GCM key
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Instagram API with Instagram Login (Preferred)
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=ghent_cafe_secure_webhook_verify_token_2026
INSTAGRAM_OAUTH_REDIRECT_URI=https://your-domain.com/api/auth/instagram/callback

# Legacy Meta Fallbacks (Backwards compatible)
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_WEBHOOK_VERIFY_TOKEN=ghent_cafe_secure_webhook_verify_token_2026
META_OAUTH_REDIRECT_URI=https://your-domain.com/api/auth/instagram/callback

# AI Provider Configuration (Pluggable LLM Abstraction)
AI_PROVIDER=openai # openai | gemini | mock
OPENAI_API_KEY=sk-proj-your-openai-api-key
GEMINI_API_KEY=your-gemini-api-key

# TikTok Business Messaging API (Prepared Connector)
TIKTOK_APP_ID=your_tiktok_app_id
TIKTOK_APP_SECRET=your_tiktok_app_secret
TIKTOK_WEBHOOK_VERIFY_TOKEN=tiktok_verify_token_2026
```

---

## 2. Meta Developer App Configuration (Instagram API with Instagram Login)

### Step 1: Create Meta Developer App
1. Go to [Meta for Developers](https://developers.facebook.com/) and log in.
2. Click **My Apps** -> **Create App**.
3. Select **Business** as the app type.
4. Set App Name to `Restaurant Social Platform` and enter your contact email.

### Step 2: Add Instagram Product
1. Under **Add Products**, select **Instagram**.
2. Choose **Instagram API with Instagram Login**.
3. Do NOT configure Facebook Login or Facebook Page access tokens.

### Step 3: Configure Authorized Redirect URIs & Scopes
1. In **Instagram Settings** -> **OAuth Settings**, set **Valid OAuth Redirect URIs** to:
   `https://your-domain.com/api/auth/instagram/callback`
2. Request and authorize the modern Instagram Login scopes:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
   - `instagram_business_manage_comments`
   - `instagram_business_content_publish` (if publishing enabled)

### Step 4: Webhook Configuration
1. In Meta Developer Dashboard, navigate to **Webhooks** -> Select **Instagram** from the dropdown.
2. Set **Callback URL** to:
   `https://your-domain.com/api/webhooks/instagram`
3. Set **Verify Token** to `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
4. Subscribe to the following webhook fields:
   - `messages`
   - `comments`

---

## 3. TikTok Business Messaging API Integration (Connector Preparation)

1. Access [TikTok for Developers](https://developers.tiktok.com/) and register a Business Application.
2. Apply for the official **TikTok Business Messaging API**.
3. Once approved, copy your `TIKTOK_APP_ID` and `TIKTOK_APP_SECRET` into `.env.local`.
4. In the Restaurant Admin Dashboard, navigate to **Integrations** -> **TikTok Business Messaging** to verify the connector status.

---

## 4. Database Migration Setup

Run the SQL migration scripts located at:
- `supabase/migrations/20260730000000_init_schema.sql`
- `supabase/migrations/20260730000001_auth_bound_rls.sql`
- `supabase/migrations/20260804000000_multi_tenant_admin.sql`
- `supabase/migrations/20260805000000_instagram_login_oauth_states.sql`
