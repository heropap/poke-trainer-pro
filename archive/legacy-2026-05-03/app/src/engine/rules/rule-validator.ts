/**
 * Rule Validator — Structural + Semantic Validation
 *
 * Two-level validation:
 * 1. Structural: Zod schema (rule-schema-zod.ts) — shape, types, required fields
 * 2. Semantic: This file — cross-field consistency, reference validity, card DB checks
 *
 * Usage:
 *   const result = validateRule(rawJson, cardDatabase);
 *   if (!result.valid) console.error(result.errors);
 */

import { validateCardRuleDef } from "./rule-schema-zod";
import { CardRuleDef, AttackRuleDef, AbilityRuleDef, TrainerRuleDef } from "./card-rule-def";
import { ActionStep, Condition, TargetSelector } from "./rule-schema";

// ═══════════════════════════════════════════════════════
// Card Database Interface (for cross-validation)
// ═══════════════════════════════════════════════════════

export interface CardData {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  attacks?: Array<{
    name: string;
    cost: string[];
    damage: string;
    text?: string;
  }>;
  abilities?: Array<{
    name: string;
    text: string;
    type: string;
  }>;
  retreatCost?: string[];
  rules?: string[];
}

// ═══════════════════════════════════════════════════════
// Validation Result
// ═══════════════════════════════════════════════════════

export interface RuleValidationResult {
  valid: boolean;
  /** Structural errors from Zod */
  structuralErrors: string[];
  /** Semantic errors from cross-validation */
  semanticErrors: string[];
  /** Warnings (non-blocking) */
  warnings: string[];
  /** Parsed data if valid */
  data?: CardRuleDef;
}

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

/**
 * Validate a raw JSON object as a CardRuleDef.
 * Performs both structural (Zod) and semantic validation.
 *
 * @param raw - Raw JSON object (e.g., from LLM output)
 * @param cardData - Optional card data for cross-validation
 */
export function validateRule(
  raw: unknown,
  cardData?: CardData,
): RuleValidationResult {
  const result: RuleValidationResult = {
    valid: true,
    structuralErrors: [],
    semanticErrors: [],
    warnings: [],
  };

  // ─── Step 1: Structural Validation (Zod) ───
  const zodResult = validateCardRuleDef(raw);
  if (!zodResult.valid) {
    result.valid = false;
    result.structuralErrors = zodResult.errors || [];
    return result;
  }

  const rule = zodResult.data! as CardRuleDef;
  result.data = rule;

  // ─── Step 2: Semantic Validation ───
  semanticValidate(rule, cardData, result);

  if (result.semanticErrors.length > 0) {
    result.valid = false;
  }

  return result;
}

/**
 * Validate a batch of rules.
 * Returns results indexed by cardId.
 */
