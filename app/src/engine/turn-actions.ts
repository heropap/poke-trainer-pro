/**
 * Turn Actions Module
 *
 * Implements all actions a player can perform during the main phase:
 * - Attach Energy (once per turn)
 * - Evolve Pokemon (not on first turn played)
 * - Retreat Active Pokemon (pay retreat cost)
 * - Play Supporter (once per turn)
 * - Play Item card
 * - Play Basic Pokemon to Bench
 *
 * Each action has:
 * 1. A legality check (can this action be performed?)
 * 2. An execution function (perform the action, mutates state, logs event)
 */

import {
  GameState,
  GameCard,
  Player,
  logEvent,
  GamePhase
} from "./game-state";
import { removeCard, addToBottom, findCard } from "./zones";
import { getEffect, getEffectSource } from "./effects/effect-registry";
import { createEffectContext } from "./effects/effect-context";
import { processBetweenTurns } from "./effects/status-effects";
import { validateEvolution } from "./middleware/evolution.middleware";
import { ActionEvent } from "./middleware/types";
import { checkEnergyCostWithProvided, getProvidedEnergy } from "./game-actions";
import { PREVENT_RETREAT_NEXT_TURN, ABILITY_BLOCKED } from "./effects/markers";

// ───────────────────────────────────────────────
// Action Result type
// ───────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  error?: string;
}

function ok(): ActionResult {
  return { success: true };
}

function fail(error: string): ActionResult {
  return { success: false, error };
}

export function getEffectiveRetreatCost(
  state: GameState,
  playerIndex: 0 | 1,
  card: GameCard
): number {
  let retreatCost = card.card.convertedRetreatCost ?? 0;

  // Apply tool retreat cost modifiers
  for (const tool of card.attachedTools) {
    const toolEffect = getEffect(tool.cardId, tool.card.name);
    if (toolEffect?.tool?.whileAttached?.modifyRetreatCost) {
      const ctx = createEffectContext(state, playerIndex, tool);
      retreatCost = toolEffect.tool.whileAttached.modifyRetreatCost(ctx, retreatCost);
    }
  }

  // Apply passive ability retreat cost modifiers from all Pokemon in play
  const player = state.players[playerIndex];
  const allInPlay: GameCard[] = [];
  if (player.active) allInPlay.push(player.active);
  allInPlay.push(...player.bench.cards);
  for (const pokemon of allInPlay) {
    if (pokemon.markers[ABILITY_BLOCKED] > 0) continue;
    const pokEffect = getEffect(pokemon.cardId, pokemon.card.name);
    if (!pokEffect?.abilities) continue;
    for (const ability of pokEffect.abilities) {
      if (ability.type !== "passive" || !ability.modifyRetreatCost) continue;
      const abilityCtx = createEffectContext(state, playerIndex, pokemon);
      retreatCost = ability.modifyRetreatCost(abilityCtx, retreatCost);
    }
  }

  // Apply Beach Court stadium effect: Basic Pokemon retreat cost -1
  if (state.stadium && state.stadium.card.card.name === "Beach Court") {
    if (card.card.subtypes.includes("Basic")) {
      retreatCost -= 1;
    }
  }

  return Math.max(0, retreatCost);
}

function checkTrainerEffectCanPlay(state: GameState, playerIndex: 0 | 1, card: GameCard): ActionResult {
  const cardEffect = getEffect(card.cardId, card.card.name);
  if (cardEffect?.trainer?.canPlay) {
    const ctx = createEffectContext(state, playerIndex, card);
    if (!cardEffect.trainer.canPlay(ctx)) {
      return fail("该卡当前无法使用");
    }
  }
  return ok();
}

async function runTrainerEffect(state: GameState, playerIndex: 0 | 1, card: GameCard): Promise<void> {
  const cardEffect = getEffect(card.cardId, card.card.name);
  if (cardEffect?.trainer?.onPlay) {
    const ctx = createEffectContext(state, playerIndex, card);
    await cardEffect.trainer.onPlay(ctx);
  }
}

