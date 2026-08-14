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
  refreshAuthContext: (preferredTenantId?: string) => Promise<boolean>;
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
  refreshAuthContext: async () => false,
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
  const fetchSeqRef = React.useRef<number>(0);

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

  const fetchAuthContext = async (preferredTenantId?: string): Promise<boolean> => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (res.ok) {
        const data = await res.json();
        if (seq !== fetchSeqRef.current) return false;

        if (data.authenticated) {
          if (data.isPlatformAdmin) {
            setIsPlatformAdmin(true);
            setRole('admin');
            setAdminProfile(data.user);
            setUser(data.user);
            const tenantsList: Tenant[] = data.allowedTenants || [];
            setAllowedTenants(tenantsList);

            let activeId = '';
            if (preferredTenantId && tenantsList.some((t: Tenant) => t.id === preferredTenantId)) {
              activeId = preferredTenantId;
            } else if (selectedTenantId && tenantsList.some((t: Tenant) => t.id === selectedTenantId)) {
              activeId = selectedTenantId;
            } else if (typeof window !== 'undefined') {
              const saved = localStorage.getItem('sonsbot_selected_tenant_id');
              if (saved && tenantsList.some((t: Tenant) => t.id === saved)) {
                activeId = saved;
              }
            }

            if (!activeId && tenantsList.length > 0) {
              activeId = tenantsList[0].id;
            }

            setSelectedTenantId(activeId);
            if (typeof window !== 'undefined') {
              if (activeId) {
                localStorage.setItem('sonsbot_selected_tenant_id', activeId);
              } else {
                localStorage.removeItem('sonsbot_selected_tenant_id');
              }
            }

            const activeTenantObj = tenantsList.find((t: Tenant) => t.id === activeId) || null;
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
          return true;
        }
      }

      if (seq === fetchSeqRef.current) {
        clearState();
        if (res.status === 403) {
          await supabaseFrontend.auth.signOut();
        }
      }
      return false;
    } catch (err) {
      console.error('Failed to load server auth context:', err);
      if (seq === fetchSeqRef.current) {
        clearState();
      }
      return false;
    } finally {
      if (seq === fetchSeqRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabaseFrontend.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
        clearState();
        setIsLoading(false);
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session) {
          await fetchAuthContext();
        } else {
          clearState();
          setIsLoading(false);
        }
      } else if (event === 'TOKEN_REFRESHED') {
        if (!session) {
          clearState();
          setIsLoading(false);
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

      const authSuccess = await fetchAuthContext();
      if (!authSuccess) {
        await supabaseFrontend.auth.signOut();
        clearState();

        const lang = typeof window !== 'undefined' ? localStorage.getItem('platform_lang') : 'ar';
        const unprovisionedMsg = lang === 'en'
          ? 'This account has not been provisioned in the platform. Contact the administrator.'
          : 'هذا الحساب غير مضاف إلى المنصة. تواصل مع مدير النظام.';

        return {
          success: false,
          error: unprovisionedMsg,
        };
      }

      return { success: true };
    } catch (err: any) {
      await supabaseFrontend.auth.signOut();
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
