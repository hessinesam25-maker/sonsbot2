'use client';

import React from 'react';
import { MapPin, ShieldCheck, Globe, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface TopHeaderProps {
  title: string;
  subtitle: string;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle }) => {
  const { tenant, isPlatformAdmin } = useAuth();
  const { language, setLanguage, direction, t } = useLanguage();

  return (
    <div className="top-bar" dir={direction}>
      <div className="page-title-group">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="header-actions">
        {/* Active Restaurant Badge */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            background: 'rgba(245, 158, 11, 0.12)', 
            border: '1px solid var(--accent-amber)',
            padding: '0.4rem 0.8rem', 
            borderRadius: 'var(--radius-sm)', 
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--accent-amber)'
          }}
        >
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} style={{ width: '18px', height: '18px', borderRadius: '4px' }} />
          ) : (
            <Building2 size={16} />
          )}
          <span>{tenant?.name || 'Restaurant Client'}</span>
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

        {isPlatformAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 700 }}>
            <ShieldCheck size={14} />
            <span>{t('common.platformAdmin')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
