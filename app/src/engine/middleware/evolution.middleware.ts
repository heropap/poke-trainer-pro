/**
 * Evolution Middleware
 *
 * Refactored to follow Modern Engine Guidelines (TheCardGoat/tcg-engines).
 *
 * Core Principles:
 * 1. Effect-Driven: Intercepts EVOLVE_ACTION events before they become effects.
 * 2. Middleware Pattern: Rules are composable, prioritized pure functions.
 * 3. Stateless Logic: Validates (State + Event) -> Result without side effects.
 */

import { GameState, GameCard } from "../game-state";
import {
  MiddlewareRule,
  ActionEvent,
  RuleResult,
  ALLOW,
  deny,
  runMiddleware,
} from "./types";

// ───────────────────────────────────────────────
// Helpers: Pure State Lookups
// ───────────────────────────────────────────────

function findTargetPokemon(
  state: Readonly<GameState>,
  playerIndex: 0 | 1,
  instanceId: string
): GameCard | null {
  const player = state.players[playerIndex];
  if (player.active?.instanceId === instanceId) {
    return player.active;
  }
  return player.bench.cards.find((c) => c.instanceId === instanceId) ?? null;
}

function findCardInHand(
  state: Readonly<GameState>,
  playerIndex: 0 | 1,
  instanceId: string
): GameCard | null {
  return (
    state.players[playerIndex].hand.cards.find(
      (c) => c.instanceId === instanceId
    ) ?? null
  );
}

// ═══════════════════════════════════════════════
//  Game-Level Rules (Priority 0-9)
// ═══════════════════════════════════════════════

export const phaseGateRule: MiddlewareRule<"EVOLVE_ACTION"> = {
  name: "evolution:phase-gate",
  priority: 0,
  appliesTo: ["EVOLVE_ACTION"],
  validate: (state) => {
    if (state.phase !== "main") {
      return deny("只能在主阶段进化宝可梦", "PHASE_NOT_MAIN");
    }
    return ALLOW;
  },
};

export const firstTurnRule: MiddlewareRule<"EVOLVE_ACTION"> = {
  name: "evolution:first-turn-block",
  priority: 1,
  appliesTo: ["EVOLVE_ACTION"],
  validate: (state) => {
    if (state.isFirstTurn) {
      return deny("游戏第一回合不能进化宝可梦", "FIRST_TURN_BLOCK");
    }
    return ALLOW;
  },
};

// ═══════════════════════════════════════════════
//  Card-Level Rules (Priority 10-19)
// ═══════════════════════════════════════════════

export const cardValidityRule: MiddlewareRule<"EVOLVE_ACTION"> = {
  name: "evolution:card-validity",
  priority: 10,
  appliesTo: ["EVOLVE_ACTION"],
  validate: (state, event) => {
    const card = findCardInHand(state, event.playerIndex, event.payload.evolutionCardId);
    if (!card) return deny("手牌中找不到该进化卡", "CARD_NOT_IN_HAND");
    if (card.card.supertype !== "Pokémon") return deny("所选卡牌不是宝可梦卡", "NOT_POKEMON");
    
    const subtypes = card.card.subtypes;
    if (!subtypes.includes("Stage 1") && !subtypes.includes("Stage 2")) {
      return deny("所选卡牌不是进化卡", "NOT_EVOLUTION_CARD");
    }
    if (!card.card.evolvesFrom) {
      return deny("进化卡缺少进化来源信息", "MISSING_EVOLVES_FROM");
    }
    return ALLOW;
  },
};

export const evolutionChainRule: MiddlewareRule<"EVOLVE_ACTION"> = {
  name: "evolution:chain-match",
  priority: 11,
  appliesTo: ["EVOLVE_ACTION"],
  validate: (state, event) => {
    const evoCard = findCardInHand(state, event.playerIndex, event.payload.evolutionCardId);
    const target = findTargetPokemon(state, event.playerIndex, event.payload.targetPokemonId);

    if (!target) return deny("目标宝可梦不在场上", "TARGET_NOT_ON_FIELD");
    if (!evoCard?.card.evolvesFrom) return ALLOW; // Handled by validity rule

    if (target.card.name !== evoCard.card.evolvesFrom) {
      return deny(
        `${evoCard.card.name} 不能从 ${target.card.name} 进化（需要 ${evoCard.card.evolvesFrom}）`,
        "CHAIN_MISMATCH"
      );
    }
    return ALLOW;
  },
};

// ═══════════════════════════════════════════════
//  Turn-Level Rules (Priority 20-29)
// ═══════════════════════════════════════════════

/**
 * Rule: Already Evolved This Turn
 * Priority: 20
 *
 * "Modern Engine" Requirement:
 * Intercepts if the Pokemon has already emitted an EVOLVE effect in the current turn scope.
 */
export const alreadyEvolvedThisTurnRule: MiddlewareRule<"EVOLVE_ACTION"> = {
  name: "evolution:already-evolved-this-turn",
  priority: 20,
  appliesTo: ["EVOLVE_ACTION"],
  validate: (state, event) => {
    const target = findTargetPokemon(state, event.playerIndex, event.payload.targetPokemonId);
    if (!target) return ALLOW;

    if (target.evolvedThisTurn) {
      return deny("不能进化本回合已经进化过的宝可梦", "ALREADY_EVOLVED_THIS_TURN");
    }
    return ALLOW;
  },
};

/**
 * Rule: Same-Turn Entry Block (Summoning Sickness)
 * Priority: 21
 *
 * "Modern Engine" Requirement:
 * Intercepts if the Pokemon was played to field in the current turn scope.
 *
 * Priority Explanation:
 * Runs AFTER alreadyEvolvedThisTurn (20).
 * If a Pokemon evolved this turn, it effectively "entered play" as the new stage.
 * But we want to give the specific error "Already Evolved" rather than generic "Just Entered".
 */
export const sameEntryTurnRule: MiddlewareRule<"EVOLVE_ACTION"> = {
  name: "evolution:same-turn-entry-block",
  priority: 21,
  appliesTo: ["EVOLVE_ACTION"],
  validate: (state, event) => {
    const target = findTargetPokemon(state, event.playerIndex, event.payload.targetPokemonId);
    if (!target) return ALLOW;

    if (target.playedThisTurn) {
      return deny("不能进化本回合刚入场的宝可梦", "SAME_TURN_ENTRY");
    }
    return ALLOW;
  },
};

// ═══════════════════════════════════════════════
//  Pipeline Composition
// ═══════════════════════════════════════════════

export const EVOLUTION_RULES: ReadonlyArray<MiddlewareRule<"EVOLVE_ACTION">> = [
  phaseGateRule,
  firstTurnRule,
  cardValidityRule,
  evolutionChainRule,
  alreadyEvolvedThisTurnRule,
  sameEntryTurnRule,
];

export function validateEvolution(
  state: Readonly<GameState>,
  event: ActionEvent<"EVOLVE_ACTION">
): RuleResult {
  return runMiddleware(EVOLUTION_RULES, state, event);
}
