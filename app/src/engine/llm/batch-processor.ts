/**
 * LLM Batch Processor — Bulk card rule generation
 *
 * Orchestrates the pipeline:
 *   Card DB → Prompt Builder → LLM API → Zod Validation → Rule Storage
 *
 * Features:
 * - Batch processing with configurable chunk size
 * - Retry on validation failure (up to 2 retries)
 * - Progress reporting
 * - Result caching to avoid re-processing
 * - Human review queue for low-confidence results
 */

import { CardInput, buildPromptMessages, buildBatchPrompt } from "./prompt-builder";
import { CardRuleDef } from "../rules/card-rule-def";
import { validateRule, CardData } from "../rules/rule-validator";
import { validateCardRuleDef } from "../rules/rule-schema-zod";

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface LLMProvider {
  /**
   * Send a chat completion request to the LLM.
   * Returns the raw text response.
   */
  complete(messages: Array<{ role: string; content: string }>): Promise<string>;
}

export interface BatchProcessorOptions {
  /** LLM provider to use */
  provider: LLMProvider;
  /** Number of cards per batch request (default: 5) */
  batchSize?: number;
  /** Maximum retries for failed validations (default: 2) */
  maxRetries?: number;
  /** Card database for cross-validation */
  cardDatabase?: Map<string, CardData>;
  /** Confidence threshold for auto-accept (default: 0.8) */
  confidenceThreshold?: number;
  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void;
  /** Whether to use single-card prompts vs batch prompts (default: false = batch) */
  singleMode?: boolean;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  currentCard?: string;
  phase: "processing" | "validating" | "done";
}

export interface BatchResult {
  /** Successfully generated and validated rules */
  successful: CardRuleDef[];
  /** Cards that failed validation after all retries */
  failed: Array<{
    card: CardInput;
    errors: string[];
    rawResponse?: string;
  }>;
  /** Cards that need human review (low confidence) */
  needsReview: Array<{
    rule: CardRuleDef;
    warnings: string[];
    confidence: number;
  }>;
  /** Processing statistics */
  stats: {
    totalCards: number;
    successCount: number;
    failCount: number;
    reviewCount: number;
    totalRetries: number;
    avgConfidence: number;
    processingTimeMs: number;
  };
}

// ═══════════════════════════════════════════════════════
// Batch Processor
// ═══════════════════════════════════════════════════════

export class BatchProcessor {
  private provider: LLMProvider;
  private batchSize: number;
  private maxRetries: number;
  private cardDatabase?: Map<string, CardData>;
  private confidenceThreshold: number;
  private onProgress?: (progress: BatchProgress) => void;
  private singleMode: boolean;

  constructor(options: BatchProcessorOptions) {
    this.provider = options.provider;
    this.batchSize = options.batchSize ?? 5;
    this.maxRetries = options.maxRetries ?? 2;
    this.cardDatabase = options.cardDatabase;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.8;
    this.onProgress = options.onProgress;
    this.singleMode = options.singleMode ?? false;
  }

  /**
   * Process a batch of cards through the LLM pipeline.
   */
  async process(cards: CardInput[]): Promise<BatchResult> {
    const startTime = Date.now();
    const result: BatchResult = {
      successful: [],
      failed: [],
      needsReview: [],
      stats: {
        totalCards: cards.length,
        successCount: 0,
        failCount: 0,
        reviewCount: 0,
        totalRetries: 0,
        avgConfidence: 0,
        processingTimeMs: 0,
      },
    };

    // Process in chunks
    const chunks = this.chunkArray(cards, this.batchSize);
    let completedCount = 0;

    for (const chunk of chunks) {
      this.reportProgress({
        total: cards.length,
        completed: completedCount,
        failed: result.failed.length,
        pending: cards.length - completedCount - result.failed.length,
        phase: "processing",
      });

      if (this.singleMode) {
        // Process each card individually
        for (const card of chunk) {
          await this.processSingleCard(card, result);
          completedCount++;
        }
      } else {
        // Process chunk as batch
        await this.processBatch(chunk, result);
        completedCount += chunk.length;
      }
    }

    // Calculate stats
    const totalConfidence = result.successful.reduce(
      (sum, r) => sum + (r.meta?.confidence ?? 1),
      0,
    );
    result.stats = {
      totalCards: cards.length,
      successCount: result.successful.length,
      failCount: result.failed.length,
      reviewCount: result.needsReview.length,
      totalRetries: result.stats.totalRetries,
      avgConfidence: result.successful.length > 0
        ? totalConfidence / result.successful.length
        : 0,
      processingTimeMs: Date.now() - startTime,
    };

    this.reportProgress({
      total: cards.length,
      completed: completedCount,
      failed: result.failed.length,
      pending: 0,
      phase: "done",
    });

    return result;
  }

