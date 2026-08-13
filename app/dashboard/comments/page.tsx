'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  MessageSquare, EyeOff, Send, RefreshCw, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { Comment, InstagramConnectionState } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function CommentsInboxPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [comments, setComments] = useState<Comment[]>([]);
  const [igState, setIgState] = useState<InstagramConnectionState | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    const data = await db.getComments(selectedTenantId);
    setComments(data);
    const connState = await db.getInstagramConnectionState(selectedTenantId);
    setIgState(connState);

    const conns = await db.getConnections(selectedTenantId);
    const activeIg = conns.find(c => c.platform === 'instagram' && c.is_active);
    if (activeIg?.last_synced_at) {
      setLastSyncedAt(activeIg.last_synced_at);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedTenantId]);

  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});

  const handleManualSync = async () => {
    if (!igState?.connected) return;

    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/instagram/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: selectedTenantId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSyncFeedback({
          type: 'error',
          message: data.error || t('comments.syncFailed', { error: 'Unknown sync failure' }),
        });
      } else {
        const msg = t('comments.syncSuccess', {
          media: data.mediaSynced ?? 0,
          comments: data.commentsSynced ?? 0,
        });
        setSyncFeedback({ type: 'success', message: msg });
        await loadData();
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Network error initiating sync.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

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
  const isIgConnected = Boolean(igState?.connected);

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('comments.title', { restaurant: restaurantName })} 
        subtitle={t('comments.subtitle', { restaurant: restaurantName })} 
      />

      {/* Operational Sync Control Bar */}
      <div 
        className="glass-card" 
        style={{ 
          marginBottom: '1rem', 
          padding: '1rem 1.25rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          flexWrap: 'wrap', 
          gap: '1rem' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span 
            className={`badge badge-${isIgConnected ? 'resolved' : 'review'}`}
            style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            Instagram {isIgConnected ? t('instagramState.connected') : t('instagramState.disconnected')}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {t('comments.lastSync')} {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : t('comments.neverSynced')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', opacity: (!isIgConnected || isSyncing) ? 0.6 : 1 }}
            disabled={!isIgConnected || isSyncing}
            onClick={handleManualSync}
            title={!isIgConnected ? t('comments.connectInstagramFirst') : t('comments.syncNow')}
          >
            <RefreshCw size={15} className={isSyncing ? 'spin-anim' : ''} />
            {isSyncing ? t('comments.syncing') : t('comments.syncNow')}
          </button>
        </div>
      </div>

      {/* Sync Status / Error Banner */}
      {!isIgConnected && (
        <div 
          className="glass-card" 
          style={{ 
            marginBottom: '1rem', 
            padding: '0.75rem 1rem', 
            background: 'rgba(239, 68, 68, 0.1)', 
            borderInlineStart: '4px solid var(--accent-red)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem'
          }}
        >
          <AlertCircle size={16} color="var(--accent-red)" />
          <span>{t('comments.connectInstagramFirst')}</span>
        </div>
      )}

      {syncFeedback && (
        <div 
          className="glass-card" 
          style={{ 
            marginBottom: '1rem', 
            padding: '0.75rem 1rem', 
            background: syncFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
            borderInlineStart: `4px solid ${syncFeedback.type === 'success' ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem'
          }}
        >
          {syncFeedback.type === 'success' ? (
            <CheckCircle2 size={16} color="var(--accent-green, #22c55e)" />
          ) : (
            <AlertCircle size={16} color="var(--accent-red, #ef4444)" />
          )}
          <span>{syncFeedback.message}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
          {t('comments.filterByClassification')}
        </span>

        {['all', 'positive', 'question', 'complaint', 'collaboration', 'spam'].map((cat) => (
          <button 
            key={cat} 
            className={`btn ${selectedFilter === cat ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setSelectedFilter(cat)}
          >
            {t(`comments.classifications.${cat}`) || cat}
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
                    {t(`comments.classifications.${comment.classification}`) || comment.classification}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {comment.media_id && (
                    <a 
                      href={comment.media_id.startsWith('http') ? comment.media_id : `https://www.instagram.com/p/DbtEzcOuehK/`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                    >
                      {direction === 'rtl' ? 'عرض المنشور الأصلي' : 'View Source Post'}
                    </a>
                  )}
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
