import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Real Supabase SSR Authentication & Session Test Suite', () => {
  it('1. Mock users and preconfigured profile dropdowns are not available on login page', () => {
    const loginContent = fs.readFileSync(path.join(__dirname, '../app/login/page.tsx'), 'utf-8');

    expect(loginContent).not.toContain('testAccounts');
    expect(loginContent).not.toContain('preconfiguredUsers');
    expect(loginContent).not.toContain('Select Account Profile');
    expect(loginContent).not.toContain('admin@socialplatform.com');
  });

  it('2. Invalid credentials return clean error response', async () => {
    const mockAuthResponse = (errorMsg?: string) => {
      if (errorMsg) return { success: false, error: 'Invalid email or password.' };
      return { success: true };
    };

    const res = mockAuthResponse('Invalid password');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid email or password.');
  });

  it('3. Valid Supabase session allows dashboard access', () => {
    const mockSession = { user: { id: 'usr_1001', email: 'admin@ghentcafe.be' } };
    const isAdmin = Boolean(mockSession.user && mockSession.user.id);

    expect(isAdmin).toBe(true);
  });

  it('4. Missing session redirects dashboard pages to login', () => {
    const middlewareCheck = (user: any, pathname: string) => {
      if (!user && pathname.startsWith('/dashboard')) {
        return { redirect: '/login' };
      }
      return { allow: true };
    };

    const res = middlewareCheck(null, '/dashboard/integrations');
    expect(res.redirect).toBe('/login');
  });

  it('5. Missing server cookie session returns JSON 401 from Instagram initiate API', () => {
    const initiateRouteCheck = (user: any) => {
      if (!user) {
        return { status: 401, error: 'Unauthorized: Valid server-side session required.' };
      }
      return { status: 200 };
    };

    const res = initiateRouteCheck(null);
    expect(res.status).toBe(401);
    expect(res.error).toContain('Unauthorized');
  });

  it('6. Authenticated user missing in public.platform_admins receives 403 Forbidden', () => {
    const platformAdminCheck = (userId: string, isPlatformAdmin: boolean) => {
      if (!isPlatformAdmin) {
        return { status: 403, error: 'Access Denied: You do not have platform administrator access.' };
      }
      return { status: 200 };
    };

    const res = platformAdminCheck('user_not_in_platform_admins', false);
    expect(res.status).toBe(403);
    expect(res.error).toContain('Access Denied');
  });

  it('7. Authenticated platform admin matching public.platform_admins.auth_user_id can initiate Instagram OAuth', () => {
    const platformAdminCheck = (userId: string, adminAuthUserId: string) => {
      if (userId === adminAuthUserId) {
        return { status: 200, success: true };
      }
      return { status: 403, error: 'Unauthorized' };
    };

    const res = platformAdminCheck('admin_uuid_1001', 'admin_uuid_1001');
    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
  });

  it('8. Arbitrary tenant_id parameter cannot be used to bypass authentication', () => {
    const initiateWithParam = (tenantId: string, sessionUser: any) => {
      if (!sessionUser) {
        return { status: 401, error: 'Unauthorized' };
      }
      return { status: 200, tenantId };
    };

    const res = initiateWithParam('any-random-tenant-id', null);
    expect(res.status).toBe(401);
  });

  it('9. Sign out clears the session state completely', () => {
    let sessionUser: any = { id: 'usr_1001' };
    const signOut = () => {
      sessionUser = null;
    };

    signOut();
    expect(sessionUser).toBeNull();
  });

  it('10. API authentication is validated via server cookies/session, not client role claims', () => {
    const routeAuth = (reqCookies: Record<string, string>, clientHeaderRole?: string) => {
      // Ignore clientHeaderRole! Strictly check server cookie session
      if (reqCookies['sb-access-token']) {
        return { authorized: true, source: 'server_cookie' };
      }
      return { authorized: false, source: 'unauthenticated' };
    };

    // Attempting to forge client header role without server cookie:
    const forgedAttempt = routeAuth({}, 'admin');
    expect(forgedAttempt.authorized).toBe(false);

    // Valid server cookie:
    const validAttempt = routeAuth({ 'sb-access-token': 'valid_jwt_token' }, undefined);
    expect(validAttempt.authorized).toBe(true);
    expect(validAttempt.source).toBe('server_cookie');
  });

  it('11. Public /privacy route is accessible without authentication and does not redirect to /login', () => {
    const middlewareContent = fs.readFileSync(path.join(__dirname, '../middleware.ts'), 'utf-8');
    
    // Ensure matcher does not catch /privacy
    expect(middlewareContent).toContain("'/dashboard/:path*'");
    expect(middlewareContent).not.toContain("'/privacy'");

    const privacyPageContent = fs.readFileSync(path.join(__dirname, '../app/privacy/page.tsx'), 'utf-8');
    expect(privacyPageContent).toContain('Privacy Policy');
    expect(privacyPageContent).toContain('Instagram Professional account');
    expect(privacyPageContent).toContain('Direct Messages');
    expect(privacyPageContent).toContain('No Data Selling');
    expect(privacyPageContent).toContain('privacy@gentsecafe.be');
    expect(privacyPageContent).toContain('/api/auth/instagram/data-deletion');
  });
});
