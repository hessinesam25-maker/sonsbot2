'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Tenant, PlatformAdmin } from '@/lib/db/types';
import { supabaseFrontend } from '@/lib/db/client';
import { db } from '@/lib/db/store';

export interface AuthContextType {
  user: User | null;
  adminProfile: PlatformAdmin | null;
  tenant: Tenant | null;
  role: 'admin' | null;
  isPlatformAdmin: boolean;
  selectedTenantId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  adminProfile: null,
  tenant: null,
  role: null,
  isPlatformAdmin: false,
  selectedTenantId: '11111111-1111-1111-1111-111111111111',
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  switchTenant: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<PlatformAdmin | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [role, setRole] = useState<'admin' | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean>(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sonsbot_selected_tenant_id');
      if (saved) return saved;
    }
    return '11111111-1111-1111-1111-111111111111';
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearState = () => {
    setUser(null);
    setAdminProfile(null);
    setTenant(null);
    setRole(null);
    setIsPlatformAdmin(false);
  };

  const verifyPlatformAdmin = async (userId: string, targetTenantId?: string) => {
    try {
      if (!userId) {
        clearState();
        return false;
      }

      const activeTenantId = targetTenantId || selectedTenantId;

      // Query platform_admins strictly by auth_user_id = user.id
      const { data: adminData, error } = await supabaseFrontend
        .from('platform_admins')
        .select('*')
        .eq('auth_user_id', userId)
        .single();

      if (adminData && !error) {
        setAdminProfile(adminData);
        setIsPlatformAdmin(true);
        setRole('admin');
        setUser({
          id: adminData.id,
          tenant_id: activeTenantId,
          email: adminData.email,
          name: adminData.name,
          role: 'owner',
          created_at: adminData.created_at,
        });

        const activeTenant = await db.getTenant(activeTenantId);
        if (activeTenant) {
          setTenant(activeTenant);
          if (activeTenant.id !== selectedTenantId) {
            setSelectedTenantId(activeTenant.id);
            if (typeof window !== 'undefined') {
              localStorage.setItem('sonsbot_selected_tenant_id', activeTenant.id);
            }
          }
        }
        return true;
      } else {
        // Authenticated in Supabase Auth but NOT listed in public.platform_admins -> REJECT ACCESS
        console.warn(`User ${userId} is not registered in public.platform_admins.auth_user_id.`);
        await supabaseFrontend.auth.signOut();
        clearState();
        return false;
      }
    } catch (err) {
      console.error('Error verifying platform admin authorization:', err);
      clearState();
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        const { data: { user: activeUser } } = await supabaseFrontend.auth.getUser();
        if (activeUser && isMounted) {
          await verifyPlatformAdmin(activeUser.id);
        } else if (isMounted) {
          clearState();
        }
      } catch (err) {
        console.error('Session initialization error:', err);
        if (isMounted) clearState();
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabaseFrontend.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await verifyPlatformAdmin(session.user.id);
      } else {
        clearState();
      }
      if (isMounted) setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      if (!email || !password) {
        return { success: false, error: 'Email and password are required.' };
      }

      // Real Supabase Authentication
      const { data: authData, error: authError } = await supabaseFrontend.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData?.user) {
        clearState();
        return { success: false, error: authError?.message || 'Invalid email or password.' };
      }

      // Server-side database verification: auth_user_id must match auth.users.id
      const isAuthorized = await verifyPlatformAdmin(authData.user.id);
      if (!isAuthorized) {
        return { success: false, error: 'Access Denied: You do not have platform administrator access.' };
      }

      return { success: true };
    } catch (err: any) {
      clearState();
      return { success: false, error: err.message || 'Login failed.' };
    } finally {
      setIsLoading(false);
    }
  };

  const switchTenant = async (tenantId: string) => {
    if (!isPlatformAdmin) {
      console.warn('Unauthorized tenant switch attempt blocked');
      return;
    }
    setSelectedTenantId(tenantId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sonsbot_selected_tenant_id', tenantId);
    }
    const newTenant = await db.getTenant(tenantId);
    setTenant(newTenant);
    if (user) {
      setUser({ ...user, tenant_id: tenantId });
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await supabaseFrontend.auth.signOut();
    } finally {
      clearState();
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        adminProfile,
        tenant,
        role,
        isPlatformAdmin,
        selectedTenantId,
        isAuthenticated: Boolean(user && isPlatformAdmin),
        isLoading,
        login,
        logout,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
