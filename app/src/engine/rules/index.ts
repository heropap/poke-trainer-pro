/**
 * Rule Engine Module — Public API (V2)
 *
 * V2 declarative rule system for PTCG cards.
 * Converts semantic JSON rules into executable CardEffectDefs.
 *
 * V1 modules (rule-executor, rule-validator, event-hooks, rule-loader,
 * modifier-pipeline, rule-compiler) are deprecated and excluded from compilation.
 */

// ─── V2 Type Definitions ───
export type {
  EnergyType,
  StatusCondition,
  ZoneType,
  OwnerType,
  TargetKind,
  TargetSelector,
  Condition,
  Cost,
  TriggerType,
  ActionType,
  ActionStep,
  Modifier,
} from "./rule-schema";

export type {
  CardRuleDef,
} from "./card-rule-def";

// ─── V2 Zod Validation ───
export {
  CardRuleDefSchema,
  ActionStepSchema,
  ConditionSchema,
  validateCardRuleDef,
} from "./rule-schema-zod";
export type { ValidationResult } from "./rule-schema-zod";

// ─── V2 Rule Compiler ───
export { compileAllV2 } from "./rule-compiler-v2";
