import React from 'react';
import Link from 'next/link';
import { Shield, Lock, Trash2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | Instagram Bot',
  description: 'Privacy Policy and Data Protection Information for Instagram Integration',
};

export default function PrivacyPolicyPage() {
  return (
    <div
      dir="ltr"
      lang="en"
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary, #090d16)',
        color: 'var(--text-primary, #f1f5f9)',
        padding: '2rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        textAlign: 'left',
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
          textAlign: 'left',
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
            Instagram Integration & Data Processing Policy • Last updated: August 2026
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {/* Section 1 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Lock size={20} /> 1. Overview & Service Purpose
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
              Our application provides automated customer-support replies for connected Instagram Professional accounts based on predefined rules and configured responses. We interact with the Instagram Graph API strictly to process incoming messages and comments to send these automated responses.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <CheckCircle2 size={20} /> 2. Data We Process
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.75rem' }}>
              When an Instagram Professional account connects to our application, we process the following data:
            </p>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary, #cbd5e1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>Account Identifiers:</strong> Instagram Professional account ID, username, and encrypted access tokens.</li>
              <li><strong>Direct Messages:</strong> Messages received by the connected Instagram account to trigger rule-based replies.</li>
              <li><strong>Comments:</strong> Comments left on the connected Instagram account posts for automated keyword and rule matching.</li>
              <li><strong>Sender Metadata:</strong> Basic sender identifiers (such as Instagram user ID and username) necessary to deliver replies.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Shield size={20} /> 3. Data Protection & Security
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.75rem' }}>
              We implement the following technical protections:
            </p>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary, #cbd5e1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>No Data Selling:</strong> We do <strong>NOT</strong> sell, trade, or rent any stored user or business data to third parties.</li>
              <li><strong>Access Token Encryption:</strong> Instagram OAuth access tokens are encrypted at rest using AES-256-GCM encryption before database storage.</li>
              <li><strong>Database Row Level Security (RLS):</strong> Data is isolated per tenant in the database using Supabase Row Level Security policies.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Trash2 size={20} /> 4. Data Retention & Deletion Requests
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.75rem' }}>
              Users and connected account owners have the right to request deletion of their stored data at any time:
            </p>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary, #cbd5e1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>Account Disconnection:</strong> Connected accounts can be disconnected via the integrations page, which revokes active connection status.</li>
              <li><strong>Manual Data Deletion:</strong> You can request complete deletion of stored messages, comments, or account connections by emailing us at <a href="mailto:hessinesam25@gmail.com" style={{ color: '#f59e0b', textDecoration: 'underline' }}>hessinesam25@gmail.com</a>. Requests are processed manually upon verification.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section style={{ padding: '1.25rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Mail size={20} /> 5. Privacy Contact Information
            </h2>
            <p style={{ color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.5rem' }}>
              For any questions regarding this Privacy Policy or to submit a data deletion request, please reach out directly:
            </p>
            <p style={{ fontWeight: 600, color: '#f1f5f9' }}>
              Email: <a href="mailto:hessinesam25@gmail.com" style={{ color: '#f59e0b', textDecoration: 'none' }}>hessinesam25@gmail.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
