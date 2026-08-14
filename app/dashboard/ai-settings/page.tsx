'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Bot, Save, CheckCircle2, AlertCircle, Sparkles, MessageSquare, BookOpen, ShieldAlert, Send } from 'lucide-react';
import { AISettings, AITone, AIReplyLength, AIEmojiUsage, AIFallbackBehavior } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function AISettingsPage() {
  const { selectedTenantId, tenant, isLoading: authLoading } = useAuth();
  const { t, direction } = useLanguage();

  const [settings, setSettings] = useState<AISettings>({
    id: `ai_set_${selectedTenantId?.slice(0, 8) || '001'}`,
    tenant_id: selectedTenantId || '',
    ai_enabled: false,
    primary_language: 'nl-BE',
    tone: 'friendly',
    reply_length: 'short',
    emoji_usage: 'low',
    custom_instructions: '',
    reply_to_dms: true,
    reply_to_comments: true,
    use_knowledge_base: true,
    fallback_behavior: 'human_handoff',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string>('');
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    reply?: string | null;
    model?: string;
    retrievedSources?: { knowledgeBase: boolean; menuItemsMatched: number };
    usage?: { inputTokens: number; outputTokens: number };
    error?: string;
  } | null>(null);
  const [igState, setIgState] = useState<import('@/lib/db/types').InstagramConnectionState>({
    connected: false,
    status: 'disconnected',
    hasPlaceholderUsername: false,
  });

  const reqSeqRef = React.useRef<number>(0);

  useEffect(() => {
    if (authLoading || !selectedTenantId) return;

    const currentSeq = ++reqSeqRef.current;
    let isMounted = true;

    async function loadSettings() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const connState = await db.getInstagramConnectionState(selectedTenantId);
        if (isMounted && currentSeq === reqSeqRef.current) setIgState(connState);

        const res = await fetch(`/api/ai-settings?tenantId=${encodeURIComponent(selectedTenantId)}`, {
          headers: { 'Cache-Control': 'no-cache, no-store' },
        });

        if (res.ok) {
          const data = await res.json();
          const loadedSettings = data.settings || data;
          if (isMounted && currentSeq === reqSeqRef.current && loadedSettings && loadedSettings.tenant_id === selectedTenantId) {
            setSettings(loadedSettings);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (isMounted && currentSeq === reqSeqRef.current) {
            setErrorMessage(errData.error || t('aiSettings.loadErrorMessage'));
          }
        }
      } catch (err: any) {
        console.error('Error loading AI Settings:', err);
        if (isMounted && currentSeq === reqSeqRef.current) {
          setErrorMessage(err.message || t('aiSettings.loadErrorMessage'));
        }
      } finally {
        if (isMounted && currentSeq === reqSeqRef.current) setLoading(false);
      }
    }
    loadSettings();
    return () => {
      isMounted = false;
    };
  }, [selectedTenantId, authLoading, t]);

  const handleSave = async () => {
    if (!selectedTenantId) return;
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, tenant_id: selectedTenantId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || t('aiSettings.errorMessage'));
      }

      const resData = await res.json();
      const updated = resData.settings || resData;
      if (updated && updated.tenant_id === selectedTenantId) {
        setSettings(updated);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error saving AI Settings:', err);
      setErrorMessage(err.message || t('aiSettings.errorMessage'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestAI = async () => {
    if (!testMessage.trim() || !selectedTenantId) return;
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: selectedTenantId, message: testMessage.trim() }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Failed to execute AI test.',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const restaurantName = tenant?.name || '';

  if (authLoading || loading || !selectedTenantId) {
    return (
      <div dir={direction}>
        <TopHeader 
          title={t('aiSettings.headerTitle', { restaurant: restaurantName })}
          subtitle={t('aiSettings.headerSubtitle')}
        />
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ width: '28px', height: '28px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-amber)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span>{t('aiSettings.loading', { restaurant: restaurantName })}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('aiSettings.headerTitle', { restaurant: restaurantName })}
        subtitle={t('aiSettings.headerSubtitle')} 
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{t('aiSettings.pageHeading')}</h2>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {t('aiSettings.activeRestaurant', { restaurant: '' })} <strong style={{ color: '#fff' }}>{restaurantName}</strong>
            </span>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? t('aiSettings.savingSettings') : t('aiSettings.saveSettings')}
        </button>
      </div>

      {savedSuccess && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {t('aiSettings.successMessage', { restaurant: restaurantName })}
        </div>
      )}

      {errorMessage && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--accent-rose)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} /> {errorMessage}
        </div>
      )}

      {!settings.ai_enabled && (
        <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid var(--accent-amber)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-amber)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} /> AI Auto-Reply is currently disabled. Incoming Instagram messages will receive fixed default replies or require manual review.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', maxWidth: '900px' }}>
        {/* Section 1: Main AI Master Toggle & Language */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={18} color="var(--accent-amber)" /> {t('aiSettings.masterSwitchTitle')}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {t('aiSettings.masterSwitchDesc')}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.ai_enabled ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                {settings.ai_enabled ? t('aiSettings.aiEnabled') : t('aiSettings.aiDisabled')}
              </span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={settings.ai_enabled} 
                  onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('aiSettings.primaryLanguage')}</label>
            <select 
              className="form-select"
              value={settings.primary_language}
              onChange={(e) => setSettings({ ...settings, primary_language: e.target.value })}
              style={{ maxWidth: '350px' }}
            >
              <option value="nl-BE">{t('aiSettings.languages.nl-BE')}</option>
              <option value="en">{t('aiSettings.languages.en')}</option>
              <option value="fr">{t('aiSettings.languages.fr')}</option>
              <option value="ar">{t('aiSettings.languages.ar')}</option>
            </select>
          </div>
        </div>

        {/* Section 2: Persona & Response Style */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
            {t('aiSettings.personaTitle')}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">{t('aiSettings.tone')}</label>
              <select 
                className="form-select"
                value={settings.tone}
                onChange={(e) => setSettings({ ...settings, tone: e.target.value as AITone })}
              >
                <option value="friendly">{t('aiSettings.tones.friendly')}</option>
                <option value="professional">{t('aiSettings.tones.professional')}</option>
                <option value="casual">{t('aiSettings.tones.casual')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('aiSettings.replyLength')}</label>
              <select 
                className="form-select"
                value={settings.reply_length}
                onChange={(e) => setSettings({ ...settings, reply_length: e.target.value as AIReplyLength })}
              >
                <option value="very_short">{t('aiSettings.replyLengths.very_short')}</option>
                <option value="short">{t('aiSettings.replyLengths.short')}</option>
                <option value="normal">{t('aiSettings.replyLengths.normal')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('aiSettings.emojiUsage')}</label>
              <select 
                className="form-select"
                value={settings.emoji_usage}
                onChange={(e) => setSettings({ ...settings, emoji_usage: e.target.value as AIEmojiUsage })}
              >
                <option value="none">{t('aiSettings.emojiUsages.none')}</option>
                <option value="low">{t('aiSettings.emojiUsages.low')}</option>
                <option value="normal">{t('aiSettings.emojiUsages.normal')}</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('aiSettings.customInstructions')}</label>
            <textarea 
              className="form-textarea"
              rows={4}
              value={settings.custom_instructions}
              onChange={(e) => setSettings({ ...settings, custom_instructions: e.target.value })}
              placeholder={t('aiSettings.customInstructionsPlaceholder')}
              style={{ width: '100%', fontSize: '0.9rem', lineHeight: 1.5 }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              {t('aiSettings.customInstructionsHelp')}
            </p>
          </div>
        </div>

        {/* Section 3: Channel Toggles & Features */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
            {t('aiSettings.channelsTitle')}
          </h3>

          {!igState.connected && (
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--accent-rose)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
              <AlertCircle size={16} style={{ display: 'inline', marginInlineEnd: '0.4rem', verticalAlign: '-3px' }} />
              {t('instagramState.connectFirstNotice')}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MessageSquare size={16} /> {t('aiSettings.replyDms')}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('aiSettings.replyDmsDesc')}</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={settings.reply_to_dms} 
                  onChange={(e) => setSettings({ ...settings, reply_to_dms: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MessageSquare size={16} /> {t('aiSettings.replyComments')}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('aiSettings.replyCommentsDesc')}</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={settings.reply_to_comments} 
                  onChange={(e) => setSettings({ ...settings, reply_to_comments: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <BookOpen size={16} /> {t('aiSettings.useKb')}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('aiSettings.useKbDesc')}</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={settings.use_knowledge_base} 
                  onChange={(e) => setSettings({ ...settings, use_knowledge_base: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="form-group" style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', marginBottom: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShieldAlert size={16} /> {t('aiSettings.fallbackBehavior')}
              </label>
              <select 
                className="form-select"
                value={settings.fallback_behavior}
                onChange={(e) => setSettings({ ...settings, fallback_behavior: e.target.value as AIFallbackBehavior })}
                style={{ maxWidth: '350px' }}
              >
                <option value="human_handoff">{t('aiSettings.fallbacks.human_handoff')}</option>
                <option value="fallback_message">{t('aiSettings.fallbacks.fallback_message')}</option>
              </select>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {t('aiSettings.fallbackDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Safe Production AI Testing Tool */}
        <div className="glass-card">
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bot size={18} color="var(--accent-amber)" /> Test AI / اختبار الذكاء الاصطناعي
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--accent-amber)', marginTop: '0.3rem', fontWeight: 600 }}>
              {direction === 'rtl'
                ? 'هذا اختبار فقط ولن يتم إرسال أي رسالة إلى Instagram.'
                : 'This is a test only. Nothing will be sent to Instagram.'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <textarea
                className="form-textarea"
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder={direction === 'rtl' ? 'اكتب سؤالاً للتجربة (مثال: ما هي أوقات العمل؟ كم سعر Cappuccino؟)' : 'Type a customer question (e.g. What time do you open? How much is the latte?)'}
                style={{ width: '100%', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleTestAI}
                disabled={testLoading || !testMessage.trim()}
                style={{ fontSize: '0.88rem' }}
              >
                <Send size={15} /> {testLoading ? (direction === 'rtl' ? 'جاري الاختبار...' : 'Testing...') : (direction === 'rtl' ? 'اختبار الرد' : 'Test Reply')}
              </button>
            </div>

            {testResult && (
              <div style={{ marginTop: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: testResult.success ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: testResult.success ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                    {testResult.success ? (direction === 'rtl' ? 'النتيجة المولدة:' : 'Generated AI Reply:') : (direction === 'rtl' ? 'خطأ في الاختبار:' : 'Test Error:')}
                  </span>
                  {testResult.model && (
                    <span className="badge badge-open" style={{ fontSize: '0.72rem' }}>
                      Model: {testResult.model}
                    </span>
                  )}
                </div>

                {testResult.success && testResult.reply ? (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.85rem', borderRadius: '4px', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '0.75rem', color: '#fff', whiteSpace: 'pre-wrap' }}>
                    {testResult.reply}
                  </div>
                ) : (
                  <div style={{ color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    {testResult.error || 'AI generation returned an error.'}
                  </div>
                )}

                {testResult.retrievedSources && (
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <span>
                      KB Used: <strong style={{ color: testResult.retrievedSources.knowledgeBase ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{testResult.retrievedSources.knowledgeBase ? 'Yes' : 'No'}</strong>
                    </span>
                    <span>
                      Menu Items Matched: <strong style={{ color: testResult.retrievedSources.menuItemsMatched > 0 ? 'var(--accent-indigo)' : 'var(--text-muted)' }}>{testResult.retrievedSources.menuItemsMatched}</strong>
                    </span>
                    {testResult.usage && (
                      <span>
                        Tokens: <strong style={{ color: '#fff' }}>{testResult.usage.inputTokens} in / {testResult.usage.outputTokens} out</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
