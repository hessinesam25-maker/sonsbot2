'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Inbox, MessageSquare, BookOpen, Utensils, 
  Sliders, Share2, FileText, BarChart3, Coffee, 
  ShieldCheck, LogOut, Building2, HelpCircle, Image, MapPin, Bot, UserCheck, TrendingUp
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, isPlatformAdmin, role, selectedTenantId, allowedTenants, switchTenant, logout } = useAuth();
  const { t, direction } = useLanguage();

  const allNavItems = [
    { href: '/dashboard/ai-settings', label: t('nav.aiSettings'), icon: Bot },
    { href: '/dashboard/rules', label: t('nav.rules'), icon: Sliders },
    { href: '/dashboard/knowledge', label: t('nav.knowledge'), icon: BookOpen },
    { href: '/dashboard/menu', label: t('nav.menu'), icon: Utensils },
    { href: '/dashboard/integrations', label: t('nav.integrations'), icon: Share2 },
    { href: '/dashboard/google', label: t('nav.google'), icon: MapPin },
    { href: '/dashboard/clients', label: t('nav.clients'), icon: Building2, adminOnly: true },
  ];

  const navItems = allNavItems.filter(item => !item.adminOnly || isPlatformAdmin);

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <aside className="sidebar" dir={direction}>
      <div>
        <div className="brand-header">
          <div className="brand-logo" style={{ background: 'linear-gradient(135deg, var(--accent-amber), var(--accent-rose))' }}>
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name || ''} style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }} />
            ) : (
              <Coffee size={24} />
            )}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div className="brand-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tenant?.name || t('common.platformName')}
            </div>
            <div className="brand-subtitle">
              {isPlatformAdmin ? t('common.platformAdmin') : tenant?.city || 'Ghent'}
            </div>
          </div>
        </div>

        {/* Platform Admin Tenant Context Switcher */}
        {isPlatformAdmin && allowedTenants.length > 1 && (
          <div style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem', marginTop: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-amber)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Building2 size={12} /> {t('common.activeContext')}:
            </div>
            <select 
              className="form-select" 
              value={selectedTenantId}
              onChange={(e) => switchTenant(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '0.4rem', background: 'rgba(0,0,0,0.4)', color: '#fff', width: '100%' }}
            >
              {allowedTenants.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.city})
                </option>
              ))}
            </select>
          </div>
        )}

        <nav>
          <ul className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={`nav-link ${isActive ? 'active' : ''}`}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="user-footer" style={{ flexDirection: 'column', gap: '0.75rem', alignItems: 'stretch' }}>
        <div className="user-info">
          <div className="avatar">
            {isPlatformAdmin ? <ShieldCheck size={18} /> : <UserCheck size={18} />}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || (isPlatformAdmin ? t('common.platformAdmin') : 'User')}
            </div>
            <span className="user-role-badge">
              {isPlatformAdmin ? t('common.adminBadge') : role || 'Member'}
            </span>
          </div>
        </div>

        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', padding: '0.4rem' }} onClick={handleSignOut}>
          <LogOut size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} /> {t('common.signOut')}
        </button>
      </div>
    </aside>
  );
};
