
import {
  GameState,
  GameCard,
  Player,
  logEvent,
  GamePhase
} from "./game-state";
import {
  removeCard,
  findCard,
  hasBasicPokemon,
  zoneSize,
  drawMultiple,
  addCards,
  addToBottom,
  isZoneEmpty,
  shuffleZone
} from "./zones";
import { getEffect, getEffectSource } from "./effects/effect-registry";
import { createEffectContext } from "./effects/effect-context";
import { flipCoin } from "./effects/coin";
import type { AttackResult } from "./effects/effect-types";
import { CANT_ATTACK_NEXT_TURN, cantUseAttackMarker, ABILITY_BLOCKED, ABILITY_BLOCKED_TEMP, DAMAGE_BOOST, PREVENT_ALL_DAMAGE_NEXT_TURN, PREVENT_RETREAT_NEXT_TURN } from "./effects/markers";
import { queryActiveModifiers, isStatusImmune, isEnergyRemovalBlocked } from "./effects/modifier-query";
import { emitEvent } from "./effects/event-bus";

export interface PlayCardResult {
  success: boolean;
  error?: string;
  gameEnded?: boolean;
}

/**
 * Get the effective max HP for a Pokémon, including bonuses from attached tools.
 * Tools like Bravery Charm (+50) and Hero's Cape (+100) increase effective HP.
 * This value is used for KO checks and heal-cap calculations.
 */
export function getEffectiveHp(card: GameCard): number {
  const base = parseInt(card.card.hp || "0", 10);
  let bonus = 0;
  for (const tool of card.attachedTools) {
    const toolEffect = getEffect(tool.cardId, tool.card.name);
    const hpMod = toolEffect?.tool?.whileAttached?.modifyHp;
    if (typeof hpMod === "number") {
      bonus += hpMod;
    } else if (typeof hpMod === "function") {
      bonus += hpMod(card.card.subtypes || []);
    }
  }
  return base + bonus;
}

/**
 * Validates if a card can be played to the active spot
 */
export function canPlayActive(
  state: GameState,
  playerIndex: 0 | 1,
  cardInstanceId: string
): boolean {
  const player = state.players[playerIndex];
  
  // Can only play if active spot is empty
  if (player.active) return false;
  
  const card = player.hand.cards.find(c => c.instanceId === cardInstanceId);
  if (!card) return false;
  
  // Must be a Basic Pokemon
  return (
    card.card.supertype === "Pokémon" && 
    card.card.subtypes.includes("Basic")
  );
}

/**
 * Validates if a card can be played to the bench
 */
export function canPlayBench(
  state: GameState,
  playerIndex: 0 | 1,
  cardInstanceId: string
): boolean {
  const player = state.players[playerIndex];
  
  // Can only play if bench is not full (max 5)
  if (player.bench.cards.length >= 5) return false;
  
  const card = player.hand.cards.find(c => c.instanceId === cardInstanceId);
  if (!card) return false;
  
  // Must be a Basic Pokemon
  return (
    card.card.supertype === "Pokémon" && 
    card.card.subtypes.includes("Basic")
  );
}

/**
 * Validates if energy can be attached
 */
export function canAttachEnergy(
  state: GameState,
  playerIndex: 0 | 1,
  cardInstanceId: string,
  targetInstanceId: string
): boolean {
  const player = state.players[playerIndex];
  
  // Check if energy already attached this turn (unless ability overrides)
  if (state.turnStatus.hasAttachedEnergy) return false;
  
  const card = player.hand.cards.find(c => c.instanceId === cardInstanceId);
  if (!card || card.card.supertype !== "Energy") return false;
  
  // Target must be in play (active or bench)
  let target: GameCard | undefined;
  if (player.active?.instanceId === targetInstanceId) {
    target = player.active;
  } else {
    target = player.bench.cards.find(c => c.instanceId === targetInstanceId);
  }
  
  return !!target;
}

/**
 * Plays a card from hand to Active spot
 */
export function playActive(
  state: GameState,
  playerIndex: 0 | 1,
  cardInstanceId: string
): PlayCardResult {
  if (!canPlayActive(state, playerIndex, cardInstanceId)) {
    return { success: false, error: "Cannot play to active spot" };
  }
  
  const player = state.players[playerIndex];
  const card = removeCard(player.hand, cardInstanceId);
  
  if (card) {
    player.active = card;
    card.playedThisTurn = true;
    logEvent(state, playerIndex, "play_pokemon", `${player.name} played ${card.card.name} to Active`);
    return { success: true };
  }
  
  return { success: false, error: "Card not found" };
}

/**
 * Plays a card from hand to Bench
 */
export function playBench(
  state: GameState,
  playerIndex: 0 | 1,
  cardInstanceId: string
): PlayCardResult {
  if (!canPlayBench(state, playerIndex, cardInstanceId)) {
    return { success: false, error: "Cannot play to bench" };
  }
  
  const player = state.players[playerIndex];
  const card = removeCard(player.hand, cardInstanceId);
  
  if (card) {
    player.bench.cards.push(card);
    card.playedThisTurn = true;
    logEvent(state, playerIndex, "play_pokemon", `${player.name} played ${card.card.name} to Bench`);
    return { success: true };
  }
  
  return { success: false, error: "Card not found" };
}

