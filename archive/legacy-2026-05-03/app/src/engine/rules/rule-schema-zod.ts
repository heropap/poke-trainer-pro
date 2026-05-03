/**
 * Zod Validation Schemas for CTA Rule System
 *
 * Validates LLM-generated CardRuleDef JSON before compilation.
 * Two levels of validation:
 * 1. Structural: schema shape, types, required fields (this file)
 * 2. Semantic: cross-field consistency, reference validity (rule-validator.ts)
 *
 * Usage:
 *   const result = CardRuleDefSchema.safeParse(llmOutput);
 *   if (!result.success) console.error(result.error.format());
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════
// Foundation Types
// ═══════════════════════════════════════════════════════

export const EnergyTypeSchema = z.enum([
  "Fire", "Water", "Grass", "Lightning",
  "Psychic", "Fighting", "Metal", "Darkness",
  "Fairy", "Dragon", "Colorless",
]);

export const StatusConditionSchema = z.enum([
  "poisoned", "burned", "asleep", "confused", "paralyzed",
]);

export const PlayerRefSchema = z.enum(["player", "opponent", "both"]);

// ═══════════════════════════════════════════════════════
// Card Filter
// ═══════════════════════════════════════════════════════

export const CardFilterSchema: z.ZodType = z.object({
  supertype: z.enum(["Pokémon", "Trainer", "Energy"]).optional(),
  subtypes: z.array(z.string()).optional(),
  types: z.array(EnergyTypeSchema).optional(),
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isBasicEnergy: z.boolean().optional(),
  evolvesFrom: z.string().optional(),
}).strict();

// ═══════════════════════════════════════════════════════
// Target Selectors
// ═══════════════════════════════════════════════════════

export const TargetSelectorSchema: z.ZodType = z.discriminatedUnion("zone", [
  z.object({ zone: z.literal("self_active") }).strict(),
  z.object({ zone: z.literal("opp_active") }).strict(),
  z.object({ zone: z.literal("own_bench"), choose: z.number().int().positive().optional() }).strict(),
  z.object({ zone: z.literal("opp_bench"), choose: z.number().int().positive().optional() }).strict(),
  z.object({ zone: z.literal("all_own") }).strict(),
  z.object({ zone: z.literal("all_opp") }).strict(),
  z.object({ zone: z.literal("all_own_bench") }).strict(),
  z.object({ zone: z.literal("all_opp_bench") }).strict(),
  z.object({ zone: z.literal("all_in_play") }).strict(),
  z.object({ zone: z.literal("own_deck"), filter: CardFilterSchema.optional(), count: z.number().int().positive().optional() }).strict(),
  z.object({ zone: z.literal("opp_deck"), filter: CardFilterSchema.optional(), count: z.number().int().positive().optional() }).strict(),
  z.object({ zone: z.literal("own_hand"), filter: CardFilterSchema.optional(), count: z.number().int().positive().optional() }).strict(),
  z.object({ zone: z.literal("opp_hand"), filter: CardFilterSchema.optional(), count: z.number().int().positive().optional() }).strict(),
  z.object({ zone: z.literal("own_discard"), filter: CardFilterSchema.optional(), count: z.number().int().positive().optional() }).strict(),
  z.object({ zone: z.literal("opp_discard"), filter: CardFilterSchema.optional(), count: z.number().int().positive().optional() }).strict(),
]);

// ═══════════════════════════════════════════════════════
// Dynamic Values & Countable References
// ═══════════════════════════════════════════════════════

export const CountableRefSchema = z.enum([
  "energy_on_self", "energy_on_defender", "energy_on_all_active", "energy_on_all_in_play",
  "damage_counters_on_self", "damage_counters_on_defender",
  "own_bench_count", "opp_bench_count", "all_bench_count",
  "own_hand_size", "opp_hand_size",
  "own_prizes_remaining", "opp_prizes_remaining", "own_prizes_taken", "opp_prizes_taken",
  "coin_heads",
]);

export const DynamicValueSchema: z.ZodType = z.union([
  z.number(),
  z.object({
    per: CountableRefSchema,
    multiply: z.number(),
  }).strict(),
]);

// ═══════════════════════════════════════════════════════
// Conditions (recursive)
// ═══════════════════════════════════════════════════════

// Using lazy for recursive types
export const ConditionSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("check", [
    z.object({ check: z.literal("coin_flip") }).strict(),
    z.object({ check: z.literal("coin_flip_multi"), count: z.number().int().positive() }).strict(),
    z.object({ check: z.literal("has_energy"), target: TargetSelectorSchema, type: EnergyTypeSchema.optional(), min: z.number().int().optional() }).strict(),
    z.object({ check: z.literal("has_damage"), target: TargetSelectorSchema, min: z.number().int().optional() }).strict(),
    z.object({ check: z.literal("has_status"), target: TargetSelectorSchema, status: StatusConditionSchema.optional() }).strict(),
    z.object({ check: z.literal("has_pokemon_on_bench"), who: PlayerRefSchema }).strict(),
    z.object({ check: z.literal("has_cards_in_deck"), who: PlayerRefSchema, min: z.number().int().optional() }).strict(),
    z.object({ check: z.literal("has_cards_in_hand"), who: PlayerRefSchema, min: z.number().int().optional() }).strict(),
    z.object({ check: z.literal("is_in_active_spot") }).strict(),
    z.object({ check: z.literal("has_tag"), target: TargetSelectorSchema, tag: z.string() }).strict(),
    z.object({ check: z.literal("is_type"), target: TargetSelectorSchema, types: z.array(EnergyTypeSchema) }).strict(),
    z.object({ check: z.literal("marker_exists"), target: TargetSelectorSchema, marker: z.string() }).strict(),
    z.object({ check: z.literal("hp_remaining_lte"), target: TargetSelectorSchema, amount: z.number().int().positive() }).strict(),
    z.object({ check: z.literal("not"), condition: z.lazy(() => ConditionSchema) }).strict(),
    z.object({ check: z.literal("and"), conditions: z.array(z.lazy(() => ConditionSchema)).min(2) }).strict(),
    z.object({ check: z.literal("or"), conditions: z.array(z.lazy(() => ConditionSchema)).min(2) }).strict(),
  ])
);

// ═══════════════════════════════════════════════════════
// Marker Lifecycle
// ═══════════════════════════════════════════════════════

export const MarkerLifecycleSchema = z.enum([
  "until_end_of_turn",
  "until_end_of_opponent_next_turn",
  "until_end_of_own_next_turn",
  "permanent",
  "on_leaving_active",
  "on_evolve",
]);

// ═══════════════════════════════════════════════════════
// Action Steps (the 53 atomic units)
// ═══════════════════════════════════════════════════════

// Forward-declare for recursive references in flip_coin.on_heads, if/then, etc.
export const ActionStepSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("action", [
    // ─── A. Damage ───
    z.object({ action: z.literal("deal_damage"), value: DynamicValueSchema, target: TargetSelectorSchema.optional() }).strict(),
    z.object({ action: z.literal("put_damage_counters"), value: DynamicValueSchema, target: TargetSelectorSchema }).strict(),
    z.object({ action: z.literal("self_damage"), value: z.number().int().nonnegative() }).strict(),
    z.object({ action: z.literal("bench_damage"), value: z.number().int().nonnegative(), side: PlayerRefSchema, count: z.number().int().optional() }).strict(),
    z.object({ action: z.literal("ignore_wr"), weakness: z.boolean().optional(), resistance: z.boolean().optional() }).strict(),

    // ─── B. Coin ───
    z.object({ action: z.literal("flip_coin"), on_heads: z.array(z.lazy(() => ActionStepSchema)), on_tails: z.array(z.lazy(() => ActionStepSchema)).optional() }).strict(),
    z.object({ action: z.literal("flip_coins"), count: z.number().int().positive(), per_heads: z.array(z.lazy(() => ActionStepSchema)) }).strict(),

    // ─── C. Status ───
    z.object({ action: z.literal("apply_status"), status: StatusConditionSchema, target: TargetSelectorSchema.optional() }).strict(),
    z.object({ action: z.literal("remove_status"), status: StatusConditionSchema.optional(), target: TargetSelectorSchema.optional() }).strict(),

    // ─── D. Card Movement ───
    z.object({ action: z.literal("draw_cards"), count: DynamicValueSchema, who: PlayerRefSchema.optional() }).strict(),
    z.object({ action: z.literal("discard_from_hand"), count: z.number().int().positive(), who: PlayerRefSchema.optional(), choice: z.enum(["player", "random"]).optional() }).strict(),
    z.object({ action: z.literal("discard_hand"), who: PlayerRefSchema.optional() }).strict(),
    z.object({
      action: z.literal("search_deck"),
      filter: CardFilterSchema,
      count: z.number().int().positive(),
      destination: z.enum(["hand", "bench", "attach_to_self", "attach_to_target", "top_of_deck", "bottom_of_deck"]),
      who: PlayerRefSchema.optional(),
    }).strict(),
    z.object({
      action: z.literal("recover_from_discard"),
      filter: CardFilterSchema,
      count: z.number().int().positive(),
      destination: z.enum(["hand", "deck", "attach_to_self", "bench"]),
      who: PlayerRefSchema.optional(),
    }).strict(),
    z.object({ action: z.literal("shuffle_hand_into_deck"), who: PlayerRefSchema.optional() }).strict(),
    z.object({ action: z.literal("shuffle_deck"), who: PlayerRefSchema.optional() }).strict(),
    z.object({ action: z.literal("reveal_top_cards"), count: z.number().int().positive(), who: PlayerRefSchema.optional(), then: z.array(z.lazy(() => ActionStepSchema)) }).strict(),
    z.object({ action: z.literal("put_on_deck"), position: z.enum(["top", "bottom"]), who: PlayerRefSchema.optional() }).strict(),
    z.object({ action: z.literal("discard_from_deck_top"), count: z.number().int().positive(), who: PlayerRefSchema.optional() }).strict(),

    // ─── E. Energy Management ───
    z.object({
      action: z.literal("discard_energy"),
      count: z.union([z.number().int().positive(), z.literal("all")]),
      target: TargetSelectorSchema.optional(),
      energy_type: EnergyTypeSchema.optional(),
    }).strict(),
    z.object({
      action: z.literal("attach_energy"),
      source: z.enum(["deck", "discard", "hand"]),
      filter: CardFilterSchema.optional(),
      count: z.number().int().positive(),
      target: TargetSelectorSchema,
    }).strict(),
    z.object({
      action: z.literal("move_energy"),
      from: TargetSelectorSchema,
      to: TargetSelectorSchema,
      energy_type: EnergyTypeSchema.optional(),
      count: z.number().int().positive().optional(),
    }).strict(),

    // ─── F. Field Operations ───
    z.object({ action: z.literal("switch_pokemon"), who: PlayerRefSchema, choice: z.enum(["player", "opponent", "random"]).optional() }).strict(),
    z.object({ action: z.literal("heal"), value: DynamicValueSchema, target: TargetSelectorSchema }).strict(),
    z.object({ action: z.literal("discard_stadium") }).strict(),
    z.object({ action: z.literal("discard_tool"), target: TargetSelectorSchema.optional() }).strict(),
    z.object({ action: z.literal("evolve"), target: TargetSelectorSchema, from_deck: z.boolean().optional() }).strict(),

    // ─── G. Marker / Restriction ───
    z.object({ action: z.literal("set_marker"), target: TargetSelectorSchema, marker: z.string(), lifecycle: MarkerLifecycleSchema, value: z.number().optional() }).strict(),
    z.object({ action: z.literal("clear_marker"), target: TargetSelectorSchema, marker: z.string() }).strict(),
    z.object({ action: z.literal("cant_attack_next_turn") }).strict(),
    z.object({ action: z.literal("cant_retreat"), target: TargetSelectorSchema.optional() }).strict(),
    z.object({ action: z.literal("reduce_damage_next_turn"), amount: z.number().int().positive() }).strict(),
    z.object({ action: z.literal("prevent_damage_next_turn") }).strict(),
    z.object({ action: z.literal("disable_attack"), target: TargetSelectorSchema.optional(), choice: z.enum(["player", "random"]) }).strict(),

    // ─── H. Flow Control ───
    z.object({ action: z.literal("if"), condition: ConditionSchema, then: z.array(z.lazy(() => ActionStepSchema)), else: z.array(z.lazy(() => ActionStepSchema)).optional() }).strict(),
    z.object({ action: z.literal("for_each"), targets: TargetSelectorSchema, body: z.array(z.lazy(() => ActionStepSchema)) }).strict(),
    z.object({
      action: z.literal("choose"),
      from: TargetSelectorSchema,
      min: z.number().int().nonnegative(),
      max: z.number().int().positive(),
      message: z.string().optional(),
      then: z.array(z.lazy(() => ActionStepSchema)),
    }).strict(),
    z.object({
      action: z.literal("choose_one"),
      options: z.array(z.object({
        label: z.string(),
        steps: z.array(z.lazy(() => ActionStepSchema)),
      }).strict()).min(2),
    }).strict(),

    // ─── I. Special ───
    z.object({ action: z.literal("copy_attack"), target: TargetSelectorSchema }).strict(),
    z.object({ action: z.literal("extra_turn") }).strict(),
    z.object({ action: z.literal("log"), message: z.string() }).strict(),
  ])
);

// ═══════════════════════════════════════════════════════
// Trigger Events
// ═══════════════════════════════════════════════════════

export const TriggerEventSchema = z.enum([
  "on_play_from_hand", "on_knocked_out", "on_opponent_plays_card",
  "on_damage_received", "on_energy_attached", "on_evolve",
  "between_turns", "on_turn_start", "on_turn_end",
  "before_attack", "after_attack", "on_retreat",
  "on_switch_in", "on_switch_out",
]);

// ═══════════════════════════════════════════════════════
// Modifier Types
// ═══════════════════════════════════════════════════════

export const ModifierTypeSchema: z.ZodType = z.discriminatedUnion("modify", [
  z.object({ modify: z.literal("incoming_damage"), amount: z.number() }).strict(),
  z.object({ modify: z.literal("outgoing_damage"), amount: z.number(), type_filter: z.array(EnergyTypeSchema).optional() }).strict(),
  z.object({ modify: z.literal("retreat_cost"), amount: z.number() }).strict(),
  z.object({ modify: z.literal("attack_cost"), add_type: EnergyTypeSchema, amount: z.number().int() }).strict(),
  z.object({ modify: z.literal("max_hp"), amount: z.number().int() }).strict(),
  z.object({ modify: z.literal("weakness"), type: EnergyTypeSchema, value: z.string() }).strict(),
  z.object({ modify: z.literal("resistance"), type: EnergyTypeSchema, value: z.string() }).strict(),
  z.object({ modify: z.literal("prevent_effects"), scope: z.enum(["from_ex", "from_abilities", "all"]) }).strict(),
  z.object({ modify: z.literal("prevent_status"), statuses: z.union([z.array(StatusConditionSchema), z.literal("all")]) }).strict(),
  z.object({ modify: z.literal("prevent_bench_damage") }).strict(),
  z.object({ modify: z.literal("block_card_type"), card_type: z.enum(["Item", "Supporter", "Stadium", "Tool"]) }).strict(),
  z.object({ modify: z.literal("provide_energy_type"), provides: EnergyTypeSchema, count: z.number().int().positive() }).strict(),
]);

// ═══════════════════════════════════════════════════════
// Modifier Definition (in ability context)
// ═══════════════════════════════════════════════════════

export const ModifierDefSchema = z.object({
  type: ModifierTypeSchema,
  condition: ConditionSchema.optional(),
}).strict();

// ═══════════════════════════════════════════════════════
// Attack Rule Definition
// ═══════════════════════════════════════════════════════

export const AttackRuleDefSchema = z.object({
  name: z.string().min(1),
  baseDamage: z.number().int().nonnegative().optional(),
  conditions: z.array(ConditionSchema).optional(),
  steps: z.array(ActionStepSchema).min(1),
}).strict();

// ═══════════════════════════════════════════════════════
// Ability Rule Definition
// ═══════════════════════════════════════════════════════

export const AbilityRuleDefSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["activated", "passive", "triggered"]),
  // Activated
  canActivate: z.array(ConditionSchema).optional(),
  oncePerTurn: z.boolean().optional(),
  // Passive
  modifiers: z.array(ModifierDefSchema).optional(),
  // Triggered
  trigger: TriggerEventSchema.optional(),
  // Shared
  condition: ConditionSchema.optional(),
  steps: z.array(ActionStepSchema).optional(),
}).strict().superRefine((data, ctx) => {
  // Cross-field validation
  if (data.type === "passive" && (!data.modifiers || data.modifiers.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passive ability must have at least one modifier",
      path: ["modifiers"],
    });
  }
  if (data.type === "triggered" && !data.trigger) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Triggered ability must specify a trigger event",
      path: ["trigger"],
    });
  }
  if (data.type === "activated" && (!data.steps || data.steps.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Activated ability must have action steps",
      path: ["steps"],
    });
  }
  if (data.type === "triggered" && (!data.steps || data.steps.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Triggered ability must have action steps",
      path: ["steps"],
    });
  }
});

// ═══════════════════════════════════════════════════════
// Trainer Rule Definition
// ═══════════════════════════════════════════════════════

export const TrainerRuleDefSchema = z.object({
  subtype: z.enum(["Supporter", "Item", "Stadium", "Tool"]),
  canPlay: z.array(ConditionSchema).optional(),
  steps: z.array(ActionStepSchema).optional(),
  stadiumEffect: z.object({
    trigger: TriggerEventSchema,
    condition: ConditionSchema.optional(),
    steps: z.array(ActionStepSchema).min(1),
  }).strict().optional(),
  toolModifiers: z.array(ModifierDefSchema).optional(),
}).strict().superRefine((data, ctx) => {
  if ((data.subtype === "Supporter" || data.subtype === "Item") && (!data.steps || data.steps.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${data.subtype} card must have action steps`,
      path: ["steps"],
    });
  }
  if (data.subtype === "Tool" && (!data.toolModifiers || data.toolModifiers.length === 0) && (!data.steps || data.steps.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tool card must have tool modifiers or action steps",
      path: ["toolModifiers"],
    });
  }
});

// ═══════════════════════════════════════════════════════
// Marker Declaration
// ═══════════════════════════════════════════════════════

export const MarkerDeclarationSchema = z.object({
  name: z.string().min(1),
  lifecycle: MarkerLifecycleSchema,
  description: z.string().optional(),
}).strict();

// ═══════════════════════════════════════════════════════
// Top-Level Card Rule Definition
// ═══════════════════════════════════════════════════════

export const CardRuleDefSchema = z.object({
  cardId: z.string().min(1),
  cardName: z.string().min(1),
  version: z.literal(1),
  attacks: z.array(AttackRuleDefSchema).optional(),
  abilities: z.array(AbilityRuleDefSchema).optional(),
  trainer: TrainerRuleDefSchema.optional(),
  markers: z.array(MarkerDeclarationSchema).optional(),
  meta: z.object({
    generatedBy: z.string().optional(),
    generatedAt: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    reviewed: z.boolean().optional(),
    originalText: z.string().optional(),
  }).strict().optional(),
}).strict().superRefine((data, ctx) => {
  // Card must have at least one effect
  const hasEffects = (data.attacks && data.attacks.length > 0)
    || (data.abilities && data.abilities.length > 0)
    || data.trainer;
  if (!hasEffects) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Card must have at least one attack, ability, or trainer effect",
    });
  }
});

// ═══════════════════════════════════════════════════════
// Validation Helper
// ═══════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  /** Parsed and typed data (only if valid) */
  data?: z.infer<typeof CardRuleDefSchema>;
}

/**
 * Validate a raw JSON object against the CardRuleDef schema.
 * Returns structured validation result.
 */
export function validateCardRuleDef(raw: unknown): ValidationResult {
  const result = CardRuleDefSchema.safeParse(raw);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map(issue => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `[${path}] ${issue.message}`;
    }),
  };
}
