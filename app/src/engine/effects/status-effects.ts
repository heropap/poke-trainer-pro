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
import { checkKnockout, takePrizes, getPrizeCount, checkWinCondition, getEffectiveHp } from "../game-actions";
import { TURN_BASED_MARKERS, DAMAGE_BOOST } from "./markers";
import { getEffect } from "./effect-registry";

/**
 * Process between-turns status effects for one player.
 * Called at the end of that player's turn, before switching to opponent.
 *
 * @param state - Game state (mutated)
 * @param playerIndex - The player whose active Pokemon is checked
 * @param isTurnOwner - Whether this is the player whose turn just ended (for paralysis cure)
 * @returns true if a KO occurred
 */
export function processBetweenTurns(
  state: GameState,
  playerIndex: 0 | 1,
  isTurnOwner: boolean = false
): boolean {
  const player = state.players[playerIndex];
  const active = player.active;

  if (!active) {
    // Still process bench marker cleanup even without active
    for (const benchCard of player.bench.cards) {
      if (!benchCard.markers) continue;
      for (const markerName of TURN_BASED_MARKERS) {
        if (benchCard.markers[markerName] !== undefined) {
          benchCard.markers[markerName]--;
          if (benchCard.markers[markerName] <= 0) {
            delete benchCard.markers[markerName];
          }
        }
      }
    }
    return false;
  }

  const hasStatusOrMarkers =
    active.statusConditions.length > 0 ||
    Object.keys(active.markers).length > 0 ||
    player.bench.cards.some(c => c.markers && Object.keys(c.markers).length > 0);

  if (!hasStatusOrMarkers) {
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
    const hp = getEffectiveHp(active);
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
    const hp = getEffectiveHp(active);
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
  if (!koOccurred && active.statusConditions.includes("paralyzed") && isTurnOwner) {
    active.statusConditions = active.statusConditions.filter(s => s !== "paralyzed");

    logEvent(state, playerIndex, "status_effect" as any,
      `${active.card.name} 的麻痹状态解除了`,
      { status: "paralyzed", cured: true }
    );
  }

  // ─── V2: heal_between_turns abilities ───
  if (!koOccurred && active.damageCounters > 0) {
    const effect = getEffect(active.cardId, active.card.name);
    if (effect?.abilities) {
      for (const ability of effect.abilities) {
        if (ability.type === "passive") {
          const abilityAny = ability as any;
          if (abilityAny._modifierType === "heal_between_turns") {
            const healAmount = abilityAny._modifierValue || 10;
            const countersToHeal = Math.min(healAmount / 10, active.damageCounters);
            if (countersToHeal > 0) {
              active.damageCounters -= countersToHeal;
              logEvent(state, playerIndex, "ability" as any,
                `${active.card.name} 的特性 ${ability.name} 回复了 ${countersToHeal * 10} 点HP`);
            }
          }
        }
      }
    }
    // Also check attached tools for between-turns healing (e.g., Leftovers)
    for (const tool of active.attachedTools) {
      const toolEffect = getEffect(tool.cardId, tool.card.name);
      const healAmount = toolEffect?.tool?.whileAttached?.healBetweenTurns;
      if (healAmount && active.damageCounters > 0) {
        const countersToHeal = Math.min(healAmount / 10, active.damageCounters);
        if (countersToHeal > 0) {
          active.damageCounters -= countersToHeal;
          logEvent(state, playerIndex, "ability" as any,
            `${tool.card.name} 为 ${active.card.name} 回复了 ${countersToHeal * 10} 点HP`);
        }
      }
    }
  }

  // ─── Tool between-turns healing on bench Pokémon ───
  for (const benchCard of player.bench.cards) {
    if (benchCard.damageCounters <= 0 || benchCard.attachedTools.length === 0) continue;
    for (const tool of benchCard.attachedTools) {
      const toolEffect = getEffect(tool.cardId, tool.card.name);
      const healAmount = toolEffect?.tool?.whileAttached?.healBetweenTurns;
      if (healAmount && benchCard.damageCounters > 0) {
        const countersToHeal = Math.min(healAmount / 10, benchCard.damageCounters);
        if (countersToHeal > 0) {
          benchCard.damageCounters -= countersToHeal;
          logEvent(state, playerIndex, "ability" as any,
            `${tool.card.name} 为 ${benchCard.card.name} 回复了 ${countersToHeal * 10} 点HP`);
        }
      }
    }
  }

  // ─── Clear turn-owner's damage boost marker ───
  // DAMAGE_BOOST is set by trainer supporters (Kieran, Giovanni's Charisma) and lasts only one turn.
  if (isTurnOwner && active.markers && active.markers[DAMAGE_BOOST] !== undefined) {
    delete active.markers[DAMAGE_BOOST];
  }

  // ─── Turn-based marker cleanup ───
  // Decrement turn-based markers on active Pokemon; remove at 0
  if (!koOccurred && active.markers) {
    for (const markerName of TURN_BASED_MARKERS) {
      if (active.markers[markerName] !== undefined) {
        active.markers[markerName]--;
        if (active.markers[markerName] <= 0) {
          delete active.markers[markerName];
        }
      }
    }
    // Also handle attack-specific markers (CANT_USE_ATTACK:*)
    for (const key of Object.keys(active.markers)) {
      if (key.startsWith("CANT_USE_ATTACK:")) {
        active.markers[key]--;
        if (active.markers[key] <= 0) {
          delete active.markers[key];
        }
      }
    }
  }

  // ─── Turn-based marker cleanup on bench ───
  for (const benchCard of player.bench.cards) {
    if (!benchCard.markers) continue;
    for (const markerName of TURN_BASED_MARKERS) {
      if (benchCard.markers[markerName] !== undefined) {
        benchCard.markers[markerName]--;
        if (benchCard.markers[markerName] <= 0) {
          delete benchCard.markers[markerName];
        }
      }
    }
  }

  return koOccurred;
}