/**
 * Attaches energy from hand to a Pokemon
 */
export function attachEnergy(
  state: GameState,
  playerIndex: 0 | 1,
  cardInstanceId: string,
  targetInstanceId: string
): PlayCardResult {
  if (!canAttachEnergy(state, playerIndex, cardInstanceId, targetInstanceId)) {
    return { success: false, error: "Cannot attach energy" };
  }
  
  const player = state.players[playerIndex];
  const card = removeCard(player.hand, cardInstanceId);
  
  if (!card) return { success: false, error: "Card not found" };
  
  let target: GameCard | undefined;
  if (player.active?.instanceId === targetInstanceId) {
    target = player.active;
  } else {
    target = player.bench.cards.find(c => c.instanceId === targetInstanceId);
  }
  
  if (target) {
    target.attachedEnergy.push(card);
    state.turnStatus.hasAttachedEnergy = true;
    logEvent(state, playerIndex, "attach_energy", `${player.name} attached ${card.card.name} to ${target.card.name}`);
    return { success: true };
  }
  
  return { success: false, error: "Target not found" };
}

const BASIC_ENERGY_TYPES = [
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
  "Dragon",
  "Fairy",
];

function parseEnergyTypeFromName(name: string): string | null {
  for (const t of BASIC_ENERGY_TYPES) {
    if (name.includes(t)) return t;
  }
  return null;
}

function getEnergyProvidedByCard(energyCard: GameCard): string[] {
  const name = energyCard.card.name || "";
  const lower = name.toLowerCase();

  if (lower.includes("double turbo energy")) return ["Colorless", "Colorless"];
  if (lower.includes("double colorless energy")) return ["Colorless", "Colorless"];
  if (lower.includes("luminous energy")) return ["Any"];
  if (lower.includes("rainbow energy")) return ["Any"];
  if (lower.includes("aurora energy")) return ["Any"];

  if (
    energyCard.card.subtypes?.includes("Basic") &&
    energyCard.card.types &&
    energyCard.card.types.length > 0
  ) {
    return [energyCard.card.types[0]];
  }

  const parsed = parseEnergyTypeFromName(name);
  if (parsed) return [parsed];

  return ["Colorless"];
}

export function getProvidedEnergy(attachedEnergy: GameCard[]): string[] {
  const pool: string[] = [];
  for (const card of attachedEnergy) {
    if (card.card.supertype !== "Energy") continue;
    pool.push(...getEnergyProvidedByCard(card));
  }
  return pool;
}

export interface EnergyCheckResult {
  sufficient: boolean;
  missing: string[];
}

export function checkEnergyCostWithProvided(
  provided: string[],
  cost: string[]
): EnergyCheckResult {
  if (!cost || cost.length === 0) {
    return { sufficient: true, missing: [] };
  }

  const currentPool = [...provided];
  const missing: string[] = [];

  const specificCosts = cost.filter((c) => c !== "Colorless");
  for (const req of specificCosts) {
    let index = currentPool.findIndex((p) => p === req);
    if (index === -1) {
      index = currentPool.findIndex((p) => p === "Any");
    }
    if (index !== -1) {
      currentPool.splice(index, 1);
    } else {
      missing.push(req);
    }
  }

  const colorlessCosts = cost.filter((c) => c === "Colorless");
  for (let i = 0; i < colorlessCosts.length; i++) {
    if (currentPool.length > 0) {
      currentPool.shift();
    } else {
      missing.push("Colorless");
    }
  }

  return {
    sufficient: missing.length === 0,
    missing,
  };
}

/**
 * Check if the attached energy on a Pokemon satisfies an attack's cost.
 *
 * PTCG energy cost rules:
 * - Specific type costs (e.g., "Fire") must be paid by that type of energy
 * - "Colorless" costs can be paid by any energy type
 * - Each attached energy can only be used to pay for one cost
 *
 * Uses a greedy algorithm: pay specific costs first, then use remaining for Colorless.
 */
export function checkEnergyCostDetailed(
  attachedEnergy: GameCard[],
  cost: string[]
): EnergyCheckResult {
  return checkEnergyCostWithProvided(getProvidedEnergy(attachedEnergy), cost);
}

export function checkEnergyCost(
  attachedEnergy: GameCard[],
  cost: string[]
): boolean {
  return checkEnergyCostDetailed(attachedEnergy, cost).sufficient;
}

/**
 * Validates if an attack can be performed.
 * Checks: active Pokemon exists, main phase, attack exists,
 * energy type requirements met, first turn restriction.
 */
