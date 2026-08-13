'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  TrendingUp, BarChart3, Lock, AlertCircle, RefreshCw, 
  ExternalLink, MessageSquare, Image as ImageIcon, Heart, Send, CheckCircle2 
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';
import { InstagramMedia, InstagramConnectionState } from '@/lib/db/types';

export default function InstagramAnalyticsPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();

  const [igState, setIgState] = useState<InstagramConnectionState | null>(null);
  const [mediaList, setMediaList] = useState<InstagramMedia[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [convsCount, setConvsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      try {
        const connState = await db.getInstagramConnectionState(selectedTenantId);
        setIgState(connState);

        const media = await db.getInstagramMedia(selectedTenantId);
        setMediaList(media);

        const comments = await db.getComments(selectedTenantId);
        setCommentsCount(comments.length);

        const convs = await db.getConversations(selectedTenantId);
        setConvsCount(convs.length);
      } catch (err) {
        console.error('Error loading analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, [selectedTenantId]);

  const restaurantName = tenant?.name || '';
  const isConnected = Boolean(igState?.connected);

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('analytics.title', { restaurant: restaurantName }) || (direction === 'rtl' ? `تحليلات إنستجرام — ${restaurantName}` : `Instagram Analytics — ${restaurantName}`)} 
        subtitle={direction === 'rtl' ? 'إحصائيات الأداء والمشاركة المتاحة لحساب إنستجرام' : 'Performance and engagement analytics for your Instagram account'} 
      />

      {/* Time Range Filter Bar */}
      <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`badge badge-${isConnected ? 'resolved' : 'review'}`} style={{ fontSize: '0.78rem' }}>
            Instagram {isConnected ? (direction === 'rtl' ? 'متصل' : 'Connected') : (direction === 'rtl' ? 'غير متصل' : 'Disconnected')}
          </span>
          {isConnected && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              @{igState?.username || 'instagram_account'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              className={`btn ${timeRange === range ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
              onClick={() => setTimeRange(range)}
            >
              {range === '7d' ? (direction === 'rtl' ? '7 أيام' : '7 Days') : range === '30d' ? (direction === 'rtl' ? '30 يوم' : '30 Days') : (direction === 'rtl' ? '90 يوم' : '90 Days')}
            </button>
          ))}
        </div>
      </div>

      {/* Permission Notice Banner */}
      <div 
        className="glass-card" 
        style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem 1.25rem', 
          background: 'rgba(245, 158, 11, 0.1)', 
          borderInlineStart: '4px solid var(--accent-amber)',
          fontSize: '0.88rem',
          lineHeight: 1.5
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-amber)', fontWeight: 700, marginBottom: '0.35rem' }}>
          <AlertCircle size={18} />
          <span>{direction === 'rtl' ? 'ملاحظة أذونات الإحصائيات Advanced Insights' : 'Instagram Insights Permission Notice'}</span>
        </div>
        <div>
          {direction === 'rtl' 
            ? 'تتطلب إحصائيات الوصول والانطباعات المتقدمة (Reach & Impressions) تصريح instagram_business_manage_insights. يعرض هذا الجدول البيانات الحقيقية المؤكدة المتاحة حالياً.' 
            : 'Advanced reach and impression metrics require instagram_business_manage_insights scope. The metrics below display real confirmed synchronized performance data.'}
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="glass-card">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ImageIcon size={16} color="var(--accent-amber)" />
            {direction === 'rtl' ? 'المنشورات المتزامنة' : 'Synced Posts'}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{mediaList.length}</div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <MessageSquare size={16} color="var(--accent-cyan)" />
            {direction === 'rtl' ? 'التعليقات المتزامنة' : 'Synced Comments'}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{commentsCount}</div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Send size={16} color="var(--accent-emerald)" />
            {direction === 'rtl' ? 'المحادثات المتزامنة' : 'Synced Conversations'}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{convsCount}</div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <TrendingUp size={16} color="var(--accent-rose)" />
            {direction === 'rtl' ? 'إجمالي التفاعلات' : 'Total Interactions'}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{commentsCount + mediaList.reduce((acc, m) => acc + (m.like_count || 0), 0)}</div>
        </div>
      </div>

      {/* Top Synchronized Content Performance */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart3 size={20} color="var(--accent-amber)" />
          {direction === 'rtl' ? 'أفضل المحتوى أداءً' : 'Top Performing Content'}
        </h3>

        {mediaList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            {direction === 'rtl' ? 'لا يوجد محتوى متزامن للعرض.' : 'No synchronized content available.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {mediaList.map((item) => (
              <div 
                key={item.id} 
                style={{ 
                  background: 'rgba(0,0,0,0.2)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 'var(--radius-sm)', 
                  padding: '1rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {item.media_url ? (
                    <img src={item.media_url} alt="Media" style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={24} />
                    </div>
                  )}

                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                      {item.caption || (direction === 'rtl' ? 'منشور إنستجرام' : 'Instagram Post')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                      <span>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : ''}</span>
                      <span className="badge badge-open" style={{ fontSize: '0.65rem' }}>{item.media_type}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Heart size={14} color="var(--accent-rose)" /> {item.like_count ?? 0}
                  </div>
                  <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MessageSquare size={14} color="var(--accent-amber)" /> {item.comments_count ?? 0}
                  </div>

                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    >
                      <ExternalLink size={13} /> {direction === 'rtl' ? 'عرض على إنستجرام' : 'View on IG'}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
