'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TopHeader } from '@/components/TopHeader';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db, getNormalizedInstagramState } from '@/lib/db/store';
import { PlatformConnection } from '@/lib/db/types';
import { 
  Share2, ShieldCheck, Lock, ExternalLink, AlertTriangle, CheckCircle2, XCircle, LogOut, RefreshCw 
} from 'lucide-react';

function IntegrationsContent() {
  const { selectedTenantId } = useAuth();
  const { t, direction } = useLanguage();
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const successMessage = searchParams.get('success');
  const errorMessage = searchParams.get('error');

  useEffect(() => {
    async function loadConnections() {
      setLoading(true);
      try {
        const conns = await db.getConnections(selectedTenantId);
        setConnections(conns);
      } catch (err) {
        console.error('Failed to load connections:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConnections();
  }, [selectedTenantId]);

  const igState = getNormalizedInstagramState(connections);
  const isConnected = igState.connected;

  const getStatusBadge = () => {
    if (!isConnected) {
      return <span className="badge badge-review">{t('instagramState.disconnected')}</span>;
    }
    return <span className="badge badge-open" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>{t('instagramState.connected')}</span>;
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`/api/auth/instagram/initiate?tenant_id=${selectedTenantId}`, {
        method: 'GET',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert(`Error initiating Instagram OAuth: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error initiating Instagram connection: ${err.message}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isConnected) return;
    const accountDisplay = igState.formattedUsername || t('instagramState.usernameUnavailable');
    const confirmed = window.confirm(
      `Are you sure you want to disconnect ${accountDisplay}? AI auto-replies will stop working for this account.`
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      const res = await fetch('/api/auth/instagram/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenant_id: selectedTenantId }),
      });
      const data = await res.json();
      if (data.success) {
        const updated = await db.getConnections(selectedTenantId);
        setConnections(updated);
      } else {
        alert(`Error disconnecting Instagram: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error disconnecting Instagram: ${err.message}`);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('integrations.title')} 
        subtitle={t('integrations.subtitle')} 
      />

      {successMessage && (
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid var(--accent-emerald)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--accent-emerald)' }}>
          <CheckCircle2 size={18} />
          <span>{t('integrations.successConnected')}</span>
        </div>
      )}

      {errorMessage && (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ef4444' }}>
          <XCircle size={18} />
          <span>{t('integrations.oauthError', { error: errorMessage })}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Instagram API Integration */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <Share2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>{t('integrations.instagramTitle')}</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('integrations.officialIgLogin')}</div>
              </div>
            </div>

            {getStatusBadge()}
          </div>

          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: '#3b82f6', marginBottom: '0.35rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={16} /> {t('integrations.directLoginFlow')}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              {t('integrations.directLoginDesc')}<br />
              <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>{t('integrations.noFbPageRequired')}</span>
            </p>
          </div>

          {isConnected ? (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('integrations.connectedAccount')}</span>
                <strong style={{ color: 'var(--text-primary)' }} className="ltr-text">
                  {igState.formattedUsername || t('instagramState.usernameUnavailable')}
                </strong>
              </div>
              {igState.instagramUserId && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('instagramState.userId')}:</span>
                  <code style={{ fontSize: '0.8rem' }} className="ltr-text">{igState.instagramUserId}</code>
                </div>
              )}
              {igState.updatedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('instagramState.lastUpdated')}:</span>
                  <span className="ltr-text">{new Date(igState.updatedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('common.status')}:</span>
                <strong style={{ color: 'var(--accent-rose)' }}>{t('instagramState.disconnected')}</strong>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {t('instagramState.notConnectedDesc')}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button 
              onClick={handleConnect}
              disabled={connecting}
              className="btn btn-primary" 
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Share2 size={14} /> {connecting ? t('common.loading') : isConnected ? t('integrations.reconnectInstagram') : t('clients.connectInstagram')}
            </button>

            {isConnected && (
              <button 
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="btn btn-secondary" 
                style={{ justifyContent: 'center', borderColor: '#ef4444', color: '#ef4444' }}
              >
                <LogOut size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} /> {disconnecting ? t('common.loading') : t('integrations.disconnect')}
              </button>
            )}
          </div>
        </div>

        {/* TikTok Connector Readiness */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#000', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>
                🎵
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>{t('integrations.tiktokTitle')}</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('integrations.tiktokSub')}</div>
              </div>
            </div>

            <span className="badge badge-review">
              {t('common.notConnected')}
            </span>
          </div>

          <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent-rose)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-rose)', marginBottom: '0.35rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={16} /> {t('integrations.tiktokApiNotice')}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              {t('integrations.tiktokApiDesc')}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">{t('integrations.tiktokAppId')}</label>
            <input type="text" className="form-input" placeholder={t('integrations.tiktokAppIdPlaceholder')} disabled />
          </div>

          <div className="form-group">
            <label className="form-label">{t('integrations.tiktokAppSecret')}</label>
            <input type="password" className="form-input" placeholder="••••••••••••" disabled />
          </div>

          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} disabled>
            <ExternalLink size={14} /> {t('integrations.tiktokAuthButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <IntegrationsContent />
    </Suspense>
  );
}
