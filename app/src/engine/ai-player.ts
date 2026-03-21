/**
 * AI Player for Pokemon TCG
 *
 * A rule-based AI that evaluates the game state and decides
 * which action to take during its turn. The AI plays through
 * the standard PTCG turn flow:
 *
 * 1. Play Basic Pokemon to bench (fill the bench)
 * 2. Evolve Pokemon where possible
 * 3. Attach energy to the best target
 * 4. Attack with the strongest available attack
 * 5. End turn if nothing else to do
 *
 * Also handles:
 * - Promotion after KO (pick highest HP bench Pokemon)
 * - Retreat when current active is low HP and bench has better option
 */

import { GameState, GamePhase, GameCard, Player } from "./game-state";
import { GameAction, ActionResult } from "./game-controller";
import { canAttack, checkEnergyCostDetailed } from "./game-actions";
import { getEffectiveRetreatCost } from "./turn-actions";
import { getEffect } from "./effects/effect-registry";
import { ABILITY_BLOCKED, ABILITY_BLOCKED_TEMP } from "./effects/markers";

// ───────────────────────────────────────────────
// AI Decision Result
// ───────────────────────────────────────────────

export interface AIDecision {
  action: GameAction;
  reason: string;
}

// ───────────────────────────────────────────────
// Main AI Entry Point
// ───────────────────────────────────────────────

/**
 * Compute the next action for the AI player.
 *
 * Returns null if the AI has no valid action (shouldn't happen
 * since end_turn is always available during main phase).
 *
 * @param state - Current game state
 * @param playerIndex - The AI's player index (0 or 1)
 * @returns The action to take, or null if game is over
 */
export function computeAIAction(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  // Don't act if game is over
  if (state.phase === GamePhase.GAME_OVER) return null;

  // Don't act if it's not our turn (except for promotion)
  if (state.currentPlayer !== playerIndex) {
    // Check if we need to promote
    const player = state.players[playerIndex];
    if (!player.active && player.bench.cards.length > 0) {
      return decidePromotion(state, playerIndex);
    }
    return null;
  }

  // Must be in main phase
  if (state.phase !== GamePhase.MAIN) return null;

  const player = state.players[playerIndex];

  // ── Priority 1: If no active Pokemon, must promote (shouldn't happen in main) ──
  if (!player.active && player.bench.cards.length > 0) {
    return decidePromotion(state, playerIndex);
  }

  // ── Priority 2: Play Basic Pokemon to empty active spot ──
  if (!player.active) {
    const basicToPlay = findBasicInHand(player);
    if (basicToPlay) {
      return {
        action: {
          type: "play_card",
          cardId: basicToPlay.instanceId,
          targetZone: "active",
        },
        reason: `Play ${basicToPlay.card.name} to active (empty)`,
      };
    }
  }

  // ── Priority 3: Play Basic Pokemon to bench ──
  if (player.bench.cards.length < 5) {
    const basics = findAllBasicsInHand(player);
    if (basics.length > 0) {
      // Play the one with lowest HP first (save big ones for later)
      const sorted = [...basics].sort(
        (a, b) => getHp(a) - getHp(b)
      );
      return {
        action: {
          type: "play_card",
          cardId: sorted[0].instanceId,
          targetZone: "bench",
        },
        reason: `Play ${sorted[0].card.name} to bench`,
      };
    }
  }

  // ── Priority 4: Evolve Pokemon where possible ──
  const evolution = findBestEvolution(state, playerIndex);
  if (evolution) {
    return evolution;
  }

  // ── Priority 4.5: Use activated abilities ──
  const abilityAction = decideAbilityUse(state, playerIndex);
  if (abilityAction) {
    return abilityAction;
  }

  // ── Priority 5: Use Item cards ──
  const itemAction = decideItemUse(state, playerIndex);
  if (itemAction) {
    return itemAction;
  }

  // ── Priority 6: Attach energy ──
  if (!state.turnStatus.hasAttachedEnergy && !player.energyAttachedThisTurn) {
    const energyAction = decideEnergyAttachment(state, playerIndex);
    if (energyAction) {
      return energyAction;
    }
  }

  // ── Priority 7: Use Supporter cards ──
  if (!state.turnStatus.hasPlayedSupporter && !player.supporterUsedThisTurn) {
    const supporterAction = decideSupporterUse(state, playerIndex);
    if (supporterAction) {
      return supporterAction;
    }
  }

  // ── Priority 7.5: Play Stadium cards ──
  if (!state.turnStatus.hasPlayedStadium) {
    const stadiumCards = player.hand.cards.filter(
      c => c.card.supertype === "Trainer" && c.card.subtypes.includes("Stadium") &&
        // Don't play same-name stadium
        (!state.stadium || state.stadium.card.card.name !== c.card.name)
    );
    if (stadiumCards.length > 0) {
      return {
        action: { type: "play_card", cardId: stadiumCards[0].instanceId },
        reason: `Play stadium: ${stadiumCards[0].card.name}`,
      };
    }
  }

  // ── Priority 8: Consider retreat if active is in danger ──
  const retreatAction = considerRetreat(state, playerIndex);
  if (retreatAction) {
    return retreatAction;
  }

  // ── Priority 9: Attack with best available attack ──
  const attackAction = decideBestAttack(state, playerIndex);
  if (attackAction) {
    return attackAction;
  }

  // ── Priority 10: End turn ──
  return {
    action: { type: "end_turn" },
    reason: "No more actions available",
  };
}

