# Ghent Café AI Platform - Setup & Deployment Guide

This guide provides step-by-step instructions for setting up the production Meta Developer App (Instagram Graph API), configuring webhooks, setting up environment variables, and enabling the TikTok connector framework.

---

## 1. Required Environment Variables

Create a `.env.local` or `.env` file in the root of your project using the structure below:

```env
# Application Environment Variables
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_TENANT_NAME="Café De Gentse Draak"
NEXT_PUBLIC_DEFAULT_LOCALE="nl"

# Database & Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DATABASE_URL=postgresql://postgres:password@localhost:5432/ghent_cafe_db

# Security Keys
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # 32-byte (64 hex characters) AES-256-GCM key

# Meta / Instagram Graph API Configuration
META_APP_ID=123456789012345
META_APP_SECRET=your_meta_app_secret_hash
META_WEBHOOK_VERIFY_TOKEN=ghent_cafe_secure_webhook_verify_token_2026

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

## 2. Meta Developer App Configuration (Instagram Official Integration)

### Step 1: Create Meta Developer App
1. Go to [Meta for Developers](https://developers.facebook.com/) and log in with your Facebook account.
2. Click **My Apps** -> **Create App**.
3. Select **Business** as the app type.
4. Set App Name to `Ghent Cafe Engagement AI` and enter your business email.

### Step 2: Add Products to Meta App
Add the following products to your Meta App dashboard:
- **Instagram Graph API**
- **Webhooks**
- **Facebook Login for Business**

### Step 3: Configure Required Permissions & OAuth
In **Facebook Login for Business** settings:
1. Set **Valid OAuth Redirect URIs** to:
   `https://your-domain.com/api/auth/instagram/callback`
2. Request and authorize the following official permissions:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `instagram_manage_comments`
   - `pages_messaging`
   - `pages_show_list`

### Step 4: Webhook Configuration
1. In Meta Developer Dashboard, navigate to **Webhooks** -> Select **Instagram** from the dropdown.
2. Click **Subscribe to this object**.
3. Set **Callback URL** to:
   `https://your-domain.com/api/webhooks/instagram`
4. Set **Verify Token** to the exact value configured in `META_WEBHOOK_VERIFY_TOKEN` (e.g. `ghent_cafe_secure_webhook_verify_token_2026`).
5. Click **Verify and Save**.
6. Subscribe to the following webhook fields:
   - `messages`
   - `comments`
   - `messaging_postbacks`

---

## 3. TikTok Business Messaging API Integration (Connector Preparation)

1. Access [TikTok for Developers](https://developers.tiktok.com/) and register a Business Application.
2. Apply for the official **TikTok Business Messaging API**.
3. Once approved, copy your `TIKTOK_APP_ID` and `TIKTOK_APP_SECRET` into `.env.local`.
4. In the Ghent Café Admin Dashboard, navigate to **Integrations** -> **TikTok Business Messaging** to verify the connector status.
> Note: No unofficial browser automation, web scraping, cookie sharing, or mobile emulation is used. The connector interface is ready to process official webhooks as soon as credentials are entered.

---

## 4. Database Migration Setup

Run the SQL migration script located at:
`supabase/migrations/20260730000000_init_schema.sql`

This script creates:
- `tenants`, `users`, `platform_connections` (with AES-256-GCM token encryption)
- `knowledge_base` & `menu_items`
- `conversations`, `messages`, `comments`
- `automation_rules` & `audit_logs`
- Multi-tenant Row Level Security (RLS) policies
