'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  Image as ImageIcon, Video, Calendar, Clock, Send, 
  AlertTriangle, ShieldCheck, CheckCircle2, Sparkles, Upload, 
  ExternalLink, Heart, MessageSquare, Filter, RefreshCw 
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';
import { InstagramMedia, PlatformConnection } from '@/lib/db/types';

export default function ContentStudioPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();

  const [activeTab, setActiveTab] = useState<'library' | 'composer'>('library');
  const [mediaList, setMediaList] = useState<InstagramMedia[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [igConnected, setIgConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Composer States
  const [contentType, setContentType] = useState<'image' | 'video' | 'carousel' | 'reel'>('image');
  const [caption, setCaption] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [publishNow, setPublishNow] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  const loadContentData = async () => {
    const list = await db.getInstagramMedia(selectedTenantId);
    setMediaList(list);

    const connState = await db.getInstagramConnectionState(selectedTenantId);
    setIgConnected(Boolean(connState?.connected));

    const conns = await db.getConnections(selectedTenantId);
    const activeIg = conns.find((c: PlatformConnection) => c.platform === 'instagram' && c.is_active);
    if (activeIg?.last_synced_at) {
      setLastSyncTime(activeIg.last_synced_at);
    }
  };

  useEffect(() => {
    loadContentData();
  }, [selectedTenantId]);

  const filteredMedia = mediaList.filter(item => {
    if (selectedFilter === 'posts') return item.media_type === 'IMAGE' || item.media_product_type === 'FEED';
    if (selectedFilter === 'reels') return item.media_product_type === 'REELS' || item.media_type === 'REEL';
    if (selectedFilter === 'videos') return item.media_type === 'VIDEO';
    return true;
  });

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
    }, 3000);
  };

  const restaurantName = tenant?.name || '';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('content.title', { restaurant: restaurantName })} 
        subtitle={t('content.subtitle')} 
      />

      {/* Instagram Sync Operational Status Header */}
      <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`badge badge-${igConnected ? 'resolved' : 'review'}`} style={{ fontSize: '0.78rem' }}>
            Instagram {igConnected ? t('instagramState.connected') : t('instagramState.disconnected')}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t('comments.lastSync')} {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : t('comments.neverSynced')}
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-amber)' }}>
          {mediaList.length} {direction === 'rtl' ? 'عناصر وسائط متزامنة' : 'Synced Media Posts'}
        </div>
      </div>

      {/* View Selector Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          className={`btn ${activeTab === 'library' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('library')}
          style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
        >
          <ImageIcon size={16} /> {direction === 'rtl' ? 'محتوى إنستجرام' : 'Instagram Content'}
        </button>
        <button
          className={`btn ${activeTab === 'composer' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('composer')}
          style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
        >
          <Send size={16} /> {direction === 'rtl' ? 'إنشاء ونشر منشور' : 'Post Creator'}
        </button>
      </div>

      {/* TAB 1: INSTAGRAM CONTENT LIBRARY */}
      {activeTab === 'library' && (
        <div>
          {/* Filters Bar */}
          <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Filter size={16} /> {direction === 'rtl' ? 'التصفية حسب نوع الوسائط:' : 'Filter Media:'}
            </span>
            {['all', 'posts', 'reels', 'videos'].map((filter) => (
              <button
                key={filter}
                className={`btn ${selectedFilter === filter ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', textTransform: 'capitalize' }}
                onClick={() => setSelectedFilter(filter)}
              >
                {filter === 'all' ? (direction === 'rtl' ? 'الكل' : 'All') : filter}
              </button>
            ))}
          </div>

          {/* Media Grid */}
          {filteredMedia.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <ImageIcon size={40} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                {direction === 'rtl' ? 'لا يوجد محتوى إنستجرام متزامن لعرضه.' : 'No synchronized Instagram content available for this restaurant.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {filteredMedia.map((item) => (
                <div key={item.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ position: 'relative', width: '100%', height: '200px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000', marginBottom: '0.85rem' }}>
                    {item.media_url ? (
                      <img src={item.media_url} alt="Instagram Media" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        <ImageIcon size={32} />
                      </div>
                    )}
                    <span 
                      className="badge badge-open" 
                      style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.7rem', background: 'rgba(0,0,0,0.75)' }}
                    >
                      {item.media_product_type || item.media_type}
                    </span>
                  </div>

                  <div style={{ flex: 1, fontSize: '0.88rem', lineHeight: 1.4, marginBottom: '0.85rem' }}>
                    {item.caption || (direction === 'rtl' ? 'بدون وصف' : 'No caption')}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : ''}</span>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Heart size={13} color="var(--accent-rose)" /> {item.like_count ?? 0}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <MessageSquare size={13} color="var(--accent-amber)" /> {item.comments_count ?? 0}
                      </span>
                    </div>
                  </div>

                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', padding: '0.45rem' }}
                    >
                      <ExternalLink size={14} /> {direction === 'rtl' ? 'عرض على إنستجرام' : 'View on Instagram'}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: POST CREATOR & PUBLISHING COMPOSER */}
      {activeTab === 'composer' && (
        <div>
          {statusMessage && (
            <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={18} />
              {statusMessage}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Creator Form */}
            <div className="glass-card">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ImageIcon size={22} color="var(--accent-amber)" /> {t('content.postCreatorTitle')}
              </h3>

              <form onSubmit={handleCreatePost}>
                <div className="form-group">
                  <label className="form-label">{t('content.selectContentType')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['image', 'video', 'carousel', 'reel'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`btn ${contentType === type ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', textTransform: 'capitalize' }}
                        onClick={() => setContentType(type)}
                      >
                        {type}
                      </button>
                    ))}
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

            {/* Live Preview */}
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
        </div>
      )}
    </div>
  );
}
