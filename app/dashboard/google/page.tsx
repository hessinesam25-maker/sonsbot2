'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { MapPin, Lock, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { supabaseFrontend } from '@/lib/db/client';

export default function GoogleBusinessIntegrationPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [connection, setConnection] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGoogleConnection() {
      setLoading(true);
      try {
        const { data } = await supabaseFrontend
          .from('google_connections')
          .select('*')
          .eq('tenant_id', selectedTenantId)
          .maybeSingle();

        setConnection(data);
      } catch (err) {
        console.error('Error checking Google connection:', err);
      } finally {
        setLoading(false);
      }
    }
    loadGoogleConnection();
  }, [selectedTenantId]);

  const restaurantName = tenant?.name || '';
  const city = tenant?.city || 'Ghent';

  const handleConnectClick = () => {
    alert(`Google Business Profile Integration Entry Point: Directing to Google OAuth flow for ${restaurantName}. Required Google My Business API credentials pending production configuration.`);
  };

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('google.title', { restaurant: restaurantName })} 
        subtitle={t('google.subtitle')} 
      />

      <div style={{ maxWidth: '850px' }}>
        {/* Google OAuth Entry Point Card */}
        <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(45deg, #4285F4, #EA4335, #FBBC05, #34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.2rem', flexShrink: 0 }}>
                G
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{t('google.syncTitle')}</h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {t('google.targetFor', { restaurant: restaurantName, city })}
                </div>
              </div>
            </div>

            <span className={`badge ${connection?.is_active ? 'badge-open' : 'badge-review'}`} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
              {t('common.status')}: {loading ? t('google.statusChecking') : connection?.is_active ? t('common.connected') : t('common.notConnected')}
            </span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{t('google.storeLocation')}</span>
              <strong style={{ color: '#fff' }}>{tenant?.address || ''}, {city}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{t('google.tokenSecurity')}</span>
              <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                <Lock size={13} /> {t('google.aesSecurity')}
              </span>
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontSize: '0.9rem' }}
            onClick={handleConnectClick}
          >
            <ExternalLink size={16} /> {connection?.is_active ? t('google.reconnectAccount') : t('google.connectAccount')}
          </button>
        </div>

        {/* Technical Requirements & Future API Scope Notice */}
        <div className="glass-card" style={{ border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} color="var(--accent-amber)" /> {t('google.techReqsTitle')}
          </h3>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {t('google.techReqsDesc')}
          </p>

          <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <strong>{t('google.prodStepsTitle')}</strong>
            <ul style={{ marginTop: '0.35rem', paddingInlineStart: '1.25rem', lineHeight: 1.6 }}>
              <li>{t('google.step1')}</li>
              <li>{t('google.step2')}</li>
              <li>{t('google.step3')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
