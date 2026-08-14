'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Utensils, Plus, Trash2, Edit, Check, AlertCircle, FileUp, CheckCircle2, ShieldAlert } from 'lucide-react';
import { MenuItem } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';
import { parseCsvMenu, parseTextMenu, detectDuplicates, ParsedMenuItem } from '@/lib/menu/parser';

export default function MenuManagerPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchMenu = async () => {
    if (!selectedTenantId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/menu?tenantId=${selectedTenantId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch menu items');
      }
      const data = await res.json();
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching menu items:', err);
      setErrorMsg('Failed to load menu items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, [selectedTenantId]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    category: 'Koffie & Warm',
    name: '',
    price: 4.00,
    description: '',
    ingredients: '',
    is_vegetarian: true,
    is_vegan: false,
    approved_allergens: '',
  });

  const handleAddItem = async () => {
    if (!newItem.name || !selectedTenantId) return;

    try {
      const payload = {
        tenant_id: selectedTenantId,
        category: newItem.category,
        name: newItem.name.trim(),
        price: Number(newItem.price),
        description: newItem.description.trim(),
        ingredients: newItem.ingredients.split(',').map(s => s.trim()).filter(Boolean),
        is_vegetarian: newItem.is_vegetarian,
        is_vegan: newItem.is_vegan,
        approved_allergens: newItem.approved_allergens.split(',').map(s => s.trim()).filter(Boolean),
        is_available: true,
      };

      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save menu item to database.');
      }

      setShowAddModal(false);
      setNewItem({
        category: 'Koffie & Warm',
        name: '',
        price: 4.00,
        description: '',
        ingredients: '',
        is_vegetarian: true,
        is_vegan: false,
        approved_allergens: '',
      });
      await fetchMenu();
    } catch (err: any) {
      console.error('Error adding menu item:', err);
      alert(`Error: ${err.message || 'Failed to save menu item.'}`);
    }
  };

  const handleToggleAvailability = async (id: string, currentAvailable: boolean) => {
    setItems(items.map(item => item.id === id ? { ...item, is_available: !currentAvailable } : item));
    try {
      await fetch('/api/menu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_available: !currentAvailable, tenant_id: selectedTenantId }),
      });
    } catch (err) {
      console.error('Error toggling availability:', err);
      fetchMenu();
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this menu item?')) return;
    setItems(items.filter(i => i.id !== id));
    try {
      await fetch(`/api/menu?id=${id}&tenantId=${selectedTenantId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Error deleting menu item:', err);
      fetchMenu();
    }
  };

  // --- MENU IMPORT WORKFLOW STATE ---
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [parsedItems, setParsedItems] = useState<ParsedMenuItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTenantId) return;

    if (file.size > 10 * 1024 * 1024) {
      setImportError('File size exceeds 10MB limit.');
      return;
    }

    setImportError(null);
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', selectedTenantId);

      const res = await fetch('/api/menu/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract menu items from file.');
      }

      setParsedItems(data.items || []);
      setImportStep('preview');
    } catch (err: any) {
      console.error('Error processing file:', err);
      setImportError(err.message || 'Failed to extract menu file.');
    } finally {
      setImporting(false);
    }
  };

  const handleUpdateParsedRow = (index: number, updates: Partial<ParsedMenuItem>) => {
    setParsedItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleDeleteParsedRow = (index: number) => {
    setParsedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddBlankRow = () => {
    const newRow: ParsedMenuItem = {
      tempId: `manual_new_${Date.now()}`,
      name: 'New Item',
      category: 'General',
      price: 5.00,
      description: '',
      ingredients: [],
      approved_allergens: [],
      is_vegetarian: false,
      is_vegan: false,
      is_available: true,
      selected: true,
      duplicateAction: 'import_new',
    };
    setParsedItems([...parsedItems, newRow]);
  };

  const handleConfirmImport = async () => {
    if (!selectedTenantId || parsedItems.length === 0) return;

    setImporting(true);
    setImportError(null);

    try {
      const res = await fetch('/api/menu/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          items: parsedItems,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Menu import failed.');
      }

      setImportResult(data.count || { imported: 0, updated: 0, skipped: 0, failed: 0 });
      setImportStep('result');
      await fetchMenu();
    } catch (err: any) {
      console.error('Error confirming menu import:', err);
      setImportError(err.message || 'Failed to complete menu import.');
    } finally {
      setImporting(false);
    }
  };

  const restaurantName = tenant?.name || '';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('menu.title', { restaurant: restaurantName })} 
        subtitle={t('menu.subtitle')} 
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button 
          className="btn btn-secondary" 
          onClick={() => {
            setImportStep('upload');
            setParsedItems([]);
            setImportError(null);
            setImportResult(null);
            setShowImportModal(true);
          }}
        >
          <FileUp size={16} /> {t('menu.importMenu') || 'Import Menu / استيراد قائمة الطعام'}
        </button>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> {t('menu.addItem')}
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--accent-rose)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.25rem' }}>
          <AlertCircle size={16} style={{ display: 'inline', marginInlineEnd: '0.4rem' }} />
          {errorMsg}
        </div>
      )}

      {/* Menu Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {items.map((item) => (
          <div key={item.id} className="glass-card" style={{ opacity: item.is_available ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.15rem' }}>{item.name}</h3>
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-amber)' }} className="ltr-text">€{item.price.toFixed(2)}</span>
                  <span className="badge badge-open" style={{ fontSize: '0.7rem' }}>{item.category}</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.65rem' }}>{item.description}</p>
                
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {item.is_vegetarian && <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>{t('menu.vegetarian')}</span>}
                  {item.is_vegan && <span style={{ fontSize: '0.72rem', background: 'rgba(6, 182, 212, 0.2)', color: 'var(--accent-cyan)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>{t('menu.vegan')}</span>}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('menu.allergens')} <strong>{Array.isArray(item.approved_allergens) ? item.approved_allergens.join(', ') : t('common.none')}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={item.is_available} 
                    onChange={() => handleToggleAvailability(item.id, item.is_available)} 
                  />
                  <span className="slider"></span>
                </label>

                <button className="btn btn-secondary" style={{ padding: '0.4rem', color: 'var(--accent-rose)' }} onClick={() => handleDeleteItem(item.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Manual Add Item Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} dir={direction}>
          <div className="glass-card" style={{ width: '480px', maxWidth: '100%', padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{t('menu.modalTitle')}</h3>

            <div className="form-group">
              <label className="form-label">{t('menu.category')}</label>
              <select className="form-select" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
                <option value="Koffie & Warm">Koffie & Warm</option>
                <option value="Gebak & Ontbijt">Gebak & Ontbijt</option>
                <option value="Lunch">Lunch</option>
                <option value="Koude Dranken">Koude Dranken</option>
                <option value="General">General</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('menu.name')}</label>
              <input type="text" className="form-input" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('menu.price')}</label>
              <input type="number" step="0.10" className="form-input ltr-text" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('menu.description')}</label>
              <textarea className="form-textarea" rows={2} value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('menu.allergens')}</label>
              <input type="text" className="form-input" placeholder={t('menu.approvedAllergensPlaceholder')} value={newItem.approved_allergens} onChange={(e) => setNewItem({ ...newItem, approved_allergens: e.target.value })} />
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={newItem.is_vegetarian} onChange={(e) => setNewItem({ ...newItem, is_vegetarian: e.target.checked })} /> {t('menu.vegetarian')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={newItem.is_vegan} onChange={(e) => setNewItem({ ...newItem, is_vegan: e.target.checked })} /> {t('menu.vegan')}
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleAddItem}>{t('menu.saveItem')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Import Workflow Modal */}
      {showImportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }} dir={direction}>
          <div className="glass-card" style={{ width: '900px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileUp size={20} color="var(--accent-indigo)" /> {t('menu.importModalTitle') || 'Import Restaurant Menu / استيراد قائمة الطعام'}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => setShowImportModal(false)}>✕</button>
            </div>

            {importError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--accent-rose)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                <AlertCircle size={16} style={{ display: 'inline', marginInlineEnd: '0.4rem' }} />
                {importError}
              </div>
            )}

            {/* STEP 1: UPLOAD */}
            {importStep === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem', border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <FileUp size={48} color="var(--accent-indigo)" style={{ marginBottom: '1rem' }} />
                <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{t('menu.selectFile') || 'Select Menu File (.csv, .pdf, .jpg, .png)'}</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Supported formats: CSV, PDF, JPG, PNG (Max size: 10MB)
                </p>
                <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                  Choose File
                  <input type="file" accept=".csv,.pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
            )}

            {/* STEP 2: PREVIEW & VERIFY TABLE */}
            {importStep === 'preview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--accent-amber)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-amber)', fontSize: '0.82rem' }}>
                  <ShieldAlert size={16} style={{ display: 'inline', marginInlineEnd: '0.4rem', verticalAlign: '-3px' }} />
                  {t('menu.noticeNotice') || 'Review extracted menu items before saving. Items marked as duplicate will be skipped by default.'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    Extracted Items: {parsedItems.length}
                  </span>
                  <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={handleAddBlankRow}>
                    <Plus size={14} /> Add Missing Row
                  </button>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: direction === 'rtl' ? 'right' : 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '0.6rem' }}>Import</th>
                        <th style={{ padding: '0.6rem' }}>Name</th>
                        <th style={{ padding: '0.6rem' }}>Category</th>
                        <th style={{ padding: '0.6rem' }}>Price (€)</th>
                        <th style={{ padding: '0.6rem' }}>Duplicate Action</th>
                        <th style={{ padding: '0.6rem' }}>Dietary</th>
                        <th style={{ padding: '0.6rem' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedItems.map((item, idx) => (
                        <tr key={item.tempId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: item.isDuplicate ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={item.selected} 
                              onChange={(e) => handleUpdateParsedRow(idx, { selected: e.target.checked })} 
                            />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input 
                              type="text" 
                              className="form-input" 
                              style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }} 
                              value={item.name} 
                              onChange={(e) => handleUpdateParsedRow(idx, { name: e.target.value })} 
                            />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input 
                              type="text" 
                              className="form-input" 
                              style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }} 
                              value={item.category} 
                              onChange={(e) => handleUpdateParsedRow(idx, { category: e.target.value })} 
                            />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input 
                              type="number" 
                              step="0.10" 
                              className="form-input ltr-text" 
                              style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', width: '80px' }} 
                              value={item.price} 
                              onChange={(e) => handleUpdateParsedRow(idx, { price: Number(e.target.value) })} 
                            />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            {item.isDuplicate ? (
                              <select 
                                className="form-select" 
                                style={{ fontSize: '0.75rem', padding: '0.2rem' }}
                                value={item.duplicateAction || 'skip'}
                                onChange={(e) => handleUpdateParsedRow(idx, { duplicateAction: e.target.value as any })}
                              >
                                <option value="skip">Skip (Duplicate)</option>
                                <option value="update">Update Existing</option>
                                <option value="import_new">Import as New</option>
                              </select>
                            ) : (
                              <span style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem' }}>New Item</span>
                            )}
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.72rem' }}>
                              <label>
                                <input 
                                  type="checkbox" 
                                  checked={item.is_vegetarian} 
                                  onChange={(e) => handleUpdateParsedRow(idx, { is_vegetarian: e.target.checked })} 
                                /> Veg
                              </label>
                              <label>
                                <input 
                                  type="checkbox" 
                                  checked={item.is_vegan} 
                                  onChange={(e) => handleUpdateParsedRow(idx, { is_vegan: e.target.checked })} 
                                /> Vegan
                              </label>
                            </div>
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.2rem 0.4rem', color: 'var(--accent-rose)' }} onClick={() => handleDeleteParsedRow(idx)}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button className="btn btn-secondary" onClick={() => setImportStep('upload')}>{t('common.back')}</button>
                  <button className="btn btn-primary" onClick={handleConfirmImport} disabled={importing}>
                    <CheckCircle2 size={16} /> {importing ? 'Importing...' : (t('menu.confirmImport') || 'Confirm Import / تأكيد الاستيراد')}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: RESULT */}
            {importStep === 'result' && importResult && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', textAlign: 'center' }}>
                <CheckCircle2 size={54} color="var(--accent-emerald)" style={{ marginBottom: '1rem' }} />
                <h4 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Menu Import Completed Successfully!</h4>
                
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  <span className="badge badge-open" style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)' }}>
                    Imported: {importResult.imported}
                  </span>
                  <span className="badge badge-open" style={{ background: 'rgba(6, 182, 212, 0.2)', color: 'var(--accent-cyan)' }}>
                    Updated: {importResult.updated}
                  </span>
                  <span className="badge badge-open" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)' }}>
                    Skipped: {importResult.skipped}
                  </span>
                  {importResult.failed > 0 && (
                    <span className="badge badge-open" style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-rose)' }}>
                      Failed: {importResult.failed}
                    </span>
                  )}
                </div>

                <button className="btn btn-primary" onClick={() => setShowImportModal(false)}>
                  Done / إغلاق
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