// ───────────────────────────────────────────────
// Helper: Get the current player
// ───────────────────────────────────────────────

export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayer];
}

export function getOpponent(state: GameState): Player {
  return state.players[state.currentPlayer === 0 ? 1 : 0];
}

// ───────────────────────────────────────────────
// 1. Attach Energy
// ───────────────────────────────────────────────

/**
 * Check if the current player can attach an energy card.
 */
export function canAttachEnergy(
  state: GameState,
  energyInstanceId: string,
  targetInstanceId: string
): ActionResult {
  if (state.phase !== GamePhase.MAIN) {
    return fail("只能在主阶段附加能量");
  }

  const player = getCurrentPlayer(state);

  if (player.energyAttachedThisTurn) {
    return fail("每回合只能附加一次能量");
  }

  const energyCard = findCard(player.hand, energyInstanceId);
  if (!energyCard) {
    return fail("手牌中找不到该能量卡");
  }

  if (energyCard.card.supertype !== "Energy") {
    return fail("所选卡牌不是能量卡");
  }

  // Target must be active or on bench
  const target = findTarget(player, targetInstanceId);
  if (!target) {
    return fail("目标宝可梦不在场上");
  }

  return ok();
}

/**
 * Attach an energy card from hand to a Pokemon.
 */
export function attachEnergy(
  state: GameState,
  energyInstanceId: string,
  targetInstanceId: string
): ActionResult {
  const check = canAttachEnergy(state, energyInstanceId, targetInstanceId);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);
  const energyCard = removeCard(player.hand, energyInstanceId)!;
  const target = findTarget(player, targetInstanceId)!;

  // Use immutable update for attachedEnergy to ensure React detects the change
  target.attachedEnergy = [...target.attachedEnergy, energyCard];
  player.energyAttachedThisTurn = true;
  state.turnStatus.hasAttachedEnergy = true;

  logEvent(
    state,
    state.currentPlayer,
    "attach_energy",
    `${player.name} 将 ${energyCard.card.name} 附加到 ${target.card.name}`,
    { energyCardId: energyCard.cardId, targetCardId: target.cardId }
  );

  return ok();
}

// ───────────────────────────────────────────────
// 2. Evolve Pokemon
// ───────────────────────────────────────────────

/**
 * Check if an evolution is legal.
 *
 * Delegates to the declarative evolution middleware pipeline.
 * The pipeline runs rules in priority order (game-level → card-level → turn-level).
 * First denial short-circuits.
 *
 * @see evolution.middleware.ts for the full rule set and priority documentation.
 */
export function canEvolve(
  state: GameState,
  evolutionInstanceId: string,
  targetInstanceId: string
): ActionResult {
  const event: ActionEvent<"EVOLVE_ACTION"> = {
    type: "EVOLVE_ACTION",
    playerIndex: state.currentPlayer,
    payload: {
      evolutionCardId: evolutionInstanceId,
      targetPokemonId: targetInstanceId,
    },
  };

  const result = validateEvolution(state, event);
  if (!result.allowed) {
    return fail(result.reason!);
  }

  return ok();
}

/**
 * Evolve a Pokemon. The evolution card goes on top; the pre-evolution
 * stays as the underlying card data. Energy, tools, and damage transfer.
 */
