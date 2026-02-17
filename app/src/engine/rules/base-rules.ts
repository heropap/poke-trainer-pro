
import { RuleValidator } from "../interfaces/validation";
import { GameState } from "../game-state";
import { GameAction } from "../game-controller";
import { checkEnergyCostDetailed } from "../game-actions";

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
