import type { GameState, PlayerIndex } from "./state";

// Effect handler — receives current state and player who played the trainer/etc.,
// returns updated state. May not be enough for all effects (some need prompts);
// those defer via state.pendingPrompt.
//
// In F4 we install minimal handlers for trainers whose effects are pure data
// transforms (no prompts). F6 fills in the rest.

export type EffectHandler = (state: GameState, player: PlayerIndex) => GameState;

const EFFECTS = new Map<string, EffectHandler>();

export function registerEffect(cardId: string, handler: EffectHandler): void {
  EFFECTS.set(cardId, handler);
}

export function getEffect(cardId: string): EffectHandler | undefined {
  return EFFECTS.get(cardId);
}

export function hasEffect(cardId: string): boolean {
  return EFFECTS.has(cardId);
}

export function clearEffects(): void {
  EFFECTS.clear();
}

export function listRegisteredEffectIds(): string[] {
  return Array.from(EFFECTS.keys());
}
