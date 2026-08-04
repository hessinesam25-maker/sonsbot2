import { CustomerLanguage, CommentClassification } from '../db/types';

/**
 * Ensures public replies are dynamic and non-repetitive by applying variation templates.
 */
export function generateVariedPublicReply(
  classification: CommentClassification,
  language: CustomerLanguage,
  baseContent?: string
): string {
  const seed = Math.floor(Math.random() * 4);

  if (classification === 'positive') {
    if (language === 'nl') {
      const options = [
        "Bedankt voor het lieve bericht! tot snel bij ons in Gent! ☕️",
        "Wat fijn om te horen! Blij dat je ervan genoten hebt! ✨",
        "Dank je wel! We kijken ernaar uit je snel weer te verwelkomen in Gent! 🙌",
        "Merci voor de complimentjes! Tot heel binnenkort! 😊"
      ];
      return options[seed % options.length];
    } else if (language === 'fr') {
      const options = [
        "Merci beaucoup pour ce gentil message! À très bientôt à Gand! ☕️",
        "Un grand merci! Ravi que vous ayez apprécié! ✨",
        "Merci infiniment! Au plaisir de vous revoir très vite! 😊"
      ];
      return options[seed % options.length];
    } else if (language === 'ar') {
      const options = [
        "شكراً جزيلاً لك! نتحرق شوقاً لرؤيتك مجدداً في غنت! ☕️",
        "شكراً على كلماتك الطيبة! نتمنى لك يوماً سعيداً! ✨"
      ];
      return options[seed % options.length];
    } else {
      const options = [
        "Thank you so much for the kind words! See you soon in Ghent! ☕️",
        "So glad you enjoyed it! Hope to see you back soon! ✨",
        "Thanks a lot! Wishing you a wonderful day! 😊"
      ];
      return options[seed % options.length];
    }
  }

  if (baseContent) {
    return baseContent;
  }

  return getFallbackResponse(language);
}

/**
 * Standard polite zero-hallucination handoff message when information is missing or human review is required.
 */
export function getFallbackResponse(language: CustomerLanguage): string {
  switch (language) {
    case 'fr':
      return "Merci pour votre message! Un membre de notre équipe va vous répondre très rapidement.";
    case 'ar':
      return "شكراً لتواصلك معنا! سيقوم أحد أعضاء فريقنا بالرد عليك في أقرب وقت ممكن.";
    case 'en':
      return "Thanks for getting in touch! A member of our team will get back to you shortly.";
    case 'nl':
    default:
      return "Bedankt voor je bericht! Een medewerker van ons team reageert zo snel mogelijk.";
  }
}

/**
 * Enforces strict length (max 2 short sentences) and tone requirements.
 */
export function sanitizeResponseLength(response: string): string {
  if (!response) return '';

  // Split sentences by period, exclamation, or question mark
  const sentences = response.match(/[^.!?]+[.!?]+/g) || [response];
  if (sentences.length > 2) {
    return sentences.slice(0, 2).join(' ').trim();
  }
  return response.trim();
}