export function evolvePokemon(
  state: GameState,
  evolutionInstanceId: string,
  targetInstanceId: string
): ActionResult {
  const check = canEvolve(state, evolutionInstanceId, targetInstanceId);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);
  const evolutionCard = removeCard(player.hand, evolutionInstanceId)!;
  const target = findTarget(player, targetInstanceId)!;

  const previousName = target.card.name;

  // Push current card onto evolution stack before overwriting
  // This preserves the complete evolution chain (e.g., Basic → Stage 1 → Stage 2)
  target.evolutionStack = [
    ...(target.evolutionStack || []),
    { cardId: target.cardId, card: target.card },
  ];

  // Transfer properties: energy, tools, damage stay
  // Card data updates to evolution
  target.card = evolutionCard.card;
  target.cardId = evolutionCard.cardId;
  // Evolution removes all status conditions and markers
  target.statusConditions = [];
  target.markers = {};
  // Mark as played this turn (can't evolve again this turn)
  target.playedThisTurn = true;
  // Mark as evolved this turn (distinct from "just entered play")
  target.evolvedThisTurn = true;

  logEvent(
    state,
    state.currentPlayer,
    "evolve_pokemon",
    `${player.name} 将 ${previousName} 进化为 ${target.card.name}`,
    { from: previousName, to: target.card.name }
  );

  // Trigger on_enter abilities for the evolved Pokemon
  // This handles abilities like "When you play this Pokémon from your hand to evolve..."
  // (e.g., Charizard ex's Infernal Reign, Gardevoir ex's Psychic Embrace, etc.)
  // Note: triggerOnEnterAbility is async but we fire-and-forget here to keep
  // evolvePokemon synchronous for backward compatibility. The async prompt
  // interactions will be handled via the state.prompt → UI callback mechanism.
  triggerOnEnterAbility(state, state.currentPlayer, target);

  return ok();
}

/**
 * Async version of evolvePokemon — awaits on_enter ability prompts.
 * Used by game-controller.ts for interactive play.
 */
export async function evolvePokemonAsync(
  state: GameState,
  evolutionInstanceId: string,
  targetInstanceId: string
): Promise<ActionResult> {
  const check = canEvolve(state, evolutionInstanceId, targetInstanceId);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);
  const evolutionCard = removeCard(player.hand, evolutionInstanceId)!;
  const target = findTarget(player, targetInstanceId)!;

  const previousName = target.card.name;

  target.evolutionStack = [
    ...(target.evolutionStack || []),
    { cardId: target.cardId, card: target.card },
  ];

  target.card = evolutionCard.card;
  target.cardId = evolutionCard.cardId;
  target.statusConditions = [];
  target.markers = {};
  target.playedThisTurn = true;
  target.evolvedThisTurn = true;

  logEvent(
    state,
    state.currentPlayer,
    "evolve_pokemon",
    `${player.name} 将 ${previousName} 进化为 ${target.card.name}`,
    { from: previousName, to: target.card.name }
  );

  // Await on_enter abilities for interactive prompt support
  await triggerOnEnterAbility(state, state.currentPlayer, target);

  return ok();
}

// ───────────────────────────────────────────────
// 3. Retreat
// ───────────────────────────────────────────────

/**
 * Check if the active Pokemon can retreat.
 */
export function canRetreat(
  state: GameState,
  energyToDiscard: string[]
): ActionResult {
  if (state.phase !== GamePhase.MAIN) {
    return fail("只能在主阶段撤退");
  }

  if (state.turnStatus.hasRetreated) {
    return fail("本回合已经撤退过了");
  }

  const player = getCurrentPlayer(state);

  if (!player.active) {
    return fail("没有战斗宝可梦");
  }

  if (player.bench.cards.length === 0) {
    return fail("备战区没有宝可梦可以替换");
  }

  // ─── Status condition check: Paralyzed Pokemon cannot retreat ───
  if (player.active.statusConditions.includes("paralyzed")) {
    return fail("麻痹状态的宝可梦不能撤退");
  }

  // ─── Status condition check: Asleep Pokemon cannot retreat ───
  if (player.active.statusConditions.includes("asleep")) {
    return fail("睡眠状态的宝可梦不能撤退");
  }

  // ─── Marker check: PREVENT_RETREAT_NEXT_TURN ───
  if (player.active.markers[PREVENT_RETREAT_NEXT_TURN] > 0) {
    return fail("该宝可梦被禁止撤退");
  }

  const retreatCost = getEffectiveRetreatCost(state, state.currentPlayer, player.active);

  const selectedEnergy: GameCard[] = [];
  for (const eid of energyToDiscard) {
    const found = player.active.attachedEnergy.find(
      (e) => e.instanceId === eid
    );
    if (!found) {
      return fail(`能量 ${eid} 不在战斗宝可梦身上`);
    }
    selectedEnergy.push(found);
  }

  if (retreatCost > 0) {
    const cost = Array.from({ length: retreatCost }, () => "Colorless");
    const energyCheck = checkEnergyCostWithProvided(
      getProvidedEnergy(selectedEnergy),
      cost
    );
    if (!energyCheck.sufficient) {
      return fail(`撤退需要 ${retreatCost} 点能量，所选能量不足`);
    }
  }

  return ok();
}

