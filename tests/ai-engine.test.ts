import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../lib/ai/language';
import { queryKnowledgeBase } from '../lib/ai/knowledge';
import { sanitizeResponseLength } from '../lib/ai/guardrails';
import { generateAIReply } from '../lib/ai/engine';
import { KnowledgeBase, MenuItem, AutomationRules } from '../lib/db/types';

describe('AI Engine, Multi-Lingual & Guardrails Test Suite', () => {
  const mockKb: KnowledgeBase = {
    id: 'kb_1',
    tenant_id: 'tenant',
    cafe_name: 'Café De Gentse Draak',
    address: 'Korenmarkt 14, 9000 Gent',
    google_maps_url: 'https://maps.google.com/?q=Korenmarkt+14+Gent',
    opening_hours: { monday: '08:00 - 18:00', tuesday: '08:00 - 18:00', wednesday: '08:00 - 18:00', thursday: '08:00 - 18:00', friday: '08:00 - 20:00', saturday: '09:00 - 20:00', sunday: '09:00 - 18:00' },
    holiday_hours: {},
    reservation_rules: 'Reserveren kan voor 1-6 personen.',
    delivery_takeaway_info: 'Takeaway mogelijk.',
    contact_email: 'info@gent.be',
    contact_phone: '+32 9 123 45 67',
    wifi_details: 'Free WiFi',
    payment_methods: ['Bancontact', 'Cash'],
    promotions: [],
    faqs: [],
    updated_at: new Date().toISOString(),
  };

  const mockMenu: MenuItem[] = [
    { id: 'm1', tenant_id: 't', category: 'Warm', name: 'Gentse Cappuccino', price: 4.2, description: 'Espresso met melk.', ingredients: ['Espresso', 'Melk'], is_vegetarian: true, is_vegan: false, approved_allergens: ['Melk'], is_available: true, created_at: '' }
  ];

  const mockRules: AutomationRules = {
    id: 'r1', tenant_id: 't', min_confidence_score: 0.85, max_public_replies_per_hour: 20,
    auto_reply_positive_comments: true, auto_reply_factual_questions: true, never_reply_complaints: true,
    hide_spam: true, ai_tone: 'friendly_warm', updated_at: ''
  };

  it('should detect languages accurately with Dutch fallback', () => {
    expect(detectLanguage('Hallo, wat zijn de openingsuren in Gent?')).toBe('nl');
    expect(detectLanguage('Hello, what time do you open?')).toBe('en');
    expect(detectLanguage('Bonjour! Avez-vous une table libre?')).toBe('fr');
    expect(detectLanguage('مرحبا، ما هي أوقات العمل؟')).toBe('ar');
    expect(detectLanguage('Random unknown string 123')).toBe('nl'); // Fallback to Belgian Dutch
  });

  it('should treat factual/predefined rule match as auto-reply eligible without depending on AI confidence score thresholds', () => {
    const strictRules: AutomationRules = {
      ...mockRules,
      min_confidence_score: 0.99, // Unreachable AI score
      auto_reply_factual_questions: true,
    };

    const res = generateAIReply('Wat zijn de openingsuren in Gent?', 'dm', mockKb, mockMenu, strictRules);
    expect(res.ruleMatchFound).toBe(true);
    expect(res.replySource).toBe('predefined_rule');
    expect(res.isSafeForAutoReply).toBe(true);
    expect(res.requiresHumanReview).toBe(false);
    expect(res.confidenceScore).toBe(1.0);
    expect(res.suggestedReply).toContain('Onze openingsuren in Gent');
  });

  it('should match common greetings deterministically as auto-reply eligible across languages', () => {
    // Dutch greeting
    const resNl = generateAIReply('Hallo!', 'dm', mockKb, mockMenu, mockRules);
    expect(resNl.ruleMatchFound).toBe(true);
    expect(resNl.matchedRuleType).toBe('greeting');
    expect(resNl.isSafeForAutoReply).toBe(true);

    // Arabic greeting "هاي"
    const resAr1 = generateAIReply('هاي', 'dm', mockKb, mockMenu, mockRules);
    expect(resAr1.ruleMatchFound).toBe(true);
    expect(resAr1.matchedRuleType).toBe('greeting');
    expect(resAr1.isSafeForAutoReply).toBe(true);

    // Arabic greeting "أهلاً" (with diacritics / alef hamza)
    const resAr2 = generateAIReply('أهلاً', 'dm', mockKb, mockMenu, mockRules);
    expect(resAr2.ruleMatchFound).toBe(true);
    expect(resAr2.matchedRuleType).toBe('greeting');
    expect(resAr2.isSafeForAutoReply).toBe(true);

    // Arabic greeting "السلام عليكم"
    const resAr3 = generateAIReply('السلام عليكم', 'dm', mockKb, mockMenu, mockRules);
    expect(resAr3.ruleMatchFound).toBe(true);
    expect(resAr3.matchedRuleType).toBe('greeting');
    expect(resAr3.isSafeForAutoReply).toBe(true);

    // French greeting "Bonjour"
    const resFr = generateAIReply('Bonjour!', 'dm', mockKb, mockMenu, mockRules);
    expect(resFr.ruleMatchFound).toBe(true);
    expect(resFr.matchedRuleType).toBe('greeting');
    expect(resFr.isSafeForAutoReply).toBe(true);

    // English greeting "Hello"
    const resEn = generateAIReply('Hello there!', 'dm', mockKb, mockMenu, mockRules);
    expect(resEn.ruleMatchFound).toBe(true);
    expect(resEn.matchedRuleType).toBe('greeting');
    expect(resEn.isSafeForAutoReply).toBe(true);
  });

  it('should respect disabled auto_reply_factual_questions setting', () => {
    const disabledRules: AutomationRules = {
      ...mockRules,
      auto_reply_factual_questions: false,
    };

    const res = generateAIReply('Wat is het adres?', 'dm', mockKb, mockMenu, disabledRules);
    expect(res.ruleMatchFound).toBe(true);
    expect(res.isSafeForAutoReply).toBe(false);
    expect(res.requiresHumanReview).toBe(true);
  });

  it('should enforce zero-hallucination policy when facts are unavailable', () => {
    const res = generateAIReply('Serveert u ook kaviaar en champagne?', 'dm', mockKb, mockMenu, mockRules);
    expect(res.ruleMatchFound).toBe(false);
    expect(res.replySource).toBe('ai_fallback');
    expect(res.isSafeForAutoReply).toBe(false);
    expect(res.requiresHumanReview).toBe(true);
    expect(res.suggestedReply).toContain('Een medewerker van ons team reageert zo snel mogelijk');
  });

  it('should restrict Dutch responses to maximum 2 short sentences', () => {
    const longText = "Onze openingsuren in Gent zijn vandaag van 8 tot 18. Kom gerust gezellig langs voor een verse wafel! We hebben ook heerlijke koffie en thee beschikbaar.";
    const sanitized = sanitizeResponseLength(longText);
    const sentenceCount = (sanitized.match(/[^.!?]+[.!?]+/g) || []).length;
    expect(sentenceCount).toBeLessThanOrEqual(2);
  });
});
