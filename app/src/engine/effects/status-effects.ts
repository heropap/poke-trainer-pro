/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Status Effect Processing (Between Turns)
 *
 * Handles status condition effects at the end of each turn:
 * - Poisoned: 10 damage (1 counter) between turns
 * - Burned: 20 damage (2 counters) between turns, flip coin to cure
 * - Asleep: Flip coin at end of turn; heads = wake up
 * - Paralyzed: Auto-cures at end of the affected player's next turn
 * - Confused: Handled during attack (flip coin; tails = self-damage)
 */

import { GameState, GameCard, logEvent } from "../game-state";
import { flipCoin } from "./coin";
import { checkKnockout, takePrizes, getPrizeCount, checkWinCondition } from "../game-actions";

/**
 * Process between-turns status effects for one player.
 * Called at the end of that player's turn, before switching to opponent.
 *
 * @param state - Game state (mutated)
 * @param playerIndex - The player whose active Pokemon is checked
 * @returns true if a KO occurred
 */
export function processBetweenTurns(
  state: GameState,
  playerIndex: 0 | 1
): boolean {
  const player = state.players[playerIndex];
  const active = player.active;

  if (!active || active.statusConditions.length === 0) {
    return false;
  }

  let koOccurred = false;

  // ─── Poisoned: 10 damage ───
  if (active.statusConditions.includes("poisoned")) {
    active.damageCounters += 1; // 1 counter = 10 damage

    logEvent(state, playerIndex, "status_effect" as any,
      `${active.card.name} 因中毒受到了 10 点伤害`,
      { status: "poisoned", damage: 10 }
    );

    // Check KO from poison
    const hp = parseInt(active.card.hp || "0", 10);
    if (hp > 0 && active.damageCounters * 10 >= hp) {
      const opponentIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
      const prizeCount = getPrizeCount(active);
      if (checkKnockout(state, playerIndex, "active")) {
        takePrizes(state, opponentIndex, prizeCount);
        koOccurred = true;
      }
    }
  }

  // ─── Burned: 20 damage + flip to cure ───
  if (!koOccurred && active.statusConditions.includes("burned")) {
    active.damageCounters += 2; // 2 counters = 20 damage

    logEvent(state, playerIndex, "status_effect" as any,
      `${active.card.name} 因灼伤受到了 20 点伤害`,
      { status: "burned", damage: 20 }
    );

    // Flip coin: heads = cured
    const healed = flipCoin();
    logEvent(state, playerIndex, "coin_flip" as any,
      healed
        ? `翻硬币正面! ${active.card.name} 的灼伤恢复了!`
        : `翻硬币反面! ${active.card.name} 仍然处于灼伤状态`,
      { result: healed ? "heads" : "tails", status: "burned" }
    );

    if (healed) {
      active.statusConditions = active.statusConditions.filter(s => s !== "burned");
    }

    // Check KO from burn
    const hp = parseInt(active.card.hp || "0", 10);
    if (hp > 0 && active.damageCounters * 10 >= hp) {
      const opponentIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
      const prizeCount = getPrizeCount(active);
      if (checkKnockout(state, playerIndex, "active")) {
        takePrizes(state, opponentIndex, prizeCount);
        koOccurred = true;
      }
    }
  }

  // ─── Asleep: Flip coin to wake up ───
  if (!koOccurred && active.statusConditions.includes("asleep")) {
    const woke = flipCoin();
    logEvent(state, playerIndex, "coin_flip" as any,
      woke
        ? `翻硬币正面! ${active.card.name} 从睡眠中醒来了!`
        : `翻硬币反面! ${active.card.name} 仍然在睡眠中`,
      { result: woke ? "heads" : "tails", status: "asleep" }
    );

    if (woke) {
      active.statusConditions = active.statusConditions.filter(s => s !== "asleep");
    }
  }

  // ─── Paralyzed: Auto-cures at end of affected player's turn ───
  if (!koOccurred && active.statusConditions.includes("paralyzed")) {
    active.statusConditions = active.statusConditions.filter(s => s !== "paralyzed");

    logEvent(state, playerIndex, "status_effect" as any,
      `${active.card.name} 的麻痹状态解除了`,
      { status: "paralyzed", cured: true }
    );
  }

  return koOccurred;
}
