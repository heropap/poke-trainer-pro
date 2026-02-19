
import { RuleValidator, ValidationResult } from "../interfaces/validation";
import { GameState } from "../game-state";
import { GameAction } from "../game-controller";
import { checkEnergyCostDetailed } from "../game-actions";
import { ActionEvent, EffectActionType, MiddlewareRule, deny, runMiddleware } from "../middleware/types";
import { CANT_ATTACK_NEXT_TURN, cantUseAttackMarker } from "../effects/markers";

// ───────────────────────────────────────────────
// Meta Rules
// ───────────────────────────────────────────────

export const checkTurnOwnership: RuleValidator = (state, action, playerIndex) => {
  const allowedAnytime = ["concede", "promote", "manual_override", "select_cards_response"];
  if (allowedAnytime.includes(action.type)) return { valid: true };

  if (state.currentPlayer !== playerIndex) {
    return { valid: false, reason: "不是你的回合", code: "NOT_YOUR_TURN" };
  }
  return { valid: true };
};

export const checkGameOver: RuleValidator = (state) => {
  if (state.phase === "game_over") {
    return { valid: false, reason: "游戏已结束", code: "GAME_OVER" };
  }
  return { valid: true };
};

export const checkGodMode: RuleValidator = (state, action) => {
  if (state.activeOverrides.godMode) return { valid: true };
  if (action.type === "manual_override") return { valid: true };
  return { valid: true }; // Continue pipeline
};

// ───────────────────────────────────────────────
// Phase Rules
// ───────────────────────────────────────────────

export const checkPhase: RuleValidator = (state, action) => {
  // Actions allowed only in MAIN phase
  const mainPhaseActions = ["play_card", "use_ability", "retreat", "evolve"];

  if (mainPhaseActions.includes(action.type)) {
    const normalizedPhase = String(state.phase).toLowerCase();
    if (normalizedPhase !== "main") {
      return { valid: false, reason: "只能在主阶段进行此操作", code: "PHASE_ERROR" };
    }
    // PTCG Rule: Attack is turn-ending — no more main-phase actions after attacking
    if (state.turnStatus.hasAttackedThisTurn) {
      return { valid: false, reason: "攻击后回合结束，不能再进行操作", code: "ATTACK_ENDS_TURN" };
    }
  }

  // Attack ends main phase / enters attack phase
  if (action.type === "attack") {
    const normalizedPhase = String(state.phase).toLowerCase();
    if (normalizedPhase !== "main") {
       return { valid: false, reason: "只能在主阶段攻击", code: "PHASE_ERROR" };
    }
  }

  return { valid: true };
};

// ───────────────────────────────────────────────
// Hard Rules (Golden Loop)
// ───────────────────────────────────────────────