/**
 * Retreat the active Pokemon. Discard energy, swap with bench Pokemon.
 */
export function retreat(
  state: GameState,
  energyToDiscard: string[],
  benchInstanceId: string
): ActionResult {
  const check = canRetreat(state, energyToDiscard);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);

  // Verify bench target exists
  const benchCard = findCard(player.bench, benchInstanceId);
  if (!benchCard) {
    return fail("备战区找不到指定的宝可梦");
  }

  const active = player.active!;

  // Discard energy from active Pokemon
  for (const eid of energyToDiscard) {
    const idx = active.attachedEnergy.findIndex((e) => e.instanceId === eid);
    if (idx !== -1) {
      const discarded = active.attachedEnergy.splice(idx, 1)[0];
      addToBottom(player.discard, discarded);
    }
  }

  // PTCG Rule: leaving the Active spot clears ALL status conditions
  active.statusConditions = [];

  // Swap: active → bench, bench target → active
  removeCard(player.bench, benchInstanceId);
  addToBottom(player.bench, active);
  player.active = benchCard;
  state.turnStatus.hasRetreated = true;

  logEvent(
    state,
    state.currentPlayer,
    "retreat",
    `${player.name} 将 ${active.card.name} 撤退，换上 ${benchCard.card.name}`,
    { retreated: active.card.name, promoted: benchCard.card.name }
  );

  return ok();
}

// ───────────────────────────────────────────────
// 4. Play Supporter
// ───────────────────────────────────────────────

/**
 * Check if a supporter card can be played.
 */
export function canPlaySupporter(
  state: GameState,
  supporterInstanceId: string
): ActionResult {
  if (state.phase !== GamePhase.MAIN) {
    return fail("只能在主阶段使用支持者");
  }

  const player = getCurrentPlayer(state);

  if (player.supporterUsedThisTurn) {
    return fail("每回合只能使用一张支持者卡");
  }

  // ─── PTCG Rule: Going-first player cannot play Supporter on their first turn ───
  if (state.turn === 1 && state.isFirstTurn) {
    return fail("先攻方第一回合不能使用支持者卡");
  }

  const card = findCard(player.hand, supporterInstanceId);
  if (!card) {
    return fail("手牌中找不到该卡牌");
  }

  if (
    card.card.supertype !== "Trainer" ||
    !card.card.subtypes.includes("Supporter")
  ) {
    return fail("所选卡牌不是支持者卡");
  }

  return checkTrainerEffectCanPlay(state, state.currentPlayer, card);
}

/**
 * Play a supporter card from hand.
 * If a registered effect exists, execute it before discarding.
 */
export async function playSupporter(
  state: GameState,
  supporterInstanceId: string
): Promise<ActionResult> {
  const check = canPlaySupporter(state, supporterInstanceId);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);
  const card = removeCard(player.hand, supporterInstanceId)!;

  player.supporterUsedThisTurn = true;
  state.turnStatus.hasPlayedSupporter = true;

  const effectSource = getEffectSource(card.cardId, card.card.name) || "none";

  logEvent(
    state,
    state.currentPlayer,
    "use_supporter",
    `${player.name} 使用了 ${card.card.name}`,
    { cardName: card.card.name, effectSource }
  );

  // Execute trainer effect if registered
  await runTrainerEffect(state, state.currentPlayer, card);

  addToBottom(player.discard, card);

  return ok();
}

