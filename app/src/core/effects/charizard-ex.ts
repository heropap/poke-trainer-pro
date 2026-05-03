import { registerAttackEffect } from "../effects";
import type { PlayerIndex, GameState } from "../state";

// Burning Darkness — base 180 + 30 per Prize the opponent has taken.
// "Opponent has taken X prizes" = 6 - opponent.prizes.length.
//
// attackIndex 0 is the only attack on Charizard ex.
registerAttackEffect("obf-125", 0, (state: GameState, attacker: PlayerIndex, base: number) => {
  const opponent = (1 - attacker) as PlayerIndex;
  const taken = 6 - state.players[opponent].prizes.length;
  return { state, damage: base + 30 * taken };
});
