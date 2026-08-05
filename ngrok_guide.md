# Optional ngrok Local Testing Guide for Instagram Webhooks

This guide explains how to optionally expose your local Next.js server (`http://localhost:3000`) to the public internet using `ngrok` for live testing of Instagram webhooks and Instagram Login OAuth callbacks.

---

## Step 1: Start Local Next.js Application
Ensure your local server is running on port 3000:
```bash
npm run dev
```

---

## Step 2: Expose Port 3000 via ngrok
In a separate terminal window, run:
```bash
ngrok http 3000
```

ngrok will output a public HTTPS URL, for example:
`https://a1b2-34-56-78-90.ngrok-free.app`

---

## Step 3: Temporarily Update Environment Variables
In `.env.local`, update your URL values:
```env
NEXT_PUBLIC_APP_URL=https://a1b2-34-56-78-90.ngrok-free.app
INSTAGRAM_OAUTH_REDIRECT_URI=https://a1b2-34-56-78-90.ngrok-free.app/api/auth/instagram/callback
```
*Restart the local dev server after updating environment variables.*

---

## Step 4: Configure Meta Developer Dashboard
1. Log in to [Meta for Developers](https://developers.facebook.com/).
2. In **Instagram product settings** -> **OAuth Settings**, set **Valid OAuth Redirect URIs** to:
   `https://a1b2-34-56-78-90.ngrok-free.app/api/auth/instagram/callback`
3. In **Webhooks** -> **Instagram**, set **Callback URL** to:
   `https://a1b2-34-56-78-90.ngrok-free.app/api/webhooks/instagram`
4. Set **Verify Token** to the value of `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (e.g., `ghent_cafe_secure_webhook_verify_token_2026`).
5. Click **Verify and Save**.

---

## Step 5: Restore Local Configuration
When finished testing, revert `.env.local` back to:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
INSTAGRAM_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/instagram/callback
```
