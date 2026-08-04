'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Inbox, MessageSquare, BookOpen, Utensils, 
  Sliders, Share2, FileText, BarChart3, Coffee, 
  ShieldCheck, LogOut, Building2, HelpCircle, Image, MapPin 
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';
import { Tenant } from '@/lib/db/types';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, isPlatformAdmin, selectedTenantId, switchTenant, logout } = useAuth();
  const { t, direction } = useLanguage();
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    if (isPlatformAdmin) {
      db.getAllTenants().then(setAllTenants).catch(console.error);
    }
  }, [isPlatformAdmin]);

  const navItems = [
    { href: '/dashboard/clients', label: t('nav.clients'), icon: Building2 },
    { href: '/dashboard', label: t('nav.overview'), icon: BarChart3 },
    { href: '/dashboard/inbox', label: t('nav.inbox'), icon: Inbox },
    { href: '/dashboard/comments', label: t('nav.comments'), icon: MessageSquare },
    { href: '/dashboard/content', label: t('nav.content'), icon: Image },
    { href: '/dashboard/faqs', label: t('nav.faqs'), icon: HelpCircle },
    { href: '/dashboard/knowledge', label: t('nav.knowledge'), icon: BookOpen },
    { href: '/dashboard/menu', label: t('nav.menu'), icon: Utensils },
    { href: '/dashboard/google', label: t('nav.google'), icon: MapPin },
    { href: '/dashboard/rules', label: t('nav.rules'), icon: Sliders },
    { href: '/dashboard/integrations', label: t('nav.integrations'), icon: Share2 },
    { href: '/dashboard/logs', label: t('nav.logs'), icon: FileText },
  ];

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
              <img src={tenant.logo_url} alt={tenant.name} style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }} />
            ) : (
              <Coffee size={24} />
            )}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div className="brand-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tenant?.name || t('common.platformName')}
            </div>
            <div className="brand-subtitle">
              {t('common.platformAdmin')}
            </div>
          </div>
        </div>

        {/* Platform Admin Tenant Context Switcher */}
        {isPlatformAdmin && (
          <div style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-amber)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Building2 size={12} /> {t('common.activeContext')}:
            </div>
            <select 
              className="form-select" 
              value={selectedTenantId}
              onChange={(e) => switchTenant(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '0.4rem', background: 'rgba(0,0,0,0.4)', color: '#fff' }}
            >
              {allTenants.map(t => (
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
            <ShieldCheck size={18} />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'Platform Administrator'}
            </div>
            <span className="user-role-badge">
              PLATFORM ADMIN
            </span>
          </div>
        </div>

        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', padding: '0.4rem' }} onClick={handleSignOut}>
          <LogOut size={14} /> {t('common.signOut')}
        </button>
      </div>
    </aside>
  );
};
