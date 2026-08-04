'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { ShieldCheck, LogIn, Lock, Mail, AlertCircle, Globe } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, language, setLanguage, direction } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      router.push('/dashboard');
    } else {
      setErrorMessage(result.error || t('login.accessDenied'));
    }
  };

  return (
    <div 
      dir={direction}
      style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'var(--bg-primary)', 
        padding: '1rem',
        position: 'relative'
      }}
    >
      {/* Top Bar Language Selector */}
      <div style={{ position: 'absolute', top: '1.5rem', right: direction === 'rtl' ? 'auto' : '1.5rem', left: direction === 'rtl' ? '1.5rem' : 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Globe size={18} color="var(--text-secondary)" />
        <button 
          onClick={() => setLanguage('ar')}
          className={`btn ${language === 'ar' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
        >
          العربية (AR)
        </button>
        <button 
          onClick={() => setLanguage('en')}
          className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
        >
          English (EN)
        </button>
      </div>

      <div className="glass-card" style={{ width: '460px', padding: '2.25rem', border: '1px solid var(--border-color)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div 
            className="brand-logo" 
            style={{ 
              margin: '0 auto 1rem auto', 
              width: '56px', 
              height: '56px', 
              fontSize: '1.5rem', 
              background: 'linear-gradient(135deg, var(--accent-amber), var(--accent-rose))', 
              borderRadius: '16px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#fff' 
            }}
          >
            <ShieldCheck size={30} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{t('common.platformName')}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {t('login.subtitle')}
          </p>
        </div>

        {errorMessage && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid var(--accent-rose)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} /> {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">{t('login.emailLabel')}</label>
            <div style={{ position: 'relative' }}>
              <Mail 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: direction === 'rtl' ? 'auto' : '12px', 
                  right: direction === 'rtl' ? '12px' : 'auto', 
                  top: '12px', 
                  color: 'var(--text-secondary)' 
                }} 
              />
              <input 
                type="email" 
                className="form-input"
                style={{ 
                  paddingLeft: direction === 'rtl' ? '12px' : '38px', 
                  paddingRight: direction === 'rtl' ? '38px' : '12px',
                  direction: 'ltr',
                  textAlign: direction === 'rtl' ? 'right' : 'left'
                }}
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('login.passwordLabel')}</label>
            <div style={{ position: 'relative' }}>
              <Lock 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: direction === 'rtl' ? 'auto' : '12px', 
                  right: direction === 'rtl' ? '12px' : 'auto', 
                  top: '12px', 
                  color: 'var(--text-secondary)' 
                }} 
              />
              <input 
                type="password" 
                className="form-input"
                style={{ 
                  paddingLeft: direction === 'rtl' ? '12px' : '38px', 
                  paddingRight: direction === 'rtl' ? '38px' : '12px' 
                }}
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button 
              type="button" 
              className="btn-link" 
              style={{ background: 'none', border: 'none', color: 'var(--accent-amber)', fontSize: '0.82rem', cursor: 'pointer', padding: 0 }}
              onClick={() => alert('Password reset links must be issued by the platform administrator via Supabase dashboard.')}
            >
              {t('login.forgotPassword')}
            </button>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }} 
            disabled={loading}
          >
            <LogIn size={18} /> {loading ? t('login.authenticating') : t('login.signInButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
