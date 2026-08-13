'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { 
  MessageSquare, Inbox, ShieldAlert, Utensils, 
  Share2, Sliders, CheckCircle2, AlertTriangle, ArrowRight 
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/db/store';
import Link from 'next/link';

export default function OverviewDashboard() {
  const { tenant, selectedTenantId } = useAuth();
  const { t, direction } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [igState, setIgState] = useState<import('@/lib/db/types').InstagramConnectionState>({
    connected: false,
    status: 'disconnected',
    hasPlaceholderUsername: false,
  });
  const [data, setData] = useState({
    openConversationsCount: 0,
    takeoverConversationsCount: 0,
    totalCommentsCount: 0,
    menuItemsCount: 0,
    isDmAutoReplyEnabled: false,
    defaultDmReply: '',
  });

  useEffect(() => {
    async function loadTenantDashboardData() {
      setLoading(true);
      try {
        const state = await db.getInstagramConnectionState(selectedTenantId);
        setIgState(state);

        const conversations = await db.getConversations(selectedTenantId);
        const openConvs = conversations.filter(c => c.status === 'open' || c.status === 'needs_human_review');
        const takeoverConvs = conversations.filter(c => c.human_takeover || c.is_manual_takeover);

        const comments = await db.getComments(selectedTenantId);
        const menu = await db.getMenu(selectedTenantId);
        const rules = await db.getAutomationRules(selectedTenantId);

        setData({
          openConversationsCount: openConvs.length,
          takeoverConversationsCount: takeoverConvs.length,
          totalCommentsCount: comments.length,
          menuItemsCount: menu.length,
          isDmAutoReplyEnabled: Boolean(rules?.auto_reply_factual_questions),
          defaultDmReply: rules?.default_dm_reply || '',
        });
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTenantDashboardData();
  }, [selectedTenantId]);

  const restaurantName = tenant?.name || '';
  const city = tenant?.city || 'Ghent';
  const country = tenant?.country || 'Belgium';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('dashboard.overviewTitle', { restaurant: restaurantName })} 
        subtitle={t('dashboard.overviewSubtitle', { restaurant: restaurantName, city, country })} 
      />

      {/* Operational Cards Grid */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {/* Instagram Connection Status */}
        <div className="glass-card stat-card" style={{ border: `1px solid ${igState.connected ? 'var(--accent-emerald)' : 'var(--accent-rose)'}` }}>
          <div className="stat-icon" style={{ background: igState.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)', color: igState.connected ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
            <Share2 size={26} />
          </div>
          <div>
            <div className="stat-val" style={{ fontSize: '1.15rem' }}>
              {loading
                ? '...'
                : igState.connected
                ? <span className="ltr-text">{igState.formattedUsername || t('instagramState.usernameUnavailable')}</span>
                : t('instagramState.disconnected')}
            </div>
            <div className="stat-lbl">{t('instagramState.connectionStatus')}</div>
          </div>
        </div>

        {/* Active Open Conversations */}
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' }}>
            <Inbox size={26} />
          </div>
          <div>
            <div className="stat-val">{loading ? '...' : data.openConversationsCount}</div>
            <div className="stat-lbl">{t('dashboard.openCustomerConvs')}</div>
          </div>
        </div>

        {/* Human Operator Takeovers */}
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)' }}>
            <ShieldAlert size={26} />
          </div>
          <div>
            <div className="stat-val">{loading ? '...' : data.takeoverConversationsCount}</div>
            <div className="stat-lbl">{t('dashboard.manualHandoffConvs')}</div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-indigo)' }}>
            <Utensils size={26} />
          </div>
          <div>
            <div className="stat-val">{loading ? '...' : data.menuItemsCount}</div>
            <div className="stat-lbl">{t('dashboard.configuredMenuItems')}</div>
          </div>
        </div>
      </div>

      {/* Main Operational Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* DM Automation & Fixed Reply Status */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={20} color="var(--accent-amber)" /> {t('dashboard.dmAutomationStatus')}
            </h3>
            <Link href="/dashboard/rules" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>
              {t('dashboard.configureRules')} <ArrowRight size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} />
            </Link>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{t('dashboard.dmAutoReplyState')}</span>
              <span className={`badge ${!igState.connected ? 'badge-review' : data.isDmAutoReplyEnabled ? 'badge-open' : 'badge-review'}`}>
                {!igState.connected
                  ? t('dashboard.stateUnavailable')
                  : data.isDmAutoReplyEnabled
                  ? t('dashboard.stateEnabled')
                  : t('dashboard.statePaused')}
              </span>
            </div>

            {!igState.connected && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--accent-rose)', padding: '0.65rem 0.85rem', borderRadius: '4px', color: 'var(--accent-rose)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                <AlertTriangle size={14} style={{ display: 'inline', marginInlineEnd: '0.4rem', verticalAlign: '-2px' }} />
                {t('instagramState.connectFirstNotice')}
              </div>
            )}

            <div style={{ fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                {t('dashboard.activeFixedReply', { restaurant: restaurantName })}
              </span>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--accent-amber)', fontStyle: data.defaultDmReply ? 'normal' : 'italic', color: data.defaultDmReply ? '#fff' : 'var(--text-muted)' }}>
                {data.defaultDmReply || t('dashboard.noDefaultReply')}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Navigation & Actions */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
            {t('dashboard.quickActions')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link href="/dashboard/inbox" className="btn btn-secondary" style={{ justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Inbox size={16} color="var(--accent-amber)" /> {t('dashboard.viewInbox')}
              </span>
              <ArrowRight size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} />
            </Link>

            <Link href="/dashboard/comments" className="btn btn-secondary" style={{ justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={16} color="var(--accent-indigo)" /> {t('dashboard.manageComments')}
              </span>
              <ArrowRight size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} />
            </Link>

            <Link href="/dashboard/clients" className="btn btn-secondary" style={{ justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sliders size={16} color="var(--accent-emerald)" /> {t('dashboard.restaurantSettings')}
              </span>
              <ArrowRight size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
