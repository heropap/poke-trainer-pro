/**
 * Manual Override Toolkit (Layer 2 / P1)
 *
 * Provides "god mode" operations that bypass normal game rules.
 * These allow players to manually execute effects for cards whose
 * effects are not implemented in the engine.
 *
 * Each override directly calls EffectContext atomic methods.
 */

import { GameState, GameCard, StatusCondition, logEvent, createGameCard } from "./game-state";
import { createEffectContext } from "./effects/effect-context";
import { findCard, removeCard } from "./zones";
import { Card } from "@/types/card";

// ─── Override Types ───

export type ManualOverrideType =
  | "draw_cards"               // Draw N cards
  | "discard_hand"             // Discard entire hand
  | "search_deck"              // Search deck for cards matching filter
  | "add_damage"               // Add damage counters to a target
  | "heal"                     // Remove damage counters from a target
  | "force_switch_self"        // Switch own active with bench (no retreat cost)
  | "force_switch_opponent"    // Switch opponent's active with their bench
  | "attach_energy_from_nowhere" // Create and attach energy (bypasses hand/once-per-turn)
  | "apply_status"             // Apply status condition to target
  | "remove_status"            // Remove all status conditions from target
  | "force_evolve"             // Evolve bypassing all restrictions
  | "search_discard"           // Retrieve cards from discard pile to hand
  | "shuffle_hand_draw"        // Shuffle hand into deck, draw N
  | "move_card_to_hand";       // Move any card from deck to hand by name filter

export interface ManualOverrideAction {
  type: "manual_override";
  overrideType: ManualOverrideType;
  params: Record<string, any>;
}

export interface ManualOverrideResult {
  success: boolean;
  error?: string;
  newState: GameState;
}

// ─── Main Executor ───

/**
 * Execute a manual override operation on the game state.
 * This bypasses normal game rules (turn order, once-per-turn limits, etc.)
 *
 * @param state - Current game state (will be mutated)
 * @param playerIndex - Which player is performing the override
 * @param action - The override action with type and params
 */
export function executeManualOverride(
  state: GameState,
  playerIndex: 0 | 1,
  action: ManualOverrideAction
): ManualOverrideResult {
  const { overrideType, params } = action;
  const player = state.players[playerIndex];

  // Create a virtual source for the effect context
  // Use the active Pokemon if available, otherwise create a minimal stub
  const source = player.active ?? createVirtualSource();

  const ctx = createEffectContext(state, playerIndex, source);

  try {
    switch (overrideType) {
      case "draw_cards":
        return handleDrawCards(ctx, state, playerIndex, params);
      case "discard_hand":
        return handleDiscardHand(ctx, state, playerIndex);
      case "search_deck":
        return handleSearchDeck(ctx, state, playerIndex, params);
      case "add_damage":
        return handleAddDamage(state, playerIndex, params);
      case "heal":
        return handleHeal(ctx, state, playerIndex, params);
      case "force_switch_self":
        return handleForceSwitchSelf(ctx, state, playerIndex, params);
      case "force_switch_opponent":
        return handleForceSwitchOpponent(ctx, state, playerIndex, params);
      case "attach_energy_from_nowhere":
        return handleAttachEnergyFromNowhere(state, playerIndex, params);
      case "apply_status":
        return handleApplyStatus(ctx, state, playerIndex, params);
      case "remove_status":
        return handleRemoveStatus(ctx, state, playerIndex, params);
      case "force_evolve":
        return handleForceEvolve(state, playerIndex, params);
      case "search_discard":
        return handleSearchDiscard(ctx, state, playerIndex, params);
      case "shuffle_hand_draw":
        return handleShuffleHandDraw(ctx, state, playerIndex, params);
      case "move_card_to_hand":
        return handleMoveCardToHand(ctx, state, playerIndex, params);
      default:
        return { success: false, error: `未知手动操作: ${overrideType}`, newState: { ...state } };
    }
  } catch (err: any) {
    return { success: false, error: `手动操作异常: ${err.message}`, newState: { ...state } };
  }
}

// ─── Handler Implementations ───

function handleDrawCards(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const count = params.count ?? 1;
  if (count < 1 || count > 20) {
    return { success: false, error: "抽牌数量须在 1-20 之间", newState: { ...state } };
  }
  const drawn = ctx.drawCards(count, "player");
  logEvent(state, playerIndex, "manual_override", `[手动] 抽了 ${drawn.length} 张牌`);
  return { success: true, newState: { ...state } };
}

function handleDiscardHand(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1
): ManualOverrideResult {
  const discarded = ctx.discardHand("player");
  logEvent(state, playerIndex, "manual_override", `[手动] 弃掉了全部 ${discarded.length} 张手牌`);
  return { success: true, newState: { ...state } };
}