// ───────────────────────────────────────────────
// 5. Play Item
// ───────────────────────────────────────────────

/**
 * Check if an item card can be played.
 */
export function canPlayItem(
  state: GameState,
  itemInstanceId: string
): ActionResult {
  if (state.phase !== GamePhase.MAIN) {
    return fail("只能在主阶段使用物品卡");
  }

  const player = getCurrentPlayer(state);

  const card = findCard(player.hand, itemInstanceId);
  if (!card) {
    return fail("手牌中找不到该卡牌");
  }

  if (
    card.card.supertype !== "Trainer" ||
    !card.card.subtypes.includes("Item")
  ) {
    return fail("所选卡牌不是物品卡");
  }

  return checkTrainerEffectCanPlay(state, state.currentPlayer, card);
}

/**
 * Play an item card from hand.
 * If it's a Pokemon Tool, attach it instead of discarding.
 * Otherwise execute effect and discard.
 */
export async function playItem(
  state: GameState,
  itemInstanceId: string,
  targetInstanceId?: string
): Promise<ActionResult> {
  const check = canPlayItem(state, itemInstanceId);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);
  const card = removeCard(player.hand, itemInstanceId)!;

  // Check if it's a Pokemon Tool — attach instead of discard
  if (card.card.subtypes.includes("Pokémon Tool") && targetInstanceId) {
    const target = findTarget(player, targetInstanceId);
    if (!target) {
      // Put card back in hand
      player.hand.cards.push(card);
      return fail("目标宝可梦不在场上");
    }
    if (target.attachedTools.length > 0) {
      player.hand.cards.push(card);
      return fail("该宝可梦已经装备了工具卡");
    }
    target.attachedTools.push(card);
    logEvent(
      state,
      state.currentPlayer,
      "use_trainer",
      `${player.name} 将 ${card.card.name} 装备到了 ${target.card.name}`,
      { toolName: card.card.name, targetName: target.card.name }
    );
    return ok();
  }

  const itemEffectSource = getEffectSource(card.cardId, card.card.name) || "none";

  logEvent(
    state,
    state.currentPlayer,
    "use_trainer",
    `${player.name} 使用了 ${card.card.name}`,
    { cardName: card.card.name, effectSource: itemEffectSource }
  );

  // Execute item effect if registered
  await runTrainerEffect(state, state.currentPlayer, card);

  addToBottom(player.discard, card);

  return ok();
}

// ───────────────────────────────────────────────
// 6. Play Basic Pokemon to Bench
// ───────────────────────────────────────────────

/**
 * Check if a basic Pokemon can be placed on the bench.
 */
export function canPlayBasicToBench(
  state: GameState,
  pokemonInstanceId: string
): ActionResult {
  if (state.phase !== GamePhase.MAIN) {
    return fail("只能在主阶段放置宝可梦");
  }

  const player = getCurrentPlayer(state);

  const card = findCard(player.hand, pokemonInstanceId);
  if (!card) {
    return fail("手牌中找不到该卡牌");
  }

  if (
    card.card.supertype !== "Pokémon" ||
    !card.card.subtypes.includes("Basic")
  ) {
    return fail("只能将基础宝可梦放到备战区");
  }

  if (player.bench.cards.length >= 5) {
    return fail("备战区已满（最多 5 只）");
  }

  return ok();
}

/**
 * Play a basic Pokemon from hand to the bench.
 */
export function playBasicToBench(
  state: GameState,
  pokemonInstanceId: string
): ActionResult {
  const check = canPlayBasicToBench(state, pokemonInstanceId);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);
  const card = removeCard(player.hand, pokemonInstanceId)!;

  card.playedThisTurn = true;
  addToBottom(player.bench, card);

  logEvent(
    state,
    state.currentPlayer,
    "play_pokemon",
    `${player.name} 将 ${card.card.name} 放到备战区`,
    { cardName: card.card.name }
  );

  // Trigger on_enter abilities (fire-and-forget for sync compatibility)
  triggerOnEnterAbility(state, state.currentPlayer, card);

  return ok();
}