export function canAttack(
  state: GameState,
  playerIndex: 0 | 1,
  attackName: string
): boolean {
  const player = state.players[playerIndex];

  // Must be active pokemon
  if (!player.active) return false;

  // Must be in main phase
  if (state.phase !== GamePhase.MAIN) return false;

  // PTCG Rule: Can only attack once per turn (attack is turn-ending)
  if (state.turnStatus.hasAttacked) return false;

  // Find attack
  const attack = player.active.card.attacks?.find(a => a.name === attackName);
  if (!attack) return false;

  // Check energy cost with type matching
  if (!checkEnergyCost(player.active.attachedEnergy, attack.cost)) {
    return false;
  }

  // Cannot attack on first turn of the game (if player 1 went first)
  if (state.turn === 1 && state.isFirstTurn) return false;

  // ─── Status condition checks ───
  // Paralyzed Pokemon cannot attack
  if (player.active.statusConditions.includes("paralyzed")) return false;

  // Asleep Pokemon cannot attack
  if (player.active.statusConditions.includes("asleep")) return false;

  // ─── Marker checks ───
  // Can't attack next turn marker (e.g., Photon Blaster, Wild Impact)
  if (player.active.markers[CANT_ATTACK_NEXT_TURN] > 0) return false;

  // Can't use this specific attack (e.g., Shinobi Blade)
  if (player.active.markers[cantUseAttackMarker(attackName)] > 0) return false;

  // V2: Check prevent_attack modifier from field abilities
  const mods = queryActiveModifiers(state, playerIndex);
  if (mods.preventAttack) return false;

  return true;
}

// ───────────────────────────────────────────────
// Damage Calculation
// ───────────────────────────────────────────────

/**
 * Calculate weakness multiplier.
 * In PTCG SV era, weakness is ×2 (value field = "×2").
 */
export function calculateWeakness(
  attackerTypes: string[],
  defender: GameCard
): number {
  if (!defender.card.weaknesses || defender.card.weaknesses.length === 0) {
    return 1;
  }

  for (const weakness of defender.card.weaknesses) {
    if (attackerTypes.includes(weakness.type)) {
      // Parse the value: "×2" → 2, "+20" → special (legacy), default ×2
      const val = weakness.value;
      if (val.startsWith("×")) {
        return parseInt(val.slice(1), 10) || 2;
      }
      // Default SV era: ×2
      return 2;
    }
  }

  return 1;
}

/**
 * Calculate resistance reduction.
 * In PTCG SV era, resistance is typically -30.
 */
export function calculateResistance(
  attackerTypes: string[],
  defender: GameCard
): number {
  if (!defender.card.resistances || defender.card.resistances.length === 0) {
    return 0;
  }

  for (const resistance of defender.card.resistances) {
    if (attackerTypes.includes(resistance.type)) {
      // Parse the value: "-30" → 30
      const val = resistance.value;
      return Math.abs(parseInt(val, 10)) || 30;
    }
  }

  return 0;
}

/**
 * Full damage calculation with weakness and resistance.
 * Formula: (base_damage × weakness_multiplier) - resistance_reduction
 * Minimum damage is 0.
 */
export function calculateDamage(
  baseDamage: number,
  attackerCard: GameCard,
  defenderCard: GameCard
): { finalDamage: number; wasWeakness: boolean; wasResistance: boolean } {
  const attackerTypes = attackerCard.card.types || [];

  const weaknessMultiplier = calculateWeakness(attackerTypes, defenderCard);
  const resistanceReduction = calculateResistance(attackerTypes, defenderCard);

  const wasWeakness = weaknessMultiplier > 1;
  const wasResistance = resistanceReduction > 0;

  let finalDamage = baseDamage * weaknessMultiplier - resistanceReduction;
  if (finalDamage < 0) finalDamage = 0;

  return { finalDamage, wasWeakness, wasResistance };
}

// ───────────────────────────────────────────────
// Multi-Prize Rules
// ───────────────────────────────────────────────

/**
 * Determine how many prize cards to take when a Pokemon is knocked out.
 *
 * Rules:
 * - Normal Pokemon: 1 prize
 * - Pokemon ex (lowercase): 2 prizes
 * - Pokemon V: 2 prizes
 * - Pokemon VMAX: 3 prizes
 * - Pokemon VSTAR: 2 prizes (changed from 3 in official rules)
 * - Pokemon GX: 2 prizes (legacy)
 * - Pokemon EX (uppercase, Mega): 2 prizes (legacy)
 */
export function getPrizeCount(card: GameCard): number {
  const subtypes = card.card.subtypes;

  // VMAX gives 3 prizes
  if (subtypes.includes("VMAX")) {
    return 3;
  }

  // ex, V, VSTAR, GX, EX give 2 prizes
  if (
    subtypes.includes("ex") ||
    subtypes.includes("V") ||
    subtypes.includes("VSTAR") ||
    subtypes.includes("GX") ||
    subtypes.includes("EX") ||
    subtypes.includes("Mega")
  ) {
    return 2;
  }

  // Tera ex also gives 2 prizes (it will have "ex" subtype)
  // Normal Pokemon: 1 prize
  return 1;
}

// ───────────────────────────────────────────────
// Knockout System
// ───────────────────────────────────────────────

/**
 * Check for Knockouts
 */
export function checkKnockout(
  state: GameState,
  playerIndex: 0 | 1, // The player whose pokemon might be KO'd
  targetZone: "active" | "bench",
  benchIndex?: number
): boolean {
  const player = state.players[playerIndex];
  let card: GameCard | null | undefined;

  if (targetZone === "active") {
    card = player.active;
  } else if (benchIndex !== undefined) {
    card = player.bench.cards[benchIndex];
  }

  if (!card) return false;

  const hp = getEffectiveHp(card);
  if (hp > 0 && card.damageCounters * 10 >= hp) {
    // KO!
    logEvent(state, playerIndex, "knockout", `${card.card.name} 被击倒了!`);

    // Discard Pokemon and all attached cards
    const discardPile = player.discard;

    // 1. Move attached energy
    discardPile.cards.push(...card.attachedEnergy);
    card.attachedEnergy = [];

    // 2. Move attached tools
    discardPile.cards.push(...card.attachedTools);
    card.attachedTools = [];

    // 3. Move Pokemon itself
    discardPile.cards.push(card);

    // Remove from field
    if (targetZone === "active") {
      player.active = null;
    } else if (benchIndex !== undefined) {
      player.bench.cards.splice(benchIndex, 1);
    }

    return true;
  }

  return false;
}

