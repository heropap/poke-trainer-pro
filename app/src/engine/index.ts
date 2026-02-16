export * from "./game-state";
export * from "./zones";
export * from "./battle-setup";
export * from "./battle-prepare";

// turn-actions and game-actions have overlapping exports (attachEnergy, canAttachEnergy).
// Import them directly from their specific modules:
//   import { ... } from "@/engine/turn-actions"   — uses getCurrentPlayer(), for local play
//   import { ... } from "@/engine/game-actions"    — takes playerIndex, for server/attack/KO

// Re-export non-conflicting items from game-actions (damage/KO system)
export {
  calculateWeakness,
  calculateResistance,
  calculateDamage,
  getPrizeCount,
  checkKnockout,
  takePrizes,
  checkWinCondition,
  promoteBenchPokemon,
  autoPromoteBench,
  concede,
  performAttack,
  canAttack,
  checkEnergyCost,
} from "./game-actions";

// Re-export non-conflicting items from turn-actions
export {
  getCurrentPlayer,
  getOpponent,
  canEvolve,
  evolvePokemon,
  canRetreat,
  retreat,
  canPlaySupporter,
  playSupporter,
  canPlayItem,
  playItem,
  canPlayBasicToBench,
  playBasicToBench,
  endTurn,
  drawCard,
} from "./turn-actions";
