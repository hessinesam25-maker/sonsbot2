'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, ShieldCheck, Globe, Building2, Share2, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';
import { PlatformConnection } from '@/lib/db/types';

interface TopHeaderProps {
  title: string;
  subtitle: string;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle }) => {
  const { tenant, selectedTenantId, allowedTenants, switchTenant, isPlatformAdmin, role } = useAuth();
  const { language, setLanguage, direction, t } = useLanguage();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [isIgConnected, setIsIgConnected] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setIsIgConnected(false);
    setConnections([]);

    if (selectedTenantId) {
      db.getConnections(selectedTenantId).then(conns => {
        if (isMounted) {
          setConnections(conns);
          const activeIg = conns.some(c => c.platform === 'instagram' && c.is_active);
          setIsIgConnected(activeIg);
        }
      }).catch(err => {
        if (isMounted) {
          console.error(err);
          setConnections([]);
          setIsIgConnected(false);
        }
      });
    }
    return () => { isMounted = false; };
  }, [selectedTenantId]);

  return (
    <div className="top-bar" dir={direction}>
      <div className="page-title-group">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="header-actions" style={{ gap: '0.75rem' }}>
        {/* Active Restaurant Display or Switcher */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            background: 'rgba(245, 158, 11, 0.12)', 
            border: '1px solid var(--accent-amber)',
            padding: '0.35rem 0.65rem', 
            borderRadius: 'var(--radius-sm)', 
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#fff'
          }}
        >
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name || ''} style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }} />
          ) : (
            <Building2 size={18} color="var(--accent-amber)" />
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {t('common.activeContext')}
            </span>
            
            {isPlatformAdmin && allowedTenants.length > 1 ? (
              <select
                value={selectedTenantId}
                onChange={(e) => switchTenant(e.target.value)}
                style={{
                  background: 'transparent',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  outline: 'none',
                  paddingRight: direction === 'rtl' ? '0' : '0.5rem',
                  paddingLeft: direction === 'rtl' ? '0.5rem' : '0',
                }}
              >
                {allowedTenants.map(t => (
                  <option key={t.id} value={t.id} style={{ background: '#18181b', color: '#fff' }}>
                    {t.name} ({t.city})
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                {tenant?.name || 'Restaurant Client'} ({tenant?.city || 'Ghent'})
              </span>
            )}
          </div>
        </div>

        {/* Connection Status Indicator */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.4rem', 
            background: isIgConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)', 
            border: `1px solid ${isIgConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
            padding: '0.4rem 0.75rem', 
            borderRadius: 'var(--radius-sm)', 
            fontSize: '0.78rem',
            fontWeight: 600,
            color: isIgConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)'
          }}
          title={isIgConnected ? t('common.connected') : t('common.notConnected')}
        >
          <Share2 size={14} />
          <span>{isIgConnected ? t('common.connected') : t('common.notConnected')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem' }}>
          <MapPin size={14} color="var(--accent-cyan)" />
          <span>{tenant?.city || 'Ghent'}, {tenant?.country || 'Belgium'}</span>
        </div>

        {/* Interface Language Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
          <Globe size={14} color="var(--text-secondary)" />
          <button 
            onClick={() => setLanguage('ar')}
            className={`lang-badge ${language === 'ar' ? 'lang-ar' : ''}`}
            style={{ 
              background: language === 'ar' ? 'var(--accent-emerald)' : 'transparent', 
              color: language === 'ar' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            العربية (AR)
          </button>
          <button 
            onClick={() => setLanguage('en')}
            className={`lang-badge ${language === 'en' ? 'lang-en' : ''}`}
            style={{ 
              background: language === 'en' ? 'var(--accent-indigo)' : 'transparent', 
              color: language === 'en' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            EN
          </button>
        </div>

        {/* Role & Admin Badges */}
        {isPlatformAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 700 }}>
            <ShieldCheck size={14} />
            <span>{t('common.platformAdmin')}</span>
          </div>
        ) : role ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize' }}>
            <UserCheck size={14} />
            <span>{role}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
