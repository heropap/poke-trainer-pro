/**
 * LLM Pipeline — Module Exports
 *
 * 三层卡牌效果解析流水线：
 *   Layer 1: LLM 语义解析 (card text → ParsedEffect JSON)
 *   Layer 2: 模式匹配+动作生成 (ParsedEffect → ActionPacket[])
 *   Layer 3: 自动化验证 (ActionPacket → pass/fail)
 */

export { PatternId, TriggerType, ConditionType, PATTERN_CATALOG } from './effect-pattern-catalog';
export type { PatternSlot, EffectPattern, ParsedEffect } from './effect-pattern-catalog';

export { buildParseRequest, validateParseResult, SEMANTIC_PARSER_SYSTEM_PROMPT, FEW_SHOT_EXAMPLES } from './semantic-parser';
export type { ParseResult } from './semantic-parser';

export { processCard, runFullPipeline, debugSingleCard } from './pipeline';
export type { PipelineResult } from './pipeline';

export { CARD_TEST_SUITE, assertParseResult, runTestSuite } from './card-test-suite';
export type { CardTestCase } from './card-test-suite';
