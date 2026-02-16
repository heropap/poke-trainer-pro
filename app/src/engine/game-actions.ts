
import {
  GameState,
  Player,
  GameCard,
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
  isZoneEmpty
} from "./zones";

export interface PlayCardResult {
  success: boolean;
  error?: string;
  gameEnded?: boolean;
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
  if (player.energyAttachedThisTurn) return false;
  
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
    player.energyAttachedThisTurn = true;
    logEvent(state, playerIndex, "attach_energy", `${player.name} attached ${card.card.name} to ${target.card.name}`);
    return { success: true };
  }
  
  return { success: false, error: "Target not found" };
}

/**
 * Helper: Calculate energy count (simplified for now)
 */
function getAttachedEnergyCount(card: GameCard): number {
  // TODO: Handle double energy etc.
  return card.attachedEnergy.length;
}

/**
 * Validates if an attack can be performed
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
  if (state.phase !== "main") return false;

  // Find attack
  const attack = player.active.card.attacks?.find(a => a.name === attackName);
  if (!attack) return false;

  // Check energy cost
  const energyCount = getAttachedEnergyCount(player.active);
  const cost = attack.convertedEnergyCost || 0;

  if (energyCount < cost) return false;

  // Cannot attack on first turn of the game (if player 1 went first)
  if (state.turn === 1 && state.isFirstTurn) return false;

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

  const hp = parseInt(card.card.hp || "0", 10);
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
    state.phase = "game_over";
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
  if (state.phase === "game_over") return true;

  // Check if any player has no active and no bench
  for (let p = 0; p < 2; p++) {
    const player = state.players[p as 0 | 1];
    if (!player.active && isZoneEmpty(player.bench)) {
      const winnerIndex = p === 0 ? 1 : 0;
      state.phase = "game_over";
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
  if (state.phase === "game_over") {
    return { success: false, error: "游戏已经结束" };
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  state.phase = "game_over";
  state.winner = {
    playerIndex: opponentIndex as 0 | 1,
    condition: "concede"
  };

  logEvent(state, playerIndex, "game_over", `${state.players[playerIndex].name} 认输了，${state.players[opponentIndex].name} 获胜！`);

  return { success: true, gameEnded: true };
}

// ───────────────────────────────────────────────
// Perform Attack (Complete Implementation)
// ───────────────────────────────────────────────

/**
 * Perform Attack with full damage calculation, weakness/resistance,
 * multi-prize knockout, and bench promotion handling.
 */
export function performAttack(
  state: GameState,
  playerIndex: 0 | 1,
  attackName: string
): PlayCardResult {
  if (!canAttack(state, playerIndex, attackName)) {
    return { success: false, error: "Cannot attack" };
  }

  const attacker = state.players[playerIndex];
  const defenderIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
  const defender = state.players[defenderIndex];
  const activeAttack = attacker.active!.card.attacks!.find(a => a.name === attackName)!;

  // 1. Calculate Base Damage
  const baseDamage = parseInt(activeAttack.damage || "0", 10);

  // 2. Apply Weakness/Resistance
  let finalDamage = baseDamage;
  let weaknessApplied = false;
  let resistanceApplied = false;

  if (baseDamage > 0 && defender.active) {
    const result = calculateDamage(baseDamage, attacker.active!, defender.active);
    finalDamage = result.finalDamage;
    weaknessApplied = result.wasWeakness;
    resistanceApplied = result.wasResistance;
  }

  // 3. Apply Damage
  if (finalDamage > 0 && defender.active) {
    defender.active.damageCounters += finalDamage / 10;

    let msg = `${attacker.active!.card.name} 使用 ${attackName} 对 ${defender.active.card.name} 造成 ${finalDamage} 点伤害`;
    if (weaknessApplied) msg += "（弱点 ×2）";
    if (resistanceApplied) msg += "（抵抗力）";

    logEvent(state, playerIndex, "damage", msg, {
      baseDamage,
      finalDamage,
      weaknessApplied,
      resistanceApplied
    });
  } else if (baseDamage === 0) {
    logEvent(state, playerIndex, "attack", `${attacker.active!.card.name} 使用了 ${attackName}`);
  } else {
    // Damage was reduced to 0 by resistance
    logEvent(state, playerIndex, "damage", `${attacker.active!.card.name} 使用 ${attackName}，但伤害被抵消了`, {
      baseDamage,
      finalDamage: 0,
      resistanceApplied: true
    });
  }

  // 4. Check KO
  // Capture the defender's active card info BEFORE knockout processing
  // (because checkKnockout will move it to discard and set active to null)
  const defenderActiveBeforeKO = defender.active;
  const prizeCountForKO = defenderActiveBeforeKO ? getPrizeCount(defenderActiveBeforeKO) : 1;

  if (defenderActiveBeforeKO && checkKnockout(state, defenderIndex, "active")) {
    takePrizes(state, playerIndex, prizeCountForKO);

    // Check Win (Prizes taken all)
    if (checkWinCondition(state)) {
      return { success: true, gameEnded: true };
    }

    // Check if defender has bench Pokemon for promotion
    if (!defender.active && !isZoneEmpty(defender.bench)) {
      // If only one bench Pokemon, auto-promote
      if (defender.bench.cards.length === 1) {
        autoPromoteBench(state, defenderIndex);
      }
      // If multiple bench Pokemon, the defender needs to choose
      // We set a special flag in the state for the UI to handle
      // For now we'll track this via the "promote_required" phase concept
      // But since GamePhase doesn't have "promote_required", we'll use
      // a convention: keep active as null and let the controller handle it
    }

    // Check win again after promotion (no bench = lose)
    if (checkWinCondition(state)) {
      return { success: true, gameEnded: true };
    }
  }

  // 5. Return success (turn ending is handled by the controller)
  return { success: true };
}
