# Platform Administrator Creation Guide

This document outlines the secure, manual process for granting Platform Administrator access to a user account in Supabase.

> [!IMPORTANT]
> There is **no public registration endpoint** for platform administrators. Only users whose `auth.users` UUID is explicitly inserted into the `public.platform_admins` table are authorized to log in to the administrative dashboard.

---

## Step-by-Step Provisioning Process

### Step 1: Create or Locate User in Supabase Auth
1. Log in to your **Supabase Dashboard**.
2. Navigate to **Authentication -> Users**.
3. Create a new user (or select an existing user) with a secure password and email address (e.g., `admin@yourdomain.com`).
4. Copy the user's **User UID** (UUID format: `00000000-0000-0000-0000-000000000000`).

---

### Step 2: Insert User into `public.platform_admins`
Run the following SQL statement in the **Supabase SQL Editor**:

```sql
-- Safe SQL Template to Grant Platform Admin Privileges
-- Replace the placeholder UUID '00000000-0000-0000-0000-000000000000' with the real Supabase Auth user ID.

INSERT INTO public.platform_admins (auth_user_id, email, name)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Replace with auth.users.id
  'admin@yourdomain.com',               -- User email address
  'Platform Administrator'               -- Admin display name
)
ON CONFLICT (auth_user_id) DO UPDATE 
SET email = EXCLUDED.email, name = EXCLUDED.name;
```

---

### Step 3: Verification
1. Open the platform login page at `/login`.
2. Enter the administrator's email and password.
3. The platform will authenticate via Supabase Auth and verify membership in `public.platform_admins`.
4. Upon successful verification, access is granted to the administrative dashboard.
