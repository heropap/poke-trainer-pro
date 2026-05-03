import type { Action, PromptResponse } from "./actions";
import type { GameState, PlayerIndex } from "./state";

// =============================================================
// Trainer effect — runs after the trainer card is moved to discard.
//
// May set state.pendingPrompt (and state.pendingEffect for multi-step).
// Multi-step effects use the effect-step registry below to continue.
// =============================================================
export type TrainerEffectHandler = (state: GameState, player: PlayerIndex) => GameState;

const TRAINER_EFFECTS = new Map<string, TrainerEffectHandler>();

export function registerTrainerEffect(cardId: string, h: TrainerEffectHandler): void {
  TRAINER_EFFECTS.set(cardId, h);
}
export function getTrainerEffect(cardId: string): TrainerEffectHandler | undefined {
  return TRAINER_EFFECTS.get(cardId);
}

// =============================================================
// Attack effect — receives state, attacker, base damage; returns
// possibly-mutated state and final damage. Attackers with no
// scaling logic don't need this.
// =============================================================
export interface AttackResult {
  state: GameState;
  damage: number;
}
export type AttackEffectHandler = (
  state: GameState,
  attacker: PlayerIndex,
  base: number,
) => AttackResult;

const ATTACK_EFFECTS = new Map<string, AttackEffectHandler>();

function attackKey(cardId: string, attackIndex: number): string {
  return `${cardId}#${attackIndex}`;
}
export function registerAttackEffect(
  cardId: string,
  attackIndex: number,
  h: AttackEffectHandler,
): void {
  ATTACK_EFFECTS.set(attackKey(cardId, attackIndex), h);
}
export function getAttackEffect(
  cardId: string,
  attackIndex: number,
): AttackEffectHandler | undefined {
  return ATTACK_EFFECTS.get(attackKey(cardId, attackIndex));
}

// =============================================================
// Ability effect — invoked by UseAbility action OR by triggers
// (e.g., on-play). Some abilities may set prompts.
// =============================================================
export type AbilityEffectHandler = (
  state: GameState,
  player: PlayerIndex,
  sourceUid: string,
) => GameState;

const ABILITY_EFFECTS = new Map<string, AbilityEffectHandler>();

function abilityKey(cardId: string, abilityName: string): string {
  return `${cardId}#${abilityName}`;
}
export function registerAbility(
  cardId: string,
  abilityName: string,
  h: AbilityEffectHandler,
): void {
  ABILITY_EFFECTS.set(abilityKey(cardId, abilityName), h);
}
export function getAbility(
  cardId: string,
  abilityName: string,
): AbilityEffectHandler | undefined {
  return ABILITY_EFFECTS.get(abilityKey(cardId, abilityName));
}

// =============================================================
// On-play triggers — fired when a Pokemon is put into play from
// the hand (Basic to bench/active). Used for entry abilities like
// Miraidon ex's Tandem Unit.
// =============================================================
export type OnPlayTrigger = (state: GameState, player: PlayerIndex, sourceUid: string) => GameState;

const ON_PLAY = new Map<string, OnPlayTrigger>();
export function registerOnPlay(cardId: string, h: OnPlayTrigger): void {
  ON_PLAY.set(cardId, h);
}
export function getOnPlay(cardId: string): OnPlayTrigger | undefined {
  return ON_PLAY.get(cardId);
}

// =============================================================
// Effect-step continuations — for multi-step effects that need
// to dispatch on PromptResponse.
// =============================================================
export type EffectStepHandler = (
  state: GameState,
  payload: PromptResponse,
) => GameState;

const EFFECT_STEPS = new Map<string, EffectStepHandler>();

export function registerEffectStep(effectId: string, h: EffectStepHandler): void {
  EFFECT_STEPS.set(effectId, h);
}
export function getEffectStep(effectId: string): EffectStepHandler | undefined {
  return EFFECT_STEPS.get(effectId);
}

// Re-exports
export type { Action };

// Dev-only utilities
export function clearAllEffects(): void {
  TRAINER_EFFECTS.clear();
  ATTACK_EFFECTS.clear();
  ABILITY_EFFECTS.clear();
  ON_PLAY.clear();
  EFFECT_STEPS.clear();
}

// Backwards compat from F4 (single 'effect' handler)
export function getEffect(cardId: string): TrainerEffectHandler | undefined {
  return TRAINER_EFFECTS.get(cardId);
}
export function registerEffect(cardId: string, h: TrainerEffectHandler): void {
  registerTrainerEffect(cardId, h);
}
export function hasEffect(cardId: string): boolean {
  return TRAINER_EFFECTS.has(cardId);
}