/**
 * Trigger on_enter abilities for a Pokemon that just entered play.
 * Checks the effect registry for abilities with type "on_enter" and
 * calls their onEnter handler.
 */
async function triggerOnEnterAbility(
  state: GameState,
  playerIndex: 0 | 1,
  pokemon: GameCard
): Promise<void> {
  if (pokemon.markers[ABILITY_BLOCKED] > 0) return;

  const effect = getEffect(pokemon.cardId, pokemon.card.name);
  if (!effect?.abilities) return;

  for (const ability of effect.abilities) {
    if (ability.type !== "on_enter" || !ability.onEnter) continue;

    logEvent(
      state,
      playerIndex,
      "use_ability",
      `${pokemon.card.name} 的入场特性 ${ability.name} 触发了`,
      { cardName: pokemon.card.name, abilityName: ability.name }
    );

    const ctx = createEffectContext(state, playerIndex, pokemon);
    await ability.onEnter(ctx);
  }
}

// ───────────────────────────────────────────────
// 7. Play Stadium
// ───────────────────────────────────────────────

/**
 * Check if a stadium card can be played.
 * PTCG rules:
 * - Only one stadium in play at a time (shared between players)
 * - You can't play a stadium with the same name as the one already in play
 * - Playing a new stadium discards the old one
 * - One stadium per turn
 */
export function canPlayStadium(
  state: GameState,
  stadiumInstanceId: string
): ActionResult {
  if (state.phase !== GamePhase.MAIN) {
    return fail("只能在主阶段使用场地卡");
  }

  if (state.turnStatus.hasPlayedStadium) {
    return fail("每回合只能使用一张场地卡");
  }

  const player = getCurrentPlayer(state);
  const card = findCard(player.hand, stadiumInstanceId);
  if (!card) {
    return fail("手牌中找不到该卡牌");
  }

  if (
    card.card.supertype !== "Trainer" ||
    !card.card.subtypes.includes("Stadium")
  ) {
    return fail("所选卡牌不是场地卡");
  }

  // Can't play a stadium with the same name as the current one
  if (state.stadium && state.stadium.card.card.name === card.card.name) {
    return fail("不能打出与当前场地同名的场地卡");
  }

  return checkTrainerEffectCanPlay(state, state.currentPlayer, card);
}

/**
 * Play a stadium card from hand.
 * If another stadium is already in play, discard it first.
 */
export async function playStadium(
  state: GameState,
  stadiumInstanceId: string
): Promise<ActionResult> {
  const check = canPlayStadium(state, stadiumInstanceId);
  if (!check.success) return check;

  const player = getCurrentPlayer(state);
  const card = removeCard(player.hand, stadiumInstanceId)!;

  // Discard old stadium if one exists
  if (state.stadium) {
    const oldStadium = state.stadium.card;
    const oldOwner = state.players[state.stadium.owner];
    addToBottom(oldOwner.discard, oldStadium);

    logEvent(
      state,
      state.currentPlayer,
      "remove_stadium",
      `场地卡 ${oldStadium.card.name} 被移除`,
      { stadiumName: oldStadium.card.name }
    );
  }

  // Place new stadium
  state.stadium = {
    card: card,
    owner: state.currentPlayer,
  };
  state.turnStatus.hasPlayedStadium = true;

  logEvent(
    state,
    state.currentPlayer,
    "play_stadium",
    `${player.name} 打出了场地卡 ${card.card.name}`,
    { stadiumName: card.card.name }
  );

  // Execute stadium effect if registered
  await runTrainerEffect(state, state.currentPlayer, card);

  return ok();
}

// ───────────────────────────────────────────────
// 8. End Turn
// ───────────────────────────────────────────────

/**
 * End the current player's turn.
 * Processes between-turns status effects, resets flags, switches player.
 */
