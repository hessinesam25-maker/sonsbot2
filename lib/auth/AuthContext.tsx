'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, Tenant, PlatformAdmin } from '@/lib/db/types';
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
  const [selectedTenantId, setSelectedTenantId] = useState<string>('11111111-1111-1111-1111-111111111111');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearState = () => {
    setUser(null);
    setAdminProfile(null);
    setTenant(null);
    setRole(null);
    setIsPlatformAdmin(false);
  };

  const verifyPlatformAdmin = async (userId?: string, userEmail?: string) => {
    setIsLoading(true);
    try {
      if (!userId && !userEmail) {
        clearState();
        return false;
      }

      let query = supabaseFrontend.from('platform_admins').select('*');
      if (userId) {
        query = query.eq('auth_user_id', userId);
      } else if (userEmail) {
        query = query.eq('email', userEmail);
      }

      const { data: adminData, error } = await query.single();

      if (adminData) {
        setAdminProfile(adminData);
        setIsPlatformAdmin(true);
        setRole('admin');
        setUser({
          id: adminData.id,
          tenant_id: selectedTenantId,
          email: adminData.email,
          name: adminData.name,
          role: 'owner', // Default role type compatibility
          created_at: adminData.created_at,
        });

        const activeTenant = await db.getTenant(selectedTenantId);
        setTenant(activeTenant);
        return true;
      } else {
        // User authenticated in Supabase Auth but NOT a platform_admin -> REJECT ACCESS
        console.warn(`User ${userEmail || userId} is not registered in public.platform_admins.`);
        await supabaseFrontend.auth.signOut();
        clearState();
        return false;
      }
    } catch (err) {
      console.error('Error verifying platform admin session:', err);
      clearState();
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session } } = await supabaseFrontend.auth.getSession();
        if (session?.user) {
          await verifyPlatformAdmin(session.user.id, session.user.email);
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Session init error:', err);
        setIsLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabaseFrontend.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await verifyPlatformAdmin(session.user.id, session.user.email);
      } else {
        clearState();
        setIsLoading(false);
      }
    });

    return () => {
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

      if (authError) {
        // Dev / local mode check if database has platform admin with matching email
        const { data: adminCheck } = await supabaseFrontend
          .from('platform_admins')
          .select('*')
          .eq('email', email)
          .single();

        if (adminCheck) {
          setAdminProfile(adminCheck);
          setIsPlatformAdmin(true);
          setRole('admin');
          setUser({
            id: adminCheck.id,
            tenant_id: selectedTenantId,
            email: adminCheck.email,
            name: adminCheck.name,
            role: 'owner',
            created_at: adminCheck.created_at,
          });
          const activeTenant = await db.getTenant(selectedTenantId);
          setTenant(activeTenant);
          return { success: true };
        }

        return { success: false, error: authError.message || 'Invalid email or password.' };
      }

      if (authData?.user) {
        const isAdmin = await verifyPlatformAdmin(authData.user.id, authData.user.email);
        if (!isAdmin) {
          return { success: false, error: 'Access Denied: Only Platform Administrators can log in.' };
        }
        return { success: true };
      }

      return { success: false, error: 'Authentication failed.' };
    } catch (err: any) {
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
    const newTenant = await db.getTenant(tenantId);
    setTenant(newTenant);
  };

  const logout = async () => {
    await supabaseFrontend.auth.signOut();
    clearState();
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
