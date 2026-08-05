# Instagram API with Instagram Login — Meta Developer Dashboard Checklist

This document details the exact manual setup required in the Meta Developer Portal for the **Instagram API with Instagram Login** flow.

---

## 1. Create / Configure Meta Developer App

1. Go to [Meta for Developers Portal](https://developers.facebook.com/).
2. Click **My Apps** -> **Create App**.
3. Select **Other** -> **Business** (or Consumer with Instagram product).
4. Enter your app name (e.g. `Restaurant AI Assistant`) and assign your Business Account.

---

## 2. Add the Instagram Product

1. In the App Dashboard, locate **Instagram** under **Add Products**.
2. Click **Set Up** on the **Instagram** product card.
3. Select **Instagram API with Instagram Login** (Do NOT choose legacy Facebook Login for Instagram).

---

## 3. Register Authorized OAuth Redirect URIs

In **Instagram Settings** -> **Basic / OAuth Settings**:

- **Local Development Callback**:
  `http://localhost:3000/api/auth/instagram/callback`
- **Production Callback**:
  `https://sons-instagram-bot.vercel.app/api/auth/instagram/callback`

> [!IMPORTANT]
> The redirect URI configured in your application (`INSTAGRAM_OAUTH_REDIRECT_URI`) must match the value registered in Meta App settings character-for-character.

---

## 4. Webhooks Configuration

1. In the Meta App Dashboard, navigate to **Webhooks**.
2. Select **Instagram** from the dropdown menu.
3. Enter:
   - **Callback URL**: `https://<your-domain>/api/webhooks/instagram` (Must be public HTTPS; use ngrok for local testing).
   - **Verify Token**: Must match `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (or `META_WEBHOOK_VERIFY_TOKEN`).
4. Click **Verify and Save**.
5. Subscribe to the following webhook fields:
   - `messages` (Direct Messages)
   - `comments` (Comments on posts and Reels)

---

## 5. Required Permissions & App Review

For public production access, request **Advanced Access** via App Review for the following modern Instagram Login scopes:

- `instagram_business_basic`: Read basic account identity (ID, username).
- `instagram_business_manage_messages`: Read and send direct messages on behalf of the professional account.
- `instagram_business_manage_comments`: Read and reply to comments on posts/Reels.
- `instagram_business_content_publish` *(Required only if content publishing feature is enabled)*.

> [!NOTE]
> Do NOT request legacy Facebook permissions such as `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, or `instagram_manage_comments`.

---

## 6. Development Mode & Test Instagram Accounts

While the Meta App status is in **Development Mode**:
1. Go to **Roles** -> **Instagram Testers**.
2. Add the Instagram usernames of the test Professional Instagram accounts (Business or Creator).
3. Log into Instagram with each test account, navigate to **Settings** -> **Apps and Websites** -> **Tester Invites**, and accept the invite.

---

## 7. Professional Account Requirement

The restaurant owner's Instagram account **must be an Instagram Professional account** (either **Business** or **Creator**). Personal Instagram accounts are not supported by the Meta Graph API for automated messaging and comment replies.