export function endTurn(state: GameState): ActionResult {
  if (state.phase !== GamePhase.MAIN && state.phase !== GamePhase.ATTACK) {
    return fail("当前阶段不能结束回合");
  }

  const currentPlayerIndex = state.currentPlayer;
  const player = getCurrentPlayer(state);

  // Process between-turns status effects for BOTH players (PTCG rule)
  // Current player's active Pokemon checked first, then opponent's
  processBetweenTurns(state, currentPlayerIndex, true);

  // Check if status damage caused a game over
  if ((state.phase as string) === "game_over") {
    return ok();
  }

  // Process opponent's active Pokemon status effects
  const opponentIndex = (currentPlayerIndex === 0 ? 1 : 0) as 0 | 1;
  processBetweenTurns(state, opponentIndex, false);

  // Check again if opponent's status damage caused a game over
  if ((state.phase as string) === "game_over") {
    return ok();
  }

  // Reset per-turn flags
  player.energyAttachedThisTurn = false;
  player.supporterUsedThisTurn = false;

  // Reset turn status for the NEXT turn
  state.turnStatus = {
    currentPlayerId: state.players[state.currentPlayer === 0 ? 1 : 0].id,
    turnCount: state.turn + 1,
    currentPhase: GamePhase.DRAW,
    hasAttachedEnergy: false,
    hasPlayedSupporter: false,
    hasPlayedStadium: false,
    hasRetreated: false,
    hasAttacked: false,
    p1VstarUsed: state.turnStatus.p1VstarUsed,
    p2VstarUsed: state.turnStatus.p2VstarUsed,
  };

  // Reset per-turn flags for all of this player's Pokemon
  if (player.active) {
    player.active.playedThisTurn = false;
    player.active.evolvedThisTurn = false;
    player.active.abilityUsedThisTurn = false;
  }
  for (const card of player.bench.cards) {
    card.playedThisTurn = false;
    card.evolvedThisTurn = false;
    card.abilityUsedThisTurn = false;
  }

  // Switch player
  state.currentPlayer = state.currentPlayer === 0 ? 1 : 0;
  state.turn++;
  state.isFirstTurn = false;
  state.phase = GamePhase.DRAW;

  logEvent(
    state,
    state.currentPlayer,
    "draw_card",
    `回合 ${state.turn}: ${state.players[state.currentPlayer].name} 的回合`,
    { turn: state.turn }
  );

  return ok();
}

// ───────────────────────────────────────────────
// 8. Draw Card (start of turn)
// ───────────────────────────────────────────────

/**
 * Draw a card at the start of the turn.
 */
export function drawCard(state: GameState): ActionResult {
  if (state.phase !== GamePhase.DRAW) {
    return fail("只能在抽牌阶段抽牌");
  }

  const player = getCurrentPlayer(state);

  if (player.deck.cards.length === 0) {
    // Deck out — opponent wins
    state.phase = GamePhase.GAME_OVER;
    state.winner = {
      playerIndex: state.currentPlayer === 0 ? 1 : 0,
      condition: "deck_out",
    };
    logEvent(
      state,
      state.currentPlayer,
      "game_over",
      `${player.name} 无法抽牌，对手获胜！`,
      { condition: "deck_out" }
    );
    return ok();
  }

  const drawn = player.deck.cards.shift()!;
  player.hand.cards.push(drawn);

  state.phase = GamePhase.MAIN;
  state.turnStatus.currentPhase = GamePhase.MAIN;

  logEvent(
    state,
    state.currentPlayer,
    "draw_card",
    `${player.name} 抽了一张牌`,
    { cardName: drawn.card.name }
  );

  return ok();
}

// ───────────────────────────────────────────────
// Helper: Find a Pokemon target (active or bench)
// ───────────────────────────────────────────────

function findTarget(player: Player, instanceId: string): GameCard | null {
  if (player.active && player.active.instanceId === instanceId) {
    return player.active;
  }
  return findCard(player.bench, instanceId) ?? null;
}
