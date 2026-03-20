/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Local Game Controller
 *
 * Connects the BattleBoard UI actions to the game engine for local play.
 * Routes all player actions (play card, attack, end turn, etc.)
 * through the appropriate engine functions and manages game flow.
 *
 * This controller handles:
 * - Turn flow: draw → main → attack → end turn → opponent draw → ...
 * - Action routing: play_card, attack, end_turn, evolve, retreat, concede
 * - Auto-draw at turn start
 * - Bench promotion after KO
 * - Game over detection
 */

import { GameState, GameCard, logEvent, GamePhase } from "./game-state";
import {
  getCurrentPlayer,
  getOpponent,
  endTurn as engineEndTurn,
  drawCard as engineDrawCard,
} from "./turn-actions";
import {
  attachEnergy as taAttachEnergy,
  evolvePokemon as taEvolvePokemon,
  evolvePokemonAsync as taEvolvePokemonAsync,
  retreat as taRetreat,
  playSupporter as taPlaySupporter,
  playItem as taPlayItem,
  playBasicToBench as taPlayBasicToBench,
  playStadium as taPlayStadium,
} from "./turn-actions";
import {
  playActive,
  playBench,
  attachEnergy as gaAttachEnergy,
  performAttack,
  promoteBenchPokemon,
  autoPromoteBench,
  concede,
  checkWinCondition,
} from "./game-actions";
import { getEffect } from "./effects/effect-registry";
import { createEffectContext, pendingPrompts } from "./effects/effect-context";
import { ABILITY_BLOCKED } from "./effects/markers";
import { resolveAttack } from "./systems/attack-system"; // New pipeline
import { executeManualOverride, ManualOverrideAction, ManualOverrideType } from "./manual-override";
import { basePipeline, validateActionWithMiddleware } from "./rules/base-rules";
import { ValidationResult } from "./interfaces/validation";

// ───────────────────────────────────────────────
// Action Types (from UI)
// ───────────────────────────────────────────────

export interface GameAction {
  type:
    | "play_card"
    | "attack"
    | "end_turn"
    | "evolve"
    | "retreat"
    | "promote"
    | "concede"
    | "use_ability"
    | "manual_override"
    | "select_cards_response";
  cardId?: string;
  targetZone?: "active" | "bench" | "attach";
  targetId?: string;
  attackName?: string;
  abilityName?: string;
  energyToDiscard?: string[];
  benchInstanceId?: string;
  /** Response for select_cards */
  selectedIds?: string[];
  /** Manual override fields (Layer 2) */
  overrideType?: ManualOverrideType;
  params?: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  gameEnded?: boolean;
  /** When true, the UI should prompt the defender to choose a bench Pokemon */
  promotionRequired?: boolean;
  /** Index of the player who needs to promote */
  promotionPlayerIndex?: 0 | 1;
  /** Updated game state after the action */
  newState: GameState;
}

// ───────────────────────────────────────────────
// Validator
// ───────────────────────────────────────────────

function validateAction(state: GameState, action: GameAction, playerIndex: 0 | 1): ValidationResult {
  // 1. God Mode Override
  if (state.activeOverrides.godMode) {
    return { valid: true };
  }

  // 2. Base Pipeline
  const middlewareResult = validateActionWithMiddleware(state, action, playerIndex);
  if (middlewareResult && !middlewareResult.valid) {
    return middlewareResult;
  }

  return basePipeline(state, action, playerIndex);
}

// ───────────────────────────────────────────────
// Game Controller
// ───────────────────────────────────────────────

/**
 * Process a player action and return the updated game state.
 *
 * This is the main entry point for all local game actions.
 * The state is mutated in place (engine functions mutate), but
 * we return a shallow clone to trigger React re-renders.
 *
 * @param state - Current game state (will be mutated)
 * @param playerIndex - Which player is performing the action (0 or 1)
 * @param action - The action to perform
 * @returns ActionResult with the updated state
 */
