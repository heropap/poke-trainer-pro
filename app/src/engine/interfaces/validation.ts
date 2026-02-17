
import { GameState } from "../game-state";
import { GameAction } from "../game-controller";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

export type RuleValidator = (state: GameState, action: GameAction, playerIndex: 0 | 1) => ValidationResult;

/**
 * Helper to combine valid results or return the first error
 */
export function combineValidators(validators: RuleValidator[]): RuleValidator {
  return (state, action, playerIndex) => {
    for (const validator of validators) {
      const result = validator(state, action, playerIndex);
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  };
}