export const checkHardRules: RuleValidator = (state, action, playerIndex) => {
  const turnStatus = state.turnStatus;
  if (!turnStatus) return { valid: true }; // Should not happen

  // 1. Retreat Limit
  if (action.type === "retreat") {
    if (turnStatus.retreated) {
      return { valid: false, reason: "每回合只能撤退一次", code: "RETREAT_LIMIT" };
    }
    // Status Check
    const active = state.players[playerIndex].active;
    if (active?.statusConditions.includes("asleep") || active?.statusConditions.includes("paralyzed")) {
       return { valid: false, reason: "睡眠或麻痹状态不能撤退", code: "STATUS_BLOCK" };
    }
  }

  // 2. Attack Rules
  if (action.type === "attack") {
    // Attack is a turn-ending action — can only attack once per turn
    if (turnStatus.hasAttackedThisTurn) {
      return { valid: false, reason: "每回合只能攻击一次", code: "ATTACK_LIMIT" };
    }
    // First Turn Rule
    if (state.turn === 1 && state.isFirstTurn) {
      // Check for specific override (e.g. going second player can attack, but here checking first player)
      // Usually "First player's first turn cannot attack".
      if (!state.activeOverrides.godMode) {
         return { valid: false, reason: "先攻第一回合不能攻击", code: "FIRST_TURN_ATTACK" };
      }
    }
    // Status Check
    const active = state.players[playerIndex].active;
    if (active?.statusConditions.includes("asleep") || active?.statusConditions.includes("paralyzed")) {
       return { valid: false, reason: "睡眠或麻痹状态不能攻击", code: "STATUS_BLOCK" };
    }
  }

  // 3. Play Card Limits (Supporter / Energy)
  if (action.type === "play_card" && action.cardId) {
    const player = state.players[playerIndex];
    const card = player.hand.cards.find(c => c.instanceId === action.cardId);
    
    if (card) {
      // Supporter Check
      if (card.card.supertype === "Trainer" && card.card.subtypes.includes("Supporter")) {
        if (turnStatus.supporterUsed) {
          // Check overrides?
          return { valid: false, reason: "每回合只能使用一张支持者", code: "SUPPORTER_LIMIT" };
        }
        // First Turn Rule for Supporter (First player cannot use)
        if (state.turn === 1 && state.isFirstTurn) {
           return { valid: false, reason: "先攻第一回合不能使用支持者", code: "FIRST_TURN_SUPPORTER" };
        }
      }

      // Energy Check
      if (card.card.supertype === "Energy") {
        if (turnStatus.energyAttached) {
           return { valid: false, reason: "每回合只能附加一次能量", code: "ENERGY_LIMIT" };
        }
      }
    }
  }

  return { valid: true };
};

export const checkAttackEnergyCost: RuleValidator = (
  state,
  action,
  playerIndex
) => {
  if (action.type !== "attack") return { valid: true };

  const player = state.players[playerIndex];
  const active = player.active;
  if (!active) {
    return { valid: false, reason: "没有战斗宝可梦", code: "NO_ACTIVE" };
  }

  if (!action.attackName) {
    return { valid: false, reason: "缺少攻击名称", code: "NO_ATTACK_NAME" };
  }

  const attack = active.card.attacks?.find((a) => a.name === action.attackName);
  if (!attack) {
    return { valid: false, reason: "找不到攻击", code: "ATTACK_NOT_FOUND" };
  }

  const energyCheck = checkEnergyCostDetailed(
    active.attachedEnergy,
    attack.cost
  );

  if (!energyCheck.sufficient) {
    return {
      valid: false,
      reason: `能量不足: 缺少 ${energyCheck.missing.join(", ")}`,
      code: "ENERGY_COST",
    };
  }

  return { valid: true };
};

// ───────────────────────────────────────────────
// Combined Pipeline
// ───────────────────────────────────────────────

import { combineValidators } from "../interfaces/validation";

export const basePipeline = combineValidators([
  checkGameOver,
  checkTurnOwnership,
  checkPhase,
  checkHardRules,
  checkAttackEnergyCost
]);

const middlewareActionTypes: EffectActionType[] = [
  "EVOLVE_ACTION",
  "ATTACH_ENERGY_ACTION",
  "RETREAT_ACTION",
  "PLAY_SUPPORTER_ACTION",
  "PLAY_ITEM_ACTION",
  "PLAY_BASIC_ACTION",
  "ATTACK_ACTION",
  "END_TURN_ACTION",
];

