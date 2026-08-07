import React from 'react';
import Link from 'next/link';
import { Shield, Lock, Trash2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | Restaurant Social Platform',
  description: 'Privacy Policy and Data Protection Information for Instagram API Integration',
};

export default function PrivacyPolicyPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary, #090d16)',
        color: 'var(--text-primary, #f1f5f9)',
        padding: '2rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: '800px', width: '100%', marginBottom: '1.5rem' }}>
        <Link
          href="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--text-secondary, #94a3b8)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            transition: 'all 0.2s ease',
          }}
        >
          <ArrowLeft size={16} /> Back to Login
        </Link>
      </div>

      <div
        className="glass-card"
        style={{
          maxWidth: '800px',
          width: '100%',
          padding: '2.5rem',
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div
            style={{
              margin: '0 auto 1rem auto',
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f59e0b, #e11d48)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Shield size={36} />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Privacy Policy</h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
            Instagram Integration & Data Processing Transparency • Last updated: August 2026
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {/* Section 1 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Lock size={20} /> 1. Overview & Service Purpose
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
              Our platform provides automated customer support, AI assistant responses, and social inbox management for restaurant and business Instagram Professional accounts. We interact with Meta/Instagram Graph APIs strictly to deliver these automated interaction and support services.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <CheckCircle2 size={20} /> 2. Data We Process
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.75rem' }}>
              When a business connects their Instagram Professional account to our service, we process the following minimum necessary data:
            </p>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary, #cbd5e1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>Account Identifiers:</strong> Instagram Professional account ID, username, and encrypted access tokens.</li>
              <li><strong>Direct Messages (DMs):</strong> Incoming customer inquiries sent to the business account to generate automated AI responses or forward to human support staff.</li>
              <li><strong>Comments & Mentions:</strong> Public post comments and post owner IDs for automated moderation and reply triggers.</li>
              <li><strong>Sender Metadata:</strong> Customer username/ID and timestamps required to maintain conversation threads.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Shield size={20} /> 3. How Data Is Used & Protection
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.75rem' }}>
              We handle your data with strict security standards:
            </p>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary, #cbd5e1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>No Data Selling:</strong> We do <strong>NOT</strong> sell, rent, or trade any customer, conversation, or business data to third parties under any circumstances.</li>
              <li><strong>Token Encryption:</strong> Access tokens and sensitive platform credentials are encrypted at rest using AES-256-GCM encryption.</li>
              <li><strong>Tenant Isolation:</strong> Data is isolated per business tenant using database-level Row Level Security (RLS).</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Trash2 size={20} /> 4. Data Retention & Deletion Rights
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.75rem' }}>
              Connected businesses and individual end-users have full rights to request complete deletion of their data at any time:
            </p>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary, #cbd5e1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>Account Disconnection:</strong> Disconnecting an Instagram account in the Integrations dashboard revokes access tokens and deactivates integration.</li>
              <li><strong>Automated Data Deletion Callback:</strong> We support Meta compliance automated data deletion callbacks via our endpoint at <code>/api/auth/instagram/data-deletion</code>.</li>
              <li><strong>Manual Data Removal:</strong> You can submit a manual data deletion or privacy request at any time using the contact details below.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section style={{ padding: '1.25rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Mail size={20} /> 5. Contact Us for Privacy & Deletion Requests
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.5rem' }}>
              For any questions regarding this Privacy Policy or to request immediate deletion of your account and associated conversation data, please contact our Data Protection Officer:
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <p style={{ fontWeight: 600 }}>Email: <a href="mailto:privacy@gentsecafe.be" style={{ color: '#f59e0b', textDecoration: 'none' }}>privacy@gentsecafe.be</a></p>
              <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem' }}>Address: Korenmarkt 14, 9000 Gent, Belgium</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
