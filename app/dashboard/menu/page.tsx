'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { Utensils, Plus, Trash2, Edit, Check, AlertCircle } from 'lucide-react';
import { MenuItem } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function MenuManagerPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMenu() {
      setLoading(true);
      const data = await db.getMenu(selectedTenantId);
      setItems(data);
      setLoading(false);
    }
    loadMenu();
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
    if (!newItem.name) return;

    const itemToAdd: MenuItem = {
      id: `menu_${Date.now()}`,
      tenant_id: selectedTenantId,
      category: newItem.category,
      name: newItem.name,
      price: Number(newItem.price),
      description: newItem.description,
      ingredients: newItem.ingredients.split(',').map(s => s.trim()),
      is_vegetarian: newItem.is_vegetarian,
      is_vegan: newItem.is_vegan,
      approved_allergens: newItem.approved_allergens.split(',').map(s => s.trim()),
      is_available: true,
      created_at: new Date().toISOString(),
    };

    setItems([...items, itemToAdd]);
    setShowAddModal(false);

    await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemToAdd),
    });
  };

  const handleToggleAvailability = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, is_available: !item.is_available } : item));
  };

  const handleDeleteItem = async (id: string) => {
    setItems(items.filter(i => i.id !== id));
    await fetch(`/api/menu?id=${id}`, { method: 'DELETE' });
  };

  const restaurantName = tenant?.name || '';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('menu.title', { restaurant: restaurantName })} 
        subtitle={t('menu.subtitle')} 
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> {t('menu.addItem')}
        </button>
      </div>

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
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('menu.allergens')} <strong>{item.approved_allergens.join(', ') || t('common.none')}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={item.is_available} 
                    onChange={() => handleToggleAvailability(item.id)} 
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

      {/* Add Modal */}
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
    </div>
  );
}
