import { CommentClassification } from '../db/types';

export interface ClassificationResult {
  isSafeForAutoReply: boolean;
  requiresHumanReview: boolean;
  reason?: string;
  classification: CommentClassification;
  confidenceScore: number;
}

/**
 * Classifies customer input to detect sensitive categories, human requests, or safe factual topics.
 */
export function classifyInput(input: string): ClassificationResult {
  const lower = input.toLowerCase();

  // 1. Explicit human request
  if (
    lower.includes('medewerker') ||
    lower.includes('mensen') ||
    lower.includes('mens') ||
    lower.includes('human') ||
    lower.includes('real person') ||
    lower.includes('manager') ||
    lower.includes('bellen') ||
    lower.includes('persoon') ||
    lower.includes('parler à un humain')
  ) {
    return {
      isSafeForAutoReply: false,
      requiresHumanReview: true,
      reason: 'Customer explicitly requested a human employee',
      classification: 'needs_review',
      confidenceScore: 0.95,
    };
  }

  // 2. Complaints, Refunds & Compensation
  if (
    lower.includes('klacht') ||
    lower.includes('slecht') ||
    lower.includes('terugbetaling') ||
    lower.includes('vergoeding') ||
    lower.includes('vies') ||
    lower.includes('onbeleefd') ||
    lower.includes('vreselijk') ||
    lower.includes('complaint') ||
    lower.includes('refund') ||
    lower.includes('compensation') ||
    lower.includes('awful') ||
    lower.includes('horrible') ||
    lower.includes('bad service') ||
    lower.includes('remboursement') ||
    lower.includes('plainte')
  ) {
    return {
      isSafeForAutoReply: false,
      requiresHumanReview: true,
      reason: 'Complaint, refund, or negative experience reported',
      classification: 'complaint',
      confidenceScore: 0.92,
    };
  }

  // 3. Food Allergies & Medical Questions (Crucial safety rule: café approved allergy decision must be human checked)
  if (
    lower.includes('allerg') ||
    lower.includes('gluten') ||
    lower.includes('lactose') ||
    lower.includes('noten') ||
    lower.includes('pinda') ||
    lower.includes('notenallergie') ||
    lower.includes('epilepsie') ||
    lower.includes('ziek') ||
    lower.includes('epipen') ||
    lower.includes('celiac') ||
    lower.includes('coeliakie') ||
    lower.includes('medical')
  ) {
    return {
      isSafeForAutoReply: false,
      requiresHumanReview: true,
      reason: 'Food allergy decision or medical query requires human verification',
      classification: 'needs_review',
      confidenceScore: 0.98,
    };
  }

  // 4. Large Group Reservations (> 8 people)
  if (
    lower.includes('grote groep') ||
    lower.includes('feest') ||
    lower.includes('trouw') ||
    lower.includes('groep van') ||
    lower.includes('evenement') ||
    lower.includes('large group') ||
    lower.includes('party') ||
    lower.includes('event') ||
    lower.includes('grand groupe')
  ) {
    return {
      isSafeForAutoReply: false,
      requiresHumanReview: true,
      reason: 'Large group reservation or event request requires human management',
      classification: 'needs_review',
      confidenceScore: 0.90,
    };
  }

  // 5. Legal Threats & Harassment
  if (
    lower.includes('advocaat') ||
    lower.includes('rechter') ||
    lower.includes('politie') ||
    lower.includes('sue') ||
    lower.includes('lawyer') ||
    lower.includes('police') ||
    lower.includes('legal action') ||
    lower.includes('avocat') ||
    lower.includes('schelden') ||
    lower.includes('fuck') ||
    lower.includes('bitch')
  ) {
    return {
      isSafeForAutoReply: false,
      requiresHumanReview: true,
      reason: 'Legal threat or severe language detected',
      classification: 'abuse',
      confidenceScore: 0.99,
    };
  }

  // 6. Press & Influencer Collaboration Requests
  if (
    lower.includes('samenwerking') ||
    lower.includes('influencer') ||
    lower.includes('collab') ||
    lower.includes('pers') ||
    lower.includes('press') ||
    lower.includes('promoten') ||
    lower.includes('sponsoring') ||
    lower.includes('partnership')
  ) {
    return {
      isSafeForAutoReply: false,
      requiresHumanReview: true,
      reason: 'Press or influencer collaboration inquiry',
      classification: 'collaboration',
      confidenceScore: 0.88,
    };
  }

  // 7. Spam or Abuse
  if (
    lower.includes('crypto') ||
    lower.includes('forex') ||
    lower.includes('whatsapp +') ||
    lower.includes('bitcoins') ||
    lower.includes('free followers') ||
    lower.includes('dm to promote')
  ) {
    return {
      isSafeForAutoReply: false,
      requiresHumanReview: false,
      reason: 'Spam detected',
      classification: 'spam',
      confidenceScore: 0.95,
    };
  }

  // 8. Positive Feedback
  if (
    lower.includes('leuk') ||
    lower.includes('super') ||
    lower.includes('heerlijk') ||
    lower.includes('top') ||
    lower.includes('geweldig') ||
    lower.includes('beste koffie') ||
    lower.includes('love') ||
    lower.includes('amazing') ||
    lower.includes('delicious') ||
    lower.includes('delicieux') ||
    lower.includes('❤️') ||
    lower.includes('🔥') ||
    lower.includes('👏')
  ) {
    return {
      isSafeForAutoReply: true,
      requiresHumanReview: false,
      classification: 'positive',
      confidenceScore: 0.90,
    };
  }

  // 9. Safe Factual Questions (Hours, Location, Menu, Veg/Vegan, Wifi, Payment)
  const factualKeywords = [
    'open', 'openingsuren', 'adres', 'gent', 'waar', 'parkeren', 'kaart', 'menu',
    'prijs', 'prijzen', 'gehakttaart', 'koffie', 'matcha', 'croissant', 'havermelk',
    'veggie', 'vegetarisch', 'vegan', 'wifi', 'bancontact', 'cash', 'betalen',
    'reserveren', 'takeaway', 'meenemen', 'afhalen', 'hours', 'address', 'payment'
  ];

  if (factualKeywords.some(kw => lower.includes(kw))) {
    return {
      isSafeForAutoReply: true,
      requiresHumanReview: false,
      classification: 'question',
      confidenceScore: 0.88,
    };
  }

  // Default Neutral fallback
  return {
    isSafeForAutoReply: true,
    requiresHumanReview: false,
    classification: 'neutral',
    confidenceScore: 0.80,
  };
}
