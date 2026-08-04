import { detectLanguage } from './language';
import { classifyInput, ClassificationResult } from './classifier';
import { queryKnowledgeBase } from './knowledge';
import { generateVariedPublicReply, getFallbackResponse, sanitizeResponseLength } from './guardrails';
import { KnowledgeBase, MenuItem, AutomationRules, CustomerLanguage, CommentClassification } from '../db/types';

export interface AIEngineResponse {
  detectedLanguage: CustomerLanguage;
  classification: CommentClassification;
  confidenceScore: number;
  isSafeForAutoReply: boolean;
  requiresHumanReview: boolean;
  suggestedReply: string;
  reason?: string;
}

export function generateAIReply(
  input: string,
  channelType: 'dm' | 'comment',
  kb: KnowledgeBase,
  menu: MenuItem[],
  rules: AutomationRules
): AIEngineResponse {
  // Step 1: Detect customer language
  const detectedLanguage = detectLanguage(input);

  // Step 2: Intent & Safety Classification
  const classificationResult: ClassificationResult = classifyInput(input);

  // Step 3: Handle Unsafe / Sensitive Topics immediately (Human Handoff)
  if (classificationResult.requiresHumanReview || !classificationResult.isSafeForAutoReply) {
    return {
      detectedLanguage,
      classification: classificationResult.classification,
      confidenceScore: classificationResult.confidenceScore,
      isSafeForAutoReply: false,
      requiresHumanReview: true,
      suggestedReply: getFallbackResponse(detectedLanguage),
      reason: classificationResult.reason || 'Flagged for human review by safety classifier',
    };
  }

  // Step 4: Handle Positive Feedback Comments
  if (channelType === 'comment' && classificationResult.classification === 'positive') {
    if (rules.auto_reply_positive_comments) {
      const variedReply = generateVariedPublicReply('positive', detectedLanguage);
      return {
        detectedLanguage,
        classification: 'positive',
        confidenceScore: 0.95,
        isSafeForAutoReply: true,
        requiresHumanReview: false,
        suggestedReply: variedReply,
      };
    }
  }

  // Step 5: Query Factual Knowledge Base (Zero-hallucination constraint)
  const kbResult = queryKnowledgeBase(input, kb, menu, detectedLanguage);

  if (kbResult.found && kbResult.factSummary) {
    const rawReply = sanitizeResponseLength(kbResult.factSummary);
    const confidenceScore = 0.92;

    // Check against configured minimum confidence threshold
    const meetsThreshold = confidenceScore >= rules.min_confidence_score;

    return {
      detectedLanguage,
      classification: 'question',
      confidenceScore,
      isSafeForAutoReply: meetsThreshold && rules.auto_reply_factual_questions,
      requiresHumanReview: !meetsThreshold,
      suggestedReply: rawReply,
    };
  }

  // Step 6: Unknown Factual Query -> Zero Hallucination Fallback
  return {
    detectedLanguage,
    classification: 'question',
    confidenceScore: 0.40, // Below threshold
    isSafeForAutoReply: false,
    requiresHumanReview: true,
    suggestedReply: getFallbackResponse(detectedLanguage),
    reason: 'Information unavailable in knowledge base. Transferred to human team.',
  };
}
