'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  Search, Send, Sparkles, Check, RefreshCw 
} from 'lucide-react';
import { Conversation, Message } from '@/lib/db/types';
import { db } from '@/lib/db/store';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function UnifiedInboxPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [replyInput, setReplyInput] = useState<string>('');
  const [aiSuggestedReply, setAiSuggestedReply] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const convList = await db.getConversations(selectedTenantId);
      setConversations(convList);
      if (convList.length > 0) {
        setSelectedConv(convList[0]);
        loadMessages(convList[0].id);
      } else {
        setSelectedConv(null);
        setMessages([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (convId: string) => {
    const msgList = await db.getMessages(convId);
    setMessages(msgList);
    setAiSuggestedReply(`Onze openingsuren voor ${tenant?.name || 'het café'} in ${tenant?.city || 'Gent'} zijn vandaag van 08:00 tot 18:00. Tot zo!`);
  };

  useEffect(() => {
    fetchConversations();
  }, [selectedTenantId]);

  const handleSelectConv = (conv: Conversation) => {
    setSelectedConv(conv);
    loadMessages(conv.id);
    setReplyInput('');
  };

  const handleToggleTakeover = async () => {
    if (!selectedConv) return;
    const updatedTakeover = !selectedConv.human_takeover;
    const updatedStatus = updatedTakeover ? 'needs_human_review' : 'open';

    const updated = await db.updateConversation(selectedConv.id, {
      human_takeover: updatedTakeover,
      is_manual_takeover: updatedTakeover,
      auto_reply_enabled: !updatedTakeover,
      status: updatedStatus as any,
    });

    if (updated) {
      setSelectedConv(updated);
      setConversations(conversations.map(c => c.id === updated.id ? updated : c));
    }
  };

  const handleSendReply = async () => {
    if (!replyInput.trim() || !selectedConv) return;

    const newMsg = await db.addMessage({
      conversation_id: selectedConv.id,
      tenant_id: selectedConv.tenant_id,
      sender_type: 'agent',
      content: replyInput,
      sanitized_content: replyInput,
      status: 'manually_replied',
    });

    if (newMsg) {
      setMessages([...messages, newMsg]);
      setReplyInput('');
    }
  };

  const filteredConversations = conversations.filter(c => {
    if (filterStatus === 'review' && c.status !== 'needs_human_review') return false;
    if (filterStatus === 'open' && c.status !== 'open') return false;
    if (filterStatus === 'resolved' && c.status !== 'resolved') return false;
    if (searchTerm && !c.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const restaurantName = tenant?.name || '';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('inbox.title', { restaurant: restaurantName })} 
        subtitle={t('inbox.subtitle')} 
      />

      <div className="inbox-layout">
        {/* Left Column: Thread List */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: direction === 'rtl' ? 'auto' : '10px', right: direction === 'rtl' ? '10px' : 'auto', top: '10px', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder={t('inbox.searchPlaceholder')} 
                className="form-input" 
                style={{ width: '100%', paddingLeft: direction === 'rtl' ? '0.9rem' : '32px', paddingRight: direction === 'rtl' ? '32px' : '0.9rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="btn btn-secondary" style={{ padding: '0.5rem', marginInlineStart: '0.5rem' }} onClick={fetchConversations} title={t('inbox.refresh')}>
              <RefreshCw size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
            <button className={`btn ${filterStatus === 'all' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }} onClick={() => setFilterStatus('all')}>{t('common.all')}</button>
            <button className={`btn ${filterStatus === 'review' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }} onClick={() => setFilterStatus('review')}>{t('inbox.needsReview')}</button>
            <button className={`btn ${filterStatus === 'open' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }} onClick={() => setFilterStatus('open')}>{t('common.active')}</button>
          </div>

          <div className="thread-list">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('inbox.loadingConvs', { restaurant: restaurantName })}</div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('inbox.noConversations', { restaurant: restaurantName })}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div 
                  key={conv.id} 
                  className={`thread-item ${selectedConv?.id === conv.id ? 'active' : ''}`}
                  onClick={() => handleSelectConv(conv)}
                >
                  <div className="thread-header">
                    <span className="thread-name ltr-text">{conv.customer_name}</span>
                    <span className={`lang-badge lang-${conv.customer_language}`}>{conv.customer_language.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`badge badge-${conv.status === 'needs_human_review' ? 'review' : conv.status}`}>
                      {conv.status === 'needs_human_review' ? t('inbox.needsReview') : conv.status === 'resolved' ? t('inbox.resolved') : t('common.active')}
                    </span>
                    {conv.human_takeover && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-rose)', fontWeight: 700 }}>{t('inbox.humanTakeoverBadge')}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Chat Window */}
        <div className="glass-card chat-window">
          {selectedConv ? (
            <>
              <div className="chat-header">
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }} className="ltr-text">{selectedConv.customer_name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <span className="badge badge-open">{t('inbox.instagramDm')}</span>
                    <span className={`lang-badge lang-${selectedConv.customer_language}`}>
                      {t('inbox.localeLabel', { locale: selectedConv.customer_language.toUpperCase() })}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.04)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ textAlign: direction === 'rtl' ? 'left' : 'right' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{t('inbox.automationControl')}</div>
                    <div style={{ fontSize: '0.7rem', color: selectedConv.human_takeover ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                      {selectedConv.human_takeover ? t('inbox.humanControlActive') : t('inbox.autoRepliesActive')}
                    </div>
                  </div>
                  <button 
                    className={`btn ${selectedConv.human_takeover ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
                    onClick={handleToggleTakeover}
                  >
                    {selectedConv.human_takeover ? t('inbox.resumeAutoReplies') : t('inbox.takeOverConv')}
                  </button>
                </div>
              </div>

              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '2rem' }}>{t('inbox.noMessages')}</div>
                ) : (
                  messages.map((msg) => {
                    const label = msg.sender_type === 'customer' 
                      ? selectedConv.customer_name 
                      : msg.sender_type === 'ai' 
                        ? t('inbox.botLabel')
                        : t('inbox.humanAgentLabel');

                    return (
                      <div key={msg.id} className={`chat-bubble ${msg.sender_type}`}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600 }} className={msg.sender_type === 'customer' ? 'ltr-text' : ''}>{label}</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }} className="ltr-text">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div>{msg.content}</div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="chat-input-area">
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input 
                    type="text" 
                    placeholder={t('inbox.typeResponse', { name: selectedConv.customer_name })} 
                    className="form-input" 
                    style={{ flex: 1 }}
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                  />
                  <button className="btn btn-primary" onClick={handleSendReply}>
                    <Send size={16} className={direction === 'rtl' ? 'rtl-flip' : ''} /> {t('inbox.send')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
              {t('inbox.selectConvPrompt', { restaurant: restaurantName })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
