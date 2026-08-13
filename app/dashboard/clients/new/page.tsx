'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopHeader } from '@/components/TopHeader';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { Building2, Save, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

export default function NewRestaurantClientPage() {
  const router = useRouter();
  const { isPlatformAdmin } = useAuth();
  const { t, direction } = useLanguage();

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    contact_email: '',
    phone: '',
    address: '',
    city: 'Ghent',
    country: 'Belgium',
    default_locale: 'ar',
    timezone: 'Europe/Brussels',
    logo_url: '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('common.error'));
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/dashboard/clients/${data.id || ''}`);
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isPlatformAdmin) {
    return (
      <div dir={direction}>
        <TopHeader title={t('clients.title')} subtitle={t('login.accessDenied')} />
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={36} color="var(--accent-rose)" style={{ margin: '0 auto 1rem auto' }} />
          <h3>{t('login.accessDenied')}</h3>
        </div>
      </div>
    );
  }

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('clients.addNew')} 
        subtitle={t('clients.subtitle')} 
      />

      <div style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary" onClick={() => router.push('/dashboard/clients')}>
          <ArrowLeft size={16} className={direction === 'rtl' ? 'rtl-flip' : ''} /> {t('common.back')}
        </button>
      </div>

      {success && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {t('clients.provisionSuccess')}
        </div>
      )}

      {errorMsg && (
        <div style={{ background: 'rgba(244, 63, 94, 0.2)', border: '1px solid var(--accent-rose)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <div className="glass-card" style={{ maxWidth: '680px' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Building2 size={22} color="var(--accent-amber)" /> {t('clients.addNew')}
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('clients.formName')} *</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Brasserie Het Gravensteen" 
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('clients.formEmail')}</label>
              <input 
                type="email" 
                className="form-input" 
                placeholder="contact@restaurant.be" 
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('clients.formPhone')}</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="+32 9 123 45 67" 
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('clients.formCity')}</label>
              <input 
                type="text" 
                className="form-input" 
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('clients.formCountry')}</label>
              <input 
                type="text" 
                className="form-input" 
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('clients.formAddress')}</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Sint-Veerleplein 5, 9000 Gent"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('clients.formLocale')}</label>
              <select 
                className="form-select" 
                value={formData.default_locale}
                onChange={(e) => setFormData({ ...formData, default_locale: e.target.value })}
              >
                <option value="ar">العربية (Arabic - AR)</option>
                <option value="en">English (EN)</option>
                <option value="nl">Nederlands (NL)</option>
                <option value="fr">Français (FR)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('clients.formTimezone')}</label>
              <select 
                className="form-select" 
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              >
                <option value="Europe/Brussels">Europe/Brussels (Belgian Standard)</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="America/New_York">America/New_York</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('clients.formLogo')}</label>
            <input 
              type="url" 
              className="form-input" 
              placeholder="https://example.com/logo.png"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => router.push('/dashboard/clients')}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Save size={16} /> {loading ? t('common.loading') : t('clients.provisionButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