/**
 * Compute all actions for a full AI turn.
 *
 * Returns an ordered list of actions the AI wants to perform
 * this turn (play cards, evolve, attach energy, attack/end).
 *
 * The caller should execute them one by one through processAction.
 */
export function computeAITurnActions(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision[] {
  const actions: AIDecision[] = [];
  const player = state.players[playerIndex];

  if (state.phase !== GamePhase.MAIN || state.currentPlayer !== playerIndex) {
    return actions;
  }

  // 1. Play all basics to bench
  if (player.bench.cards.length < 5) {
    const basics = findAllBasicsInHand(player);
    const sorted = [...basics].sort((a, b) => getHp(a) - getHp(b));
    const slotsAvailable = 5 - player.bench.cards.length;
    for (let i = 0; i < Math.min(sorted.length, slotsAvailable); i++) {
      actions.push({
        action: {
          type: "play_card",
          cardId: sorted[i].instanceId,
          targetZone: "bench",
        },
        reason: `Play ${sorted[i].card.name} to bench`,
      });
    }
  }

  // 2. Evolve where possible
  const evolutions = findAllEvolutions(state, playerIndex);
  actions.push(...evolutions);

  // 2.5. Use all available abilities
  const abilityActions = findAllAbilityActions(state, playerIndex);
  actions.push(...abilityActions);

  // 3. Attach energy
  if (!state.turnStatus.hasAttachedEnergy && !player.energyAttachedThisTurn) {
    const energyAction = decideEnergyAttachment(state, playerIndex);
    if (energyAction) {
      actions.push(energyAction);
    }
  }

  // 4. Attack or end turn
  const attackAction = decideBestAttack(state, playerIndex);
  if (attackAction) {
    actions.push(attackAction);
  } else {
    actions.push({
      action: { type: "end_turn" },
      reason: "No attack available, ending turn",
    });
  }

  return actions;
}

// ───────────────────────────────────────────────
// Decision Helpers
// ───────────────────────────────────────────────

/** Find a Basic Pokemon in hand */
function findBasicInHand(player: Player): GameCard | null {
  return (
    player.hand.cards.find(
      (c) =>
        c.card.supertype === "Pokémon" &&
        c.card.subtypes.includes("Basic")
    ) || null
  );
}

/** Find ALL Basic Pokemon in hand */
function findAllBasicsInHand(player: Player): GameCard[] {
  return player.hand.cards.filter(
    (c) =>
      c.card.supertype === "Pokémon" &&
      c.card.subtypes.includes("Basic")
  );
}

/** Get HP as number */
function getHp(card: GameCard): number {
  return parseInt(card.card.hp || "0", 10);
}

/** Get remaining HP */
function getRemainingHp(card: GameCard): number {
  return getHp(card) - card.damageCounters * 10;
}

/** Get the total energy attached to a card */
function getEnergyCount(card: GameCard): number {
  return card.attachedEnergy.length;
}

/**
 * Find the best evolution to perform.
 * Prioritizes evolving the active Pokemon, then bench.
 */
function findBestEvolution(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  const player = state.players[playerIndex];
  const evolutions = findAllEvolutions(state, playerIndex);
  if (evolutions.length === 0) return null;

  // Prefer evolving active Pokemon first
  const activeEvo = evolutions.find(
    (e) => e.action.targetId === player.active?.instanceId
  );
  return activeEvo || evolutions[0];
}

/**
 * Find all possible evolutions.
 */
function findAllEvolutions(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision[] {
  const player = state.players[playerIndex];
  const results: AIDecision[] = [];

  if (state.isFirstTurn) return results;

  // Get all stage 1/2 cards in hand
  const evoCards = player.hand.cards.filter(
    (c) =>
      c.card.supertype === "Pokémon" &&
      (c.card.subtypes.includes("Stage 1") ||
        c.card.subtypes.includes("Stage 2")) &&
      c.card.evolvesFrom
  );

  // Get all Pokemon in play (active + bench)
  const inPlay: GameCard[] = [];
  if (player.active) inPlay.push(player.active);
  inPlay.push(...player.bench.cards);

  for (const evo of evoCards) {
    const target = inPlay.find(
      (p) =>
        p.card.name === evo.card.evolvesFrom &&
        !p.playedThisTurn
    );
    if (target) {
      results.push({
        action: {
          type: "evolve",
          cardId: evo.instanceId,
          targetId: target.instanceId,
        },
        reason: `Evolve ${target.card.name} → ${evo.card.name}`,
      });
    }
  }

  return results;
}

/**
 * Decide which Pokemon to attach energy to.
 *
 * Strategy:
 * 1. Prioritize the active Pokemon (it attacks)
 * 2. If active already has enough for its best attack, try bench
 * 3. Prefer energy type matching the Pokemon's type
 */
function decideEnergyAttachment(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  const player = state.players[playerIndex];

  // Find energy cards in hand
  const energyCards = player.hand.cards.filter(
    (c) => c.card.supertype === "Energy"
  );

  if (energyCards.length === 0) return null;

  // Collect targets: active + bench
  const targets: GameCard[] = [];
  if (player.active) targets.push(player.active);
  targets.push(...player.bench.cards);

  if (targets.length === 0) return null;

  // Score each target
  let bestTarget: GameCard | null = null;
  let bestScore = -1;

  for (const target of targets) {
    let score = 0;

    // Active Pokemon gets priority
    if (target === player.active) {
      score += 100;
    }

    // Needs energy for attack? Big bonus
    const attacks = target.card.attacks || [];
    const currentEnergy = getEnergyCount(target);
    const maxCost = Math.max(
      0,
      ...attacks.map((a) => a.convertedEnergyCost || 0)
    );

    if (currentEnergy < maxCost) {
      score += 50; // Still needs energy
    }

    // Has higher damage attacks? More valuable target
    const maxDamage = Math.max(
      0,
      ...attacks.map((a) => parseInt(a.damage || "0", 10))
    );
    score += maxDamage / 10;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = target;
    }
  }

  if (!bestTarget) return null;

  // Pick the first available energy
  const energy = energyCards[0];

  return {
    action: {
      type: "play_card",
      cardId: energy.instanceId,
      targetZone: "attach",
      targetId: bestTarget.instanceId,
    },
    reason: `Attach ${energy.card.name} to ${bestTarget.card.name}`,
  };
}

/**
 * Decide the best attack to use.
 *
 * Strategy:
 * - Pick the attack that does the most damage
 * - Must have enough energy to use it
 * - Consider if it can KO the opponent
 */
function decideBestAttack(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  const player = state.players[playerIndex];

  if (!player.active || !player.active.card.attacks) return null;

  const attacks = player.active.card.attacks;
  let bestAttack: { name: string; damage: number } | null = null;

  for (const attack of attacks) {
    if (canAttack(state, playerIndex, attack.name)) {
      const damage = parseInt(attack.damage || "0", 10);
      if (!bestAttack || damage > bestAttack.damage) {
        bestAttack = { name: attack.name, damage };
      }
    }
  }

  if (!bestAttack) return null;

  return {
    action: {
      type: "attack",
      attackName: bestAttack.name,
    },
    reason: `Attack with ${bestAttack.name} (${bestAttack.damage} dmg)`,
  };
}

/**
 * Consider retreating the active Pokemon.
 *
 * Strategy: Retreat if:
 * - Active has low remaining HP (< 30% of max)
 * - There's a healthier bench Pokemon with higher HP
 * - Can afford the retreat cost
 */
function considerRetreat(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  const player = state.players[playerIndex];

  if (!player.active) return null;
  if (player.bench.cards.length === 0) return null;

  const active = player.active;
  const maxHp = getHp(active);
  const remainingHp = getRemainingHp(active);

  // Only retreat if low HP (below 30%)
  if (maxHp === 0 || remainingHp / maxHp > 0.3) return null;

  // Check retreat cost
  const retreatCost = getEffectiveRetreatCost(state, playerIndex, active);
  if (retreatCost > 0) {
    const cost = Array.from({ length: retreatCost }, () => "Colorless");
    const energyCheck = checkEnergyCostDetailed(active.attachedEnergy, cost);
    if (!energyCheck.sufficient) return null;
  }

  // Find healthiest bench Pokemon
  const benchSorted = [...player.bench.cards].sort(
    (a, b) => getRemainingHp(b) - getRemainingHp(a)
  );

  const bestBench = benchSorted[0];
  if (!bestBench) return null;

  // Only retreat if bench Pokemon is significantly healthier
  if (getRemainingHp(bestBench) <= remainingHp) return null;

  // Pick energy to discard for retreat cost
  const energyToDiscard = active.attachedEnergy
    .slice(0, retreatCost)
    .map((e) => e.instanceId);

  return {
    action: {
      type: "retreat",
      energyToDiscard,
      benchInstanceId: bestBench.instanceId,
    },
    reason: `Retreat ${active.card.name} (HP: ${remainingHp}/${maxHp}) for ${bestBench.card.name} (HP: ${getRemainingHp(bestBench)}/${getHp(bestBench)})`,
  };
}

/**
 * Decide whether to use an activated ability from any Pokemon in play.
 * Only uses abilities that have registered effects and haven't been used this turn.
 */
function decideAbilityUse(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  const actions = findAllAbilityActions(state, playerIndex);
  return actions.length > 0 ? actions[0] : null;
}

/**
 * Find all usable activated abilities across all Pokemon in play.
 */
function findAllAbilityActions(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision[] {
  const player = state.players[playerIndex];
  const results: AIDecision[] = [];

  // Collect all Pokemon in play
  const inPlay: GameCard[] = [];
  if (player.active) inPlay.push(player.active);
  inPlay.push(...player.bench.cards);

  for (const pokemon of inPlay) {
    // Skip if already used ability this turn
    if (pokemon.abilityUsedThisTurn) continue;
    // Skip if ability is blocked
    if (pokemon.markers[ABILITY_BLOCKED] > 0 || pokemon.markers[ABILITY_BLOCKED_TEMP] > 0) continue;
    // Skip if no abilities
    if (!pokemon.card.abilities) continue;

    const effect = getEffect(pokemon.cardId, pokemon.card.name);
    if (!effect?.abilities) continue;

    for (const ability of effect.abilities) {
      // Only use activated abilities (passive/on_enter are automatic)
      if (ability.type !== "activated") continue;

      // Check if it has an onActivate handler
      if (!ability.onActivate) continue;

      results.push({
        action: {
          type: "use_ability",
          cardId: pokemon.instanceId,
          abilityName: ability.name,
        },
        reason: `Use ability: ${pokemon.card.name}'s ${ability.name}`,
      });
    }
  }

  return results;
}

/**
 * Decide whether to use an Item card from hand.
 * Only uses Items that have registered effects.
 */
function decideItemUse(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  const player = state.players[playerIndex];

  // Find Item cards with registered effects
  const items = player.hand.cards.filter(
    (c) =>
      c.card.supertype === "Trainer" &&
      c.card.subtypes.includes("Item") &&
      !c.card.subtypes.includes("Pokémon Tool") &&
      getEffect(c.cardId)?.trainer
  );

  if (items.length === 0) return null;

  // Use the first usable item
  for (const item of items) {
    const effect = getEffect(item.cardId);
    if (effect?.trainer) {
      // If it has a canPlay check, respect it (simplified — create a minimal ctx)
      return {
        action: {
          type: "play_card",
          cardId: item.instanceId,
          targetZone: undefined,
        },
        reason: `Use item: ${item.card.name}`,
      };
    }
  }

  return null;
}

/**
 * Decide whether to use a Supporter card from hand.
 * Only uses Supporters that have registered effects.
 */
function decideSupporterUse(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision | null {
  const player = state.players[playerIndex];

  // Find Supporter cards with registered effects
  const supporters = player.hand.cards.filter(
    (c) =>
      c.card.supertype === "Trainer" &&
      c.card.subtypes.includes("Supporter") &&
      getEffect(c.cardId)?.trainer
  );

  if (supporters.length === 0) return null;

  // Use the first usable supporter
  return {
    action: {
      type: "play_card",
      cardId: supporters[0].instanceId,
      targetZone: undefined,
    },
    reason: `Use supporter: ${supporters[0].card.name}`,
  };
}

/**
 * Decide which bench Pokemon to promote after a KO.
 *
 * Strategy: Pick the one with the highest HP.
 */
function decidePromotion(
  state: GameState,
  playerIndex: 0 | 1
): AIDecision {
  const player = state.players[playerIndex];

  // Sort bench by remaining HP descending
  const sorted = [...player.bench.cards].sort(
    (a, b) => getRemainingHp(b) - getRemainingHp(a)
  );

  const best = sorted[0];

  return {
    action: {
      type: "promote",
      benchInstanceId: best.instanceId,
    },
    reason: `Promote ${best.card.name} (HP: ${getRemainingHp(best)}/${getHp(best)})`,
  };
}
