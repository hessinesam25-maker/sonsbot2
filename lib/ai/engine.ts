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
  ruleMatchFound: boolean;
  matchedRuleType: string;
  replySource: 'predefined_rule' | 'positive_comment' | 'ai_fallback';
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
      ruleMatchFound: false,
      matchedRuleType: 'safety_classifier',
      replySource: 'ai_fallback',
      reason: classificationResult.reason || 'Flagged for human review by safety classifier',
    };
  }

  // Step 4: Handle Positive Feedback Comments
  if (channelType === 'comment' && classificationResult.classification === 'positive') {
    if (rules.auto_reply_positive_comments !== false) {
      const variedReply = generateVariedPublicReply('positive', detectedLanguage);
      return {
        detectedLanguage,
        classification: 'positive',
        confidenceScore: 1.0,
        isSafeForAutoReply: true,
        requiresHumanReview: false,
        suggestedReply: variedReply,
        ruleMatchFound: true,
        matchedRuleType: 'positive_comment',
        replySource: 'positive_comment',
        reason: 'Matched positive comment rule',
      };
    }
  }

  // Step 5: Query Deterministic Predefined Rules & Knowledge Base
  const kbResult = queryKnowledgeBase(input, kb, menu, detectedLanguage);

  if (kbResult.found && kbResult.factSummary) {
    const rawReply = sanitizeResponseLength(kbResult.factSummary);
    const isAutoSendEnabled = rules.auto_reply_factual_questions !== false;

    // Deterministic rule matches do NOT depend on AI confidence thresholds
    return {
      detectedLanguage,
      classification: 'question',
      confidenceScore: 1.0,
      isSafeForAutoReply: isAutoSendEnabled,
      requiresHumanReview: !isAutoSendEnabled,
      suggestedReply: rawReply,
      ruleMatchFound: true,
      matchedRuleType: kbResult.sourceCategory || 'predefined_rule',
      replySource: 'predefined_rule',
      reason: isAutoSendEnabled ? 'Matched deterministic predefined rule' : 'Rule matched but auto-reply disabled by tenant configuration',
    };
  }

  // Step 6: Unknown / Unmatched Query Fallback
  return {
    detectedLanguage,
    classification: 'question',
    confidenceScore: 0.40, // Below threshold fallback
    isSafeForAutoReply: false,
    requiresHumanReview: true,
    suggestedReply: getFallbackResponse(detectedLanguage),
    ruleMatchFound: false,
    matchedRuleType: 'none',
    replySource: 'ai_fallback',
    reason: 'Information unavailable in knowledge base. Transferred to human team.',
  };
}