function handleSearchDeck(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const filterType = params.filter as string ?? "any";
  const count = params.count ?? 1;

  const filter = buildCardFilter(filterType);
  const found = ctx.searchDeck(filter, count, "player");

  for (const card of found) {
    ctx.addToHand(card, "player");
  }
  ctx.shuffleDeck("player");

  logEvent(state, playerIndex, "manual_override",
    `[手动] 从牌组搜索了 ${found.length} 张卡牌 (filter: ${filterType})`);
  return { success: true, newState: { ...state } };
}

function handleAddDamage(
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const targetInstanceId = params.targetInstanceId as string;
  const amount = params.amount ?? 10;

  if (!targetInstanceId) {
    return { success: false, error: "需要指定目标宝可梦", newState: { ...state } };
  }

  const target = findPokemonInPlay(state, targetInstanceId);
  if (!target) {
    return { success: false, error: "找不到目标宝可梦", newState: { ...state } };
  }

  const counters = Math.floor(amount / 10);
  target.damageCounters += counters;

  logEvent(state, playerIndex, "manual_override",
    `[手动] 给 ${target.card.name} 放置了 ${counters} 个伤害计数器 (${amount} 伤害)`);
  return { success: true, newState: { ...state } };
}

function handleHeal(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const targetInstanceId = params.targetInstanceId as string;
  const amount = params.amount ?? 30;

  if (!targetInstanceId) {
    return { success: false, error: "需要指定目标宝可梦", newState: { ...state } };
  }

  const target = findPokemonInPlay(state, targetInstanceId);
  if (!target) {
    return { success: false, error: "找不到目标宝可梦", newState: { ...state } };
  }

  ctx.heal(amount, target);
  logEvent(state, playerIndex, "manual_override",
    `[手动] 治疗了 ${target.card.name} ${amount} 点伤害`);
  return { success: true, newState: { ...state } };
}

function handleForceSwitchSelf(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const benchInstanceId = params.benchInstanceId as string;
  if (!benchInstanceId) {
    return { success: false, error: "需要指定备战区宝可梦", newState: { ...state } };
  }

  const success = ctx.switchOwnActive(benchInstanceId);
  if (!success) {
    return { success: false, error: "换人失败", newState: { ...state } };
  }

  logEvent(state, playerIndex, "manual_override",
    `[手动] 强制换上了备战区的宝可梦`);
  return { success: true, newState: { ...state } };
}

function handleForceSwitchOpponent(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const benchInstanceId = params.benchInstanceId as string;
  if (!benchInstanceId) {
    return { success: false, error: "需要指定对手备战区宝可梦", newState: { ...state } };
  }

  const success = ctx.switchOpponentActive(benchInstanceId);
  if (!success) {
    return { success: false, error: "换人失败", newState: { ...state } };
  }

  logEvent(state, playerIndex, "manual_override",
    `[手动] 强制换上了对手备战区的宝可梦`);
  return { success: true, newState: { ...state } };
}

function handleAttachEnergyFromNowhere(
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const targetInstanceId = params.targetInstanceId as string;
  const energyType = params.energyType as string ?? "Colorless";

  if (!targetInstanceId) {
    return { success: false, error: "需要指定目标宝可梦", newState: { ...state } };
  }

  const target = findPokemonInPlay(state, targetInstanceId);
  if (!target) {
    return { success: false, error: "找不到目标宝可梦", newState: { ...state } };
  }

  // Create a virtual energy card
  const energyCard: Card = {
    id: `virtual-energy-${energyType.toLowerCase()}-${Date.now()}`,
    name: `Basic ${energyType} Energy`,
    supertype: "Energy",
    subtypes: ["Basic"],
    types: [energyType],
    number: "0",
    legalities: {},
    images: { small: "", large: "" },
  };

  const gameEnergy = createGameCard(energyCard);
  target.attachedEnergy.push(gameEnergy);

  logEvent(state, playerIndex, "manual_override",
    `[手动] 凭空给 ${target.card.name} 附加了 ${energyType} 能量`);
  return { success: true, newState: { ...state } };
}

function handleApplyStatus(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const targetInstanceId = params.targetInstanceId as string;
  const status = params.status as StatusCondition;

  if (!targetInstanceId) {
    return { success: false, error: "需要指定目标宝可梦", newState: { ...state } };
  }
  if (!status) {
    return { success: false, error: "需要指定状态异常类型", newState: { ...state } };
  }

  const target = findPokemonInPlay(state, targetInstanceId);
  if (!target) {
    return { success: false, error: "找不到目标宝可梦", newState: { ...state } };
  }

  ctx.applyStatus(target, status);
  logEvent(state, playerIndex, "manual_override",
    `[手动] 给 ${target.card.name} 施加了 ${status} 状态`);
  return { success: true, newState: { ...state } };
}

