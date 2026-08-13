'use client';

import React, { useState } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Image, Video, Calendar, Clock, Send, AlertTriangle, ShieldCheck, CheckCircle2, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function ContentStudioPage() {
  const { tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [contentType, setContentType] = useState<'image' | 'video' | 'carousel' | 'reel'>('image');
  const [caption, setCaption] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [publishNow, setPublishNow] = useState(true);
  const [mediaFile, setMediaFile] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const metaCapabilities = {
    image: { supported: true, notice: 'Supported via Meta Graph API container endpoint (/me/media).' },
    video: { supported: true, notice: 'Supported for posts up to 60s.' },
    carousel: { supported: true, notice: 'Supported up to 10 images/videos.' },
    reel: { supported: true, notice: 'Supported via IG Reel media containers.' },
  };

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption) return;

    setStatusMessage(`Post successfully ${publishNow ? 'published' : 'scheduled'} for ${tenant?.name || 'Restaurant'}!`);
    setTimeout(() => {
      setStatusMessage('');
      setCaption('');
      setMediaFile(null);
    }, 3000);
  };

  const restaurantName = tenant?.name || '';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('content.title', { restaurant: restaurantName })} 
        subtitle={t('content.subtitle')} 
      />

      {statusMessage && (
        <div style={{ background: statusMessage.startsWith('Error') ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)', border: `1px solid ${statusMessage.startsWith('Error') ? 'var(--accent-rose)' : 'var(--accent-emerald)'}`, padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: statusMessage.startsWith('Error') ? 'var(--accent-rose)' : 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {statusMessage.startsWith('Error') ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          {statusMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Creator Form */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Image size={22} color="var(--accent-amber)" /> {t('content.postCreatorTitle')}
          </h3>

          <form onSubmit={handleCreatePost}>
            <div className="form-group">
              <label className="form-label">{t('content.selectContentType')}</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['image', 'video', 'carousel', 'reel'] as const).map((type) => {
                  return (
                    <button
                      key={type}
                      type="button"
                      className={`btn ${contentType === type ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', textTransform: 'capitalize' }}
                      onClick={() => setContentType(type)}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {metaCapabilities[contentType].notice}
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">{t('content.mediaUploadTitle')}</label>
              <div style={{ border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)' }}>
                <Upload size={24} style={{ margin: '0 auto 0.5rem auto', color: 'var(--text-muted)' }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('content.dragDropMedia')}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{t('content.maxFileSize')}</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('content.captionHashtags')}</label>
              <textarea 
                className="form-textarea" 
                rows={4} 
                placeholder={t('content.captionPlaceholder', { restaurant: restaurantName })}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('content.publishingSchedule')}</label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                  <input type="radio" name="schedule" checked={publishNow} onChange={() => setPublishNow(true)} /> {t('content.publishNow')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                  <input type="radio" name="schedule" checked={!publishNow} onChange={() => setPublishNow(false)} /> {t('content.scheduleLater')}
                </label>
              </div>

              {!publishNow && (
                <input 
                  type="datetime-local" 
                  className="form-input" 
                  value={scheduleDate} 
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', marginTop: '0.5rem' }}>
              <Send size={16} className={direction === 'rtl' ? 'rtl-flip' : ''} /> {publishNow ? t('content.publishToIg') : t('content.scheduleForRestaurant')}
            </button>
          </form>
        </div>

        {/* Live Instagram Mobile Preview */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} color="var(--accent-cyan)" /> {t('content.livePreviewTitle')}
          </h3>

          <div style={{ width: '280px', margin: '0 auto', border: '2px solid var(--border-color)', borderRadius: '24px', padding: '12px', background: '#000', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                {(restaurantName || 'R')[0]}
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }} className="ltr-text">{restaurantName || 'restaurant_official'}</div>
            </div>

            <div style={{ width: '100%', height: '220px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('content.mediaPreviewBox', { type: contentType.toUpperCase() })}
            </div>

            <div style={{ marginTop: '10px', fontSize: '0.78rem', lineHeight: 1.4 }}>
              <strong className="ltr-text">{restaurantName || 'restaurant_official'}</strong> {caption || t('content.captionPreviewFallback')}
            </div>
          </div>
        </div>
      </div>

      {/* Instagram Analytics & Insights Foundation Card */}
      <div className="glass-card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={20} color="var(--accent-amber)" /> {t('content.insightsTitle')}
        </h3>

        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--accent-amber)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', color: '#fff', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--accent-amber)', display: 'block', marginBottom: '0.35rem' }}>
            {t('content.insightsNoticeTitle')}
          </strong>
          {t('content.insightsNoticeDesc')}
        </div>
      </div>
    </div>
  );
}
