import { CustomerLanguage } from '../db/types';

/**
 * Fast, reliable language detection for English, French, Arabic, and Dutch (Belgian flavor).
 * Defaults to 'nl' (Belgian Dutch) as per requirements.
 */
export function detectLanguage(text: string): CustomerLanguage {
  if (!text || typeof text !== 'string') return 'nl';

  const cleaned = text.trim();

  // Arabic detection (Unicode range 0600-06FF)
  if (/[\u0600-\u06FF]/.test(cleaned)) {
    return 'ar';
  }

  const lower = cleaned.toLowerCase();

  // Dutch key indicators (Primary locale for Ghent, Belgium)
  const dutchKeywords = [
    'hallo', 'ey', 'goeiedag', 'dank u', 'dankjewel', 'alstublieft', 'aub', 'openingsuren',
    'adres', 'kaart', 'prijs', 'prijzen', 'vegetarisch', 'reserveren', 'gent', 'wat zijn',
    'waar', 'hoelaat', 'groetjes', 'tot ziens', 'met', 'ons', 'ons team', 'wafel', 'koffie'
  ];
  if (dutchKeywords.some(kw => lower.includes(kw))) {
    return 'nl';
  }

  // French key indicators
  const frenchKeywords = [
    'bonjour', 'salut', 'merci', 'svp', 's\'il vous plaît', 'est-ce', 'avez-vous',
    'ouvert', 'horaires', 'menu', 'adresse', 'carte', 'réservation', 'combien', 'où', 'du'
  ];
  if (frenchKeywords.some(kw => lower.includes(kw))) {
    return 'fr';
  }

  // English key indicators
  const englishKeywords = [
    'hello', 'hi', 'hey', 'thanks', 'thank you', 'please', 'what time',
    'hours', 'address', 'location', 'menu', 'price', 'vegetarian', 'vegan', 'reservation', 'do you'
  ];
  if (englishKeywords.some(kw => lower.includes(kw))) {
    return 'en';
  }

  // Default fallback for Ghent café is Dutch
  return 'nl';
}
