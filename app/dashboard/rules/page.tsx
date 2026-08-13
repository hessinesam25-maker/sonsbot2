'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Send, MessageSquare, Shield, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AutomationRules } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function RulesPage() {
  const { selectedTenantId, tenant, isLoading } = useAuth();
  const { t, direction } = useLanguage();
  const [activeTab, setActiveTab] = useState<'dm' | 'comments'>('dm');
  const [igState, setIgState] = useState<import('@/lib/db/types').InstagramConnectionState>({
    connected: false,
    status: 'disconnected',
    hasPlaceholderUsername: false,
  });
  const [rules, setRules] = useState<AutomationRules>({
    id: 'rules_001',
    tenant_id: selectedTenantId,
    min_confidence_score: 0.85,
    max_public_replies_per_hour: 20,
    auto_reply_positive_comments: true,
    auto_reply_factual_questions: true,
    never_reply_complaints: true,
    hide_spam: true,
    ai_tone: 'friendly_warm',
    default_dm_reply: '',
    updated_at: new Date().toISOString(),
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isLoading || !selectedTenantId) return;

    let isMounted = true;
    async function loadRules() {
      const state = await db.getInstagramConnectionState(selectedTenantId);
      if (isMounted) setIgState(state);

      const data = await db.getAutomationRules(selectedTenantId);
      if (isMounted && data) {
        setRules(data);
      }
    }
    loadRules();
    return () => { isMounted = false; };
  }, [selectedTenantId, isLoading]);

  const handleSave = async () => {
    if (!selectedTenantId) return;
    setSaving(true);
    try {
      await db.updateAutomationRules({ ...rules, tenant_id: selectedTenantId }, selectedTenantId);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err) {
      console.error('Error saving automation rules:', err);
    } finally {
      setSaving(false);
    }
  };

  const restaurantName = tenant?.name || '';

  if (isLoading || !selectedTenantId) {
    return (
      <div dir={direction}>
        <TopHeader 
          title={t('rules.title', { restaurant: restaurantName })} 
          subtitle={t('rules.subtitle')} 
        />
        <div className="glass-card" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('rules.title', { restaurant: restaurantName })} 
        subtitle={t('rules.subtitle')} 
      />

      {!igState.connected && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-rose)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          <AlertTriangle size={18} /> {t('instagramState.connectFirstNotice')}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.3rem', borderRadius: 'var(--radius-sm)', flexWrap: 'wrap' }}>
          <button 
            className={`btn ${activeTab === 'dm' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
            onClick={() => setActiveTab('dm')}
          >
            <Send size={15} className={direction === 'rtl' ? 'rtl-flip' : ''} /> {t('rules.dmTab')}
          </button>
          <button 
            className={`btn ${activeTab === 'comments' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
            onClick={() => setActiveTab('comments')}
          >
            <MessageSquare size={15} /> {t('rules.commentsTab')}
          </button>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? t('rules.saving') : t('rules.saveSettings')}
        </button>
      </div>

      {savedSuccess && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {t('rules.settingsUpdated', { restaurant: restaurantName })}
        </div>
      )}

      {/* Tab 1: Dedicated DM Automation Settings */}
      {activeTab === 'dm' && (
        <div className="glass-card" style={{ maxWidth: '800px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Send size={20} className={direction === 'rtl' ? 'rtl-flip' : ''} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{t('rules.dmAutoReplyTitle')}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {t('rules.configuredFor', { restaurant: restaurantName })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: !igState.connected ? 'var(--accent-rose)' : rules.auto_reply_factual_questions ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                {!igState.connected
                  ? t('instagramState.unavailableUntilConnected')
                  : rules.auto_reply_factual_questions
                  ? t('rules.dmActive')
                  : t('rules.dmPaused')}
              </span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={rules.auto_reply_factual_questions} 
                  onChange={(e) => setRules({ ...rules, auto_reply_factual_questions: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5, background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
            {t('rules.dmNotice')}
          </p>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {t('rules.defaultDmLabel')}
            </label>
            <textarea 
              className="form-textarea" 
              rows={4}
              placeholder={t('rules.defaultDmPlaceholder')}
              value={rules.default_dm_reply || ''}
              onChange={(e) => setRules({ ...rules, default_dm_reply: e.target.value })}
              style={{ width: '100%', fontSize: '0.92rem', lineHeight: 1.5 }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              {t('rules.defaultDmHelp')}
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Comments Automation Settings */}
      {activeTab === 'comments' && (
        <div className="glass-card" style={{ maxWidth: '800px' }}>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} color="var(--accent-emerald)" /> {t('rules.commentModerationTitle')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{t('rules.autoReplyPositive')}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('rules.autoReplyPositiveDesc')}</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={rules.auto_reply_positive_comments} 
                  onChange={(e) => setRules({ ...rules, auto_reply_positive_comments: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{t('rules.neverReplyComplaints')}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--accent-rose)' }}>{t('rules.neverReplyComplaintsDesc')}</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={rules.never_reply_complaints} 
                  onChange={(e) => setRules({ ...rules, never_reply_complaints: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{t('rules.hideSpam')}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('rules.hideSpamDesc')}</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={rules.hide_spam} 
                  onChange={(e) => setRules({ ...rules, hide_spam: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="form-group" style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <label className="form-label">{t('rules.maxRepliesPerHour')}</label>
              <input 
                type="number" 
                className="form-input ltr-text" 
                value={rules.max_public_replies_per_hour}
                onChange={(e) => setRules({ ...rules, max_public_replies_per_hour: parseInt(e.target.value) || 20 })}
                style={{ maxWidth: '200px' }}
              />
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {t('rules.maxRepliesHelp')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