export function processAction(
  state: GameState,
  playerIndex: 0 | 1,
  action: GameAction
): Promise<ActionResult> {
  return (async () => {
    // ─── Phase 1: Validation Chain ───
    const validation = validateAction(state, action, playerIndex);
    if (!validation.valid) {
      console.warn(`[Action Blocked] ${action.type}: ${validation.reason} (${validation.code})`);
      return {
        success: false,
        error: validation.reason,
        newState: { ...state }
      };
    }

    let result: ActionResult;

    switch (action.type) {
      case "play_card":
        result = await handlePlayCard(state, playerIndex, action);
        break;
      case "attack":
        result = handleAttack(state, playerIndex, action);
        break;
      case "end_turn":
        result = handleEndTurn(state, playerIndex);
        break;
      case "evolve":
        result = await handleEvolve(state, playerIndex, action);
        break;
      case "retreat":
        result = handleRetreat(state, playerIndex, action);
        break;
      case "promote":
        result = handlePromote(state, playerIndex, action);
        break;
      case "concede":
        result = handleConcede(state, playerIndex);
        break;
      case "use_ability":
        result = await handleUseAbility(state, playerIndex, action);
        break;
      case "manual_override": {
        if (!action.overrideType) {
          result = { success: false, error: "缺少手动操作类型", newState: { ...state } };
        } else {
          const overrideAction: ManualOverrideAction = {
            type: "manual_override",
            overrideType: action.overrideType,
            params: action.params ?? {},
          };
          const overrideResult = executeManualOverride(state, playerIndex, overrideAction);
          result = { ...overrideResult, newState: overrideResult.newState };
        }
        break;
      }
      case "select_cards_response": {
        if (!state.prompt) {
          result = { success: false, error: "没有待处理的选择请求", newState: { ...state } };
        } else if (state.prompt.playerIndex !== playerIndex) {
          result = { success: false, error: "不是你的选择回合", newState: { ...state } };
        } else {
          const resolve = pendingPrompts.get(state.prompt.id);
          if (resolve) {
            resolve(action.selectedIds || []);
            pendingPrompts.delete(state.prompt.id);
            state.prompt = null;
            result = { success: true, newState: { ...state } };
          } else {
            state.prompt = null;
            result = { success: true, newState: { ...state } };
          }
        }
        break;
      }
      default:
        result = {
          success: false,
          error: `未知操作: ${(action as any).type}`,
          newState: { ...state }
        };
    }

    return result;
  })();
}

// ───────────────────────────────────────────────
// Action Handlers
// ───────────────────────────────────────────────

