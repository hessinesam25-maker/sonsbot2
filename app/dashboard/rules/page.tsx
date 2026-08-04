'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Sliders, Shield, Save, CheckCircle2, Sparkles } from 'lucide-react';
import { AutomationRules } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/db/store';

export default function RulesPage() {
  const { selectedTenantId, tenant } = useAuth();
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
    updated_at: new Date().toISOString(),
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function loadRules() {
      const data = await db.getAutomationRules(selectedTenantId);
      if (data) {
        setRules(data);
      }
    }
    loadRules();
  }, [selectedTenantId]);

  const handleSave = async () => {
    await db.updateAutomationRules({ ...rules, tenant_id: selectedTenantId }, selectedTenantId);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };


  return (
    <div>
      <TopHeader 
        title="Automation Rules & AI Guardrails" 
        subtitle="Confidence Thresholds, Comment Controls & Human Handoff Rules" 
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={16} /> Save Automation Settings
        </button>
      </div>

      {savedSuccess && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> Automation Rules successfully updated!
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Confidence & Rate Limits */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sliders size={20} color="var(--accent-amber)" /> Confidence & Rate Limits
          </h3>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label className="form-label">Minimum AI Confidence Score Required</label>
              <span style={{ fontWeight: 800, color: 'var(--accent-amber)' }}>{(rules.min_confidence_score * 100).toFixed(0)}%</span>
            </div>
            <input 
              type="range" 
              min="0.50" 
              max="0.99" 
              step="0.01"
              value={rules.min_confidence_score}
              onChange={(e) => setRules({ ...rules, min_confidence_score: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent-amber)' }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Queries with AI confidence below this threshold will automatically be flagged as "Needs human review".
            </p>
          </div>

          <div className="form-group" style={{ marginTop: '1.5rem' }}>
            <label className="form-label">Maximum Automated Public Comment Replies / Hour</label>
            <input 
              type="number" 
              className="form-input" 
              value={rules.max_public_replies_per_hour}
              onChange={(e) => setRules({ ...rules, max_public_replies_per_hour: parseInt(e.target.value) })}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Rate limit cap to protect Instagram account reputation.
            </p>
          </div>
        </div>

        {/* Comment Management Safeguards */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} color="var(--accent-emerald)" /> Comment Automation Toggles
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto-Reply to Positive Comments</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Send varied, friendly thank you replies on posts</div>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto-Reply to Factual Questions</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Answer opening hours, location & menu questions</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={rules.auto_reply_factual_questions} 
                  onChange={(e) => setRules({ ...rules, auto_reply_factual_questions: e.target.checked })} 
                />
                <span className="slider"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Never Auto-Reply to Complaints</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-rose)' }}>Mandatory human handoff for negative feedback & refunds</div>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Hide or Flag Spam Comments</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Automatically hide promotional or bot spam comments</div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