/**
 * Take Prizes
 */
export function takePrizes(
  state: GameState,
  playerIndex: 0 | 1,
  count: number
): void {
  const player = state.players[playerIndex];
  // Can't take more prizes than available
  const actualCount = Math.min(count, zoneSize(player.prizes));
  const taken = drawMultiple(player.prizes, actualCount);
  addCards(player.hand, taken);

  logEvent(state, playerIndex, "prize_taken", `${player.name} 拿取了 ${taken.length} 张奖励卡`);

  // Check Win Condition: Prizes
  if (isZoneEmpty(player.prizes)) {
    state.phase = GamePhase.GAME_OVER;
    state.winner = {
      playerIndex,
      condition: "prizes_taken"
    };
    logEvent(state, playerIndex, "game_over", `${player.name} 拿完了所有奖励卡，获得胜利！`);
  }
}

/**
 * Check Win Condition: No Bench Pokemon (after active KO)
 */
export function checkWinCondition(state: GameState): boolean {
  if (state.phase === GamePhase.GAME_OVER) return true;

  // Check if any player has no active and no bench
  for (let p = 0; p < 2; p++) {
    const player = state.players[p as 0 | 1];
    if (!player.active && isZoneEmpty(player.bench)) {
      const winnerIndex = p === 0 ? 1 : 0;
      state.phase = GamePhase.GAME_OVER;
      state.winner = {
        playerIndex: winnerIndex as 0 | 1,
        condition: "no_bench_pokemon"
      };
      logEvent(state, winnerIndex as 0 | 1, "game_over", `${player.name} 场上没有宝可梦了，${state.players[winnerIndex].name} 获胜！`);
      return true;
    }
  }

  return false;
}

// ───────────────────────────────────────────────
// Bench Promotion
// ───────────────────────────────────────────────

/**
 * Promote a bench Pokemon to active.
 * Called when the active spot is empty after a KO.
 */
export function promoteBenchPokemon(
  state: GameState,
  playerIndex: 0 | 1,
  benchInstanceId: string
): PlayCardResult {
  const player = state.players[playerIndex];

  // Active must be empty
  if (player.active) {
    return { success: false, error: "战斗区已有宝可梦" };
  }

  // Must have bench pokemon
  if (isZoneEmpty(player.bench)) {
    return { success: false, error: "备战区没有宝可梦" };
  }

  // Find the bench pokemon
  const card = findCard(player.bench, benchInstanceId);
  if (!card) {
    return { success: false, error: "备战区找不到指定的宝可梦" };
  }

  // Move to active
  removeCard(player.bench, benchInstanceId);
  player.active = card;

  logEvent(state, playerIndex, "play_pokemon", `${player.name} 将 ${card.card.name} 从备战区移到战斗区`);

  return { success: true };
}

/**
 * Auto-promote the first bench Pokemon (convenience for AI/auto mode).
 */
export function autoPromoteBench(
  state: GameState,
  playerIndex: 0 | 1
): PlayCardResult {
  const player = state.players[playerIndex];

  if (player.active) {
    return { success: false, error: "战斗区已有宝可梦" };
  }

  if (isZoneEmpty(player.bench)) {
    return { success: false, error: "备战区没有宝可梦" };
  }

  // Pick first bench Pokemon
  return promoteBenchPokemon(state, playerIndex, player.bench.cards[0].instanceId);
}

// ───────────────────────────────────────────────
// Concede
// ───────────────────────────────────────────────

/**
 * A player concedes the game.
 */