function handlePlayCard(
  state: GameState,
  playerIndex: 0 | 1,
  action: GameAction
): Promise<ActionResult> {
  return (async () => {
    if (!action.cardId) {
      return { success: false, error: "缺少卡牌 ID", newState: { ...state } };
    }

    if (state.phase !== GamePhase.MAIN) {
    return { success: false, error: "只能在主阶段打出卡牌", newState: { ...state } };
  }

    const player = state.players[playerIndex];
    const card = player.hand.cards.find(c => c.instanceId === action.cardId);
    if (!card) {
      return { success: false, error: "手牌中找不到该卡牌", newState: { ...state } };
    }

    // ─── Route by CARD TYPE first, then by targetZone ───
    // This ensures Pokemon Tools, Energy, etc. go to the correct handler
    // regardless of how the UI dispatched them.

    // 1. Pokemon cards
    if (card.card.supertype === "Pokémon") {
      if (card.card.subtypes.includes("Basic")) {
        if (action.targetZone === "active") {
          const res = playActive(state, playerIndex, action.cardId);
          return { ...res, newState: { ...state } };
        }
        if (action.targetZone === "bench") {
          const res = playBench(state, playerIndex, action.cardId);
          return { ...res, newState: { ...state } };
        }
        // Auto-detect: active if empty, otherwise bench
        if (!player.active) {
          const res = playActive(state, playerIndex, action.cardId);
          return { ...res, newState: { ...state } };
        } else {
          const res = playBench(state, playerIndex, action.cardId);
          return { ...res, newState: { ...state } };
        }
      }
      // Stage 1/2 evolution cards should use the "evolve" action type,
      // but handle gracefully if dispatched as "play_card"
      if (card.card.subtypes.includes("Stage 1") || card.card.subtypes.includes("Stage 2")) {
        if (action.targetId) {
          const res = await taEvolvePokemonAsync(state, action.cardId, action.targetId);
          return { success: res.success, error: res.error, newState: { ...state } };
        }
        return { success: false, error: "进化卡需要指定目标宝可梦", newState: { ...state } };
      }
    }

    // 2. Energy cards
    if (card.card.supertype === "Energy") {
      if (action.targetId) {
        const res = taAttachEnergy(state, action.cardId, action.targetId);
        return { ...res, newState: { ...state } };
      }
      // targetZone "attach" with targetId
      if (action.targetZone === "attach" && action.targetId) {
        const res = taAttachEnergy(state, action.cardId, action.targetId);
        return { ...res, newState: { ...state } };
      }
      return { success: false, error: "能量卡需要指定附加目标", newState: { ...state } };
    }

    // 3. Trainer cards
    if (card.card.supertype === "Trainer") {
      // 3a. Pokemon Tool — needs a target to attach to
      if (card.card.subtypes.includes("Pokémon Tool")) {
        if (!action.targetId) {
          return { success: false, error: "工具卡需要指定装备目标", newState: { ...state } };
        }
        const res = await taPlayItem(state, action.cardId, action.targetId);
        return { success: res.success, error: res.error, newState: { ...state } };
      }
      // 3b. Supporter
      if (card.card.subtypes.includes("Supporter")) {
        const res = await taPlaySupporter(state, action.cardId);
        return { success: res.success, error: res.error, newState: { ...state } };
      }
      // 3c. Item (non-Tool)
      if (card.card.subtypes.includes("Item")) {
        const res = await taPlayItem(state, action.cardId);
        return { success: res.success, error: res.error, newState: { ...state } };
      }
      // 3d. Stadium
      if (card.card.subtypes.includes("Stadium")) {
        const res = await taPlayStadium(state, action.cardId);
        return { success: res.success, error: res.error, newState: { ...state } };
      }
      // 3e. Other trainer types
      return { success: false, error: `不支持的训练师卡类型: ${card.card.subtypes.join(", ")}`, newState: { ...state } };
    }

    return { success: false, error: "无法确定如何打出该卡牌", newState: { ...state } };
  })();
}

function handleAttack(
  state: GameState,
  playerIndex: 0 | 1,
  action: GameAction
): ActionResult {
  if (!action.attackName) {
    return { success: false, error: "缺少攻击名称", newState: { ...state } };
  }

  if (state.phase !== GamePhase.MAIN) {
    return { success: false, error: "只能在主阶段攻击", newState: { ...state } };
  }

  const res = performAttack(state, playerIndex, action.attackName);

  if (!res.success) {
    return { success: false, error: res.error, newState: { ...state } };
  }

  if (res.gameEnded) {
    return { success: true, gameEnded: true, newState: { ...state } };
  }

  // After attack, check if opponent needs to promote
  const defenderIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
  const defender = state.players[defenderIndex];

  if (!defender.active && defender.bench.cards.length > 0) {
    // Defender needs to promote — but if only 1 bench, auto-promote
    if (defender.bench.cards.length === 1) {
      autoPromoteBench(state, defenderIndex);
    } else {
      // Multiple bench: signal UI that defender must choose promotion
      // Do NOT call endTurn here — it will be called in handlePromote
      // after the defender selects which Pokemon to promote.
      // This ensures between-turns status processing happens with
      // all Pokemon properly on the field.
      return {
        success: true,
        promotionRequired: true,
        promotionPlayerIndex: defenderIndex,
        newState: { ...state }
      };
    }
  }

  // End the attacker's turn (attack ends the turn in PTCG)
  const endRes = engineEndTurn(state);

  // Auto-draw for the new turn's player
  // Note: engineEndTurn mutates state.phase to "draw", but TS can't track this
  const phaseAfterEnd = state.phase as string;
  if (endRes.success && phaseAfterEnd === GamePhase.DRAW) {
    engineDrawCard(state);
    const phaseAfterDraw = state.phase as string;
    if (phaseAfterDraw === GamePhase.GAME_OVER) {
      return { success: true, gameEnded: true, newState: { ...state } };
    }
  }

  return { success: true, newState: { ...state } };
}

