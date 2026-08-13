'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopHeader } from '@/components/TopHeader';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { Building2, Plus, Globe2, Clock, CheckCircle2, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { Tenant } from '@/lib/db/types';
import { db } from '@/lib/db/store';

export default function RestaurantClientsPage() {
  const { isPlatformAdmin, switchTenant, selectedTenantId } = useAuth();
  const { t, direction } = useLanguage();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const list = await db.getAllTenants();
      setTenants(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleSelectClient = (tenantId: string) => {
    switchTenant(tenantId);
  };

  if (!isPlatformAdmin) {
    return (
      <div dir={direction}>
        <TopHeader title={t('clients.title')} subtitle={t('login.accessDenied')} />
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={36} color="var(--accent-rose)" style={{ margin: '0 auto 1rem auto' }} />
          <h3>{t('login.accessDenied')}</h3>
        </div>
      </div>
    );
  }

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('clients.title')} 
        subtitle={t('clients.subtitle')} 
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t('clients.totalRegistered')}: {tenants.length}</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t('clients.clickToSwitch')}</p>
        </div>

        <Link href="/dashboard/clients/new" className="btn btn-primary">
          <Plus size={16} /> {t('clients.addNew')}
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>{t('common.loading')}</div>
        ) : tenants.length === 0 ? (
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>
            <Building2 size={32} style={{ margin: '0 auto 1rem auto', color: 'var(--text-muted)' }} />
            <div>{t('clients.noClients')}</div>
          </div>
        ) : (
          tenants.map((item) => {
            const isSelected = selectedTenantId === item.id;
            return (
              <div 
                key={item.id} 
                className="glass-card" 
                style={{ 
                  border: isSelected ? '2px solid var(--accent-amber)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(245, 158, 11, 0.05)' : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {item.logo_url ? <img src={item.logo_url} alt={item.name} style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }} /> : <Building2 size={20} />}
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.name}</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: <code className="ltr-text">{item.id.slice(0, 8)}...</code></span>
                      </div>
                    </div>

                    <span className={`badge ${isSelected ? 'badge-open' : 'badge-resolved'}`} style={{ fontSize: '0.7rem' }}>
                      {isSelected ? t('common.activeContext') : t('common.active')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Globe2 size={14} color="var(--accent-cyan)" />
                      <span>{item.address || 'Ghent'}, {item.city}, {item.country}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Clock size={14} color="var(--accent-indigo)" />
                      <span>{t('clients.formTimezone')}: {item.timezone || 'Europe/Brussels'} ({t('clients.formLocale')}: {(item.default_locale || 'ar').toUpperCase()})</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.82rem' }}
                    onClick={() => handleSelectClient(item.id)}
                  >
                    {isSelected ? <CheckCircle2 size={14} /> : <ArrowRight size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} />}
                    {isSelected ? t('common.activeContext') : t('common.switchContext')}
                  </button>

                  <Link 
                    href={`/dashboard/clients/${item.id}`}
                    className="btn btn-secondary" 
                    style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={t('clients.clientDetails')}
                  >
                    <ExternalLink size={16} />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
