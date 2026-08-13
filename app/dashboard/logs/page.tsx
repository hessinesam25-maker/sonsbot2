'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { FileText, Search, ShieldCheck, Filter } from 'lucide-react';
import { AuditLog } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function AuditLogsPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    async function loadLogs() {
      const data = await db.getAuditLogs(selectedTenantId);
      setLogs(data);
    }
    loadLogs();
  }, [selectedTenantId]);

  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = logs.filter(l => 
    l.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.actor_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    JSON.stringify(l.details).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('logs.title')} 
        subtitle={t('logs.subtitle')} 
      />

      <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: direction === 'rtl' ? 'auto' : '10px', right: direction === 'rtl' ? '10px' : 'auto', top: '10px', color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            placeholder={t('logs.searchPlaceholder')} 
            className="form-input" 
            style={{ width: '100%', paddingLeft: direction === 'rtl' ? '0.9rem' : '32px', paddingRight: direction === 'rtl' ? '32px' : '0.9rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('logs.colTimestamp')}</th>
              <th>{t('logs.colEventType')}</th>
              <th>{t('logs.colActor')}</th>
              <th>{t('logs.colDetails')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} className="ltr-text">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-amber)' }} className="ltr-text">{log.event_type}</span>
                </td>
                <td>
                  <span className="badge badge-open" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>{log.actor_type}</span>
                </td>
                <td style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text-primary)' }} className="ltr-text">
                  {JSON.stringify(log.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
