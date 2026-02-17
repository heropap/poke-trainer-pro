/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Effect Context Factory
 *
 * Creates EffectContext objects that provide helper methods for card effects.
 * Each method operates directly on the GameState and logs appropriate events.
 */

import { GameState, GameCard, Player, StatusCondition, logEvent } from "../game-state";
import { removeCard, addToBottom, addToTop, shuffleZone, findCard, drawMultiple } from "../zones";
import { flipCoin as coinFlip, flipCoins as coinFlips } from "./coin";
import { checkKnockout, takePrizes, getPrizeCount, checkWinCondition } from "../game-actions";
import { EffectContext } from "./effect-types";

/**
 * Global store for pending prompt resolvers.
 * This allows async effects to pause execution until the UI responds.
 * Key: promptId, Value: resolve function
 */
export const pendingPrompts = new Map<string, (ids: string[]) => void>();

/**
 * Create an EffectContext for a card effect execution.
 *
 * @param state - The current game state (will be mutated)
 * @param playerIndex - The player performing the effect
 * @param source - The source card of the effect
 */
export function createEffectContext(
  state: GameState,
  playerIndex: 0 | 1,
  source: GameCard
): EffectContext {
  const opponentIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;

  const ctx: EffectContext = {
    state,
    player: state.players[playerIndex],
    opponent: state.players[opponentIndex],
    playerIndex,
    opponentIndex,
    source,

    // ─── Damage ───

    damage(amount: number, target?: GameCard): void {
      const t = target ?? state.players[opponentIndex].active;
      if (!t || amount <= 0) return;

      t.damageCounters += amount / 10;

      logEvent(state, playerIndex, "damage",
        `${source.card.name} 的效果对 ${t.card.name} 造成了 ${amount} 点伤害`,
        { amount, targetName: t.card.name }
      );
    },

    damageAll(amount: number, targets: GameCard[]): void {
      if (amount <= 0) return;
      for (const t of targets) {
        t.damageCounters += amount / 10;
        logEvent(state, playerIndex, "damage",
          `${source.card.name} 的效果对 ${t.card.name} 造成了 ${amount} 点伤害`,
          { amount, targetName: t.card.name }
        );
      }
    },

    // ─── Heal ───

    heal(amount: number, target: GameCard): void {
      if (amount <= 0) return;
      const healCounters = amount / 10;
      const actual = Math.min(target.damageCounters, healCounters);
      target.damageCounters -= actual;

      logEvent(state, playerIndex, "heal" as any,
        `${target.card.name} 恢复了 ${actual * 10} 点 HP`,
        { amount: actual * 10, targetName: target.card.name }
      );
    },

    // ─── Draw ───

    drawCards(count: number, who: "player" | "opponent" = "player"): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const pIdx = who === "player" ? playerIndex : opponentIndex;
      const drawn = drawMultiple(p.deck, count);
      p.hand.cards.push(...drawn);

      if (drawn.length > 0) {
        logEvent(state, pIdx, "draw_card",
          `${p.name} 抽了 ${drawn.length} 张牌`,
          { count: drawn.length }
        );
      }

      return drawn;
    },

    // ─── Discard ───

    discardFromHand(count: number, who: "player" | "opponent" = "player"): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const discarded: GameCard[] = [];
      const actual = Math.min(count, p.hand.cards.length);

      for (let i = 0; i < actual; i++) {
        // Discard from the end of hand (simplified - no choice)
        const card = p.hand.cards.pop();
        if (card) {
          addToBottom(p.discard, card);
          discarded.push(card);
        }
      }

      return discarded;
    },

    discardHand(who: "player" | "opponent" = "player"): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const discarded = [...p.hand.cards];
      for (const card of discarded) {
        addToBottom(p.discard, card);
      }
      p.hand.cards = [];

      if (discarded.length > 0) {
        logEvent(state, playerIndex, "use_trainer" as any,
          `${p.name} 丢弃了手中全部 ${discarded.length} 张牌`
        );
      }

      return discarded;
    },

    // ─── Search Deck ───

    searchDeck(
      filter: (card: GameCard) => boolean,
      count: number,
      who: "player" | "opponent" = "player"
    ): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const found: GameCard[] = [];

      for (let i = 0; i < p.deck.cards.length && found.length < count; i++) {
        if (filter(p.deck.cards[i])) {
          found.push(p.deck.cards[i]);
        }
      }

      // Remove found cards from deck
      for (const card of found) {
        const idx = p.deck.cards.indexOf(card);
        if (idx !== -1) {
          p.deck.cards.splice(idx, 1);
        }
      }

      if (found.length > 0) {
        logEvent(state, playerIndex, "search_deck" as any,
          `从牌组中搜索到了 ${found.length} 张牌`,
          { count: found.length }
        );
      }

      return found;
    },

    addToHand(card: GameCard, who: "player" | "opponent" = "player"): void {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      p.hand.cards.push(card);
    },

    shuffleDeck(who: "player" | "opponent" = "player"): void {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      shuffleZone(p.deck);
    },

    // ─── Energy Operations ───

    attachEnergyFromDeck(
      filter: (c: GameCard) => boolean,
      target: GameCard
    ): boolean {
      const p = state.players[playerIndex];
      const idx = p.deck.cards.findIndex(filter);
      if (idx === -1) return false;

      const energy = p.deck.cards.splice(idx, 1)[0];
      target.attachedEnergy.push(energy);

      logEvent(state, playerIndex, "attach_energy",
        `从牌组中搜索到 ${energy.card.name} 并附加到 ${target.card.name}`,
        { energyName: energy.card.name, targetName: target.card.name }
      );

      return true;
    },

    moveEnergy(
      from: GameCard,
      to: GameCard,
      energyInstanceId: string
    ): boolean {
      const idx = from.attachedEnergy.findIndex(e => e.instanceId === energyInstanceId);
      if (idx === -1) return false;

      const energy = from.attachedEnergy.splice(idx, 1)[0];
      to.attachedEnergy.push(energy);

      logEvent(state, playerIndex, "attach_energy",
        `将 ${energy.card.name} 从 ${from.card.name} 移动到 ${to.card.name}`,
        { energyName: energy.card.name, fromName: from.card.name, toName: to.card.name }
      );

      return true;
    },

    // ─── Coin Flip ───

    flipCoin(): boolean {
      const result = coinFlip();
      logEvent(state, playerIndex, "coin_flip" as any,
        result ? "翻硬币: 正面!" : "翻硬币: 反面!",
        { result: result ? "heads" : "tails" }
      );
      return result;
    },

    flipCoins(count: number): { heads: number; tails: number } {
      const result = coinFlips(count);
      logEvent(state, playerIndex, "coin_flip" as any,
        `翻 ${count} 枚硬币: ${result.heads} 正面, ${result.tails} 反面`,
        { count, heads: result.heads, tails: result.tails }
      );
      return result;
    },

    // ─── Status Conditions ───

    applyStatus(target: GameCard, status: StatusCondition): void {
      // Some statuses are mutually exclusive (asleep, confused, paralyzed)
      if (status === "asleep" || status === "confused" || status === "paralyzed") {
        // Remove any existing mutually exclusive status
        target.statusConditions = target.statusConditions.filter(
          s => s !== "asleep" && s !== "confused" && s !== "paralyzed"
        );
      }

      if (!target.statusConditions.includes(status)) {
        target.statusConditions.push(status);
      }

      logEvent(state, playerIndex, "status_effect",
        `${target.card.name} 陷入了 ${statusToText(status)} 状态!`,
        { status, targetName: target.card.name }
      );
    },

    removeStatus(target: GameCard, status: StatusCondition): void {
      target.statusConditions = target.statusConditions.filter(s => s !== status);
    },

    removeAllStatus(target: GameCard): void {
      target.statusConditions = [];
    },

    // ─── Field Manipulation ───

    switchOpponentActive(benchInstanceId: string): boolean {
      const opp = state.players[opponentIndex];

      if (!opp.active) return false;

      const benchCard = findCard(opp.bench, benchInstanceId);
      if (!benchCard) return false;

      // Move current active to bench
      const currentActive = opp.active;
      removeCard(opp.bench, benchInstanceId);
      addToBottom(opp.bench, currentActive);
      opp.active = benchCard;

      // PTCG Rule: leaving the Active spot clears ALL status conditions
      currentActive.statusConditions = [];

      logEvent(state, playerIndex, "retreat",
        `${source.card.name} 的效果将 ${benchCard.card.name} 拖到了战斗区!`,
        { newActive: benchCard.card.name, oldActive: currentActive.card.name }
      );

      return true;
    },

    // ─── Switch Own Active ───

    switchOwnActive(benchInstanceId: string): boolean {
      const p = state.players[playerIndex];

      if (!p.active) return false;

      const benchCard = findCard(p.bench, benchInstanceId);
      if (!benchCard) return false;

      const currentActive = p.active;
      removeCard(p.bench, benchInstanceId);
      addToBottom(p.bench, currentActive);
      p.active = benchCard;

      // Clear status conditions on the Pokemon that was switched out
      currentActive.statusConditions = [];

      logEvent(state, playerIndex, "retreat",
        `${currentActive.card.name} 退回备战区，${benchCard.card.name} 成为了新的战斗宝可梦!`,
        { newActive: benchCard.card.name, oldActive: currentActive.card.name }
      );

      return true;
    },

    // ─── Search Discard ───

    searchDiscard(
      filter: (card: GameCard) => boolean,
      count: number,
      who: "player" | "opponent" = "player"
    ): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const found: GameCard[] = [];

      for (let i = 0; i < p.discard.cards.length && found.length < count; i++) {
        if (filter(p.discard.cards[i])) {
          found.push(p.discard.cards[i]);
        }
      }

      // Remove found cards from discard
      for (const card of found) {
        const idx = p.discard.cards.indexOf(card);
        if (idx !== -1) {
          p.discard.cards.splice(idx, 1);
        }
      }

      if (found.length > 0) {
        logEvent(state, playerIndex, "search_deck" as any,
          `从弃牌堆中取回了 ${found.length} 张牌`,
          { count: found.length }
        );
      }

      return found;
    },

    // ─── Shuffle Hand Into Deck ───

    shuffleHandIntoDeck(who: "player" | "opponent" = "player"): number {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const count = p.hand.cards.length;

      // Move all hand cards to deck
      for (const card of p.hand.cards) {
        addToBottom(p.deck, card);
      }
      p.hand.cards = [];

      // Shuffle the deck
      shuffleZone(p.deck);

      if (count > 0) {
        logEvent(state, playerIndex, "use_trainer" as any,
          `${p.name} 将手中 ${count} 张牌洗入了牌组`,
          { count }
        );
      }

      return count;
    },

    // ─── Reveal Top Cards ───

    revealTopCards(count: number, who: "player" | "opponent" = "player"): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const revealed = drawMultiple(p.deck, count);

      if (revealed.length > 0) {
        logEvent(state, playerIndex, "search_deck" as any,
          `翻开了牌组顶部 ${revealed.length} 张牌`,
          { count: revealed.length }
        );
      }

      return revealed;
    },

    // ─── Put On Top Of Deck ───

    putOnTopOfDeck(cards: GameCard[], who: "player" | "opponent" = "player"): void {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];

      // Add in reverse order so first card in array ends up on top
      for (let i = cards.length - 1; i >= 0; i--) {
        addToTop(p.deck, cards[i]);
      }
    },

    // ─── Shuffle Into Deck ───

    shuffleIntoDeck(cards: GameCard[], who: "player" | "opponent" = "player"): void {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];

      for (const card of cards) {
        addToBottom(p.deck, card);
      }
      shuffleZone(p.deck);

      if (cards.length > 0) {
        logEvent(state, playerIndex, "use_trainer" as any,
          `将 ${cards.length} 张牌洗入了牌组`,
          { count: cards.length }
        );
      }
    },

    // ─── Attach Energy From Discard ───

    attachEnergyFromDiscard(
      filter: (c: GameCard) => boolean,
      count: number,
      target: GameCard
    ): GameCard[] {
      const p = state.players[playerIndex];
      const attached: GameCard[] = [];

      for (let i = 0; i < p.discard.cards.length && attached.length < count; i++) {
        if (filter(p.discard.cards[i])) {
          attached.push(p.discard.cards[i]);
        }
      }

      // Remove from discard and attach
      for (const energy of attached) {
        const idx = p.discard.cards.indexOf(energy);
        if (idx !== -1) {
          p.discard.cards.splice(idx, 1);
        }
        target.attachedEnergy.push(energy);
      }

      if (attached.length > 0) {
        logEvent(state, playerIndex, "attach_energy",
          `从弃牌堆取回 ${attached.length} 张能量附加到 ${target.card.name}`,
          { count: attached.length, targetName: target.card.name }
        );
      }

      return attached;
    },

    // ─── Pick Up Pokemon ───

    pickUpPokemon(instanceId: string, who: "player" | "opponent" = "player"): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const collected: GameCard[] = [];
      let pokemon: GameCard | null = null;

      // Check if it's the active Pokemon
      if (p.active?.instanceId === instanceId) {
        pokemon = p.active;
        p.active = null;
      } else {
        // Check bench
        pokemon = removeCard(p.bench, instanceId) ?? null;
      }

      if (!pokemon) return [];

      // Collect all attached energy
      for (const energy of pokemon.attachedEnergy) {
        collected.push(energy);
      }
      pokemon.attachedEnergy = [];

      // Collect all attached tools
      for (const tool of pokemon.attachedTools) {
        collected.push(tool);
      }
      pokemon.attachedTools = [];

      // Reset Pokemon state
      pokemon.damageCounters = 0;
      pokemon.statusConditions = [];
      pokemon.playedThisTurn = false;
      pokemon.abilityUsedThisTurn = false;
      pokemon.markers = {};
      pokemon.evolutionStack = [];

      // Add the Pokemon itself
      collected.push(pokemon);

      logEvent(state, playerIndex, "use_trainer" as any,
        `${pokemon.card.name} 及其附加卡片被回收到手中`,
        { pokemonName: pokemon.card.name, totalCards: collected.length }
      );

      return collected;
    },

    // ─── Stadium ───

    getStadium(): GameCard | null {
      return state.stadium?.card ?? null;
    },

    removeStadium(): boolean {
      if (!state.stadium) return false;

      const oldStadium = state.stadium.card;
      const oldOwner = state.players[state.stadium.owner];
      addToBottom(oldOwner.discard, oldStadium);

      logEvent(state, playerIndex, "remove_stadium",
        `场地卡 ${oldStadium.card.name} 被移除`,
        { stadiumName: oldStadium.card.name }
      );

      state.stadium = null;
      return true;
    },

    findPokemon(instanceId: string): GameCard | null {
      for (const p of state.players) {
        if (p.active?.instanceId === instanceId) return p.active;
        const bench = findCard(p.bench, instanceId);
        if (bench) return bench;
      }
      return null;
    },

    getAllPokemon(who: "player" | "opponent" = "player"): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const all: GameCard[] = [];
      if (p.active) all.push(p.active);
      all.push(...p.bench.cards);
      return all;
    },

    // ─── Markers ───

    addMarker(target: GameCard, name: string, count: number = 1): void {
      target.markers[name] = (target.markers[name] || 0) + count;
    },

    removeMarker(target: GameCard, name: string, count?: number): void {
      if (count === undefined) {
        delete target.markers[name];
      } else {
        const current = target.markers[name] || 0;
        const newVal = current - count;
        if (newVal <= 0) {
          delete target.markers[name];
        } else {
          target.markers[name] = newVal;
        }
      }
    },

    getMarker(target: GameCard, name: string): number {
      return target.markers[name] || 0;
    },

    hasMarker(target: GameCard, name: string): boolean {
      return (target.markers[name] || 0) > 0;
    },

    // ─── Logging ───

    log(message: string): void {
      logEvent(state, playerIndex, "use_ability" as any, message);
    },

    // ─── User Prompt ───

    promptUser(options): Promise<string[]> {
      const promptId = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      
      state.prompt = {
        id: promptId,
        type: "select_cards",
        playerIndex: playerIndex,
        zone: options.zone || "deck",
        min: options.min,
        max: options.max,
        message: options.message,
        filter: options.filter,
        targets: options.targets
      };
      
      return new Promise<string[]>((resolve) => {
        pendingPrompts.set(promptId, resolve);
      });
    },
  };

  return ctx;
}

// ─── Helper ───

function statusToText(status: StatusCondition): string {
  switch (status) {
    case "poisoned": return "中毒";
    case "burned": return "灼伤";
    case "asleep": return "睡眠";
    case "confused": return "混乱";
    case "paralyzed": return "麻痹";
    default: return status;
  }
}