export function concede(
  state: GameState,
  playerIndex: 0 | 1
): PlayCardResult {
  if (state.phase === GamePhase.GAME_OVER) {
    return { success: false, error: "游戏已经结束" };
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  state.phase = GamePhase.GAME_OVER;
    state.winner = {
      playerIndex: opponentIndex as 0 | 1,
      condition: "concede",
    };

  logEvent(state, playerIndex, "game_over", `${state.players[playerIndex].name} 认输了，${state.players[opponentIndex].name} 获胜！`);

  return { success: true, gameEnded: true };
}

// ───────────────────────────────────────────────
// Perform Attack (Complete Implementation)
// ───────────────────────────────────────────────

/**
 * Perform Attack with full damage calculation, weakness/resistance,
 * multi-prize knockout, bench promotion handling, AND card effect integration.
 *
 * Flow:
 * 1. canAttack validation
 * 2. Check effect registry for custom attack logic
 * 3. If effect exists: call onAttack() to get modified damage + side effects
 * 4. Apply weakness/resistance to the (possibly modified) base damage
 * 5. Apply tool damage modifiers (incoming damage reduction)
 * 6. Apply damage to defender
 * 7. Process effect side effects (bench damage, self damage, status, energy discard)
 * 8. Check KO, prizes, win condition
 */
export function performAttack(
  state: GameState,
  playerIndex: 0 | 1,
  attackName: string
): PlayCardResult {
  if (!canAttack(state, playerIndex, attackName)) {
    return { success: false, error: "Cannot attack" };
  }

  // PTCG Rule: Attack is a turn-ending action — mark that attack has been used
  state.turnStatus.hasAttacked = true;

  const attacker = state.players[playerIndex];
  const defenderIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
  const defender = state.players[defenderIndex];
  const activeAttack = attacker.active!.card.attacks!.find(a => a.name === attackName)!;

  // ─── Confused: Flip coin before attacking ───
  // If confused, flip a coin:
  //   Heads → attack proceeds normally
  //   Tails → 30 damage to self (3 damage counters), attack fails
  if (attacker.active!.statusConditions.includes("confused")) {
    const heads = flipCoin();
    logEvent(state, playerIndex, "coin_flip",
      heads
        ? `${attacker.active!.card.name} 处于混乱状态，翻硬币…正面! 攻击正常进行`
        : `${attacker.active!.card.name} 处于混乱状态，翻硬币…反面! 攻击失败，对自己造成 30 点伤害`,
      { result: heads ? "heads" : "tails", status: "confused" }
    );

    if (!heads) {
      // Self-damage: 3 damage counters = 30 damage
      attacker.active!.damageCounters += 3;

      // Check self-KO from confusion damage
      const selfHp = getEffectiveHp(attacker.active!);
      if (selfHp > 0 && attacker.active!.damageCounters * 10 >= selfHp) {
        const selfPrize = getPrizeCount(attacker.active!);
        if (checkKnockout(state, playerIndex, "active")) {
          takePrizes(state, defenderIndex, selfPrize);
          if (checkWinCondition(state)) {
            return { success: true, gameEnded: true };
          }
        }
      }

      // Attack fails but turn action is consumed (success = true, attack just didn't land)
      return { success: true };
    }
  }

  // 1. Calculate Base Damage from card data
  const rawBaseDamage = parseInt(activeAttack.damage || "0", 10);

  // 2. Check for registered attack effect
  let effectResult: AttackResult | null = null;
  const cardEffect = getEffect(attacker.active!.cardId, attacker.active!.card.name);
  const effectSource = getEffectSource(attacker.active!.cardId, attacker.active!.card.name) || "none";

  if (cardEffect?.attacks) {
    const attackEffect = cardEffect.attacks.find(a => a.name === attackName);
    if (attackEffect?.onAttack) {
      const ctx = createEffectContext(state, playerIndex, attacker.active!);
      effectResult = attackEffect.onAttack(ctx, rawBaseDamage);
    }
  }

  // 3. Determine final base damage (from effect or raw)
  let baseDamage = effectResult ? effectResult.damage : rawBaseDamage;
  const skipWeakness = effectResult?.skipWeakness ?? false;
  const skipResistance = effectResult?.skipResistance ?? false;

  // 3a. Apply trainer damage boosts (Kieran +20, Giovanni's Charisma +10)
  // DAMAGE_BOOST marker is set by trainer supporters, applied BEFORE weakness/resistance
  if (baseDamage > 0 && attacker.active) {
    const damageBoost = attacker.active.markers[DAMAGE_BOOST] ?? 0;
    if (damageBoost > 0) {
      baseDamage += damageBoost;
      logEvent(state, playerIndex, "damage" as any,
        `${attacker.active.card.name} 的攻击伤害 +${damageBoost}（训练家效果）`);
    }
  }

  // 3b. Apply attacker tool damage modifiers (e.g. Choice Belt +30, Vitality Band +10)
  if (baseDamage > 0 && attacker.active) {
    baseDamage = applyAttackerToolDamageModifiers(state, attacker.active, baseDamage);
  }

  // 4. Apply Weakness/Resistance
  let finalDamage = baseDamage;
  let weaknessApplied = false;
  let resistanceApplied = false;

  if (baseDamage > 0 && defender.active) {
    if (!skipWeakness && !skipResistance) {
      const result = calculateDamage(baseDamage, attacker.active!, defender.active);
      finalDamage = result.finalDamage;
      weaknessApplied = result.wasWeakness;
      resistanceApplied = result.wasResistance;
    } else if (!skipWeakness) {
      const wm = calculateWeakness(attacker.active!.card.types || [], defender.active);
      finalDamage = baseDamage * wm;
      weaknessApplied = wm > 1;
    } else if (!skipResistance) {
      const rd = calculateResistance(attacker.active!.card.types || [], defender.active);
      finalDamage = Math.max(0, baseDamage - rd);
      resistanceApplied = rd > 0;
    }
  }

  // 5. Apply tool damage modifiers (incoming damage reduction on defender)
  if (finalDamage > 0 && defender.active) {
    finalDamage = applyToolDamageModifiers(state, defender.active, finalDamage);
    if (finalDamage < 0) finalDamage = 0;
  }

  // 5b. Apply passive ability damage modifiers from all Pokemon in play
  if (finalDamage > 0 && attacker.active && defender.active) {
    // Collect all Pokemon by player
    const allPokemonByPlayer: [GameCard[], GameCard[]] = [[], []];
    for (let pi = 0; pi < 2; pi++) {
      const p = state.players[pi];
      if (p.active) allPokemonByPlayer[pi].push(p.active);
      allPokemonByPlayer[pi].push(...p.bench.cards);
    }

    // Attacker side: modifyDamage (isAttacker = true) — only for the attacking Pokemon
    for (const pokemon of allPokemonByPlayer[playerIndex]) {
      if (pokemon.markers[ABILITY_BLOCKED] > 0 || pokemon.markers[ABILITY_BLOCKED_TEMP] > 0) continue;
      const effect = getEffect(pokemon.cardId, pokemon.card.name);
      if (!effect?.abilities) continue;
      for (const ability of effect.abilities) {
        if (ability.type !== "passive" || !ability.modifyDamage) continue;
        if (pokemon.instanceId !== attacker.active!.instanceId) continue;
        const ectx = createEffectContext(state, playerIndex, pokemon);
        const newDamage = ability.modifyDamage(ectx, finalDamage, true);
        if (newDamage !== finalDamage) {
          logEvent(state, playerIndex, "ability" as any,
            `${pokemon.card.name} 的特性 ${ability.name} 修改了伤害 (${finalDamage} → ${newDamage})`);
          finalDamage = newDamage;
        }
      }
    }

    // Defender side: modifyDamage (isAttacker = false) + modifyIncomingDamage — only for the defending Pokemon
    for (const pokemon of allPokemonByPlayer[defenderIndex]) {
      if (pokemon.markers[ABILITY_BLOCKED] > 0 || pokemon.markers[ABILITY_BLOCKED_TEMP] > 0) continue;
      const effect = getEffect(pokemon.cardId, pokemon.card.name);
      if (!effect?.abilities) continue;
      for (const ability of effect.abilities) {
        if (ability.type !== "passive") continue;
        if (pokemon.instanceId !== defender.active!.instanceId) continue;
        if (ability.modifyDamage) {
          const ectx = createEffectContext(state, defenderIndex, pokemon);
          const newDamage = ability.modifyDamage(ectx, finalDamage, false);
          if (newDamage !== finalDamage) {
            logEvent(state, defenderIndex, "ability" as any,
              `${pokemon.card.name} 的特性 ${ability.name} 修改了伤害 (${finalDamage} → ${newDamage})`);
            finalDamage = newDamage;
          }
        }
        if (ability.modifyIncomingDamage) {
          const ectx = createEffectContext(state, defenderIndex, pokemon);
          const newDamage = ability.modifyIncomingDamage(ectx, finalDamage);
          if (newDamage !== finalDamage) {
            logEvent(state, defenderIndex, "ability" as any,
              `${pokemon.card.name} 的特性 ${ability.name} 减少了受到的伤害 (${finalDamage} → ${newDamage})`);
            finalDamage = newDamage;
          }
        }
      }
    }

    if (finalDamage < 0) finalDamage = 0;
  }

  // 5c. Check PREVENT_ALL_DAMAGE_NEXT_TURN marker on defender
  if (finalDamage > 0 && defender.active) {
    if ((defender.active.markers[PREVENT_ALL_DAMAGE_NEXT_TURN] ?? 0) > 0) {
      logEvent(state, defenderIndex, "ability" as any,
        `${defender.active.card.name} 的保护效果阻挡了所有伤害`);
      finalDamage = 0;
    }
  }

  // 6. Apply Damage to defender's active
  if (finalDamage > 0 && defender.active) {
    defender.active.damageCounters += finalDamage / 10;

    let msg = `${attacker.active!.card.name} 使用 ${attackName} 对 ${defender.active.card.name} 造成 ${finalDamage} 点伤害`;
    if (weaknessApplied) msg += "（弱点 ×2）";
    if (resistanceApplied) msg += "（抵抗力）";

    logEvent(state, playerIndex, "damage", msg, {
      baseDamage,
      finalDamage,
      weaknessApplied,
      resistanceApplied,
      effectSource,
    });

    // Emit DAMAGE_DEALT event for chain reactions
    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: attacker.active!,
      target: defender.active,
      amount: finalDamage,
      attackName,
      playerIndex,
    });
  } else if (baseDamage === 0) {
    logEvent(state, playerIndex, "attack", `${attacker.active!.card.name} 使用了 ${attackName}`, { effectSource });
  } else {
    logEvent(state, playerIndex, "damage", `${attacker.active!.card.name} 使用 ${attackName}，但伤害被抵消了`, {
      baseDamage,
      finalDamage: 0,
      resistanceApplied: true,
      effectSource,
    });
  }

  // 7. Process effect side effects
  if (effectResult) {
    // Bench damage
    if (effectResult.benchDamage) {
      for (const bd of effectResult.benchDamage) {
        // V2: Check bench damage prevention from passive abilities
        // Check 1: target's own abilities
        let benchDamageBlocked = false;
        if (bd.target.markers[ABILITY_BLOCKED] <= 0 && bd.target.markers[ABILITY_BLOCKED_TEMP] <= 0) {
          const targetEffect = getEffect(bd.target.cardId, bd.target.card.name);
          if (targetEffect?.abilities?.some(a =>
            a.type === "passive" && (a as any).preventBenchDamage
          )) {
            logEvent(state, playerIndex, "ability" as any,
              `${bd.target.card.name} 的特性阻挡了板凳伤害!`);
            benchDamageBlocked = true;
          }
        }
        // Check 2: field-wide bench protection (e.g., Manaphy's Wave Veil)
        // Any allied Pokemon with preventBenchDamage protects ALL bench Pokemon
        if (!benchDamageBlocked) {
          const allAlliedPokemon = [
            defender.active,
            ...defender.bench.cards,
          ].filter(Boolean) as GameCard[];
          for (const ally of allAlliedPokemon) {
            if (ally === bd.target) continue; // already checked above
            if (ally.markers[ABILITY_BLOCKED] > 0 || ally.markers[ABILITY_BLOCKED_TEMP] > 0) continue;
            const allyEffect = getEffect(ally.cardId, ally.card.name);
            if (allyEffect?.abilities?.some(a =>
              a.type === "passive" && (a as any).preventBenchDamage
            )) {
              logEvent(state, playerIndex, "ability" as any,
                `${ally.card.name} 的特性 保护了 ${bd.target.card.name} 免受板凳伤害!`);
              benchDamageBlocked = true;
              break;
            }
          }
        }
        if (benchDamageBlocked) continue;
        bd.target.damageCounters += bd.damage / 10;
        logEvent(state, playerIndex, "damage",
          `${attacker.active!.card.name} 的效果对 ${bd.target.card.name} 造成了 ${bd.damage} 点伤害`);
      }
    }

    // Self damage
    if (effectResult.selfDamage && effectResult.selfDamage > 0 && attacker.active) {
      attacker.active.damageCounters += effectResult.selfDamage / 10;
      logEvent(state, playerIndex, "damage",
        `${attacker.active.card.name} 对自己造成了 ${effectResult.selfDamage} 点伤害`);
    }

    // Status effects
    if (effectResult.statusEffects) {
      for (const se of effectResult.statusEffects) {
        const target = se.target === "defender" ? defender.active : attacker.active;
        const targetPi = se.target === "defender" ? defenderIndex : playerIndex;
        if (target) {
          // V2: Check status immunity from passive abilities/tools
          if (isStatusImmune(state, target, targetPi)) {
            logEvent(state, playerIndex, "ability" as any,
              `${target.card.name} 的特性免疫了${statusToText(se.status)}状态!`);
            continue;
          }
          // Mutually exclusive statuses
          if (se.status === "asleep" || se.status === "confused" || se.status === "paralyzed") {
            target.statusConditions = target.statusConditions.filter(
              s => s !== "asleep" && s !== "confused" && s !== "paralyzed"
            );
          }
          if (!target.statusConditions.includes(se.status)) {
            target.statusConditions.push(se.status);
          }
          logEvent(state, playerIndex, "status_effect",
            `${target.card.name} 陷入了${statusToText(se.status)}状态!`,
            { status: se.status });

          // Emit STATUS_APPLIED event
          emitEvent(state, {
            type: "STATUS_APPLIED",
            pokemon: target,
            status: se.status,
            playerIndex: targetPi,
          });
        }
      }
    }

    // Prevent retreat on defender (e.g., attacks that trap the opponent)
    if (effectResult.preventRetreat && defender.active) {
      defender.active.markers[PREVENT_RETREAT_NEXT_TURN] = (defender.active.markers[PREVENT_RETREAT_NEXT_TURN] ?? 0) + 1;
      logEvent(state, playerIndex, "status_effect" as any,
        `${defender.active.card.name} 下回合无法撤退!`);
    }

    // Energy discard
    if (effectResult.discardEnergy && effectResult.discardEnergy > 0 && attacker.active) {
      const count = Math.min(effectResult.discardEnergy, attacker.active.attachedEnergy.length);
      for (let i = 0; i < count; i++) {
        const e = attacker.active.attachedEnergy.pop();
        if (e) addToBottom(attacker.discard, e);
      }
      if (count > 0) {
        logEvent(state, playerIndex, "use_trainer",
          `${attacker.active.card.name} 丢弃了 ${count} 个附加能量`);
      }
    }
  }

  // 8. Check KO on defender's active
  const defenderActiveBeforeKO = defender.active;
  const prizeCountForKO = defenderActiveBeforeKO ? getPrizeCount(defenderActiveBeforeKO) : 1;

  if (defenderActiveBeforeKO && checkKnockout(state, defenderIndex, "active")) {
    // Emit POKEMON_KO event
    emitEvent(state, {
      type: "POKEMON_KO",
      pokemon: defenderActiveBeforeKO,
      knockedBy: attacker.active ?? undefined,
      playerIndex: defenderIndex,
    });

    const extraPrize = effectResult?.extraPrize ?? 0;
    takePrizes(state, playerIndex, prizeCountForKO + extraPrize);

    // Emit PRIZE_TAKEN event
    emitEvent(state, {
      type: "PRIZE_TAKEN",
      playerIndex,
      count: prizeCountForKO + extraPrize,
    });

    if (checkWinCondition(state)) {
      return { success: true, gameEnded: true };
    }

    if (!defender.active && !isZoneEmpty(defender.bench)) {
      if (defender.bench.cards.length === 1) {
        autoPromoteBench(state, defenderIndex);
      }
    }

    if (checkWinCondition(state)) {
      return { success: true, gameEnded: true };
    }
  }

  // Check KO on defender's bench (from bench damage)
  if (effectResult?.benchDamage) {
    for (let i = defender.bench.cards.length - 1; i >= 0; i--) {
      const benchCard = defender.bench.cards[i];
      const hp = getEffectiveHp(benchCard);
      if (hp > 0 && benchCard.damageCounters * 10 >= hp) {
        const benchPrize = getPrizeCount(benchCard);
        if (checkKnockout(state, defenderIndex, "bench", i)) {
          emitEvent(state, {
            type: "POKEMON_KO",
            pokemon: benchCard,
            knockedBy: attacker.active ?? undefined,
            playerIndex: defenderIndex,
          });
          takePrizes(state, playerIndex, benchPrize);
          emitEvent(state, {
            type: "PRIZE_TAKEN",
            playerIndex,
            count: benchPrize,
          });
          if (checkWinCondition(state)) {
            return { success: true, gameEnded: true };
          }
        }
      }
    }
  }

  // Check KO on self (from self damage)
  if (effectResult?.selfDamage && attacker.active) {
    const selfHp = getEffectiveHp(attacker.active);
    if (selfHp > 0 && attacker.active.damageCounters * 10 >= selfHp) {
      const selfPrize = getPrizeCount(attacker.active);
      if (checkKnockout(state, playerIndex, "active")) {
        emitEvent(state, {
          type: "POKEMON_KO",
          pokemon: attacker.active,
          playerIndex,
        });
        takePrizes(state, defenderIndex, selfPrize);
        emitEvent(state, {
          type: "PRIZE_TAKEN",
          playerIndex: defenderIndex,
          count: selfPrize,
        });
        if (checkWinCondition(state)) {
          return { success: true, gameEnded: true };
        }
      }
    }
  }

  // 9. Shuffle self into deck (e.g., Lumineon V "Aqua Return")
  if (effectResult?.shuffleSelf && attacker.active) {
    const pokemon = attacker.active;
    // Move all attached energy + tools to deck
    while (pokemon.attachedEnergy.length > 0) {
      const e = pokemon.attachedEnergy.pop()!;
      attacker.deck.cards.push(e);
    }
    while (pokemon.attachedTools.length > 0) {
      const t = pokemon.attachedTools.pop()!;
      attacker.deck.cards.push(t);
    }
    // Move Pokemon itself to deck
    attacker.deck.cards.push(pokemon);
    attacker.active = null;
    shuffleZone(attacker.deck);
    logEvent(state, playerIndex, "use_trainer",
      `${pokemon.card.name} 和所有附加卡牌洗入了牌组`);

    // Promote bench Pokemon
    if (!isZoneEmpty(attacker.bench)) {
      if (attacker.bench.cards.length === 1) {
        autoPromoteBench(state, playerIndex);
      }
      // Multiple bench: UI will prompt selection
    }
  }

  return { success: true };
}

