'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Tenant, PlatformAdmin } from '@/lib/db/types';
import { supabaseFrontend } from '@/lib/db/client';

export interface AuthContextType {
  user: User | null;
  adminProfile: PlatformAdmin | null;
  tenant: Tenant | null;
  role: 'owner' | 'manager' | 'support_agent' | 'admin' | null;
  isPlatformAdmin: boolean;
  selectedTenantId: string;
  allowedTenants: Tenant[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshAuthContext: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  adminProfile: null,
  tenant: null,
  role: null,
  isPlatformAdmin: false,
  selectedTenantId: '',
  allowedTenants: [],
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  switchTenant: async () => {},
  refreshAuthContext: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<PlatformAdmin | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [role, setRole] = useState<'owner' | 'manager' | 'support_agent' | 'admin' | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean>(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [allowedTenants, setAllowedTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearState = () => {
    setUser(null);
    setAdminProfile(null);
    setTenant(null);
    setRole(null);
    setIsPlatformAdmin(false);
    setSelectedTenantId('');
    setAllowedTenants([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sonsbot_selected_tenant_id');
    }
  };

  const fetchAuthContext = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          if (data.isPlatformAdmin) {
            setIsPlatformAdmin(true);
            setRole('admin');
            setAdminProfile(data.user);
            setUser(data.user);
            setAllowedTenants(data.allowedTenants || []);

            let activeId = '';
            if (typeof window !== 'undefined') {
              const saved = localStorage.getItem('sonsbot_selected_tenant_id');
              if (saved && (data.allowedTenants || []).some((t: Tenant) => t.id === saved)) {
                activeId = saved;
              }
            }

            if (!activeId && data.allowedTenants && data.allowedTenants.length > 0) {
              activeId = data.allowedTenants[0].id;
            }

            setSelectedTenantId(activeId);
            if (typeof window !== 'undefined' && activeId) {
              localStorage.setItem('sonsbot_selected_tenant_id', activeId);
            }

            const activeTenantObj = (data.allowedTenants || []).find((t: Tenant) => t.id === activeId) || null;
            setTenant(activeTenantObj);
          } else {
            // Normal Tenant User: FORCED to server-assigned tenantId
            setIsPlatformAdmin(false);
            setAdminProfile(null);
            setRole(data.role);
            setUser(data.user);

            const serverTenantId = data.tenantId;
            setSelectedTenantId(serverTenantId);
            setAllowedTenants(data.allowedTenants || []);
            setTenant(data.tenant || null);

            // Cleanly overwrite any stale cross-tenant localStorage value
            if (typeof window !== 'undefined') {
              localStorage.setItem('sonsbot_selected_tenant_id', serverTenantId);
            }
          }
          return;
        }
      }
      clearState();
    } catch (err) {
      console.error('Failed to load server auth context:', err);
      clearState();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    fetchAuthContext();

    const { data: { subscription } } = supabaseFrontend.auth.onAuthStateChange(async (event) => {
      if (isMounted) {
        if (event === 'SIGNED_OUT') {
          clearState();
          setIsLoading(false);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await fetchAuthContext();
        }
      }
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

      const { data: authData, error: authError } = await supabaseFrontend.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData?.user) {
        clearState();
        return { success: false, error: authError?.message || 'Invalid email or password.' };
      }

      await fetchAuthContext();
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

    const target = allowedTenants.find(t => t.id === tenantId);
    if (!target) {
      console.warn('Target tenant not in authorized allowedTenants list');
      return;
    }

    setSelectedTenantId(tenantId);
    setTenant(target);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sonsbot_selected_tenant_id', tenantId);
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
        allowedTenants,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        logout,
        switchTenant,
        refreshAuthContext: fetchAuthContext,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