const actionRules: MiddlewareRule[] = [
  {
    name: "game:over",
    priority: -1,
    appliesTo: middlewareActionTypes,
    validate: (state) => {
      if (state.phase === "game_over") {
        return deny("游戏已结束", "GAME_OVER");
      }
      return { allowed: true };
    },
  },
  {
    name: "turn:ownership",
    priority: 0,
    appliesTo: middlewareActionTypes,
    validate: (state, event) => {
      if (state.currentPlayer !== event.playerIndex) {
        return deny("不是你的回合", "NOT_YOUR_TURN");
      }
      return { allowed: true };
    },
  },
  {
    name: "phase:main-only",
    priority: 5,
    appliesTo: [
      "EVOLVE_ACTION",
      "ATTACH_ENERGY_ACTION",
      "RETREAT_ACTION",
      "PLAY_SUPPORTER_ACTION",
      "PLAY_ITEM_ACTION",
      "PLAY_BASIC_ACTION",
      "ATTACK_ACTION",
    ],
    validate: (state) => {
      const normalized = String(state.phase).toLowerCase();
      if (normalized !== "main") {
        return deny("只能在主阶段进行此操作", "PHASE_ERROR");
      }
      if (state.turnStatus.hasAttackedThisTurn) {
        return deny("攻击后回合结束，不能再进行操作", "ATTACK_ENDS_TURN");
      }
      return { allowed: true };
    },
  },
  {
    name: "phase:end-turn",
    priority: 6,
    appliesTo: ["END_TURN_ACTION"],
    validate: (state) => {
      const normalized = String(state.phase).toLowerCase();
      if (normalized !== "main" && normalized !== "attack") {
        return deny("当前阶段不能结束回合", "PHASE_ERROR");
      }
      return { allowed: true };
    },
  },
  {
    name: "turn:limits",
    priority: 10,
    appliesTo: [
      "ATTACH_ENERGY_ACTION",
      "PLAY_SUPPORTER_ACTION",
      "RETREAT_ACTION",
      "ATTACK_ACTION",
    ],
    validate: (state, event) => {
      if (event.type === "ATTACH_ENERGY_ACTION" && state.turnStatus.energyAttached) {
        return deny("每回合只能附加一次能量", "ENERGY_LIMIT");
      }
      if (event.type === "PLAY_SUPPORTER_ACTION" && state.turnStatus.supporterUsed) {
        return deny("每回合只能使用一张支持者", "SUPPORTER_LIMIT");
      }
      if (event.type === "RETREAT_ACTION" && state.turnStatus.retreated) {
        return deny("每回合只能撤退一次", "RETREAT_LIMIT");
      }
      if (event.type === "ATTACK_ACTION" && state.turnStatus.hasAttackedThisTurn) {
        return deny("每回合只能攻击一次", "ATTACK_LIMIT");
      }
      return { allowed: true };
    },
  },
  {
    name: "turn:first-turn",
    priority: 12,
    appliesTo: ["ATTACK_ACTION", "PLAY_SUPPORTER_ACTION"],
    validate: (state, event) => {
      if (state.turn === 1 && state.isFirstTurn) {
        if (event.type === "ATTACK_ACTION") {
          return deny("先攻第一回合不能攻击", "FIRST_TURN_ATTACK");
        }
        if (event.type === "PLAY_SUPPORTER_ACTION") {
          return deny("先攻第一回合不能使用支持者", "FIRST_TURN_SUPPORTER");
        }
      }
      return { allowed: true };
    },
  },
  {
    name: "status:attack-retreat",
    priority: 20,
    appliesTo: ["ATTACK_ACTION", "RETREAT_ACTION"],
    validate: (state, event) => {
      const player = state.players[event.playerIndex];
      const active = player.active;
      if (!active) {
        return deny("没有战斗宝可梦", "NO_ACTIVE");
      }
      if (active.statusConditions.includes("asleep") || active.statusConditions.includes("paralyzed")) {
        if (event.type === "ATTACK_ACTION") {
          return deny("睡眠或麻痹状态不能攻击", "STATUS_BLOCK");
        }
        return deny("睡眠或麻痹状态不能撤退", "STATUS_BLOCK");
      }
      return { allowed: true };
    },
  },
  {
    name: "attack:energy-cost",
    priority: 30,
    appliesTo: ["ATTACK_ACTION"],
    validate: (state, event) => {
      const player = state.players[event.playerIndex];
      const active = player.active;
      if (!active) {
        return deny("没有战斗宝可梦", "NO_ACTIVE");
      }
      const attackName = (event as ActionEvent<"ATTACK_ACTION">).payload.attackName;
      const attack = active.card.attacks?.find((a) => a.name === attackName);
      if (!attack) {
        return deny("找不到攻击", "ATTACK_NOT_FOUND");
      }
      const energyCheck = checkEnergyCostDetailed(active.attachedEnergy, attack.cost);
      if (!energyCheck.sufficient) {
        return deny(`能量不足: 缺少 ${energyCheck.missing.join(", ")}`, "ENERGY_COST");
      }
      return { allowed: true };
    },
  },
  {
    name: "attack:markers",
    priority: 35,
    appliesTo: ["ATTACK_ACTION"],
    validate: (state, event) => {
      const player = state.players[event.playerIndex];
      const active = player.active;
      if (!active) {
        return deny("没有战斗宝可梦", "NO_ACTIVE");
      }
      const attackName = (event as ActionEvent<"ATTACK_ACTION">).payload.attackName;
      if (active.markers[CANT_ATTACK_NEXT_TURN] > 0) {
        return deny("该宝可梦本回合无法攻击", "CANT_ATTACK");
      }
      if (active.markers[cantUseAttackMarker(attackName)] > 0) {
        return deny("该攻击本回合无法使用", "CANT_USE_ATTACK");
      }
      return { allowed: true };
    },
  },
];