function handleEndTurn(
  state: GameState,
  playerIndex: 0 | 1
): ActionResult {
  if (state.phase !== GamePhase.MAIN) {
    return { success: false, error: "当前阶段不能结束回合", newState: { ...state } };
  }

  // End the turn
  const res = engineEndTurn(state);

  if (!res.success) {
    return { success: false, error: res.error, newState: { ...state } };
  }

  // Auto-draw for the new turn's player
  // Note: engineEndTurn mutates state.phase to "draw", but TS can't track this
  const phaseAfterEnd = state.phase as string;
  if (phaseAfterEnd === GamePhase.DRAW) {
    engineDrawCard(state);
    const phaseAfterDraw = state.phase as string;
    if (phaseAfterDraw === GamePhase.GAME_OVER) {
      return { success: true, gameEnded: true, newState: { ...state } };
    }
  }

  return { success: true, newState: { ...state } };
}

async function handleEvolve(
  state: GameState,
  playerIndex: 0 | 1,
  action: GameAction
): Promise<ActionResult> {
  if (!action.cardId || !action.targetId) {
    return { success: false, error: "缺少进化卡或目标 ID", newState: { ...state } };
  }

  const res = await taEvolvePokemonAsync(state, action.cardId, action.targetId);
  return { success: res.success, error: res.error, newState: { ...state } };
}

function handleRetreat(
  state: GameState,
  playerIndex: 0 | 1,
  action: GameAction
): ActionResult {
  if (!action.benchInstanceId) {
    return { success: false, error: "缺少替换目标", newState: { ...state } };
  }

  // PTCG Rule: Only one retreat per turn
  if (state.turnStatus.hasRetreated) {
    return { success: false, error: "本回合已经撤退过了", newState: { ...state } };
  }

  const energyToDiscard = action.energyToDiscard || [];
  const res = taRetreat(state, energyToDiscard, action.benchInstanceId);
  return { success: res.success, error: res.error, newState: { ...state } };
}

function handlePromote(
  state: GameState,
  playerIndex: 0 | 1,
  action: GameAction
): ActionResult {
  if (!action.benchInstanceId) {
    return { success: false, error: "缺少备战区宝可梦 ID", newState: { ...state } };
  }

  const player = state.players[playerIndex];

  // Verify this player actually needs to promote
  if (player.active) {
    return { success: false, error: "战斗区已有宝可梦", newState: { ...state } };
  }

  const res = promoteBenchPokemon(state, playerIndex, action.benchInstanceId);

  if (!res.success) {
    return { success: false, error: res.error, newState: { ...state } };
  }

  // If we're still in "main" phase, this promotion was triggered after a KO
  // during the opponent's attack. We need to end the attacker's turn now.
  const phaseAfterPromote = state.phase as string;
  if (phaseAfterPromote === GamePhase.MAIN) {
    // End the attacker's turn (between-turns processing happens here)
    const endRes = engineEndTurn(state);

    // Auto-draw for the new turn's player
    const phaseAfterEnd = state.phase as string;
    if (endRes.success && phaseAfterEnd === GamePhase.DRAW) {
      engineDrawCard(state);
      const phaseAfterDraw = state.phase as string;
      if (phaseAfterDraw === GamePhase.GAME_OVER) {
        return { success: true, gameEnded: true, newState: { ...state } };
      }
    }
  } else if (phaseAfterPromote === GamePhase.DRAW) {
    // Legacy path: already in draw phase, just draw
    engineDrawCard(state);
    const phaseAfterDraw = state.phase as string;
    if (phaseAfterDraw === GamePhase.GAME_OVER) {
      return { success: true, gameEnded: true, newState: { ...state } };
    }
  }

  return { success: true, newState: { ...state } };
}

