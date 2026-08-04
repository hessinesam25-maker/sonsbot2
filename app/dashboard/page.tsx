'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { 
  MessageSquare, Users, AlertTriangle, 
  Clock, Sparkles, TrendingUp, ShieldAlert, Globe2, Activity 
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/db/store';

export default function OverviewDashboard() {
  const { tenant, selectedTenantId } = useAuth();
  const { t, direction } = useLanguage();

  const [stats, setStats] = useState({
    totalMessages: 0,
    totalComments: 0,
    avgResponseTimeSec: 2.1,
    aiResolutionRatePercent: 85.0,
    humanHandoffRatePercent: 15.0,
    positiveCommentsCount: 0,
    negativeCommentsCount: 0,
    failedOutgoingReplies: 0,
    topQuestions: [
      { question: 'What are your opening hours?', count: 14 },
      { question: 'Where are you located (Google Maps)?', count: 9 },
      { question: 'Do you offer vegan or vegetarian options?', count: 7 },
      { question: 'Do I need to book a reservation in advance?', count: 4 },
    ]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRealStats() {
      setLoading(true);
      try {
        const conversations = await db.getConversations(selectedTenantId);
        const comments = await db.getComments(selectedTenantId);

        let msgCount = 0;
        for (const c of conversations) {
          const msgs = await db.getMessages(c.id);
          msgCount += msgs.length;
        }

        const posCount = comments.filter(c => c.classification === 'positive').length;
        const negCount = comments.filter(c => c.classification === 'complaint').length;

        setStats(prev => ({
          ...prev,
          totalMessages: msgCount,
          totalComments: comments.length,
          positiveCommentsCount: posCount,
          negativeCommentsCount: negCount,
        }));
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadRealStats();
  }, [selectedTenantId]);

  return (
    <div dir={direction}>
      <TopHeader 
        title={tenant?.name || t('dashboard.title')} 
        subtitle={`${t('dashboard.subtitle')} (${tenant?.city || 'Ghent'}, ${tenant?.country || 'Belgium'})`} 
      />

      {/* Stats Summary Row */}
      <div className="stats-grid">
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' }}>
            <MessageSquare size={26} />
          </div>
          <div>
            <div className="stat-val">{loading ? '...' : stats.totalMessages}</div>
            <div className="stat-lbl">{t('dashboard.incomingMessages')}</div>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-indigo)' }}>
            <Users size={26} />
          </div>
          <div>
            <div className="stat-val">{loading ? '...' : stats.totalComments}</div>
            <div className="stat-lbl">{t('dashboard.publicComments')}</div>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>
            <Sparkles size={26} />
          </div>
          <div>
            <div className="stat-val">{stats.aiResolutionRatePercent}%</div>
            <div className="stat-lbl">{t('dashboard.aiResolutionRate')}</div>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)' }}>
            <AlertTriangle size={26} />
          </div>
          <div>
            <div className="stat-val">{stats.humanHandoffRatePercent}%</div>
            <div className="stat-lbl">{t('dashboard.humanHandoffRate')}</div>
          </div>
        </div>
      </div>

      {/* Second Row: Detailed Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Common Questions & Resolution Performance */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} color="var(--accent-amber)" />
              {t('dashboard.frequentInquiries')} ({tenant?.name})
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('dashboard.autoResolvedInquiries')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {stats.topQuestions.map((q, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{q.question}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '100px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${(q.count / 20) * 100}%`, height: '100%', background: 'var(--accent-amber)' }}></div>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-amber)' }}>{q.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Language Breakdown */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Globe2 size={20} color="var(--accent-cyan)" />
            {t('dashboard.languageBreakdown')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <span>Arabic (AR - Primary)</span>
                <span style={{ fontWeight: 700 }}>65%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '65%', height: '100%', background: 'var(--accent-amber)' }}></div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <span>English (EN)</span>
                <span style={{ fontWeight: 700 }}>20%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '20%', height: '100%', background: 'var(--accent-indigo)' }}></div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <span>Dutch (NL)</span>
                <span style={{ fontWeight: 700 }}>10%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '10%', height: '100%', background: 'var(--accent-cyan)' }}></div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <span>French (FR)</span>
                <span style={{ fontWeight: 700 }}>5%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '5%', height: '100%', background: 'var(--accent-emerald)' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Third Row: System Health & Comment Sentiment */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{stats.avgResponseTimeSec} sec</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('dashboard.avgResponseTime')}</div>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{stats.positiveCommentsCount} / {stats.negativeCommentsCount}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('dashboard.commentSentiment')}</div>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{stats.failedOutgoingReplies} Failed</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('dashboard.webhookErrors')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
