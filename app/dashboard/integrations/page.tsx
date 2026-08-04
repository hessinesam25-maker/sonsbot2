'use client';

import React from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  Share2, ShieldCheck, Lock, ExternalLink, AlertTriangle, RefreshCw 
} from 'lucide-react';

export default function IntegrationsPage() {
  return (
    <div>
      <TopHeader 
        title="Platform Integrations Status" 
        subtitle="Meta Graph API OAuth Preparation & TikTok Business Messaging Readiness" 
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Instagram / Meta Integration */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Share2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Instagram Professional (Meta Graph API)</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Official Graph API v19.0 Preparation</div>
              </div>
            </div>

            <span className="badge badge-review">
              Not verified
            </span>
          </div>

          <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--accent-amber)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.35rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={16} /> Meta Developer App Integration Status
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              The local Meta OAuth handler and webhook ingestion endpoints are prepared at <code>http://localhost:3000/api/auth/instagram/callback</code> and <code>http://localhost:3000/api/webhooks/instagram</code>.
              Meta cannot call localhost directly. Live verification requires an external HTTPS URL (e.g. via ngrok) or production domain.
            </p>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
              <strong style={{ color: 'var(--accent-amber)' }}>Not verified (Local Preparation Mode)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Token Storage:</span>
              <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                <Lock size={12} /> AES-256-GCM Encrypted
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Webhook Verification:</span>
              <span>HMAC-SHA256 Ready</span>
            </div>
          </div>

          <a 
            href="http://localhost:3000/api/auth/instagram/callback?error=local_test"
            className="btn btn-secondary" 
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <RefreshCw size={14} /> Test Local OAuth Callback Handler
          </a>
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