function handleConcede(
  state: GameState,
  playerIndex: 0 | 1
): ActionResult {
  const res = concede(state, playerIndex);
  return {
    success: res.success,
    error: res.error,
    gameEnded: res.gameEnded,
    newState: { ...state }
  };
}

async function handleUseAbility(
  state: GameState,
  playerIndex: 0 | 1,
  action: GameAction
): Promise<ActionResult> {
  if (!action.cardId || !action.abilityName) {
    return { success: false, error: "缺少卡牌 ID 或特性名称", newState: { ...state } };
  }

  if (state.phase !== GamePhase.MAIN) {
    return { success: false, error: "只能在主阶段使用特性", newState: { ...state } };
  }

  const player = state.players[playerIndex];

  // Find the Pokemon with this ability (could be active or bench)
  let sourceCard: GameCard | null = null;
  if (player.active?.instanceId === action.cardId) {
    sourceCard = player.active;
  } else {
    sourceCard = player.bench.cards.find(c => c.instanceId === action.cardId) ?? null;
  }

  if (!sourceCard) {
    return { success: false, error: "场上找不到该宝可梦", newState: { ...state } };
  }

  // Check if the card has the named ability in its data
  const abilityData = sourceCard.card.abilities?.find(a => a.name === action.abilityName);
  if (!abilityData) {
    return { success: false, error: `${sourceCard.card.name} 没有名为 ${action.abilityName} 的特性`, newState: { ...state } };
  }

  // Check if there's a registered effect for this ability
  const cardEffect = getEffect(sourceCard.cardId, sourceCard.card.name);
  const abilityEffect = cardEffect?.abilities?.find(a => a.name === action.abilityName);

  if (!abilityEffect) {
    return { success: false, error: `${action.abilityName} 的效果尚未实现`, newState: { ...state } };
  }

  if (abilityEffect.type !== "activated") {
    return { success: false, error: `${action.abilityName} 不是主动使用的特性`, newState: { ...state } };
  }

  // Check if ability is blocked by a marker (e.g., Garbodor's Garbotoxin)
  if (sourceCard.markers[ABILITY_BLOCKED] > 0) {
    return { success: false, error: `${sourceCard.card.name} 的特性被封锁了`, newState: { ...state } };
  }

  // Check if already used this turn (for once-per-turn abilities)
  if (sourceCard.abilityUsedThisTurn) {
    return { success: false, error: `${action.abilityName} 本回合已经使用过了`, newState: { ...state } };
  }

  const ctx = createEffectContext(state, playerIndex, sourceCard);

  // Check activation condition
  if (abilityEffect.canActivate && !abilityEffect.canActivate(ctx)) {
    return { success: false, error: `${action.abilityName} 当前无法使用`, newState: { ...state } };
  }

  // Execute the ability
  logEvent(state, playerIndex, "use_ability",
    `${player.name} 使用了 ${sourceCard.card.name} 的特性: ${action.abilityName}`,
    { cardName: sourceCard.card.name, abilityName: action.abilityName }
  );

  if (abilityEffect.onActivate) {
    await abilityEffect.onActivate(ctx);
  }

  sourceCard.abilityUsedThisTurn = true;

  return { success: true, newState: { ...state } };
}

// ───────────────────────────────────────────────
// Helper: Start a new game's first turn
// ───────────────────────────────────────────────

/**
 * After game initialization (setup phase), start the first player's turn.
 * This handles the transition from "setup" → "draw" → "main".
 */
export function startFirstTurn(state: GameState): GameState {
  const currentPhase = state.phase as string;
  if (currentPhase === GamePhase.MAIN) {
    // Already in main phase
    return { ...state };
  }

  if (currentPhase === GamePhase.DRAW) {
    // In draw phase, perform the draw
    engineDrawCard(state);
    return { ...state };
  }

  // Transition to draw phase for the first player
  state.phase = GamePhase.DRAW;
  state.turn = 1;

  engineDrawCard(state);
  return { ...state };
}
