'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Bot, Save, CheckCircle2, AlertCircle, Sparkles, MessageSquare, BookOpen, ShieldAlert } from 'lucide-react';
import { AISettings, AITone, AIReplyLength, AIEmojiUsage, AIFallbackBehavior } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function AISettingsPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();

  const [settings, setSettings] = useState<AISettings>({
    id: `ai_set_${selectedTenantId.slice(0, 8)}`,
    tenant_id: selectedTenantId,
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

  useEffect(() => {
    let isMounted = true;
    async function loadSettings() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/ai-settings?tenantId=${encodeURIComponent(selectedTenantId)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            setSettings(data);
          }
        } else {
          // Fallback to store direct getter if API endpoint unavailable or in offline test environment
          const fallbackData = await db.getAISettings(selectedTenantId);
          if (isMounted && fallbackData) {
            setSettings(fallbackData);
          }
        }
      } catch (err: any) {
        console.error('Error loading AI Settings:', err);
        try {
          const fallbackData = await db.getAISettings(selectedTenantId);
          if (isMounted && fallbackData) {
            setSettings(fallbackData);
          }
        } catch {
          if (isMounted) {
            setErrorMessage(t('aiSettings.loadErrorMessage'));
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadSettings();
    return () => {
      isMounted = false;
    };
  }, [selectedTenantId, t]);

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage(null);
    const restaurantName = tenant?.name || 'Restaurant';

    try {
      const res = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, tenant_id: selectedTenantId }),
      });

      if (res.ok) {
        const updated = await res.json();
        if (updated) setSettings(updated);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3500);
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          throw new Error(errData.error || t('aiSettings.errorMessage'));
        }
        // Fallback to store write if server route bypasses client fetch in local test
        const updated = await db.updateAISettings(
          { ...settings, tenant_id: selectedTenantId },
          selectedTenantId
        );
        if (updated) setSettings(updated);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3500);
      }
    } catch (err: any) {
      console.error('Error saving AI Settings:', err);
      setErrorMessage(err.message || t('aiSettings.errorMessage'));
    } finally {
      setSaving(false);
    }
  };

  const restaurantName = tenant?.name || 'Restaurant';

  if (loading) {
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', maxWidth: '900px' }}>
        {/* Section 1: Main AI Master Toggle & Language */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      </div>
    </div>
  );
}