  /**
   * Process a single card through the LLM pipeline.
   */
  private async processSingleCard(
    card: CardInput,
    result: BatchResult,
  ): Promise<void> {
    this.reportProgress({
      total: result.stats.totalCards,
      completed: result.successful.length,
      failed: result.failed.length,
      pending: result.stats.totalCards - result.successful.length - result.failed.length,
      currentCard: card.name,
      phase: "processing",
    });

    let lastError = "";
    let lastRawResponse = "";

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const messages = buildPromptMessages(card);
        const rawResponse = await this.provider.complete(messages);
        lastRawResponse = rawResponse;

        const parsed = this.parseResponse(rawResponse);
        if (!parsed) {
          lastError = "Failed to parse LLM response as JSON";
          result.stats.totalRetries++;
          continue;
        }

        // Validate
        const cardData = this.cardDatabase?.get(card.id);
        const validation = validateRule(parsed, cardData);

        if (!validation.valid) {
          lastError = [...validation.structuralErrors, ...validation.semanticErrors].join("; ");
          result.stats.totalRetries++;
          continue;
        }

        const rule = validation.data!;

        // Check confidence
        const confidence = rule.meta?.confidence ?? 0.9;
        if (confidence < this.confidenceThreshold || validation.warnings.length > 2) {
          result.needsReview.push({
            rule,
            warnings: validation.warnings,
            confidence,
          });
          return;
        }

        result.successful.push(rule);
        return;
      } catch (err) {
        lastError = (err as Error).message;
        result.stats.totalRetries++;
      }
    }

    // All retries exhausted
    result.failed.push({
      card,
      errors: [lastError],
      rawResponse: lastRawResponse,
    });
  }

  /**
   * Process a batch of cards in one LLM call.
   */
  private async processBatch(
    cards: CardInput[],
    result: BatchResult,
  ): Promise<void> {
    try {
      const messages = buildBatchPrompt(cards);
      const rawResponse = await this.provider.complete(messages);

      // Try to parse as array
      let parsedArray: unknown[];
      try {
        const parsed = JSON.parse(rawResponse.trim());
        parsedArray = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // If batch parsing fails, fall back to single-card processing
        console.warn("[BatchProcessor] Batch parse failed, falling back to single-card mode");
        for (const card of cards) {
          await this.processSingleCard(card, result);
        }
        return;
      }

      // Validate each result
      for (let i = 0; i < parsedArray.length; i++) {
        const card = cards[i];
        const parsed = parsedArray[i];

        const cardData = this.cardDatabase?.get(card?.id);
        const validation = validateRule(parsed, cardData);

        if (!validation.valid) {
          // Retry as single card
          if (card) {
            await this.processSingleCard(card, result);
          }
          continue;
        }

        const rule = validation.data!;
        const confidence = rule.meta?.confidence ?? 0.9;

        if (confidence < this.confidenceThreshold) {
          result.needsReview.push({
            rule,
            warnings: validation.warnings,
            confidence,
          });
        } else {
          result.successful.push(rule);
        }
      }

      // Handle any cards not covered by the response
      if (parsedArray.length < cards.length) {
        for (let i = parsedArray.length; i < cards.length; i++) {
          await this.processSingleCard(cards[i], result);
        }
      }
    } catch (err) {
      // Batch call failed entirely — fall back to single mode
      console.warn("[BatchProcessor] Batch call failed:", (err as Error).message);
      for (const card of cards) {
        await this.processSingleCard(card, result);
      }
    }
  }

  // ─── Helpers ───

  private parseResponse(raw: string): unknown | null {
    try {
      // Strip markdown code blocks if present
      let cleaned = raw.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private reportProgress(progress: BatchProgress): void {
    this.onProgress?.(progress);
  }
}

// ═══════════════════════════════════════════════════════
// Convenience: Filter cards that need rules
// ═══════════════════════════════════════════════════════

/**
 * Filter cards from the database that have effect text but no existing rule.
 * These are candidates for LLM rule generation.
 */
export function findCardsNeedingRules(
  allCards: CardInput[],
  existingRuleIds: Set<string>,
): CardInput[] {
  return allCards.filter(card => {
    // Skip cards with existing rules
    if (existingRuleIds.has(card.id)) return false;

    // Include cards with attack text effects
    const hasAttackText = card.attacks?.some(a => a.text && a.text.length > 0);
    // Include cards with abilities
    const hasAbility = card.abilities && card.abilities.length > 0;
    // Include trainer cards with rules text
    const hasTrainerRules = card.supertype === "Trainer" && card.rules && card.rules.length > 0;

    return hasAttackText || hasAbility || hasTrainerRules;
  });
}
