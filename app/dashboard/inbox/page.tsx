'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  Search, Send, Sparkles, Check, RefreshCw 
} from 'lucide-react';
import { Conversation, Message } from '@/lib/db/types';
import { db } from '@/lib/db/store';
import { useAuth } from '@/lib/auth/AuthContext';

export default function UnifiedInboxPage() {
  const { selectedTenantId, tenant } = useAuth();
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

  return (
    <div>
      <TopHeader 
        title="Unified Customer Inbox (Live Supabase)" 
        subtitle="Manage Instagram Direct Messages & Automated AI Human Handoffs" 
      />

      <div className="inbox-layout">
        {/* Left Column: Thread List */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="Search conversations..." 
                className="form-input" 
                style={{ width: '100%', paddingLeft: '32px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={fetchConversations}>
              <RefreshCw size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
            <button className={`btn ${filterStatus === 'all' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }} onClick={() => setFilterStatus('all')}>All</button>
            <button className={`btn ${filterStatus === 'review' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }} onClick={() => setFilterStatus('review')}>Review</button>
            <button className={`btn ${filterStatus === 'open' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }} onClick={() => setFilterStatus('open')}>Open</button>
          </div>

          <div className="thread-list">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading real Supabase rows...</div>
            ) : (
              filteredConversations.map((conv) => (
                <div 
                  key={conv.id} 
                  className={`thread-item ${selectedConv?.id === conv.id ? 'active' : ''}`}
                  onClick={() => handleSelectConv(conv)}
                >
                  <div className="thread-header">
                    <span className="thread-name">{conv.customer_name}</span>
                    <span className={`lang-badge lang-${conv.customer_language}`}>{conv.customer_language.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`badge badge-${conv.status === 'needs_human_review' ? 'review' : conv.status}`}>
                      {conv.status.replace('_', ' ')}
                    </span>
                    {conv.human_takeover && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-rose)', fontWeight: 700 }}>HANDOFF</span>
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
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedConv.customer_name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <span className="badge badge-open">Instagram DM</span>
                    <span className={`lang-badge lang-${selectedConv.customer_language}`}>
                      Detected: {selectedConv.customer_language === 'nl' ? 'Dutch (BE)' : selectedConv.customer_language.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.04)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Human Takeover</div>
                    <div style={{ fontSize: '0.7rem', color: selectedConv.human_takeover ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                      {selectedConv.human_takeover ? 'AI Paused (Manual Control)' : 'AI Auto-Reply Active'}
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={selectedConv.human_takeover} 
                      onChange={handleToggleTakeover} 
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '2rem' }}>No messages yet in this conversation</div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`chat-bubble ${msg.sender_type}`}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{msg.sender_type === 'customer' ? selectedConv.customer_name : msg.sender_type === 'ai' ? '🤖 Ghent AI Assistant' : '👤 Support Agent'}</span>
                        {msg.ai_confidence && (
                          <span>Confidence: {(msg.ai_confidence * 100).toFixed(0)}%</span>
                        )}
                      </div>
                      <div>{msg.content}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="chat-input-area">
                {aiSuggestedReply && (
                  <div className="ai-suggestion-box">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: 'var(--accent-amber)', fontSize: '0.8rem' }}>
                        <Sparkles size={14} /> AI Suggested Response (Belgian Dutch 1-2 Sentences):
                      </div>
                      <div style={{ marginTop: '0.25rem', color: 'var(--text-primary)' }}>{aiSuggestedReply}</div>
                    </div>
                    <button 
                      className="btn btn-primary" 
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      onClick={() => setReplyInput(aiSuggestedReply)}
                    >
                      <Check size={12} /> Use Suggestion
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input 
                    type="text" 
                    placeholder="Type your response to customer..." 
                    className="form-input" 
                    style={{ flex: 1 }}
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                  />
                  <button className="btn btn-primary" onClick={handleSendReply}>
                    <Send size={16} /> Send Manual Reply
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