/**
 * Apply tool damage modifiers for incoming damage on a Pokemon.
 * Checks all attached tools for modifyIncomingDamage effects.
 */
function applyToolDamageModifiers(
  state: GameState,
  target: GameCard,
  damage: number
): number {
  let modified = damage;
  for (const tool of target.attachedTools) {
    const toolEffect = getEffect(tool.cardId, tool.card.name);
    if (toolEffect?.tool?.whileAttached?.modifyIncomingDamage) {
      const ownerIndex = findOwnerIndex(state, target);
      if (ownerIndex !== null) {
        const ctx = createEffectContext(state, ownerIndex, tool);
        modified = toolEffect.tool.whileAttached.modifyIncomingDamage(ctx, modified);
      }
    }
  }
  return modified;
}

/**
 * Apply attacker's tool damage modifiers (outgoing damage boost).
 * Checks all attached tools for modifyDamage effects (e.g. Choice Belt, Vitality Band).
 */
function applyAttackerToolDamageModifiers(
  state: GameState,
  attacker: GameCard,
  damage: number
): number {
  let modified = damage;
  for (const tool of attacker.attachedTools) {
    const toolEffect = getEffect(tool.cardId, tool.card.name);
    if (toolEffect?.tool?.whileAttached?.modifyDamage) {
      const ownerIndex = findOwnerIndex(state, attacker);
      if (ownerIndex !== null) {
        const ctx = createEffectContext(state, ownerIndex, tool);
        modified = toolEffect.tool.whileAttached.modifyDamage(ctx, modified);
      }
    }
  }
  return modified;
}

/**
 * Find which player owns a GameCard.
 */
function findOwnerIndex(state: GameState, card: GameCard): 0 | 1 | null {
  for (let i = 0; i < 2; i++) {
    const p = state.players[i as 0 | 1];
    if (p.active?.instanceId === card.instanceId) return i as 0 | 1;
    if (p.bench.cards.some(c => c.instanceId === card.instanceId)) return i as 0 | 1;
  }
  return null;
}

/** Helper for status condition text */
function statusToText(status: string): string {
  switch (status) {
    case "poisoned": return "中毒";
    case "burned": return "灼伤";
    case "asleep": return "睡眠";
    case "confused": return "混乱";
    case "paralyzed": return "麻痹";
    default: return status;
  }
}
