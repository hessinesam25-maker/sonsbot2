'use client';

import React, { useState, useEffect } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { BookOpen, Save, MapPin, Clock, HelpCircle, CheckCircle2 } from 'lucide-react';
import { KnowledgeBase } from '@/lib/db/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { db } from '@/lib/db/store';

export default function KnowledgeBaseEditorPage() {
  const { selectedTenantId, tenant } = useAuth();
  const { t, direction } = useLanguage();
  const [kb, setKb] = useState<KnowledgeBase>({
    id: 'kb_001',
    tenant_id: selectedTenantId,
    cafe_name: tenant?.name || 'Restaurant Client',
    address: 'Korenmarkt 14, 9000 Gent, België',
    google_maps_url: 'https://maps.google.com/?q=Korenmarkt+14+Gent',
    opening_hours: {
      monday: '08:00 - 18:00',
      tuesday: '08:00 - 18:00',
      wednesday: '08:00 - 18:00',
      thursday: '08:00 - 18:00',
      friday: '08:00 - 20:00',
      saturday: '09:00 - 20:00',
      sunday: '09:00 - 18:00',
    },
    holiday_hours: {},
    reservation_rules: 'Tafels voor 1-6 personen kunnen online gereserveerd worden tot 2 uur op voorhand.',
    delivery_takeaway_info: 'Takeaway en afhalen mogelijk aan de toog.',
    contact_email: 'hallo@restaurant.be',
    contact_phone: '+32 9 234 56 78',
    wifi_details: 'Gratis Wi-Fi beschikbaar voor klanten.',
    payment_methods: ['Bancontact', 'Visa', 'Mastercard', 'Apple Pay', 'Cash'],
    promotions: [],
    faqs: [],
    updated_at: new Date().toISOString(),
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function loadKb() {
      const data = await db.getKnowledgeBase(selectedTenantId);
      if (data) {
        setKb(data);
      }
    }
    loadKb();
  }, [selectedTenantId]);

  const handleSave = async () => {
    await db.updateKnowledgeBase({ ...kb, tenant_id: selectedTenantId }, selectedTenantId);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const restaurantName = tenant?.name || '';
  const city = tenant?.city || 'Ghent';
  const country = tenant?.country || 'Belgium';

  return (
    <div dir={direction}>
      <TopHeader 
        title={t('knowledge.title', { restaurant: restaurantName })} 
        subtitle={t('knowledge.subtitle', { city, country })} 
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={16} /> {t('knowledge.saveChanges')}
        </button>
      </div>

      {savedSuccess && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-emerald)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {t('knowledge.saveSuccess')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Core Info */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={20} color="var(--accent-amber)" /> {t('knowledge.coreDetails')}
          </h3>

          <div className="form-group">
            <label className="form-label">{t('knowledge.cafeName')}</label>
            <input 
              type="text" 
              className="form-input" 
              value={kb.cafe_name}
              onChange={(e) => setKb({ ...kb, cafe_name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('knowledge.addressInCity', { city })}</label>
            <input 
              type="text" 
              className="form-input" 
              value={kb.address}
              onChange={(e) => setKb({ ...kb, address: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('knowledge.mapsUrl')}</label>
            <input 
              type="url" 
              className="form-input" 
              value={kb.google_maps_url}
              onChange={(e) => setKb({ ...kb, google_maps_url: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('knowledge.contactEmail')}</label>
              <input 
                type="email" 
                className="form-input" 
                value={kb.contact_email}
                onChange={(e) => setKb({ ...kb, contact_email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('knowledge.contactPhone')}</label>
              <input 
                type="tel" 
                className="form-input" 
                value={kb.contact_phone}
                onChange={(e) => setKb({ ...kb, contact_phone: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Opening Hours */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={20} color="var(--accent-indigo)" /> {t('knowledge.openingHours')}
          </h3>

          {Object.entries(kb.opening_hours).map(([day, hours]) => (
            <div key={day} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.88rem', textTransform: 'capitalize', fontWeight: 600 }}>{day}</span>
              <input 
                type="text" 
                className="form-input ltr-text" 
                style={{ width: '180px', fontSize: '0.85rem' }}
                value={hours}
                onChange={(e) => setKb({
                  ...kb,
                  opening_hours: { ...kb.opening_hours, [day]: e.target.value }
                })}
              />
            </div>
          ))}
        </div>

        {/* Reservation Rules & Takeaway Info */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem' }}>{t('knowledge.reservationTakeawayTitle')}</h3>

          <div className="form-group">
            <label className="form-label">{t('knowledge.reservationPolicy')}</label>
            <textarea 
              className="form-textarea" 
              rows={3} 
              value={kb.reservation_rules}
              onChange={(e) => setKb({ ...kb, reservation_rules: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('knowledge.deliveryTakeawayInfo')}</label>
            <textarea 
              className="form-textarea" 
              rows={3} 
              value={kb.delivery_takeaway_info}
              onChange={(e) => setKb({ ...kb, delivery_takeaway_info: e.target.value })}
            />
          </div>
        </div>

        {/* Wi-Fi & Payment Methods */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem' }}>{t('knowledge.facilitiesPaymentsTitle')}</h3>

          <div className="form-group">
            <label className="form-label">{t('knowledge.wifiDetails')}</label>
            <input 
              type="text" 
              className="form-input" 
              value={kb.wifi_details}
              onChange={(e) => setKb({ ...kb, wifi_details: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('knowledge.paymentMethods')}</label>
            <input 
              type="text" 
              className="form-input" 
              value={kb.payment_methods.join(', ')}
              onChange={(e) => setKb({ ...kb, payment_methods: e.target.value.split(',').map(s => s.trim()) })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
