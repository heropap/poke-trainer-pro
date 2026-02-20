/**
 * Rule Engine Module — Public API
 *
 * CTA (Condition-Target-Action) rule system for PTCG cards.
 * Converts declarative JSON rules into executable CardEffectDefs.
 */

// ─── Type Definitions ───
export type {
  EnergyType,
  StatusCondition,
  PlayerRef,
  TargetSelector,
  CardFilter,
  DynamicValue,
  CountableRef,
  Condition,
  MarkerLifecycle,
  ActionStep,
  TriggerEvent,
  Modifier,
  ModifierType,
} from "./rule-schema";

export type {
  CardRuleDef,
  AttackRuleDef,
  AbilityRuleDef,
  AbilityRuleType,
  TrainerRuleDef,
  ModifierDef,
  MarkerDeclaration,
} from "./card-rule-def";

// ─── Zod Validation ───
export {
  CardRuleDefSchema,
  AttackRuleDefSchema,
  AbilityRuleDefSchema,
  TrainerRuleDefSchema,
  ActionStepSchema,
  ConditionSchema,
  ModifierTypeSchema,
  validateCardRuleDef,
} from "./rule-schema-zod";
export type { ValidationResult } from "./rule-schema-zod";

// ─── Rule Compiler (Phase 1e) ───
export { compileRule } from "./rule-compiler";

// ─── Rule Executor (Phase 1b) ───
export { executeSteps } from "./rule-executor";

// ─── Modifier Pipeline (Phase 1c) ───
export { ModifierPipeline } from "./modifier-pipeline";

// ─── Event Hooks (Phase 1d) ───
export { EventHookRegistry } from "./event-hooks";

// ─── Rule Validator (Phase 1f) ───
export { validateRule } from "./rule-validator";

// ─── Rule Loader (Phase 1g) ───
export { loadRuleEffects } from "./rule-loader";