function handleRemoveStatus(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const targetInstanceId = params.targetInstanceId as string;

  if (!targetInstanceId) {
    return { success: false, error: "需要指定目标宝可梦", newState: { ...state } };
  }

  const target = findPokemonInPlay(state, targetInstanceId);
  if (!target) {
    return { success: false, error: "找不到目标宝可梦", newState: { ...state } };
  }

  ctx.removeAllStatus(target);
  logEvent(state, playerIndex, "manual_override",
    `[手动] 清除了 ${target.card.name} 的所有状态异常`);
  return { success: true, newState: { ...state } };
}

function handleForceEvolve(
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const cardId = params.cardId as string; // instanceId of the evolution card in hand
  const targetInstanceId = params.targetInstanceId as string; // instanceId of the Pokemon to evolve

  if (!cardId || !targetInstanceId) {
    return { success: false, error: "需要指定进化卡和目标宝可梦", newState: { ...state } };
  }

  const player = state.players[playerIndex];
  const target = findPokemonInPlay(state, targetInstanceId);
  if (!target) {
    return { success: false, error: "找不到目标宝可梦", newState: { ...state } };
  }

  // Find the evolution card in hand
  const evoCardIndex = player.hand.cards.findIndex(c => c.instanceId === cardId);
  if (evoCardIndex < 0) {
    return { success: false, error: "手牌中找不到进化卡", newState: { ...state } };
  }

  const evoCard = player.hand.cards[evoCardIndex];

  // Force evolve: bypass all checks (first turn, same turn, evolution chain)
  // Keep energy and damage, clear status
  const prevCard = target.card;
  target.card = evoCard.card;
  target.cardId = evoCard.cardId;
  target.statusConditions = [];
  target.evolvedThisTurn = true;

  // Remove evolution card from hand
  player.hand.cards.splice(evoCardIndex, 1);

  logEvent(state, playerIndex, "manual_override",
    `[手动] 强制将 ${prevCard.name} 进化为 ${evoCard.card.name} (跳过限制)`);
  return { success: true, newState: { ...state } };
}

function handleSearchDiscard(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const filterType = params.filter as string ?? "any";
  const count = params.count ?? 1;

  const filter = buildCardFilter(filterType);
  const found = ctx.searchDiscard(filter, count, "player");

  for (const card of found) {
    ctx.addToHand(card, "player");
  }

  logEvent(state, playerIndex, "manual_override",
    `[手动] 从弃牌堆取回了 ${found.length} 张卡牌 (filter: ${filterType})`);
  return { success: true, newState: { ...state } };
}

function handleShuffleHandDraw(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const count = params.count ?? 5;

  const shuffled = ctx.shuffleHandIntoDeck("player");
  const drawn = ctx.drawCards(count, "player");

  logEvent(state, playerIndex, "manual_override",
    `[手动] 洗回了 ${shuffled} 张手牌，重新抽了 ${drawn.length} 张`);
  return { success: true, newState: { ...state } };
}

function handleMoveCardToHand(
  ctx: ReturnType<typeof createEffectContext>,
  state: GameState,
  playerIndex: 0 | 1,
  params: Record<string, any>
): ManualOverrideResult {
  const filterType = params.filter as string ?? "any";
  const count = params.count ?? 1;

  const filter = buildCardFilter(filterType);
  const found = ctx.searchDeck(filter, count, "player");

  for (const card of found) {
    ctx.addToHand(card, "player");
  }
  ctx.shuffleDeck("player");

  logEvent(state, playerIndex, "manual_override",
    `[手动] 从牌组取了 ${found.length} 张卡到手牌 (filter: ${filterType})`);
  return { success: true, newState: { ...state } };
}

// ─── Utility ───

function createVirtualSource(): GameCard {
  return createGameCard({
    id: "__virtual__",
    name: "Manual Override",
    supertype: "Trainer",
    subtypes: ["Item"],
    number: "0",
    legalities: {},
    images: { small: "", large: "" },
  });
}

function findPokemonInPlay(state: GameState, instanceId: string): GameCard | null {
  for (const player of state.players) {
    if (player.active?.instanceId === instanceId) return player.active;
    const bench = player.bench.cards.find(c => c.instanceId === instanceId);
    if (bench) return bench;
  }
  return null;
}

function buildCardFilter(filterType: string): (card: GameCard) => boolean {
  switch (filterType) {
    case "pokemon":
      return (c) => c.card.supertype === "Pokémon";
    case "basic_pokemon":
      return (c) => c.card.supertype === "Pokémon" && (c.card.subtypes?.includes("Basic") ?? false);
    case "trainer":
      return (c) => c.card.supertype === "Trainer";
    case "energy":
      return (c) => c.card.supertype === "Energy";
    case "supporter":
      return (c) => c.card.supertype === "Trainer" && (c.card.subtypes?.includes("Supporter") ?? false);
    case "item":
      return (c) => c.card.supertype === "Trainer" && (c.card.subtypes?.includes("Item") ?? false);
    case "any":
    default:
      return () => true;
  }
}
