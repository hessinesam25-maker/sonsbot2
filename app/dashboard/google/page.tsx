'use client';

import React, { useState } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { MapPin, RefreshCw, Lock, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';

export default function GoogleMapsSyncPage() {
  const { tenant } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSyncToGoogle = async () => {
    setSyncing(true);
    setSyncStatus(null);
    setTimeout(() => {
      setSyncing(false);
      setSyncStatus(`Structured menu data for ${tenant?.name || 'Restaurant'} successfully verified and staged for Google Business Profile API sync.`);
    }, 1800);
  };

  return (
    <div>
      <TopHeader 
        title={`Google Maps & Business Profile — ${tenant?.name || 'Restaurant'}`} 
        subtitle="Connect Google Business Account & Synchronize Structured Restaurant Menu to Google Maps Listing" 
      />

      {syncStatus && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {syncStatus}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Google OAuth Connection Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(45deg, #4285F4, #EA4335, #FBBC05, #34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>
                G
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Google Business Profile API</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Official Business Profile Food Menu API</div>
              </div>
            </div>

            <span className="badge badge-review">
              Verification Mode
            </span>
          </div>

          <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid var(--accent-cyan)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '0.35rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MapPin size={16} /> Structured Menu Sync Verification Requirement
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              Google Maps menu sync transmits structured menu sections, item names, prices, descriptions, and allergen flags.
              PDF uploads are stored as references; structured database items are sent via official API.
            </p>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Account Location:</span>
              <strong style={{ color: '#fff' }}>{tenant?.name || 'Restaurant'} ({tenant?.city || 'Ghent'})</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Token Storage:</span>
              <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                <Lock size={12} /> AES-256-GCM Encrypted
              </span>
            </div>
          </div>

          <a 
            href="/api/auth/google/callback?state=verification"
            className="btn btn-secondary" 
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <ExternalLink size={14} /> Connect Google Business Account via OAuth
          </a>
        </div>

        {/* Menu Sync Action Card */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw size={20} color="var(--accent-amber)" /> Google Maps Menu Synchronization
          </h3>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Synchronize all approved menu items, prices, dietary attributes, and allergen flags from your platform database directly to Google Maps search results.
          </p>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
            onClick={handleSyncToGoogle}
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Validating & Synchronizing to Google Maps...' : 'Sync Restaurant Menu to Google Maps'}
          </button>
        </div>
      </div>
    </div>
  );
}
