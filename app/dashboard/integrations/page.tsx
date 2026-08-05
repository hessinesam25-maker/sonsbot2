'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/db/store';
import { PlatformConnection } from '@/lib/db/types';
import { 
  Share2, ShieldCheck, Lock, ExternalLink, AlertTriangle, CheckCircle2, XCircle, LogOut, RefreshCw 
} from 'lucide-react';

export default function IntegrationsPage() {
  const { selectedTenantId, isPlatformAdmin } = useAuth();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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

  const igConnection = connections.find(c => c.platform === 'instagram');
  const isConnected = Boolean(igConnection && igConnection.is_active);

  const getStatusBadge = () => {
    if (!igConnection || !igConnection.is_active) {
      return <span className="badge badge-review">Not connected</span>;
    }
    if (igConnection.token_expires_at) {
      const expires = new Date(igConnection.token_expires_at);
      const daysRemaining = (expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysRemaining <= 0) {
        return <span className="badge badge-closed" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>Reconnect required</span>;
      }
      if (daysRemaining <= 7) {
        return <span className="badge badge-review" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' }}>Token expiring</span>;
      }
    }
    return <span className="badge badge-open" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>Connected</span>;
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`/api/auth/instagram/initiate?tenant_id=${selectedTenantId}`);
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
    if (!igConnection) return;
    const confirmed = window.confirm(
      `Are you sure you want to disconnect Instagram account @${igConnection.account_name}? AI auto-replies will stop working for this account.`
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      await db.updateConnection(igConnection.id, { is_active: false });
      const updated = await db.getConnections(selectedTenantId);
      setConnections(updated);
      await db.addAuditLog({
        tenant_id: selectedTenantId,
        event_type: 'INSTAGRAM_DISCONNECTED',
        actor_type: 'user',
        details: { platform: 'instagram', account_id: igConnection.account_id },
      });
    } catch (err: any) {
      alert(`Error disconnecting Instagram: ${err.message}`);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div>
      <TopHeader 
        title="Platform Integrations Status" 
        subtitle="Instagram API with Instagram Login & TikTok Business Messaging Readiness" 
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Instagram API with Instagram Login Integration */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Share2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Instagram Professional (Instagram Login)</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Official Instagram Login & Graph API v20.0</div>
              </div>
            </div>

            {getStatusBadge()}
          </div>

          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: '#3b82f6', marginBottom: '0.35rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={16} /> Direct Instagram Login Flow
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              Connect your <strong>Instagram Professional (Business or Creator)</strong> account directly with your Instagram login credentials.<br />
              <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>No Facebook account, Facebook Page, or Page selection required!</span>
            </p>
          </div>

          {isConnected && igConnection ? (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Connected Account:</span>
                <strong style={{ color: 'var(--text-primary)' }}>@{igConnection.account_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Instagram User ID:</span>
                <code style={{ fontSize: '0.8rem' }}>{igConnection.account_id}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Token Encryption:</span>
                <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                  <Lock size={12} /> AES-256-GCM Encrypted
                </span>
              </div>
              {igConnection.token_expires_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Token Expiry:</span>
                  <span>{new Date(igConnection.token_expires_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <strong style={{ color: 'var(--accent-amber)' }}>Not Connected</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Account Requirement:</span>
                <span>Professional (Business / Creator)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>OAuth Flow:</span>
                <span>Instagram API with Instagram Login</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              onClick={handleConnect}
              disabled={connecting}
              className="btn btn-primary" 
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Share2 size={14} /> {connecting ? 'Connecting...' : isConnected ? 'Reconnect Instagram' : 'Connect Instagram'}
            </button>

            {isConnected && (
              <button 
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="btn btn-secondary" 
                style={{ justifyContent: 'center', borderColor: '#ef4444', color: '#ef4444' }}
              >
                <LogOut size={14} /> {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}
          </div>
        </div>

        {/* TikTok Connector Readiness */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#000', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>
                🎵
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>TikTok Business Messaging</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Modular Provider Connector</div>
              </div>
            </div>

            <span className="badge badge-review">
              Not connected
            </span>
          </div>

          <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent-rose)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-rose)', marginBottom: '0.35rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={16} /> Official TikTok Business API Access Required
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              <strong>Not connected — official TikTok API access required.</strong><br />
              This platform uses zero unofficial web scraping, browser automation, cookie sharing, or mobile emulation. Connecting TikTok requires official TikTok Business Messaging API app authorization.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">TikTok App ID</label>
            <input type="text" className="form-input" placeholder="Enter TikTok App ID when authorized..." disabled />
          </div>

          <div className="form-group">
            <label className="form-label">TikTok App Secret</label>
            <input type="password" className="form-input" placeholder="Enter TikTok App Secret..." disabled />
          </div>

          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} disabled>
            <ExternalLink size={14} /> Open TikTok Developer Portal Authorization
          </button>
        </div>
      </div>
    </div>
  );
}
