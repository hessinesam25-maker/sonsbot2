'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopHeader } from '@/components/TopHeader';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/db/store';
import { Tenant, PlatformConnection } from '@/lib/db/types';
import { 
  Building2, ArrowLeft, CheckCircle2, Circle, 
  Share2, MapPin, BookOpen, Utensils, Sliders, 
  ExternalLink, Globe, Clock, Mail, Phone 
} from 'lucide-react';

export default function RestaurantDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { isPlatformAdmin, switchTenant } = useAuth();
  const { t, direction } = useLanguage();

  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [kbExists, setKbExists] = useState(false);
  const [menuCount, setMenuCount] = useState(0);
  const [rulesExists, setRulesExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectingIg, setConnectingIg] = useState(false);

  useEffect(() => {
    async function loadClientData() {
      if (!tenantId) return;
      setLoading(true);
      try {
        const tData = await db.getTenant(tenantId);
        setTenant(tData);

        const conns = await db.getConnections(tenantId);
        setConnections(conns);

        const kb = await db.getKnowledgeBase(tenantId);
        setKbExists(Boolean(kb && kb.cafe_name));

        const menu = await db.getMenu(tenantId);
        setMenuCount(menu.length);

        const rules = await db.getAutomationRules(tenantId);
        setRulesExists(Boolean(rules));
      } catch (err) {
        console.error('Error loading tenant details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadClientData();
  }, [tenantId]);

  const handleConnectInstagram = async () => {
    setConnectingIg(true);
    try {
      const res = await fetch(`/api/auth/instagram/initiate?tenant_id=${tenantId}`);
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert(`Error initiating Instagram OAuth: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error initiating Instagram connection: ${err.message}`);
    } finally {
      setConnectingIg(false);
    }
  };

  const handleSwitchToThisTenant = async () => {
    if (tenantId) {
      await switchTenant(tenantId);
      router.push('/dashboard');
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem' }}>{t('common.loading')}</div>;
  }

  if (!tenant) {
    return (
      <div dir={direction}>
        <TopHeader title={t('clients.clientDetails')} subtitle={t('common.error')} />
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <h3>Restaurant Tenant Not Found</h3>
          <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => router.push('/dashboard/clients')}>
            <ArrowLeft size={16} /> {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  const igConnected = connections.some(c => c.platform === 'instagram' && c.is_active);

  const onboardingSteps = [
    { title: t('clients.step1Details'), status: true, icon: Building2, actionHref: undefined },
    { title: t('clients.step2Kb'), status: kbExists, icon: BookOpen, actionHref: '/dashboard/knowledge' },
    { title: t('clients.step3Menu'), status: menuCount > 0, icon: Utensils, actionHref: '/dashboard/menu' },
    { title: t('clients.step4Instagram'), status: igConnected, icon: Share2, isIgAction: true },
    { title: t('clients.step5Google'), status: false, icon: MapPin, actionHref: '/dashboard/google' },
    { title: t('clients.step6Chatbot'), status: rulesExists, icon: Sliders, actionHref: '/dashboard/rules' },
  ];

  return (
    <div dir={direction}>
      <TopHeader 
        title={`${t('clients.clientDetails')}: ${tenant.name}`} 
        subtitle={`ID: ${tenant.id} (${tenant.city}, ${tenant.country})`} 
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary" onClick={() => router.push('/dashboard/clients')}>
          <ArrowLeft size={16} /> {t('common.back')}
        </button>

        <button className="btn btn-primary" onClick={handleSwitchToThisTenant}>
          <CheckCircle2 size={16} /> {t('common.switchContext')}
        </button>
      </div>

      {/* Restaurant Overview Card */}
      <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.5rem' }}>
            {tenant.logo_url ? <img src={tenant.logo_url} alt={tenant.name} style={{ width: '100%', height: '100%', borderRadius: '14px', objectFit: 'cover' }} /> : tenant.name.charAt(0)}
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{tenant.name}</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {tenant.address}, {tenant.city}, {tenant.country}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>{t('clients.formTimezone')}</span>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={14} /> {tenant.timezone || 'Europe/Brussels'}</strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>{t('clients.formLocale')}</span>
            <strong>{(tenant.default_locale || 'ar').toUpperCase()}</strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>{t('clients.formEmail')}</span>
            <strong style={{ direction: 'ltr', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={14} /> {tenant.contact_email || '—'}</strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>{t('clients.formPhone')}</span>
            <strong style={{ direction: 'ltr', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Phone size={14} /> {tenant.phone || '—'}</strong>
          </div>
        </div>
      </div>

      {/* Onboarding Steps Card */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.3rem' }}>{t('clients.onboardingTitle')}</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>{t('clients.onboardingSubtitle')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {onboardingSteps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div 
                key={idx}
                style={{ 
                  background: step.status ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.03)', 
                  border: step.status ? '1px solid var(--accent-emerald)' : '1px solid var(--border-color)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  {step.status ? (
                    <CheckCircle2 size={22} color="var(--accent-emerald)" />
                  ) : (
                    <Circle size={22} color="var(--text-muted)" />
                  )}
                  <Icon size={20} color={step.status ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{step.title}</span>
                </div>

                <div>
                  {step.isIgAction ? (
                    <button 
                      className={`btn ${step.status ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                      onClick={handleConnectInstagram}
                      disabled={connectingIg}
                    >
                      <Share2 size={14} />
                      {connectingIg ? t('common.loading') : step.status ? t('clients.disconnectInstagram') : t('clients.connectInstagram')}
                    </button>
                  ) : step.actionHref ? (
                    <button 
                      className="btn btn-secondary" 
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                      onClick={() => router.push(step.actionHref!)}
                    >
                      <ExternalLink size={14} /> Configure
                    </button>
                  ) : (
                    <span className="badge badge-open" style={{ fontSize: '0.75rem' }}>{t('common.verified')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
