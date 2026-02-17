
import { GameState, GameCard, logEvent } from "../game-state";
import { checkKnockout, takePrizes, checkWinCondition } from "../game-actions";

interface AttackContext {
  state: GameState;
  attacker: GameCard;
  defender: GameCard;
  attackName: string;
  damage: number;
  weaknessApplied: boolean;
  resistanceApplied: boolean;
}

/**
 * Atomic Attack Processing Pipeline
 */
export function resolveAttack(
  state: GameState,
  attackerIndex: 0 | 1,
  attackName: string
): { success: boolean; error?: string; gameEnded?: boolean } {
  
  const attackerPlayer = state.players[attackerIndex];
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const defenderPlayer = state.players[defenderIndex];
  
  const attacker = attackerPlayer.active;
  const defender = defenderPlayer.active;

  if (!attacker || !defender) {
    return { success: false, error: "双方必须有战斗宝可梦" };
  }

  const attack = attacker.card.attacks?.find(a => a.name === attackName);
  if (!attack) {
    return { success: false, error: "找不到攻击" };
  }

  // 1. Initialize Context
  const ctx: AttackContext = {
    state,
    attacker,
    defender,
    attackName,
    damage: parseInt(attack.damage || "0", 10),
    weaknessApplied: false,
    resistanceApplied: false
  };

  // 2. Pipeline Execution
  applyWeaknessAndResistance(ctx);
  applyEffects(ctx); // Tools, Abilities, Status
  applyDamage(ctx, attackerIndex);

  // 3. Post-Attack Checks (Event Trigger)
  // Check KO
  if (checkKnockout(state, defenderIndex, "active")) {
    // Take Prizes
    // TODO: Determine prize count based on rule box (ex = 2, V = 2, etc.)
    const prizesToTake = 1; 
    takePrizes(state, attackerIndex, prizesToTake);

    // Check Win
    if (checkWinCondition(state)) {
      return { success: true, gameEnded: true };
    }
  }

  return { success: true };
}

// ───────────────────────────────────────────────
// Pipeline Steps
// ───────────────────────────────────────────────

function applyWeaknessAndResistance(ctx: AttackContext) {
  if (ctx.damage === 0) return;

  const { attacker, defender } = ctx;
  const attackerType = attacker.card.types?.[0]; // Simplified: Primary type

  if (!attackerType) return;

  // Weakness (x2)
  if (defender.card.weaknesses?.some(w => w.type === attackerType)) {
    ctx.damage *= 2;
    ctx.weaknessApplied = true;
  }

  // Resistance (-30)
  if (defender.card.resistances?.some(r => r.type === attackerType)) {
    ctx.damage -= 30;
    if (ctx.damage < 0) ctx.damage = 0;
    ctx.resistanceApplied = true;
  }
}

function applyEffects(ctx: AttackContext) {
  // TODO: Apply tool effects, status conditions, etc.
  // e.g. Choice Belt (+30 vs V)
  // This would use the EffectRegistry
}

function applyDamage(ctx: AttackContext, attackerIndex: 0 | 1) {
  if (ctx.damage > 0) {
    ctx.defender.damageCounters += ctx.damage / 10;
    
    let msg = `${ctx.attacker.card.name} 使用 ${ctx.attackName} 对 ${ctx.defender.card.name} 造成 ${ctx.damage} 点伤害`;
    if (ctx.weaknessApplied) msg += " (弱点 x2)";
    if (ctx.resistanceApplied) msg += " (抗性 -30)";
    
    logEvent(ctx.state, attackerIndex, "damage", msg, { damage: ctx.damage });
  } else {
    logEvent(ctx.state, attackerIndex, "attack", `${ctx.attacker.card.name} 使用了 ${ctx.attackName}`);
  }
}
