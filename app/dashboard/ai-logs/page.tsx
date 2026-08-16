'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { 
  Activity, Search, RefreshCw, Filter, CheckCircle2, 
  XCircle, Clock, AlertTriangle, MessageSquare, 
  Layers, ExternalLink, ChevronRight, X, Sparkles, Database,
  Send, HelpCircle, ShieldAlert, Cpu
} from 'lucide-react';
import { AIDecisionTrace } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function AILogsPage() {
  const { selectedTenantId, tenant, isPlatformAdmin } = useAuth();
  const { t, direction } = useLanguage();

  const isRtl = direction === 'rtl';

  const [traces, setTraces] = useState<AIDecisionTrace[]>([]);
  const [summary, setSummary] = useState<{
    totalEvents: number;
    repliesSent: number;
    noReplies: number;
    failedSends: number;
    avgLatencyMs: number;
  }>({
    totalEvents: 0,
    repliesSent: 0,
    noReplies: 0,
    failedSends: 0,
    avgLatencyMs: 0,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [failureFilter, setFailureFilter] = useState<string>('all');

  // Selected Trace for Detail Modal
  const [selectedTrace, setSelectedTrace] = useState<AIDecisionTrace | null>(null);

  const fetchSeqRef = useRef<number>(0);

  const fetchTraces = useCallback(async (isSilent = false) => {
    if (!selectedTenantId) return;

    const currentSeq = ++fetchSeqRef.current;
    if (!isSilent) setLoading(true); else setRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        tenantId: selectedTenantId,
        limit: '100',
      });

      if (channelFilter !== 'all') params.append('channel', channelFilter);
      if (outcomeFilter !== 'all') params.append('outcome', outcomeFilter);
      if (failureFilter !== 'all') params.append('failureCategory', failureFilter);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());

      const res = await fetch(`/api/ai-logs?${params.toString()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (currentSeq === fetchSeqRef.current) {
        setTraces(data.traces || []);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch (err: any) {
      if (currentSeq === fetchSeqRef.current) {
        console.error('[AI_LOGS_FETCH_ERROR]', err);
        setError(err.message || 'Failed to fetch AI decision traces');
      }
    } finally {
      if (currentSeq === fetchSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedTenantId, channelFilter, outcomeFilter, failureFilter, searchTerm]);

  // Initial Load & on filter changes
  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Auto-refresh interval (every 8 seconds when active)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTraces(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTraces]);

  const renderOutcomeBadge = (trace: AIDecisionTrace) => {
    if (!trace.final_outcome) {
      return (
        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#60a5fa', animation: 'pulse 1.5s infinite' }} />
          {isRtl ? 'قيد المعالجة' : 'Processing'}
        </span>
      );
    }

    if (trace.final_outcome === 'REPLY_SENT') {
      return (
        <span className="badge badge-replied" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <CheckCircle2 size={12} />
          {isRtl ? 'تم الرد' : 'Reply Sent'}
        </span>
      );
    }

    if (trace.final_outcome === 'NO_REPLY_DUPLICATE') {
      return (
        <span className="badge badge-closed" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <Layers size={12} />
          {isRtl ? 'حدث مكرر' : 'Duplicate'}
        </span>
      );
    }

    if (trace.final_outcome === 'NO_REPLY_HUMAN_TAKEOVER') {
      return (
        <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <ShieldAlert size={12} />
          {isRtl ? 'استلام بشري' : 'Human Takeover'}
        </span>
      );
    }

    if (trace.final_outcome === 'NO_REPLY_AI_DISABLED' || trace.final_outcome === 'NO_REPLY_AUTO_REPLY_DISABLED') {
      return (
        <span className="badge badge-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <AlertTriangle size={12} />
          {isRtl ? 'معطل' : 'AI Disabled'}
        </span>
      );
    }

    if (trace.final_outcome === 'NO_REPLY_META_SEND_FAILED') {
      return (
        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <XCircle size={12} />
          {isRtl ? 'فشل إرسال ميتا' : 'Meta Send Failed'}
        </span>
      );
    }

    if (trace.final_outcome === 'NO_REPLY_NO_FALLBACK' || trace.final_outcome === 'PROCESSING_FAILED') {
      return (
        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <XCircle size={12} />
          {isRtl ? 'فشل المعالجة' : 'Failed'}
        </span>
      );
    }

    return (
      <span className="badge badge-open">
        {trace.final_outcome}
      </span>
    );
  };

  const getFailureReasonSnippet = (trace: AIDecisionTrace) => {
    if (trace.failure_reason) return trace.failure_reason;
    if (trace.failure_category) return trace.failure_category;
    if (trace.fallback_reason) return `${isRtl ? 'بديل' : 'Fallback'}: ${trace.fallback_reason}`;
    return null;
  };

  return (
    <div dir={direction}>
      <TopHeader 
        title={isRtl ? `سجل قرارات الذكاء الاصطناعي — ${tenant?.name || ''}` : `AI Decision Traces — ${tenant?.name || ''}`}
        subtitle={isRtl ? 'مراقبة فورية لمراحل معالجة الرسائل والتعليقات والتحقق من سير العمليات' : 'Real-time observability and execution telemetry for DM and comment decision paths'}
      />

      {/* Summary Operational Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
            <Activity size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{isRtl ? 'إجمالي الأحداث' : 'Total Events'}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{summary.totalEvents}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{isRtl ? 'تم الرد بنجاح' : 'Replies Sent'}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399' }}>{summary.repliesSent}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{isRtl ? 'بدون رد (تجاهل/استلام)' : 'No Replies (Handled)'}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24' }}>{summary.noReplies}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
            <XCircle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{isRtl ? 'فشل الإرسال / أخطاء' : 'Failed Sends'}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f87171' }}>{summary.failedSends}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{isRtl ? 'متوسط زمن التنفيذ' : 'Avg Latency'}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
              {summary.avgLatencyMs > 0 ? `${summary.avgLatencyMs}ms` : '0ms'}
            </div>
          </div>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div className="glass-card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <Search size={15} style={{ position: 'absolute', [isRtl ? 'right' : 'left']: '10px', top: '10px', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder={isRtl ? 'بحث بواسطة Trace ID، المعرف الخارجي، أو السبب...' : 'Search by Trace ID, Message ID, or Reason...'} 
                className="form-input" 
                style={{ width: '100%', [isRtl ? 'paddingRight' : 'paddingLeft']: '30px', fontSize: '0.82rem', padding: '0.45rem 0.75rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select 
              className="form-select" 
              value={channelFilter} 
              onChange={(e) => setChannelFilter(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.45rem', minWidth: '110px' }}
            >
              <option value="all">{isRtl ? 'جميع القنوات' : 'All Channels'}</option>
              <option value="dm">{isRtl ? 'رسائل خاصة (DM)' : 'Direct Messages'}</option>
              <option value="comment">{isRtl ? 'تعليقات' : 'Comments'}</option>
            </select>

            <select 
              className="form-select" 
              value={outcomeFilter} 
              onChange={(e) => setOutcomeFilter(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.45rem', minWidth: '130px' }}
            >
              <option value="all">{isRtl ? 'جميع النتائج' : 'All Outcomes'}</option>
              <option value="REPLY_SENT">{isRtl ? 'تم الرد (REPLY_SENT)' : 'Reply Sent'}</option>
              <option value="NO_REPLY">{isRtl ? 'بدون رد (تجاهل/استلام)' : 'No Reply (Handled)'}</option>
              <option value="FAILED">{isRtl ? 'أخطاء وفشل إرسال' : 'Failed'}</option>
              <option value="PROCESSING">{isRtl ? 'قيد المعالجة' : 'Processing'}</option>
            </select>

            <select 
              className="form-select" 
              value={failureFilter} 
              onChange={(e) => setFailureFilter(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.45rem', minWidth: '140px' }}
            >
              <option value="all">{isRtl ? 'جميع فئات الأخطاء' : 'All Failure Categories'}</option>
              <option value="DUPLICATE_EVENT">{isRtl ? 'تكرار حدث' : 'DUPLICATE_EVENT'}</option>
              <option value="HUMAN_TAKEOVER">{isRtl ? 'استلام بشري' : 'HUMAN_TAKEOVER'}</option>
              <option value="AI_DISABLED">{isRtl ? 'الذكاء معطل' : 'AI_DISABLED'}</option>
              <option value="AI_PROVIDER_ERROR">{isRtl ? 'خطأ مزود الذكاء' : 'AI_PROVIDER_ERROR'}</option>
              <option value="AI_PROVIDER_TIMEOUT">{isRtl ? 'انتهاء مهلة الذكاء' : 'AI_PROVIDER_TIMEOUT'}</option>
              <option value="META_SEND_FAILURE">{isRtl ? 'فشل إرسال ميتا' : 'META_SEND_FAILURE'}</option>
              <option value="TOKEN_DECRYPTION_FAILURE">{isRtl ? 'فشل فك تشفير الرمز' : 'TOKEN_DECRYPTION_FAILURE'}</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={autoRefresh} 
                onChange={(e) => setAutoRefresh(e.target.checked)} 
                style={{ cursor: 'pointer' }}
              />
              {isRtl ? 'تحديث تلقائي (8 ثوانٍ)' : 'Auto-refresh (8s)'}
            </label>

            <button 
              className="btn btn-secondary" 
              onClick={() => fetchTraces(false)}
              disabled={loading || refreshing}
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {isRtl ? 'تحديث' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="glass-card" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--accent-rose)', padding: '0.9rem', marginBottom: '1.25rem', color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Traces Table */}
      <div className="glass-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{isRtl ? 'الوقت' : 'Time'}</th>
              <th>{isRtl ? 'القناة' : 'Channel'}</th>
              <th>{isRtl ? 'المرحلة' : 'Stage'}</th>
              <th>{isRtl ? 'النتيجة' : 'Outcome'}</th>
              <th>{isRtl ? 'الذكاء الاصطناعي' : 'AI Generation'}</th>
              <th>{isRtl ? 'ميتا' : 'Meta Delivery'}</th>
              <th>{isRtl ? 'زمن التنفيذ' : 'Latency'}</th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && traces.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem auto', display: 'block', color: 'var(--accent-amber)' }} />
                  {isRtl ? 'جاري تحميل سجلات الذكاء الاصطناعي...' : 'Loading AI decision traces...'}
                </td>
              </tr>
            ) : traces.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                  <Activity size={32} style={{ margin: '0 auto 0.75rem auto', display: 'block', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    {isRtl ? 'لا توجد سجلات بعد' : 'No decision traces recorded yet'}
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    {isRtl ? 'ستظهر هنا السجلات تلقائياً بمجرد وصول رسائل أو تعليقات جديدة.' : 'Traces will automatically appear here when new DMs or comments arrive.'}
                  </div>
                </td>
              </tr>
            ) : (
              traces.map((trace) => {
                const failureSnippet = getFailureReasonSnippet(trace);
                const hasError = trace.final_outcome === 'NO_REPLY_META_SEND_FAILED' || trace.final_outcome === 'NO_REPLY_NO_FALLBACK' || trace.final_outcome === 'PROCESSING_FAILED';
                
                return (
                  <tr 
                    key={trace.trace_id} 
                    onClick={() => setSelectedTrace(trace)}
                    style={{ 
                      cursor: 'pointer',
                      background: hasError ? 'rgba(239, 68, 68, 0.03)' : undefined,
                    }}
                    className="hover-row"
                  >
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} className="ltr-text">
                      {new Date(trace.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <div style={{ fontSize: '0.68rem', opacity: 0.7 }}>
                        {new Date(trace.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td>
                      <span className="badge badge-open" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                        {trace.channel_type}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }} className="ltr-text">
                        {trace.processing_stage}
                      </div>
                      {failureSnippet && (
                        <div style={{ fontSize: '0.72rem', color: hasError ? '#f87171' : 'var(--accent-amber)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={failureSnippet}>
                          {failureSnippet}
                        </div>
                      )}
                    </td>

                    <td>
                      {renderOutcomeBadge(trace)}
                    </td>

                    <td>
                      {trace.generation_attempted ? (
                        <div>
                          <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            {trace.generation_success ? (
                              <CheckCircle2 size={12} color="#34d399" />
                            ) : (
                              <XCircle size={12} color="#f87171" />
                            )}
                            <span className="ltr-text" style={{ fontWeight: 600 }}>{trace.ai_model || 'DeepSeek'}</span>
                          </div>
                          {trace.generation_latency_ms ? (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }} className="ltr-text">
                              {trace.generation_latency_ms}ms {trace.tokens_total ? `• ${trace.tokens_total} tok` : ''}
                            </div>
                          ) : null}
                        </div>
                      ) : trace.fallback_used ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-amber)', fontWeight: 600 }}>
                          {isRtl ? 'رد ثابت' : 'Fixed Fallback'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </td>

                    <td>
                      {trace.meta_send_attempted ? (
                        <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {trace.meta_send_success ? (
                            <>
                              <CheckCircle2 size={12} color="#34d399" />
                              <span style={{ color: '#34d399', fontWeight: 600 }}>{trace.meta_http_status || 200}</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={12} color="#f87171" />
                              <span style={{ color: '#f87171', fontWeight: 600 }}>{trace.meta_http_status || 500}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </td>

                    <td style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)', whiteSpace: 'nowrap' }} className="ltr-text">
                      {trace.total_latency_ms ? `${trace.total_latency_ms}ms` : '—'}
                    </td>

                    <td>
                      <ChevronRight size={16} style={{ color: 'var(--text-secondary)', transform: isRtl ? 'rotate(180deg)' : 'none' }} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Trace Detail Modal */}
      {selectedTrace && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(5px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '1.5rem',
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '780px',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            padding: '1.5rem',
            position: 'relative',
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.85rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <Activity size={18} color="var(--accent-amber)" />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                    {isRtl ? 'تفاصيل أثر قرار الذكاء الاصطناعي' : 'AI Decision Trace Details'}
                  </h3>
                  {renderOutcomeBadge(selectedTrace)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }} className="ltr-text">
                  Trace ID: {selectedTrace.trace_id}
                </div>
              </div>

              <button 
                onClick={() => setSelectedTrace(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* 1. Overview & Timing */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={14} /> {isRtl ? 'نظرة عامة وتوقيت التنفيذ' : 'Overview & Execution Timing'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'القناة:' : 'Channel:'}</span>{' '}
                    <strong style={{ textTransform: 'uppercase' }}>{selectedTrace.channel_type} ({selectedTrace.platform})</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'المرحلة:' : 'Stage:'}</span>{' '}
                    <strong className="ltr-text">{selectedTrace.processing_stage}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'النتيجة النهائية:' : 'Final Outcome:'}</span>{' '}
                    <strong className="ltr-text">{selectedTrace.final_outcome || 'IN_PROGRESS'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'إجمالي الزمن:' : 'Total Latency:'}</span>{' '}
                    <strong style={{ color: 'var(--accent-amber)' }}>{selectedTrace.total_latency_ms ? `${selectedTrace.total_latency_ms}ms` : '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'تاريخ الإنشاء:' : 'Created At:'}</span>{' '}
                    <span className="ltr-text">{new Date(selectedTrace.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 2. Failure & Fallback Diagnostics (Prominent if failed) */}
              {(selectedTrace.failure_category || selectedTrace.failure_reason || selectedTrace.fallback_used) && (
                <div style={{ 
                  background: (selectedTrace.failure_category || selectedTrace.failure_reason) ? 'rgba(239, 68, 68, 0.05)' : 'rgba(245, 158, 11, 0.05)', 
                  padding: '0.9rem', 
                  borderRadius: '8px', 
                  border: `1px solid ${(selectedTrace.failure_category || selectedTrace.failure_reason) ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}` 
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: (selectedTrace.failure_category || selectedTrace.failure_reason) ? '#f87171' : 'var(--accent-amber)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <ShieldAlert size={14} /> {isRtl ? 'تشخيص الأخطاء والبدائل' : 'Failure & Fallback Diagnostics'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                    {selectedTrace.failure_category && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'فئة العطل:' : 'Failure Category:'}</span>{' '}
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontWeight: 700 }}>
                          {selectedTrace.failure_category}
                        </span>
                      </div>
                    )}
                    {selectedTrace.failure_reason && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'سبب العطل:' : 'Failure Reason:'}</span>{' '}
                        <span style={{ color: '#f87171', fontFamily: 'monospace' }}>{selectedTrace.failure_reason}</span>
                      </div>
                    )}
                    {selectedTrace.fallback_used && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>{isRtl ? 'تم استخدام الرد البديل:' : 'Fallback Used:'}</span>{' '}
                        <strong>{selectedTrace.fallback_type || 'fixed_reply'}</strong> — {selectedTrace.fallback_reason || 'AI unavailable'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. Correlation Identifiers */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Layers size={14} /> {isRtl ? 'معرفات الربط الداخلي والخارجي' : 'Correlation Identifiers'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', fontSize: '0.78rem', fontFamily: 'monospace' }} className="ltr-text">
                  <div><span style={{ color: 'var(--text-secondary)' }}>Tenant ID:</span> {selectedTrace.tenant_id}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Conversation ID:</span> {selectedTrace.conversation_id || '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Incoming Msg ID:</span> {selectedTrace.incoming_message_id || '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Outgoing Msg ID:</span> {selectedTrace.outgoing_message_id || '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Ext Event ID:</span> {selectedTrace.external_event_id ? `${selectedTrace.external_event_id.slice(0, 24)}...` : '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Ext Outgoing ID:</span> {selectedTrace.external_outgoing_message_id || '—'}</div>
                </div>
              </div>

              {/* 4. AI Generation & Knowledge Retrieval */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Cpu size={14} /> {isRtl ? 'توليد الذكاء الاصطناعي' : 'AI Generation'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Provider / Model:</span> <strong>{selectedTrace.ai_provider || 'deepseek'} / {selectedTrace.ai_model || 'deepseek-v4-flash'}</strong></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Attempted / Success:</span> {selectedTrace.generation_attempted ? (selectedTrace.generation_success ? '✅ Success' : '❌ Failed') : 'Not Attempted'}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>AI Latency:</span> {selectedTrace.generation_latency_ms ? `${selectedTrace.generation_latency_ms}ms` : '—'}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Tokens (Prompt/Compl/Total):</span> {selectedTrace.tokens_prompt || 0} / {selectedTrace.tokens_completion || 0} / {selectedTrace.tokens_total || 0}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>History Msg Count:</span> {selectedTrace.history_message_count || 0}</div>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Database size={14} /> {isRtl ? 'استرجاع قاعدة المعرفة' : 'Knowledge Retrieval'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Retrieved Results Count:</span> <strong>{selectedTrace.retrieval_result_count || 0}</strong></div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Summary:</span>
                      <pre style={{ margin: '0.3rem 0 0 0', fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', padding: '0.4rem', borderRadius: '4px', overflowX: 'auto' }}>
                        {JSON.stringify(selectedTrace.retrieval_summary || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. Meta Delivery Metadata */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Send size={14} /> {isRtl ? 'إرسال ميتا (Instagram Graph API)' : 'Meta Graph API Delivery'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Send Attempted:</span> {selectedTrace.meta_send_attempted ? 'Yes' : 'No'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Send Success:</span> {selectedTrace.meta_send_success ? '✅ Yes' : (selectedTrace.meta_send_attempted ? '❌ No' : '—')}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>HTTP Status:</span> {selectedTrace.meta_http_status || '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Error Code / Subcode:</span> {selectedTrace.meta_error_code || '—'} / {selectedTrace.meta_error_subcode || '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Error Type:</span> {selectedTrace.meta_error_type || '—'}</div>
                </div>
              </div>

              {/* 6. V2 Forward Schema (Unpopulated in Phase 1A) */}
              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.8rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.08)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  {isRtl ? 'حقول الإصدار القادم (Phase 2):' : 'Future Schema Fields (Phase 2):'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.35rem' }}>
                  <div>Language: <em>Not implemented yet</em></div>
                  <div>Intent: <em>Not implemented yet</em></div>
                  <div>Risk Level: <em>Not implemented yet</em></div>
                  <div>Verification: <em>Not implemented yet</em></div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedTrace(null)}>
                {isRtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
