'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Send, MessageSquare, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AutomationRules } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function RulesPage() {
  const { selectedTenantId, tenant, isLoading } = useAuth();
  const { t, direction } = useLanguage();
  const [igState, setIgState] = useState<import('@/lib/db/types').InstagramConnectionState>({
    connected: false,
    status: 'disconnected',
    hasPlaceholderUsername: false,
  });

  const [rules, setRules] = useState<AutomationRules>({
    id: 'rules_001',
    tenant_id: selectedTenantId || '',
    min_confidence_score: 0.85,
    max_public_replies_per_hour: 20,
    auto_reply_positive_comments: true,
    auto_reply_factual_questions: true,
    never_reply_complaints: true,
    hide_spam: true,
    ai_tone: 'friendly_warm',
    default_dm_reply: '',
    static_dm_enabled: false,
    static_comment_enabled: false,
    default_comment_reply: '',
    updated_at: new Date().toISOString(),
  });

  const [initialRules, setInitialRules] = useState<AutomationRules | null>(null);
  const [loadingRules, setLoadingRules] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !selectedTenantId) return;

    let isMounted = true;
    async function loadRulesData() {
      setLoadingRules(true);
      setErrorMessage(null);
      try {
        const state = await db.getInstagramConnectionState(selectedTenantId);
        if (isMounted) setIgState(state);

        const res = await fetch(`/api/rules?tenantId=${selectedTenantId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            setRules(data);
            setInitialRules(data);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (isMounted) setErrorMessage(errData.error || 'فشل تحميل قواعد الأتمتة');
        }
      } catch (err: any) {
        console.error('[RULES_LOAD_ERROR]', err);
        if (isMounted) setErrorMessage('حدث خطأ أثناء تحميل قواعد الأتمتة');
      } finally {
        if (isMounted) setLoadingRules(false);
      }
    }

    loadRulesData();
    return () => { isMounted = false; };
  }, [selectedTenantId, isLoading]);

  const handleSave = async () => {
    if (!selectedTenantId) return;
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage(null);

    const previousState = { ...rules };

    try {
      const res = await fetch('/api/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: selectedTenantId,
          static_dm_enabled: rules.static_dm_enabled,
          default_dm_reply: rules.default_dm_reply,
          static_comment_enabled: rules.static_comment_enabled,
          default_comment_reply: rules.default_comment_reply,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'فشل حفظ قواعد الأتمتة');
      }

      const updated = await res.json();
      setRules(updated);
      setInitialRules(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      console.error('[RULES_SAVE_ERROR]', err);
      // Rollback UI state to pre-edit state on persistence failure
      if (initialRules) {
        setRules(initialRules);
      } else {
        setRules(previousState);
      }
      setErrorMessage(err.message || 'فشل حفظ التغييرات، تم استعادة الحالة السابقة تلقائياً.');
    } finally {
      setSaving(false);
    }
  };

  const restaurantName = tenant?.name || '';

  if (isLoading || loadingRules || !selectedTenantId) {
    return (
      <div dir={direction}>
        <TopHeader 
          title="الردود التلقائية (بدون ذكاء اصطناعي)" 
          subtitle="إدارة الردود الثابتة للرسائل المباشرة والتعليقات على إنستغرام" 
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
        title="الردود التلقائية (بدون ذكاء اصطناعي)" 
        subtitle="إدارة الردود الثابتة والجاهزة للرسائل المباشرة والتعليقات" 
      />

      {!igState.connected && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-rose)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          <AlertTriangle size={18} /> {t('instagramState.connectFirstNotice')}
        </div>
      )}

      {errorMessage && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-rose)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          <AlertTriangle size={18} /> {errorMessage}
        </div>
      )}

      {savedSuccess && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> تم حفظ إعدادات الردود التلقائية بنجاح!
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? t('rules.saving') : t('rules.saveSettings')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '850px' }}>
        {/* CARD 1: Direct Messages (DM) Automation */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Send size={20} className={direction === 'rtl' ? 'rtl-flip' : ''} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>الرد التلقائي للرسائل المباشرة (DM)</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  إرسال رد ثابت ومحدد عند تعطيل الذكاء الاصطناعي أو فشله
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: rules.static_dm_enabled ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                {rules.static_dm_enabled ? 'مفعل' : 'معطل'}
              </span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={Boolean(rules.static_dm_enabled)} 
                  onChange={(e) => setRules({ ...rules, static_dm_enabled: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
              نص الرد التلقائي للرسائل المباشرة
            </label>
            <textarea 
              className="form-textarea" 
              rows={4}
              placeholder="أدخل نص الرد التلقائي الثابت الذي سيتم إرساله في الرسائل المباشرة..."
              value={rules.default_dm_reply || ''}
              onChange={(e) => setRules({ ...rules, default_dm_reply: e.target.value })}
              disabled={!rules.static_dm_enabled}
              style={{ width: '100%', fontSize: '0.92rem', lineHeight: 1.5, opacity: rules.static_dm_enabled ? 1 : 0.6 }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              سيتم إرسال هذا النص كـ DM تلقائي عندما يكون الذكاء الاصطناعي معطلاً للرسائل.
            </p>
          </div>
        </div>

        {/* CARD 2: Comments Automation */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MessageSquare size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>الرد التلقائي على التعليقات (Comments)</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  إرسال رد ثابت ومحدد على منشورات إنستغرام عند تعطيل الذكاء الاصطناعي أو فشله
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: rules.static_comment_enabled ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                {rules.static_comment_enabled ? 'مفعل' : 'معطل'}
              </span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={Boolean(rules.static_comment_enabled)} 
                  onChange={(e) => setRules({ ...rules, static_comment_enabled: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
              نص الرد التلقائي على التعليقات
            </label>
            <textarea 
              className="form-textarea" 
              rows={4}
              placeholder="أدخل نص الرد التلقائي الثابت الذي سيتم إرساله رداً على التعليقات..."
              value={rules.default_comment_reply || ''}
              onChange={(e) => setRules({ ...rules, default_comment_reply: e.target.value })}
              disabled={!rules.static_comment_enabled}
              style={{ width: '100%', fontSize: '0.92rem', lineHeight: 1.5, opacity: rules.static_comment_enabled ? 1 : 0.6 }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              سيتم إرسال هذا النص كـ رد تعليق تلقائي عندما يكون الذكاء الاصطناعي معطلاً للتعليقات.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