export function validateRules(
  rules: unknown[],
  cardDatabase?: Map<string, CardData>,
): Map<string, RuleValidationResult> {
  const results = new Map<string, RuleValidationResult>();
  for (const raw of rules) {
    const result = validateRule(raw, undefined);
    if (result.data) {
      // Cross-validate with card database
      if (cardDatabase && result.data.cardId) {
        const card = cardDatabase.get(result.data.cardId);
        if (card) {
          semanticValidate(result.data, card, result);
          if (result.semanticErrors.length > 0) {
            result.valid = false;
          }
        } else {
          result.warnings.push(`Card ${result.data.cardId} not found in database`);
        }
      }
      results.set(result.data.cardId, result);
    } else {
      results.set(`unknown_${results.size}`, result);
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════
// Semantic Validation
// ═══════════════════════════════════════════════════════

function semanticValidate(
  rule: CardRuleDef,
  cardData: CardData | undefined,
  result: RuleValidationResult,
): void {
  // ─── Cross-validate with card data ───
  if (cardData) {
    crossValidateWithCard(rule, cardData, result);
  }

  // ─── Validate attacks ───
  if (rule.attacks) {
    for (const attack of rule.attacks) {
      validateAttackRule(attack, rule.cardName, result);
    }
  }

  // ─── Validate abilities ───
  if (rule.abilities) {
    for (const ability of rule.abilities) {
      validateAbilityRule(ability, rule.cardName, result);
    }
  }

  // ─── Validate trainer ───
  if (rule.trainer) {
    validateTrainerRule(rule.trainer, rule.cardName, result);
  }

  // ─── Validate markers consistency ───
  if (rule.markers) {
    validateMarkerConsistency(rule, result);
  }

  // ─── Validate version ───
  if (rule.version !== 1) {
    result.semanticErrors.push(`Unsupported version: ${rule.version}`);
  }
}

// ═══════════════════════════════════════════════════════
// Cross-validation with Card Database
// ═══════════════════════════════════════════════════════

function crossValidateWithCard(
  rule: CardRuleDef,
  card: CardData,
  result: RuleValidationResult,
): void {
  // Check card ID match
  if (rule.cardId !== card.id) {
    result.semanticErrors.push(
      `Card ID mismatch: rule has "${rule.cardId}", card DB has "${card.id}"`
    );
  }

  // Check card name match (warning only, names can vary slightly)
  if (rule.cardName !== card.name) {
    result.warnings.push(
      `Card name mismatch: rule has "${rule.cardName}", card DB has "${card.name}"`
    );
  }

  // Validate attacks exist in card data
  if (rule.attacks && card.attacks) {
    for (const attackRule of rule.attacks) {
      const cardAttack = card.attacks.find(a => a.name === attackRule.name);
      if (!cardAttack) {
        result.semanticErrors.push(
          `Attack "${attackRule.name}" not found in card "${card.name}". ` +
          `Available attacks: ${card.attacks.map(a => a.name).join(", ")}`
        );
      }
    }
    // Check for missing attacks (warning)
    for (const cardAttack of card.attacks) {
      if (cardAttack.text || (cardAttack.damage && cardAttack.damage !== "0")) {
        const hasRule = rule.attacks.some(a => a.name === cardAttack.name);
        if (!hasRule) {
          result.warnings.push(
            `Attack "${cardAttack.name}" from card data has no rule definition`
          );
        }
      }
    }
  }

  // Validate abilities exist in card data
  if (rule.abilities && card.abilities) {
    for (const abilityRule of rule.abilities) {
      const cardAbility = card.abilities.find(a => a.name === abilityRule.name);
      if (!cardAbility) {
        result.semanticErrors.push(
          `Ability "${abilityRule.name}" not found in card "${card.name}". ` +
          `Available abilities: ${card.abilities.map(a => a.name).join(", ")}`
        );
      }
    }
  }

  // Validate card type consistency
  if (rule.trainer && card.supertype !== "Trainer") {
    result.semanticErrors.push(
      `Rule defines trainer effect but card "${card.name}" is ${card.supertype}, not Trainer`
    );
  }
  if (rule.attacks && card.supertype === "Trainer" && !card.subtypes?.includes("Stadium")) {
    result.warnings.push(
      `Rule defines attacks but card "${card.name}" is a Trainer card`
    );
  }
}

// ═══════════════════════════════════════════════════════
// Attack Rule Validation
// ═══════════════════════════════════════════════════════

function validateAttackRule(
  attack: AttackRuleDef,
  cardName: string,
  result: RuleValidationResult,
): void {
  // Check for empty steps
  if (attack.steps.length === 0) {
    result.semanticErrors.push(
      `Attack "${attack.name}" on "${cardName}" has no action steps`
    );
  }

  // Validate step references
  for (let i = 0; i < attack.steps.length; i++) {
    validateActionStep(attack.steps[i], `${cardName}.${attack.name}.steps[${i}]`, result);
  }

  // Check for unreachable steps after unconditional damage
  let hasUnconditionalReturn = false;
  for (const step of attack.steps) {
    if (hasUnconditionalReturn && step.action !== "log") {
      result.warnings.push(
        `Attack "${attack.name}": steps after unconditional return may be unreachable`
      );
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════
// Ability Rule Validation
// ═══════════════════════════════════════════════════════

function validateAbilityRule(
  ability: AbilityRuleDef,
  cardName: string,
  result: RuleValidationResult,
): void {
  // Type-specific validation
  switch (ability.type) {
    case "activated":
      if (!ability.steps || ability.steps.length === 0) {
        result.semanticErrors.push(
          `Activated ability "${ability.name}" on "${cardName}" has no action steps`
        );
      }
      break;

    case "passive":
      if (!ability.modifiers || ability.modifiers.length === 0) {
        result.semanticErrors.push(
          `Passive ability "${ability.name}" on "${cardName}" has no modifiers`
        );
      }
      break;

    case "triggered":
      if (!ability.trigger) {
        result.semanticErrors.push(
          `Triggered ability "${ability.name}" on "${cardName}" has no trigger event`
        );
      }
      if (!ability.steps || ability.steps.length === 0) {
        result.semanticErrors.push(
          `Triggered ability "${ability.name}" on "${cardName}" has no action steps`
        );
      }
      break;
  }

  // Validate steps if present
  if (ability.steps) {
    for (let i = 0; i < ability.steps.length; i++) {
      validateActionStep(ability.steps[i], `${cardName}.${ability.name}.steps[${i}]`, result);
    }
  }
}

// ═══════════════════════════════════════════════════════
// Trainer Rule Validation
// ═══════════════════════════════════════════════════════

function validateTrainerRule(
  trainer: TrainerRuleDef,
  cardName: string,
  result: RuleValidationResult,
): void {
  // Subtype-specific validation
  switch (trainer.subtype) {
    case "Supporter":
    case "Item":
      if (!trainer.steps || trainer.steps.length === 0) {
        result.semanticErrors.push(
          `${trainer.subtype} "${cardName}" has no action steps`
        );
      }
      break;

    case "Stadium":
      if (!trainer.stadiumEffect && (!trainer.steps || trainer.steps.length === 0)) {
        result.warnings.push(
          `Stadium "${cardName}" has no stadium effect or action steps`
        );
      }
      break;

    case "Tool":
      if (!trainer.toolModifiers || trainer.toolModifiers.length === 0) {
        if (!trainer.steps || trainer.steps.length === 0) {
          result.semanticErrors.push(
            `Tool "${cardName}" has no modifiers or action steps`
          );
        }
      }
      break;
  }

  // Validate steps if present
  if (trainer.steps) {
    for (let i = 0; i < trainer.steps.length; i++) {
      validateActionStep(trainer.steps[i], `${cardName}.trainer.steps[${i}]`, result);
    }
  }
}

// ═══════════════════════════════════════════════════════
// Action Step Validation
// ═══════════════════════════════════════════════════════

function validateActionStep(
  step: ActionStep,
  path: string,
  result: RuleValidationResult,
): void {
  // Validate nested steps (recursive)
  switch (step.action) {
    case "flip_coin":
      for (let i = 0; i < step.on_heads.length; i++) {
        validateActionStep(step.on_heads[i], `${path}.on_heads[${i}]`, result);
      }
      if (step.on_tails) {
        for (let i = 0; i < step.on_tails.length; i++) {
          validateActionStep(step.on_tails[i], `${path}.on_tails[${i}]`, result);
        }
      }
      break;

    case "flip_coins":
      for (let i = 0; i < step.per_heads.length; i++) {
        validateActionStep(step.per_heads[i], `${path}.per_heads[${i}]`, result);
      }
      break;

    case "if":
      validateCondition(step.condition, `${path}.condition`, result);
      for (let i = 0; i < step.then.length; i++) {
        validateActionStep(step.then[i], `${path}.then[${i}]`, result);
      }
      if (step.else) {
        for (let i = 0; i < step.else.length; i++) {
          validateActionStep(step.else[i], `${path}.else[${i}]`, result);
        }
      }
      break;

    case "for_each":
      for (let i = 0; i < step.body.length; i++) {
        validateActionStep(step.body[i], `${path}.body[${i}]`, result);
      }
      break;

    case "choose":
      for (let i = 0; i < step.then.length; i++) {
        validateActionStep(step.then[i], `${path}.then[${i}]`, result);
      }
      if (step.min > step.max) {
        result.semanticErrors.push(
          `${path}: choose.min (${step.min}) > choose.max (${step.max})`
        );
      }
      break;

    case "choose_one":
      if (step.options.length < 2) {
        result.semanticErrors.push(
          `${path}: choose_one must have at least 2 options`
        );
      }
      for (let i = 0; i < step.options.length; i++) {
        for (let j = 0; j < step.options[i].steps.length; j++) {
          validateActionStep(step.options[i].steps[j], `${path}.options[${i}].steps[${j}]`, result);
        }
      }
      break;

    case "reveal_top_cards":
      for (let i = 0; i < step.then.length; i++) {
        validateActionStep(step.then[i], `${path}.then[${i}]`, result);
      }
      break;

    case "deal_damage":
      if (typeof step.value === "number" && step.value < 0) {
        result.semanticErrors.push(`${path}: damage cannot be negative`);
      }
      break;

    case "heal":
      if (typeof step.value === "number" && step.value < 0) {
        result.semanticErrors.push(`${path}: heal amount cannot be negative`);
      }
      break;
  }
}

// ═══════════════════════════════════════════════════════
// Condition Validation
// ═══════════════════════════════════════════════════════

function validateCondition(
  condition: Condition,
  path: string,
  result: RuleValidationResult,
): void {
  switch (condition.check) {
    case "not":
      validateCondition(condition.condition, `${path}.not`, result);
      break;
    case "and":
      if (condition.conditions.length < 2) {
        result.semanticErrors.push(`${path}: "and" condition needs at least 2 sub-conditions`);
      }
      for (let i = 0; i < condition.conditions.length; i++) {
        validateCondition(condition.conditions[i], `${path}.and[${i}]`, result);
      }
      break;
    case "or":
      if (condition.conditions.length < 2) {
        result.semanticErrors.push(`${path}: "or" condition needs at least 2 sub-conditions`);
      }
      for (let i = 0; i < condition.conditions.length; i++) {
        validateCondition(condition.conditions[i], `${path}.or[${i}]`, result);
      }
      break;
  }
}

// ═══════════════════════════════════════════════════════
// Marker Consistency Check
// ═══════════════════════════════════════════════════════

function validateMarkerConsistency(
  rule: CardRuleDef,
  result: RuleValidationResult,
): void {
  const declaredMarkers = new Set(rule.markers?.map(m => m.name) || []);
  const usedMarkers = new Set<string>();

  // Collect all markers used in steps
  function collectMarkersFromSteps(steps: ActionStep[]): void {
    for (const step of steps) {
      if (step.action === "set_marker") usedMarkers.add(step.marker);
      if (step.action === "clear_marker") usedMarkers.add(step.marker);
      // Recurse into nested steps
      if (step.action === "flip_coin") {
        collectMarkersFromSteps(step.on_heads);
        if (step.on_tails) collectMarkersFromSteps(step.on_tails);
      }
      if (step.action === "flip_coins") collectMarkersFromSteps(step.per_heads);
      if (step.action === "if") {
        collectMarkersFromSteps(step.then);
        if (step.else) collectMarkersFromSteps(step.else);
      }
      if (step.action === "for_each") collectMarkersFromSteps(step.body);
      if (step.action === "choose") collectMarkersFromSteps(step.then);
      if (step.action === "choose_one") {
        for (const opt of step.options) collectMarkersFromSteps(opt.steps);
      }
      if (step.action === "reveal_top_cards") collectMarkersFromSteps(step.then);
    }
  }

  // Collect from all attacks and abilities
  if (rule.attacks) {
    for (const a of rule.attacks) collectMarkersFromSteps(a.steps);
  }
  if (rule.abilities) {
    for (const a of rule.abilities) {
      if (a.steps) collectMarkersFromSteps(a.steps);
    }
  }
  if (rule.trainer?.steps) {
    collectMarkersFromSteps(rule.trainer.steps);
  }

  // Check for undeclared markers (warning only)
  for (const marker of usedMarkers) {
    if (!declaredMarkers.has(marker)) {
      // Skip well-known markers
      const wellKnown = [
        "CANT_ATTACK_NEXT_TURN", "PREVENT_RETREAT_NEXT_TURN",
        "PREVENT_ALL_DAMAGE_NEXT_TURN", "VSTAR_USED", "ABILITY_BLOCKED", "ABILITY_BLOCKED_TEMP", "DAMAGE_BOOST",
        "SQUAWK_AND_SEIZE_USED",
      ];
      if (!wellKnown.includes(marker) && !marker.startsWith("DAMAGE_REDUCTION:") && !marker.startsWith("CANT_USE_ATTACK:")) {
        result.warnings.push(
          `Marker "${marker}" is used but not declared in markers[] (add for documentation)`
        );
      }
    }
  }

  // Check for declared but unused markers (warning only)
  for (const marker of declaredMarkers) {
    if (!usedMarkers.has(marker)) {
      result.warnings.push(
        `Marker "${marker}" is declared but never used in action steps`
      );
    }
  }
}
