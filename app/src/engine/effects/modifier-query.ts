/**
 * V2 Modifier Query System
 *
 * Scans the field for active passive abilities that produce V2 modifier effects.
 * Used by the validation pipeline (base-rules.ts) and game actions to check
 * whether V2 modifiers like prevent_item_usage, extra_energy_attach, etc.
 * are currently in effect.
 *
 * This bridges the gap between V2 compiled abilities (which set modifyDamage,
 * modifyRetreatCost, etc.) and game-loop validation rules that were previously
 * hardcoded.
 */

import { GameState, GameCard } from "../game-state";
import { getEffect } from "./effect-registry";
import { createEffectContext } from "./effect-context";
import { ABILITY_BLOCKED } from "./markers";

// ───────────────────────────────────────────────
// Modifier Query Results
// ───────────────────────────────────────────────

export interface ActiveModifiers {
  /** Whether the current player can attach extra energy this turn */
  extraEnergyAttach: boolean;
  /** Number of extra energy attachments allowed (0 = normal 1/turn) */
  extraEnergyCount: number;
  /** Whether Item cards are blocked for the specified player */
  preventItemUsage: boolean;
  /** Whether Supporter cards are blocked for the specified player */
  preventSupporterUsage: boolean;
  /** Whether abilities are globally blocked (e.g., Garbotoxin) */
  preventAbility: boolean;
  /** Whether evolution is blocked for the specified player */
  preventEvolution: boolean;
  /** Whether status conditions are blocked for a target */
  preventStatus: boolean;
  /** Whether energy removal is blocked on a target */
  preventEnergyRemoval: boolean;
  /** Whether attacks are blocked for the target player (V2 prevent_attack) */
  preventAttack: boolean;
  /** Whether retreat is blocked for the target player (V2 prevent_retreat) */
  preventRetreat: boolean;
  /** Accumulated retreat cost modification (negative = reduction) */
  modifyRetreatCost: number;
  /** Accumulated HP modification */
  modifyHp: number;
}

const DEFAULT_MODIFIERS: ActiveModifiers = {
  extraEnergyAttach: false,
  extraEnergyCount: 0,
  preventItemUsage: false,
  preventSupporterUsage: false,
  preventAbility: false,
  preventEvolution: false,
  preventStatus: false,
  preventEnergyRemoval: false,
  preventAttack: false,
  preventRetreat: false,
  modifyRetreatCost: 0,
  modifyHp: 0,
};

// ───────────────────────────────────────────────
// Query Functions
// ───────────────────────────────────────────────

/**
 * Scan the field for all active modifiers affecting a player.
 * Checks both players' Pokemon for passive abilities with modifier effects.
 */