function toMiddlewareEvent(
  state: GameState,
  action: GameAction,
  playerIndex: 0 | 1
): ActionEvent<EffectActionType> | null {
  switch (action.type) {
    case "evolve": {
      if (!action.cardId || !action.targetId) return null;
      return {
        type: "EVOLVE_ACTION",
        playerIndex,
        payload: {
          evolutionCardId: action.cardId,
          targetPokemonId: action.targetId,
        },
      };
    }
    case "retreat": {
      if (!action.benchInstanceId) return null;
      return {
        type: "RETREAT_ACTION",
        playerIndex,
        payload: {
          energyToDiscard: action.energyToDiscard || [],
          benchTargetId: action.benchInstanceId,
        },
      };
    }
    case "attack": {
      if (!action.attackName) return null;
      return {
        type: "ATTACK_ACTION",
        playerIndex,
        payload: { attackName: action.attackName },
      };
    }
    case "end_turn": {
      return {
        type: "END_TURN_ACTION",
        playerIndex,
        payload: {},
      };
    }
    case "play_card": {
      if (!action.cardId) return null;
      const player = state.players[playerIndex];
      const card = player.hand.cards.find((c) => c.instanceId === action.cardId);
      if (!card) return null;
      if (card.card.supertype === "Energy") {
        if (!action.targetId) return null;
        return {
          type: "ATTACH_ENERGY_ACTION",
          playerIndex,
          payload: {
            energyCardId: action.cardId,
            targetPokemonId: action.targetId,
          },
        };
      }
      if (card.card.supertype === "Trainer") {
        if (card.card.subtypes.includes("Supporter")) {
          return {
            type: "PLAY_SUPPORTER_ACTION",
            playerIndex,
            payload: { cardId: action.cardId },
          };
        }
        if (card.card.subtypes.includes("Item")) {
          return {
            type: "PLAY_ITEM_ACTION",
            playerIndex,
            payload: { cardId: action.cardId, targetId: action.targetId },
          };
        }
      }
      if (card.card.supertype === "Pokémon" && card.card.subtypes.includes("Basic")) {
        return {
          type: "PLAY_BASIC_ACTION",
          playerIndex,
          payload: { cardId: action.cardId },
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export function validateActionWithMiddleware(
  state: GameState,
  action: GameAction,
  playerIndex: 0 | 1
): ValidationResult | null {
  const event = toMiddlewareEvent(state, action, playerIndex);
  if (!event) return null;
  const result = runMiddleware(actionRules, state, event);
  if (result.allowed) return { valid: true };
  return { valid: false, reason: result.reason, code: result.rule };
}
