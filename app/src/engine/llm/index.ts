/**
 * LLM Pipeline Module — Public API
 *
 * Provides tools for LLM-based card rule generation:
 * - Prompt builder for generating structured prompts
 * - Batch processor for bulk card processing
 * - Card filtering for finding cards needing rules
 */

export {
  buildSystemPrompt,
  buildFewShotExamples,
  buildCardPrompt,
  buildPromptMessages,
  buildBatchPrompt,
} from "./prompt-builder";
export type { CardInput } from "./prompt-builder";

export {
  BatchProcessor,
  findCardsNeedingRules,
} from "./batch-processor";
export type {
  LLMProvider,
  BatchProcessorOptions,
  BatchProgress,
  BatchResult,
} from "./batch-processor";
