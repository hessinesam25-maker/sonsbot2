'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { HelpCircle, Plus, Trash2, Save, CheckCircle2, Tag, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { FAQ } from '@/lib/db/types';
import { db } from '@/lib/db/store';

export default function FAQManagerPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFaq, setNewFaq] = useState({
    title: '',
    questionText: '',
    answerText: '',
    locale: 'nl',
    keywords: '',
    priority: 5,
  });

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const data = await db.getFAQs(selectedTenantId);
      setFaqs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
  }, [selectedTenantId]);

  const handleAddFaq = async () => {
    if (!newFaq.title || !newFaq.questionText) return;

    await fetch('/api/faqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newFaq,
        tenant_id: selectedTenantId,
      }),
    });

    setShowAddModal(false);
    setNewFaq({ title: '', questionText: '', answerText: '', locale: 'nl', keywords: '', priority: 5 });
    fetchFaqs();
  };

  const restaurantName = tenant?.name || '';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('faqs.title', { restaurant: restaurantName })} 
        subtitle={t('faqs.subtitle')} 
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600 }}>{t('faqs.activeFaqsCount', { restaurant: restaurantName, count: faqs.length })}</div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> {t('faqs.addFaqRule')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>{t('faqs.loadingFaqs')}</div>
        ) : faqs.length === 0 ? (
          <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <HelpCircle size={36} style={{ margin: '0 auto 1rem auto', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{t('faqs.noFaqsTitle')}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 1.25rem auto' }}>
              {t('faqs.noFaqsDesc')}
            </p>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> {t('faqs.createFirstFaq')}
            </button>
          </div>
        ) : (
          faqs.map((faq) => (
            <div key={faq.id} className="glass-card" style={{ opacity: faq.is_enabled ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{faq.title}</h3>
                    <span className={`lang-badge lang-${faq.locale}`}>{faq.locale.toUpperCase()}</span>
                    <span className="badge badge-open" style={{ fontSize: '0.7rem' }}>{t('faqs.priorityLabel', { priority: faq.priority })}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {t('faqs.questionLabel')} "{faq.question[faq.locale] || Object.values(faq.question)[0]}"
                  </div>
                </div>

                <label className="toggle-switch">
                  <input type="checkbox" checked={faq.is_enabled} readOnly />
                  <span className="slider"></span>
                </label>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.2rem' }}>{t('faqs.approvedAnswer')}</div>
                <div>{faq.answer[faq.locale] || Object.values(faq.answer)[0]}</div>
              </div>

              {faq.keywords.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <Tag size={14} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('faqs.triggerKeywords')}</span>
                  {faq.keywords.map((kw, idx) => (
                    <span key={idx} style={{ fontSize: '0.72rem', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add FAQ Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} dir={direction}>
          <div className="glass-card" style={{ width: '520px', maxWidth: '100%', padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{t('faqs.modalTitle')}</h3>

            <div className="form-group">
              <label className="form-label">{t('faqs.faqTitleInput')}</label>
              <input type="text" className="form-input" placeholder={t('faqs.faqTitlePlaceholder')} value={newFaq.title} onChange={(e) => setNewFaq({ ...newFaq, title: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('faqs.questionInput')}</label>
              <input type="text" className="form-input" placeholder={t('faqs.questionPlaceholder')} value={newFaq.questionText} onChange={(e) => setNewFaq({ ...newFaq, questionText: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('faqs.answerInput')}</label>
              <textarea className="form-textarea" rows={3} placeholder={t('faqs.answerPlaceholder')} value={newFaq.answerText} onChange={(e) => setNewFaq({ ...newFaq, answerText: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('faqs.language')}</label>
                <select className="form-select" value={newFaq.locale} onChange={(e) => setNewFaq({ ...newFaq, locale: e.target.value })}>
                  <option value="ar">العربية (AR)</option>
                  <option value="en">English (EN)</option>
                  <option value="nl">Dutch (NL)</option>
                  <option value="fr">French (FR)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('faqs.priorityInput')}</label>
                <input type="number" className="form-input" value={newFaq.priority} onChange={(e) => setNewFaq({ ...newFaq, priority: Number(e.target.value) })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('faqs.keywordsInput')}</label>
              <input type="text" className="form-input" placeholder={t('faqs.keywordsPlaceholder')} value={newFaq.keywords} onChange={(e) => setNewFaq({ ...newFaq, keywords: e.target.value })} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleAddFaq}>{t('faqs.saveFaqRule')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
