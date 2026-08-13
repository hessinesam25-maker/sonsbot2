'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  MessageSquare, ShieldCheck, EyeOff, ThumbsUp, 
  AlertOctagon, Sparkles, Filter, Send 
} from 'lucide-react';
import { Comment, CommentClassification } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function CommentsInboxPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    async function loadComments() {
      const data = await db.getComments(selectedTenantId);
      setComments(data);
    }
    loadComments();
  }, [selectedTenantId]);

  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});

  const handleManualReply = async (commentId: string) => {
    const replyText = replyInputs[commentId];
    if (!replyText) return;

    const updated = await db.updateComment(commentId, {
      auto_replied: true,
      reply_content: replyText,
    });

    if (updated) {
      setComments(comments.map(c => c.id === commentId ? updated : c));
    } else {
      setComments(comments.map(c => c.id === commentId ? {
        ...c,
        auto_replied: true,
        reply_content: replyText,
      } : c));
    }

    setReplyInputs({ ...replyInputs, [commentId]: '' });
  };

  const handleToggleHide = async (commentId: string) => {
    const target = comments.find(c => c.id === commentId);
    if (!target) return;
    const newHideState = !target.is_hidden;

    const updated = await db.updateComment(commentId, { is_hidden: newHideState });
    if (updated) {
      setComments(comments.map(c => c.id === commentId ? updated : c));
    } else {
      setComments(comments.map(c => c.id === commentId ? {
        ...c,
        is_hidden: newHideState,
      } : c));
    }
  };

  const filteredComments = comments.filter(c => {
    if (selectedFilter === 'question') return c.classification === 'question';
    if (selectedFilter === 'positive') return c.classification === 'positive';
    if (selectedFilter === 'complaint') return c.classification === 'complaint';
    if (selectedFilter === 'spam') return c.classification === 'spam';
    if (selectedFilter === 'collaboration') return c.classification === 'collaboration';
    return true;
  });

  const restaurantName = tenant?.name || '';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('comments.title', { restaurant: restaurantName })} 
        subtitle={t('comments.subtitle')} 
      />

      {/* Filter Bar */}
      <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', overflowX: 'auto' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
          <Filter size={16} /> {t('comments.filterByClassification')}
        </span>

        {['all', 'positive', 'question', 'complaint', 'collaboration', 'spam'].map((cat) => (
          <button 
            key={cat} 
            className={`btn ${selectedFilter === cat ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', textTransform: 'capitalize' }}
            onClick={() => setSelectedFilter(cat)}
          >
            {cat === 'all' ? t('common.all') : cat}
          </button>
        ))}
      </div>

      {/* Comments List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredComments.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            <MessageSquare size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
            <div>{t('comments.noComments', { restaurant: restaurantName })}</div>
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div key={comment.id} className="glass-card" style={{ opacity: comment.is_hidden ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-amber)' }} className="ltr-text">@{comment.author_username}</div>
                  <span className="badge badge-open" style={{ fontSize: '0.7rem' }}>Instagram {comment.media_type}</span>
                  <span className={`badge badge-${comment.classification === 'spam' ? 'review' : 'resolved'}`} style={{ fontSize: '0.7rem' }}>
                    {comment.classification}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className={`btn ${comment.is_hidden ? 'btn-primary' : 'btn-secondary'}`} 
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                    onClick={() => handleToggleHide(comment.id)}
                  >
                    <EyeOff size={14} /> {comment.is_hidden ? t('comments.unhide') : t('comments.hide')}
                  </button>
                </div>
              </div>

              {/* Comment Content */}
              <div style={{ fontSize: '0.95rem', marginBottom: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                "{comment.content}"
              </div>

              {/* Existing Public Reply */}
              {comment.auto_replied && comment.reply_content && (
                <div style={{ marginInlineStart: '1.5rem', background: 'rgba(245, 158, 11, 0.1)', borderInlineStart: '3px solid var(--accent-amber)', padding: '0.65rem 1rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.2rem' }}>
                    {t('comments.officialReply')}
                  </div>
                  <div>{comment.reply_content}</div>
                </div>
              )}

              {/* Manual Reply Form if not replied */}
              {!comment.auto_replied && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder={t('comments.typeReplyPlaceholder')} 
                    className="form-input" 
                    style={{ flex: 1, fontSize: '0.85rem' }}
                    value={replyInputs[comment.id] || ''}
                    onChange={(e) => setReplyInputs({ ...replyInputs, [comment.id]: e.target.value })}
                  />
                  <button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => handleManualReply(comment.id)}>
                    <Send size={14} className={direction === 'rtl' ? 'rtl-flip' : ''} /> {t('comments.postReply')}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
