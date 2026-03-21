
import { GameState, GameCard, logEvent } from "../game-state";
import { checkKnockout, takePrizes, checkWinCondition, getPrizeCount } from "../game-actions";
import { getEffect } from "../effects/effect-registry";
import { createEffectContext } from "../effects/effect-context";
import { ABILITY_BLOCKED, PREVENT_ALL_DAMAGE_NEXT_TURN } from "../effects/markers";

interface AttackContext {
  state: GameState;
  attacker: GameCard;
  defender: GameCard;
  attackerIndex: 0 | 1;
  defenderIndex: 0 | 1;
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
    attackerIndex,
    defenderIndex,
    attackName,
    damage: parseInt(attack.damage || "0", 10),
    weaknessApplied: false,
    resistanceApplied: false
  };

  // 2. Pipeline Execution
  applyWeaknessAndResistance(ctx);
  applyPassiveAbilities(ctx);  // Passive ability modifiers
  applyEffects(ctx);           // Tools, Status, etc.
  applyDamage(ctx, attackerIndex);

  // 3. Post-Attack Checks (Event Trigger)
  // Check KO
  if (checkKnockout(state, defenderIndex, "active")) {
    // Take Prizes based on rule box (ex = 2, V = 2, VMAX = 3, etc.)
    const prizesToTake = getPrizeCount(ctx.defender);
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

/**
 * Apply passive ability modifiers from all Pokemon in play.
 *
 * Scans both players' active + bench for passive abilities that modify damage:
 * - modifyDamage: modify damage when this Pokemon is attacking or defending
 * - modifyIncomingDamage: modify damage received by this Pokemon
 * - preventBenchDamage: prevent bench damage to this Pokemon
 */
function applyPassiveAbilities(ctx: AttackContext) {
  if (ctx.damage === 0) return;

  const { state, attacker, defender, attackerIndex, defenderIndex } = ctx;

  // Collect all Pokemon in play for both sides
  const allPokemonByPlayer: [GameCard[], GameCard[]] = [[], []];
  for (let pi = 0; pi < 2; pi++) {
    const p = state.players[pi];
    if (p.active) allPokemonByPlayer[pi].push(p.active);
    allPokemonByPlayer[pi].push(...p.bench.cards);
  }

  // Check attacker's passive abilities: modifyDamage (isAttacker = true)
  for (const pokemon of allPokemonByPlayer[attackerIndex]) {
    if (pokemon.markers[ABILITY_BLOCKED] > 0) continue;
    const effect = getEffect(pokemon.cardId, pokemon.card.name);
    if (!effect?.abilities) continue;

    for (const ability of effect.abilities) {
      if (ability.type !== "passive") continue;

      // Attacker's side: modifyDamage for the attacking Pokemon
      if (ability.modifyDamage && pokemon.instanceId === attacker.instanceId) {
        const ectx = createEffectContext(state, attackerIndex, pokemon);
        const newDamage = ability.modifyDamage(ectx, ctx.damage, true);
        if (newDamage !== ctx.damage) {
          logEvent(state, attackerIndex, "ability",
            `${pokemon.card.name} 的特性 ${ability.name} 修改了伤害 (${ctx.damage} → ${newDamage})`);
          ctx.damage = newDamage;
        }
      }
    }
  }

  // Check defender's passive abilities: modifyDamage (isAttacker = false) + modifyIncomingDamage
  for (const pokemon of allPokemonByPlayer[defenderIndex]) {
    if (pokemon.markers[ABILITY_BLOCKED] > 0) continue;
    const effect = getEffect(pokemon.cardId, pokemon.card.name);
    if (!effect?.abilities) continue;

    for (const ability of effect.abilities) {
      if (ability.type !== "passive") continue;

      // Defender's side: modifyDamage for the defending Pokemon
      if (ability.modifyDamage && pokemon.instanceId === defender.instanceId) {
        const ectx = createEffectContext(state, defenderIndex, pokemon);
        const newDamage = ability.modifyDamage(ectx, ctx.damage, false);
        if (newDamage !== ctx.damage) {
          logEvent(state, defenderIndex, "ability",
            `${pokemon.card.name} 的特性 ${ability.name} 修改了伤害 (${ctx.damage} → ${newDamage})`);
          ctx.damage = newDamage;
        }
      }

      // Defender's modifyIncomingDamage
      if (ability.modifyIncomingDamage && pokemon.instanceId === defender.instanceId) {
        const ectx = createEffectContext(state, defenderIndex, pokemon);
        const newDamage = ability.modifyIncomingDamage(ectx, ctx.damage);
        if (newDamage !== ctx.damage) {
          logEvent(state, defenderIndex, "ability",
            `${pokemon.card.name} 的特性 ${ability.name} 减少了受到的伤害 (${ctx.damage} → ${newDamage})`);
          ctx.damage = newDamage;
        }
      }
    }
  }

  // Ensure damage doesn't go below 0
  if (ctx.damage < 0) ctx.damage = 0;
}

function applyEffects(ctx: AttackContext) {
  // Check PREVENT_ALL_DAMAGE marker on defender
  if (ctx.defender.markers[PREVENT_ALL_DAMAGE_NEXT_TURN] > 0) {
    logEvent(ctx.state, ctx.defenderIndex, "ability",
      `${ctx.defender.card.name} 的保护效果阻挡了所有伤害`);
    ctx.damage = 0;
  }
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
