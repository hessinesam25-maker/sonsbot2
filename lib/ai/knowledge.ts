import { KnowledgeBase, MenuItem, CustomerLanguage } from '../db/types';

export interface KBQueryResult {
  found: boolean;
  factSummary?: string;
  sourceCategory?: string;
}

/**
 * Searches the Knowledge Base and Menu for factual answers to customer queries.
 * Strictly returns only facts present in the database to prevent hallucinations.
 */
export function queryKnowledgeBase(
  query: string,
  kb: KnowledgeBase,
  menu: MenuItem[],
  language: CustomerLanguage
): KBQueryResult {
  const lower = query.toLowerCase();

  // 1. Address & Directions
  if (lower.includes('adres') || lower.includes('waar') || lower.includes('location') || lower.includes('address') || lower.includes('gent') || lower.includes('route')) {
    if (language === 'nl') {
      return {
        found: true,
        factSummary: `Wij zijn gevestigd op ${kb.address} in Gent. Bekijk de route via Google Maps: ${kb.google_maps_url}`,
        sourceCategory: 'location',
      };
    } else if (language === 'fr') {
      return {
        found: true,
        factSummary: `Nous sommes situés au ${kb.address} à Gand. Voir sur Google Maps: ${kb.google_maps_url}`,
        sourceCategory: 'location',
      };
    } else if (language === 'ar') {
      return {
        found: true,
        factSummary: `عنواننا هو ${kb.address} في غنت. خرائط جوجل: ${kb.google_maps_url}`,
        sourceCategory: 'location',
      };
    } else {
      return {
        found: true,
        factSummary: `We are located at ${kb.address} in Ghent. Find us on Google Maps: ${kb.google_maps_url}`,
        sourceCategory: 'location',
      };
    }
  }

  // 2. Opening Hours & Holiday Hours
  if (lower.includes('open') || lower.includes('openingsuren') || lower.includes('uren') || lower.includes('gesloten') || lower.includes('hours') || lower.includes('horaires')) {
    const hoursText = `Ma: ${kb.opening_hours.monday}, Di: ${kb.opening_hours.tuesday}, Wo: ${kb.opening_hours.wednesday}, Do: ${kb.opening_hours.thursday}, Vr: ${kb.opening_hours.friday}, Za: ${kb.opening_hours.saturday}, Zo: ${kb.opening_hours.sunday}`;
    if (language === 'nl') {
      return {
        found: true,
        factSummary: `Onze openingsuren in Gent: ${hoursText}.`,
        sourceCategory: 'hours',
      };
    } else {
      return {
        found: true,
        factSummary: `Our opening hours in Ghent: Mon-Fri 08:00-18:00, Sat-Sun 09:00-18:00.`,
        sourceCategory: 'hours',
      };
    }
  }

  // 3. Vegetarian & Vegan Options
  if (lower.includes('veggie') || lower.includes('vegetarisch') || lower.includes('vegan') || lower.includes('plantaardig')) {
    const vegItems = menu.filter(m => m.is_vegetarian || m.is_vegan).map(m => m.name);
    const veganItems = menu.filter(m => m.is_vegan).map(m => m.name);

    if (vegItems.length > 0) {
      if (language === 'nl') {
        return {
          found: true,
          factSummary: `We hebben heerlijke vegetarische en vegan opties zoals ${vegItems.join(', ')}. Havermelk is ook beschikbaar!`,
          sourceCategory: 'dietary',
        };
      } else {
        return {
          found: true,
          factSummary: `We offer delicious vegetarian & vegan options including ${vegItems.join(', ')}. Oat milk is available!`,
          sourceCategory: 'dietary',
        };
      }
    }
  }

  // 4. Menu Items & Prices
  for (const item of menu) {
    if (lower.includes(item.name.toLowerCase())) {
      if (language === 'nl') {
        return {
          found: true,
          factSummary: `${item.name} kost €${item.price.toFixed(2)}. ${item.description}`,
          sourceCategory: 'menu',
        };
      } else {
        return {
          found: true,
          factSummary: `${item.name} is €${item.price.toFixed(2)}. ${item.description}`,
          sourceCategory: 'menu',
        };
      }
    }
  }

  // 5. Wifi & Payment Methods
  if (lower.includes('wifi') || lower.includes('internet')) {
    return {
      found: true,
      factSummary: kb.wifi_details,
      sourceCategory: 'facilities',
    };
  }

  if (lower.includes('betalen') || lower.includes('bancontact') || lower.includes('cash') || lower.includes('payment') || lower.includes('kaarten')) {
    return {
      found: true,
      factSummary: `Je kan bij ons betalen met ${kb.payment_methods.join(', ')}.`,
      sourceCategory: 'facilities',
    };
  }

  // 6. Basic Reservations & Takeaway
  if (lower.includes('reserveren') || lower.includes('tafel') || lower.includes('book') || lower.includes('reservation')) {
    return {
      found: true,
      factSummary: kb.reservation_rules,
      sourceCategory: 'reservations',
    };
  }

  if (lower.includes('takeaway') || lower.includes('afhalen') || lower.includes('meenemen') || lower.includes('afhaaldienst')) {
    return {
      found: true,
      factSummary: kb.delivery_takeaway_info,
      sourceCategory: 'takeaway',
    };
  }

  // 7. Check FAQs
  for (const faq of kb.faqs) {
    const qText = faq.question[language] || faq.question['nl'];
    if (lower.includes(qText.toLowerCase()) || qText.toLowerCase().split(' ').some(w => w.length > 4 && lower.includes(w))) {
      return {
        found: true,
        factSummary: faq.answer[language] || faq.answer['nl'],
        sourceCategory: 'faq',
      };
    }
  }

  // Unknown/Unavailable factual query -> Trigger zero-hallucination fallback
  return {
    found: false,
  };
}
