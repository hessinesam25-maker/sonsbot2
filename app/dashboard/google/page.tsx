'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { MapPin, Lock, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabaseFrontend } from '@/lib/db/client';

export default function GoogleBusinessIntegrationPage() {
  const { selectedTenantId, tenant } = useAuth();
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

  const handleConnectClick = () => {
    alert(`Google Business Profile Integration Entry Point: Directing to Google OAuth flow for ${tenant?.name || 'store'}. Required Google My Business API credentials pending production configuration.`);
  };

  return (
    <div>
      <TopHeader 
        title={`Google Business Profile — ${tenant?.name || 'Restaurant'}`} 
        subtitle="Manage Google Business Info, Reviews & Google Maps Menu Sync Entry Point" 
      />

      <div style={{ maxWidth: '850px' }}>
        {/* Google OAuth Entry Point Card */}
        <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(45deg, #4285F4, #EA4335, #FBBC05, #34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>
                G
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Google Business Profile & Maps Sync</h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Integration target for: <strong>{tenant?.name || 'Restaurant'}</strong> ({tenant?.city || 'Ghent'})
                </div>
              </div>
            </div>

            <span className={`badge ${connection?.is_active ? 'badge-open' : 'badge-review'}`} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
              Status: {loading ? 'Checking...' : connection?.is_active ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Store Location:</span>
              <strong style={{ color: '#fff' }}>{tenant?.address || 'Address'}, {tenant?.city || 'Ghent'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Token Security:</span>
              <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                <Lock size={13} /> AES-256-GCM Encrypted Storage
              </span>
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontSize: '0.9rem' }}
            onClick={handleConnectClick}
          >
            <ExternalLink size={16} /> {connection?.is_active ? 'Reconnect Google Business Account' : 'Connect Google Business Profile'}
          </button>
        </div>

        {/* Technical Requirements & Future API Scope Notice */}
        <div className="glass-card" style={{ border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} color="var(--accent-amber)" /> Integration Technical Requirements
          </h3>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Connecting Google Business Profile will enable multi-location menu synchronization, Google Maps review monitoring, and business info updates directly from this dashboard.
          </p>

          <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <strong>Required production steps for full enablement:</strong>
            <ul style={{ marginTop: '0.35rem', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
              <li>Create Google Cloud Console OAuth 2.0 Client Credentials</li>
              <li>Enable Google My Business Business Information API & Food Menus API</li>
              <li>Configure <code>/api/auth/google/callback</code> server endpoint</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