export function queryActiveModifiers(
  state: GameState,
  targetPlayerIndex: 0 | 1
): ActiveModifiers {
  const result = { ...DEFAULT_MODIFIERS };

  // Scan ALL Pokemon on the field (both players)
  for (let pi = 0; pi < 2; pi++) {
    const player = state.players[pi as 0 | 1];
    const allPokemon: GameCard[] = [];
    if (player.active) allPokemon.push(player.active);
    allPokemon.push(...player.bench.cards);

    for (const pokemon of allPokemon) {
      // Skip if ability is blocked on this Pokemon
      if (pokemon.markers[ABILITY_BLOCKED] > 0) continue;

      const effect = getEffect(pokemon.cardId, pokemon.card.name);
      if (!effect?.abilities) continue;

      for (const ability of effect.abilities) {
        if (ability.type !== "passive") continue;

        // Check for custom modifier flags via the ability's metadata
        // These are set by compileModifierIntoAbility in rule-compiler-v2.ts
        const abilityAny = ability as any;

        // extra_energy_attach: allows the target player to attach more energy
        if (abilityAny._modifierType === "extra_energy_attach" && pi === targetPlayerIndex) {
          result.extraEnergyAttach = true;
          result.extraEnergyCount += (abilityAny._modifierValue || 1);
        }

        // prevent_item_usage: blocks items for the target player
        if (abilityAny._modifierType === "prevent_item_usage") {
          // Check if this modifier targets the specified player
          const affectsOpponent = pi !== targetPlayerIndex;
          if (affectsOpponent || abilityAny._modifierTarget === "self") {
            result.preventItemUsage = true;
          }
        }

        // prevent_supporter_usage: blocks supporters for the target player
        if (abilityAny._modifierType === "prevent_supporter_usage") {
          const affectsOpponent = pi !== targetPlayerIndex;
          if (affectsOpponent || abilityAny._modifierTarget === "self") {
            result.preventSupporterUsage = true;
          }
        }

        // prevent_ability: global ability lock (e.g., Garbotoxin)
        if (abilityAny._modifierType === "prevent_ability") {
          result.preventAbility = true;
        }

        // prevent_evolution: blocks evolution for target player
        if (abilityAny._modifierType === "prevent_evolution") {
          const affectsOpponent = pi !== targetPlayerIndex;
          if (affectsOpponent) {
            result.preventEvolution = true;
          }
        }

        // prevent_status: blocks status conditions
        if (abilityAny._modifierType === "prevent_status") {
          if (pi === targetPlayerIndex) {
            result.preventStatus = true;
          }
        }

        // prevent_energy_removal: blocks energy discard effects
        if (abilityAny._modifierType === "prevent_energy_removal") {
          if (pi === targetPlayerIndex) {
            result.preventEnergyRemoval = true;
          }
        }

        // prevent_attack: blocks attacks for the target player
        if (abilityAny._modifierType === "prevent_attack") {
          const affectsOpponent = pi !== targetPlayerIndex;
          if (affectsOpponent) {
            result.preventAttack = true;
          }
        }

        // prevent_retreat: blocks retreat for the target player
        if (abilityAny._modifierType === "prevent_retreat") {
          const affectsOpponent = pi !== targetPlayerIndex;
          if (affectsOpponent) {
            result.preventRetreat = true;
          }
        }

        // modify_retreat_cost: reduce/increase retreat cost
        if (abilityAny._modifierType === "modify_retreat_cost") {
          if (pi === targetPlayerIndex) {
            result.modifyRetreatCost += (abilityAny._modifierValue || 0);
          }
        }

        // modify_hp: increase/decrease max HP
        if (abilityAny._modifierType === "modify_hp") {
          if (pi === targetPlayerIndex) {
            result.modifyHp += (abilityAny._modifierValue || 0);
          }
        }
      }
    }
  }

  // Also check stadium effects for modifier-like behaviors
  if (state.stadium) {
    const stadiumEffect = getEffect(state.stadium.card.cardId, state.stadium.card.card.name);
    // Stadium modifier detection can be extended here
  }

  return result;
}

/**
 * Check if a specific Pokemon is immune to status conditions.
 * Checks the Pokemon's own abilities and attached tools.
 */
export function isStatusImmune(
  state: GameState,
  pokemon: GameCard,
  playerIndex: 0 | 1
): boolean {
  if (pokemon.markers[ABILITY_BLOCKED] > 0) return false;

  const effect = getEffect(pokemon.cardId, pokemon.card.name);
  if (effect?.abilities) {
    for (const ability of effect.abilities) {
      if (ability.type === "passive") {
        const abilityAny = ability as any;
        if (abilityAny._modifierType === "prevent_status") {
          return true;
        }
      }
    }
  }

  // Check tools
  for (const tool of pokemon.attachedTools) {
    const toolEffect = getEffect(tool.cardId, tool.card.name);
    if ((toolEffect?.tool as any)?._preventStatus) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a specific Pokemon's energy cannot be discarded by effects.
 */
export function isEnergyRemovalBlocked(
  state: GameState,
  pokemon: GameCard,
  playerIndex: 0 | 1
): boolean {
  if (pokemon.markers[ABILITY_BLOCKED] > 0) return false;

  const effect = getEffect(pokemon.cardId, pokemon.card.name);
  if (effect?.abilities) {
    for (const ability of effect.abilities) {
      if (ability.type === "passive") {
        const abilityAny = ability as any;
        if (abilityAny._modifierType === "prevent_energy_removal") {
          return true;
        }
      }
    }
  }

  return false;
}
