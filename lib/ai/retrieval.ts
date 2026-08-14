import { KnowledgeBase, MenuItem, FAQItem } from '../db/types';

export interface RetrievedContextData {
  restaurantName: string;
  kbSummary: Record<string, string>;
  relevantMenuItems: MenuItem[];
  matchedFaqs: FAQItem[];
  retrievalMetadata: {
    kbTopicsMatched: string[];
    menuItemsMatchedCount: number;
  };
}

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, '') // Remove Arabic diacritics
    .replace(/[أإآ]/g, 'ا') // Normalize alef
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lightweight, deterministic tenant data retrieval layer.
 * Selects only relevant Knowledge Base sections and Menu items for the prompt.
 */
export function retrieveRelevantTenantData(
  query: string,
  kb: KnowledgeBase,
  menu: MenuItem[]
): RetrievedContextData {
  const normQuery = normalizeText(query);
  const words = normQuery.split(' ');

  const kbSummary: Record<string, string> = {};
  const kbTopicsMatched: string[] = [];

  // Always include basic identity
  kbSummary['Restaurant Name'] = kb.cafe_name || 'Restaurant';

  // 1. Opening & Holiday Hours
  if (
    normQuery.includes('open') || normQuery.includes('close') || normQuery.includes('hour') ||
    normQuery.includes('uren') || normQuery.includes('gesloten') || normQuery.includes('ساع') ||
    normQuery.includes('اوقات') || normQuery.includes('عمل') || normQuery.includes('متى') ||
    normQuery.includes('مفتوح') || normQuery.includes('مغلق') || normQuery.includes('today') ||
    normQuery.includes('vandaag') || normQuery.includes('weekend')
  ) {
    if (kb.opening_hours) {
      kbSummary['Opening Hours'] = `Mon: ${kb.opening_hours.monday}, Tue: ${kb.opening_hours.tuesday}, Wed: ${kb.opening_hours.wednesday}, Thu: ${kb.opening_hours.thursday}, Fri: ${kb.opening_hours.friday}, Sat: ${kb.opening_hours.saturday}, Sun: ${kb.opening_hours.sunday}`;
      kbTopicsMatched.push('opening_hours');
    }
    if (kb.holiday_hours && Object.keys(kb.holiday_hours).length > 0) {
      kbSummary['Holiday Hours'] = JSON.stringify(kb.holiday_hours);
      kbTopicsMatched.push('holiday_hours');
    }
  }

  // 2. Address & Location
  if (
    normQuery.includes('address') || normQuery.includes('location') || normQuery.includes('where') ||
    normQuery.includes('adres') || normQuery.includes('waar') || normQuery.includes('route') ||
    normQuery.includes('عنوان') || normQuery.includes('اين') || normQuery.includes('موقع') ||
    normQuery.includes('خريطة') || normQuery.includes('maps')
  ) {
    if (kb.address) {
      kbSummary['Address'] = kb.address;
      kbTopicsMatched.push('address');
    }
    if (kb.google_maps_url) {
      kbSummary['Google Maps Link'] = kb.google_maps_url;
      kbTopicsMatched.push('google_maps_url');
    }
  }

  // 3. Reservations
  if (
    normQuery.includes('reserve') || normQuery.includes('book') || normQuery.includes('table') ||
    normQuery.includes('reserveren') || normQuery.includes('tafel') || normQuery.includes('حجز') ||
    normQuery.includes('طاولة') || normQuery.includes('احجز') || normQuery.includes('people') ||
    normQuery.includes('personen') || normQuery.includes('شخص')
  ) {
    if (kb.reservation_rules) {
      kbSummary['Reservation Rules'] = kb.reservation_rules;
      kbTopicsMatched.push('reservation_rules');
    }
  }

  // 4. Takeaway & Delivery
  if (
    normQuery.includes('takeaway') || normQuery.includes('delivery') || normQuery.includes('pickup') ||
    normQuery.includes('afhalen') || normQuery.includes('meenemen') || normQuery.includes('توصيل') ||
    normQuery.includes('سفري') || normQuery.includes('استلام')
  ) {
    if (kb.delivery_takeaway_info) {
      kbSummary['Delivery & Takeaway Info'] = kb.delivery_takeaway_info;
      kbTopicsMatched.push('delivery_takeaway_info');
    }
  }

  // 5. Payment Methods
  if (
    normQuery.includes('pay') || normQuery.includes('card') || normQuery.includes('cash') ||
    normQuery.includes('betalen') || normQuery.includes('bancontact') || normQuery.includes('دفع') ||
    normQuery.includes('بطاقة') || normQuery.includes('كاش') || normQuery.includes('فيزا')
  ) {
    if (kb.payment_methods && kb.payment_methods.length > 0) {
      kbSummary['Accepted Payment Methods'] = kb.payment_methods.join(', ');
      kbTopicsMatched.push('payment_methods');
    }
  }

  // 6. Wi-Fi & Facilities
  if (
    normQuery.includes('wifi') || normQuery.includes('internet') || normQuery.includes('facilities') ||
    normQuery.includes('واي فاي') || normQuery.includes('إنترنت')
  ) {
    if (kb.wifi_details) {
      kbSummary['Wi-Fi Details'] = kb.wifi_details;
      kbTopicsMatched.push('wifi_details');
    }
  }

  // 7. Contact
  if (
    normQuery.includes('contact') || normQuery.includes('phone') || normQuery.includes('email') ||
    normQuery.includes('bellen') || normQuery.includes('اتصال') || normQuery.includes('هاتف') ||
    normQuery.includes('تواصل') || normQuery.includes('بريد')
  ) {
    if (kb.contact_email) kbSummary['Contact Email'] = kb.contact_email;
    if (kb.contact_phone) kbSummary['Contact Phone'] = kb.contact_phone;
    kbTopicsMatched.push('contact');
  }

  // If no specific topic matched (e.g. general greeting or broad inquiry), include standard key facts
  if (kbTopicsMatched.length === 0) {
    if (kb.address) kbSummary['Address'] = kb.address;
    if (kb.opening_hours) {
      kbSummary['Opening Hours'] = `Mon: ${kb.opening_hours.monday}, Tue: ${kb.opening_hours.tuesday}, Wed: ${kb.opening_hours.wednesday}, Thu: ${kb.opening_hours.thursday}, Fri: ${kb.opening_hours.friday}, Sat: ${kb.opening_hours.saturday}, Sun: ${kb.opening_hours.sunday}`;
    }
    if (kb.reservation_rules) kbSummary['Reservation Rules'] = kb.reservation_rules;
  }

  // Matching FAQs
  const matchedFaqs: FAQItem[] = [];
  if (kb.faqs && Array.isArray(kb.faqs)) {
    for (const faq of kb.faqs) {
      const qNl = normalizeText(faq.question?.nl || '');
      const qEn = normalizeText(faq.question?.en || '');
      const qFr = normalizeText(faq.question?.fr || '');
      const qAr = normalizeText(faq.question?.ar || '');

      if (
        (qNl && (normQuery.includes(qNl) || qNl.split(' ').some(w => w.length > 3 && words.includes(w)))) ||
        (qEn && (normQuery.includes(qEn) || qEn.split(' ').some(w => w.length > 3 && words.includes(w)))) ||
        (qFr && (normQuery.includes(qFr) || qFr.split(' ').some(w => w.length > 3 && words.includes(w)))) ||
        (qAr && (normQuery.includes(qAr) || qAr.split(' ').some(w => w.length > 3 && words.includes(w))))
      ) {
        matchedFaqs.push(faq);
      }
    }
  }

  // Matching Menu items
  let relevantMenuItems: MenuItem[] = [];
  const activeMenu = (menu || []).filter(m => m.is_available !== false);

  if (activeMenu.length <= 10) {
    // If menu is compact (10 or fewer items), send full menu to ensure complete context
    relevantMenuItems = activeMenu;
  } else {
    // Filter matching items
    const dietaryQuery = normQuery.includes('vegan') || normQuery.includes('veggie') || normQuery.includes('vegetarisch') || normQuery.includes('نباتي');
    const priceQuery = normQuery.includes('price') || normQuery.includes('cost') || normQuery.includes('prijs') || normQuery.includes('kost') || normQuery.includes('سعر') || normQuery.includes('بكم') || normQuery.includes('كم');
    const menuQuery = normQuery.includes('menu') || normQuery.includes('food') || normQuery.includes('drink') || normQuery.includes('kaart') || normQuery.includes('قائمة') || normQuery.includes('طعام');

    relevantMenuItems = activeMenu.filter(item => {
      const itemNameNorm = normalizeText(item.name);
      const itemDescNorm = normalizeText(item.description || '');
      const itemCatNorm = normalizeText(item.category || '');

      // Direct name match or word overlap
      if (normQuery.includes(itemNameNorm) || itemNameNorm.split(' ').some(w => w.length > 2 && normQuery.includes(w))) {
        return true;
      }
      // Category match
      if (itemCatNorm && normQuery.includes(itemCatNorm)) {
        return true;
      }
      // Dietary filter match
      if (dietaryQuery && (item.is_vegan || item.is_vegetarian)) {
        return true;
      }
      return false;
    });

    // If query was broad menu/price query and no specific item matched, include top 8 items across categories
    if (relevantMenuItems.length === 0 && (menuQuery || priceQuery || dietaryQuery)) {
      relevantMenuItems = activeMenu.slice(0, 8);
    }
  }

  return {
    restaurantName: kb.cafe_name || 'Restaurant',
    kbSummary,
    relevantMenuItems,
    matchedFaqs,
    retrievalMetadata: {
      kbTopicsMatched,
      menuItemsMatchedCount: relevantMenuItems.length,
    },
  };
}
