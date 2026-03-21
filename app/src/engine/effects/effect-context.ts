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
import { checkKnockout, takePrizes, getPrizeCount, checkWinCondition, getEffectiveHp } from "../game-actions";
import { EffectContext } from "./effect-types";
import { isStatusImmune, isEnergyRemovalBlocked } from "./modifier-query";

/**
 * Global store for pending prompt resolvers.
 * This allows async effects to pause execution until the UI responds.
 * Key: promptId, Value: resolve function
 */
export const pendingPrompts = new Map<string, (ids: string[]) => void>();

/**
 * Callback to notify the UI when a prompt is set during effect execution.
 * This allows the UI to render the prompt modal mid-execution by receiving
 * intermediate state updates. Set this before calling processAction.
 */
export let onPromptStateChange: ((state: GameState) => void) | null = null;

/**
 * Set the callback that gets invoked when an effect sets a prompt on state.
 * This allows the React UI to render the prompt immediately during async
 * effect execution instead of waiting for the entire action to complete.
 */
export function setPromptStateChangeCallback(cb: ((state: GameState) => void) | null) {
  onPromptStateChange = cb;
}

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
        // Discard from the end of hand (auto - no choice)
        const card = p.hand.cards.pop();
        if (card) {
          addToBottom(p.discard, card);
          discarded.push(card);
        }
      }

      return discarded;
    },

    async promptDiscardFromHand(count: number, who: "player" | "opponent" = "player"): Promise<GameCard[]> {
      const pIdx = who === "player" ? playerIndex : opponentIndex;
      const p = state.players[pIdx];
      const actual = Math.min(count, p.hand.cards.length);

      if (actual <= 0) return [];

      // Auto-discard helper (no user choice)
      function autoDiscard(): GameCard[] {
        const discarded: GameCard[] = [];
        for (let i = 0; i < actual; i++) {
          const card = p.hand.cards.pop();
          if (card) {
            addToBottom(p.discard, card);
            discarded.push(card);
          }
        }
        return discarded;
      }

      // If hand size equals or is less than required, auto-discard all needed
      if (p.hand.cards.length <= actual) {
        return autoDiscard();
      }

      // Only prompt if not already in a prompt (prevent nesting) and if
      // state allows prompts (game must be in interactive mode)
      if (state.prompt) {
        // Already in a prompt — auto-discard to avoid deadlock
        return autoDiscard();
      }

      // If no UI is listening (test mode or non-interactive), auto-discard
      if (!onPromptStateChange) {
        return autoDiscard();
      }

      // Set up prompt for interactive user selection
      const promptId = `discard-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      state.prompt = {
        id: promptId,
        type: "select_cards",
        playerIndex: pIdx as 0 | 1,
        zone: "hand",
        min: actual,
        max: actual,
        message: `选择 ${actual} 张手牌丢弃`,
      };

      // Create a deferred promise so we can register the resolver BEFORE
      // notifying the UI (the callback may resolve synchronously in tests).
      let resolvePrompt!: (ids: string[]) => void;
      const selectedIdsPromise = new Promise<string[]>((resolve) => {
        resolvePrompt = resolve;
      });
      pendingPrompts.set(promptId, resolvePrompt);

      // Safety fallback: 30 second timeout for unresponsive UI
      setTimeout(() => {
        if (pendingPrompts.has(promptId)) {
          pendingPrompts.delete(promptId);
          const autoIds: string[] = [];
          for (let i = p.hand.cards.length - 1; i >= 0 && autoIds.length < actual; i--) {
            autoIds.push(p.hand.cards[i].instanceId);
          }
          state.prompt = null;
          resolvePrompt(autoIds);
        }
      }, 30000);

      // Notify UI of prompt so it can render the selection modal immediately.
      // Without this, the UI wouldn't see the prompt until processAction completes.
      onPromptStateChange({ ...state });

      // Wait for user response via select_cards_response action.
      const selectedIds = await selectedIdsPromise;

      // Clear prompt
      state.prompt = null;

      // Discard the selected cards
      const discarded: GameCard[] = [];
      for (const sid of selectedIds) {
        const idx = p.hand.cards.findIndex((c) => c.instanceId === sid);
        if (idx !== -1) {
          const [card] = p.hand.cards.splice(idx, 1);
          addToBottom(p.discard, card);
          discarded.push(card);
        }
      }

      if (discarded.length > 0) {
        logEvent(state, pIdx as 0 | 1, "use_trainer" as any,
          `${p.name} 选择丢弃了 ${discarded.length} 张手牌`
        );
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

    // ─── Interactive Prompt Methods ───

    async promptSearchDeck(
      filter: (card: GameCard) => boolean,
      count: number,
      message: string,
      who: "player" | "opponent" = "player",
      minCount?: number
    ): Promise<GameCard[]> {
      const pIdx = who === "player" ? playerIndex : opponentIndex;
      const p = state.players[pIdx];
      // minCount defaults to count (exact selection); pass 0 for "up to N" cards
      const actualMin = minCount !== undefined ? minCount : count;

      // Find all matching cards in deck
      const matching = p.deck.cards.filter(filter);

      // Auto-select fallback: no UI, no matches, matches ≤ count, or nested prompt
      if (!onPromptStateChange || matching.length === 0 || matching.length <= count || state.prompt) {
        const autoSelect = matching.slice(0, count);
        for (const card of autoSelect) {
          const idx = p.deck.cards.indexOf(card);
          if (idx !== -1) p.deck.cards.splice(idx, 1);
        }
        if (autoSelect.length > 0) {
          logEvent(state, playerIndex, "search_deck" as any,
            `从牌组中搜索到了 ${autoSelect.length} 张牌`,
            { count: autoSelect.length }
          );
        }
        return autoSelect;
      }

      // Interactive: show prompt
      const promptId = `search-deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      state.prompt = {
        id: promptId,
        type: "select_cards",
        playerIndex: pIdx as 0 | 1,
        zone: "deck",
        min: actualMin,
        max: count,
        message,
        targets: matching.map(c => c.instanceId),
      };

      let resolvePrompt!: (ids: string[]) => void;
      const selectedIdsPromise = new Promise<string[]>((resolve) => {
        resolvePrompt = resolve;
      });
      pendingPrompts.set(promptId, resolvePrompt);

      // Notify UI
      onPromptStateChange({ ...state });

      // Safety timeout: auto-select after 30 seconds
      const timeoutId = setTimeout(() => {
        if (pendingPrompts.has(promptId)) {
          pendingPrompts.delete(promptId);
          resolvePrompt(matching.slice(0, count).map(c => c.instanceId));
        }
      }, 30000);

      const selectedIds = await selectedIdsPromise;
      clearTimeout(timeoutId);
      state.prompt = null;

      // Remove selected cards from deck
      const result: GameCard[] = [];
      for (const id of selectedIds) {
        const idx = p.deck.cards.findIndex(c => c.instanceId === id);
        if (idx !== -1) {
          result.push(p.deck.cards.splice(idx, 1)[0]);
        }
      }

      if (result.length > 0) {
        logEvent(state, playerIndex, "search_deck" as any,
          `从牌组中搜索到了 ${result.length} 张牌`,
          { count: result.length }
        );
      }

      return result;
    },

    async promptSearchDiscard(
      filter: (card: GameCard) => boolean,
      count: number,
      message: string,
      who: "player" | "opponent" = "player",
      minCount?: number
    ): Promise<GameCard[]> {
      const pIdx = who === "player" ? playerIndex : opponentIndex;
      const p = state.players[pIdx];
      // minCount defaults to count (exact selection); pass 0 for "up to N" cards
      const actualMin = minCount !== undefined ? minCount : count;

      // Find all matching cards in discard
      const matching = p.discard.cards.filter(filter);

      // Auto-select fallback
      if (!onPromptStateChange || matching.length === 0 || matching.length <= count || state.prompt) {
        const autoSelect = matching.slice(0, count);
        for (const card of autoSelect) {
          const idx = p.discard.cards.indexOf(card);
          if (idx !== -1) p.discard.cards.splice(idx, 1);
        }
        if (autoSelect.length > 0) {
          logEvent(state, playerIndex, "search_deck" as any,
            `从弃牌堆中取回了 ${autoSelect.length} 张牌`,
            { count: autoSelect.length }
          );
        }
        return autoSelect;
      }

      // Interactive: show prompt
      const promptId = `search-discard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      state.prompt = {
        id: promptId,
        type: "select_cards",
        playerIndex: pIdx as 0 | 1,
        zone: "discard",
        min: actualMin,
        max: count,
        message,
        targets: matching.map(c => c.instanceId),
      };

      let resolvePrompt!: (ids: string[]) => void;
      const selectedIdsPromise = new Promise<string[]>((resolve) => {
        resolvePrompt = resolve;
      });
      pendingPrompts.set(promptId, resolvePrompt);

      onPromptStateChange({ ...state });

      const timeoutId = setTimeout(() => {
        if (pendingPrompts.has(promptId)) {
          pendingPrompts.delete(promptId);
          resolvePrompt(matching.slice(0, count).map(c => c.instanceId));
        }
      }, 30000);

      const selectedIds = await selectedIdsPromise;
      clearTimeout(timeoutId);
      state.prompt = null;

      // Remove selected cards from discard
      const result: GameCard[] = [];
      for (const id of selectedIds) {
        const idx = p.discard.cards.findIndex(c => c.instanceId === id);
        if (idx !== -1) {
          result.push(p.discard.cards.splice(idx, 1)[0]);
        }
      }

      if (result.length > 0) {
        logEvent(state, playerIndex, "search_deck" as any,
          `从弃牌堆中取回了 ${result.length} 张牌`,
          { count: result.length }
        );
      }

      return result;
    },

    async promptSwitchOwnActive(message?: string): Promise<boolean> {
      const p = state.players[playerIndex];

      if (!p.active || p.bench.cards.length === 0) return false;

      // Auto-select if only 1 bench Pokemon or no UI
      if (p.bench.cards.length === 1 || !onPromptStateChange || state.prompt) {
        return ctx.switchOwnActive(p.bench.cards[0].instanceId);
      }

      // Interactive: prompt user to pick bench Pokemon
      const promptId = `switch-own-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      state.prompt = {
        id: promptId,
        type: "select_cards",
        playerIndex: playerIndex,
        zone: "bench",
        min: 1,
        max: 1,
        message: message || "选择一只备战区宝可梦切换到战斗区",
        targets: p.bench.cards.map(c => c.instanceId),
      };

      let resolvePrompt!: (ids: string[]) => void;
      const selectedIdsPromise = new Promise<string[]>((resolve) => {
        resolvePrompt = resolve;
      });
      pendingPrompts.set(promptId, resolvePrompt);

      onPromptStateChange({ ...state });

      const timeoutId = setTimeout(() => {
        if (pendingPrompts.has(promptId)) {
          pendingPrompts.delete(promptId);
          resolvePrompt([p.bench.cards[0].instanceId]);
        }
      }, 30000);

      const selectedIds = await selectedIdsPromise;
      clearTimeout(timeoutId);
      state.prompt = null;

      if (selectedIds.length > 0) {
        return ctx.switchOwnActive(selectedIds[0]);
      }
      return false;
    },

    async promptSwitchOpponentActive(message?: string): Promise<boolean> {
      const opp = state.players[opponentIndex];

      if (!opp.active || opp.bench.cards.length === 0) return false;

      // Auto-select if only 1 bench Pokemon or no UI
      if (opp.bench.cards.length === 1 || !onPromptStateChange || state.prompt) {
        return ctx.switchOpponentActive(opp.bench.cards[0].instanceId);
      }

      // Interactive: prompt user to pick opponent bench Pokemon
      const promptId = `switch-opp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      state.prompt = {
        id: promptId,
        type: "select_cards",
        playerIndex: playerIndex,
        zone: "opponent_bench",
        min: 1,
        max: 1,
        message: message || "选择一只对手的备战宝可梦切换到战斗区",
        targets: opp.bench.cards.map(c => c.instanceId),
      };

      let resolvePrompt!: (ids: string[]) => void;
      const selectedIdsPromise = new Promise<string[]>((resolve) => {
        resolvePrompt = resolve;
      });
      pendingPrompts.set(promptId, resolvePrompt);

      onPromptStateChange({ ...state });

      const timeoutId = setTimeout(() => {
        if (pendingPrompts.has(promptId)) {
          pendingPrompts.delete(promptId);
          resolvePrompt([opp.bench.cards[0].instanceId]);
        }
      }, 30000);

      const selectedIds = await selectedIdsPromise;
      clearTimeout(timeoutId);
      state.prompt = null;

      if (selectedIds.length > 0) {
        return ctx.switchOpponentActive(selectedIds[0]);
      }
      return false;
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
      // V2: Check status immunity from passive abilities/tools
      let targetPi: 0 | 1 = playerIndex;
      for (let pi = 0; pi < 2; pi++) {
        const p = state.players[pi as 0 | 1];
        if (p.active?.instanceId === target.instanceId ||
            p.bench.cards.some(c => c.instanceId === target.instanceId)) {
          targetPi = pi as 0 | 1;
          break;
        }
      }
      if (isStatusImmune(state, target, targetPi)) {
        logEvent(state, playerIndex, "ability" as any,
          `${target.card.name} 的特性免疫了 ${statusToText(status)} 状态!`);
        return;
      }

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

    // ─── Direct Evolution (bypasses middleware) ───

    evolvePokemonDirect(targetInstanceId: string, evolutionCard: GameCard): boolean {
      const p = state.players[playerIndex];
      // Find target on field (active or bench)
      let target: GameCard | null = null;
      if (p.active?.instanceId === targetInstanceId) {
        target = p.active;
      } else {
        target = p.bench.cards.find(c => c.instanceId === targetInstanceId) ?? null;
      }
      if (!target) return false;

      const previousName = target.card.name;

      // Push current card onto evolution stack
      target.evolutionStack = [
        ...(target.evolutionStack || []),
        { cardId: target.cardId, card: target.card },
      ];

      // Update card data to evolution
      target.card = evolutionCard.card;
      target.cardId = evolutionCard.cardId;
      // Evolution removes all status conditions and markers
      target.statusConditions = [];
      target.markers = {};
      // Mark flags
      target.playedThisTurn = true;
      target.evolvedThisTurn = true;

      logEvent(state, playerIndex, "evolve_pokemon" as any,
        `${previousName} 进化为 ${target.card.name}`,
        { from: previousName, to: target.card.name }
      );

      return true;
    },

    // ─── V2 Action Support Methods ───

    placeDamageCounters(amount: number, target: GameCard): void {
      if (amount <= 0) return;
      const counters = Math.floor(amount / 10);
      if (counters <= 0) return;
      target.damageCounters += counters;

      logEvent(state, playerIndex, "damage",
        `${source.card.name} 的效果在 ${target.card.name} 上放置了 ${counters} 个伤害标记`,
        { counters, targetName: target.card.name }
      );

      // Check KO from placed damage counters
      const hp = getEffectiveHp(target);
      if (hp > 0 && target.damageCounters * 10 >= hp) {
        // Find which player owns the target
        for (let pi = 0; pi < 2; pi++) {
          const p = state.players[pi as 0 | 1];
          if (p.active?.instanceId === target.instanceId) {
            const attackerIdx = (pi === 0 ? 1 : 0) as 0 | 1;
            const prizeCount = getPrizeCount(target);
            if (checkKnockout(state, pi as 0 | 1, "active")) {
              takePrizes(state, attackerIdx, prizeCount);
              checkWinCondition(state);
            }
            break;
          }
          const benchIdx = p.bench.cards.findIndex(c => c.instanceId === target.instanceId);
          if (benchIdx !== -1) {
            const attackerIdx = (pi === 0 ? 1 : 0) as 0 | 1;
            const prizeCount = getPrizeCount(target);
            if (checkKnockout(state, pi as 0 | 1, "bench", benchIdx)) {
              takePrizes(state, attackerIdx, prizeCount);
              checkWinCondition(state);
            }
            break;
          }
        }
      }
    },

    moveDamageCounters(count: number, from: GameCard, to: GameCard): void {
      const actual = Math.min(count, from.damageCounters);
      if (actual <= 0) return;
      from.damageCounters -= actual;
      to.damageCounters += actual;

      logEvent(state, playerIndex, "damage",
        `将 ${actual} 个伤害标记从 ${from.card.name} 移到 ${to.card.name}`,
        { counters: actual, fromName: from.card.name, toName: to.card.name }
      );
    },

    moveToLostZone(card: GameCard, who: "player" | "opponent" = "player"): void {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      p.lostZone.cards.push(card);

      logEvent(state, playerIndex, "use_trainer" as any,
        `${card.card.name} 被放逐到放逐区`,
        { cardName: card.card.name }
      );
    },

    moveToLostZoneMultiple(cards: GameCard[], who: "player" | "opponent" = "player"): void {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      for (const card of cards) {
        p.lostZone.cards.push(card);
      }

      if (cards.length > 0) {
        logEvent(state, playerIndex, "use_trainer" as any,
          `${cards.length} 张牌被放逐到放逐区`,
          { count: cards.length }
        );
      }
    },

    devolve(target: GameCard, destination: "hand" | "discard" = "discard"): GameCard | null {
      if (!target.evolutionStack || target.evolutionStack.length === 0) return null;

      // The current top card is the evolution to remove
      const removedCard: GameCard = {
        instanceId: target.instanceId + "-devo",
        cardId: target.cardId,
        card: target.card,
        damageCounters: 0,
        attachedEnergy: [],
        attachedTools: [],
        statusConditions: [],
        playedThisTurn: false,
        evolvedThisTurn: false,
        abilityUsedThisTurn: false,
        markers: {},
        evolutionStack: [],
      };

      // Restore previous stage
      const prev = target.evolutionStack.pop()!;
      target.cardId = prev.cardId;
      target.card = prev.card;

      // Find owner and send removed card to destination
      for (let pi = 0; pi < 2; pi++) {
        const p = state.players[pi as 0 | 1];
        const owns = p.active?.instanceId === target.instanceId ||
          p.bench.cards.some(c => c.instanceId === target.instanceId);
        if (owns) {
          if (destination === "hand") {
            p.hand.cards.push(removedCard);
          } else {
            addToBottom(p.discard, removedCard);
          }
          break;
        }
      }

      // Check if devolve caused KO (damage exceeds new HP)
      const newHp = getEffectiveHp(target);
      if (newHp > 0 && target.damageCounters * 10 >= newHp) {
        for (let pi = 0; pi < 2; pi++) {
          const p = state.players[pi as 0 | 1];
          if (p.active?.instanceId === target.instanceId) {
            const attackerIdx = (pi === 0 ? 1 : 0) as 0 | 1;
            const prizeCount = getPrizeCount(target);
            if (checkKnockout(state, pi as 0 | 1, "active")) {
              takePrizes(state, attackerIdx, prizeCount);
              checkWinCondition(state);
            }
            break;
          }
        }
      }

      logEvent(state, playerIndex, "evolve_pokemon" as any,
        `${removedCard.card.name} 被退化，恢复为 ${target.card.name}`,
        { from: removedCard.card.name, to: target.card.name }
      );

      return removedCard;
    },

    spreadDamage(totalCounters: number, targets: GameCard[]): void {
      if (totalCounters <= 0 || targets.length === 0) return;

      // Non-interactive: distribute counters evenly, remainder to first targets
      const perTarget = Math.floor(totalCounters / targets.length);
      let remainder = totalCounters % targets.length;

      for (const t of targets) {
        const counters = perTarget + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        if (counters > 0) {
          t.damageCounters += counters;
          logEvent(state, playerIndex, "damage",
            `${source.card.name} 的效果在 ${t.card.name} 上放置了 ${counters} 个伤害标记`,
            { counters, targetName: t.card.name }
          );
        }
      }
    },

    discardEnergyFromPokemon(
      count: number,
      target: GameCard,
      filter?: (card: GameCard) => boolean
    ): GameCard[] {
      // V2: Check if energy removal is blocked on this target
      // Find target's owner player index
      let targetPi: 0 | 1 = playerIndex;
      for (let pi = 0; pi < 2; pi++) {
        const p = state.players[pi as 0 | 1];
        if (p.active?.instanceId === target.instanceId ||
            p.bench.cards.some(c => c.instanceId === target.instanceId)) {
          targetPi = pi as 0 | 1;
          break;
        }
      }
      // Only block if opponent is trying to remove energy (not self-discard for attack cost)
      if (targetPi !== playerIndex && isEnergyRemovalBlocked(state, target, targetPi)) {
        logEvent(state, playerIndex, "ability" as any,
          `${target.card.name} 的特性阻止了能量被丢弃!`);
        return [];
      }

      const discarded: GameCard[] = [];
      let remaining = count;

      for (let i = target.attachedEnergy.length - 1; i >= 0 && remaining > 0; i--) {
        const energy = target.attachedEnergy[i];
        if (!filter || filter(energy)) {
          target.attachedEnergy.splice(i, 1);
          // Find the owner of the target to put energy in their discard
          for (let pi = 0; pi < 2; pi++) {
            const p = state.players[pi as 0 | 1];
            if (p.active?.instanceId === target.instanceId ||
                p.bench.cards.some(c => c.instanceId === target.instanceId)) {
              addToBottom(p.discard, energy);
              break;
            }
          }
          discarded.push(energy);
          remaining--;
        }
      }

      if (discarded.length > 0) {
        logEvent(state, playerIndex, "use_trainer" as any,
          `从 ${target.card.name} 上弃掉了 ${discarded.length} 张能量`,
          { count: discarded.length, targetName: target.card.name }
        );
      }

      return discarded;
    },

    searchLostZone(
      filter: (card: GameCard) => boolean,
      count: number,
      who: "player" | "opponent" = "player"
    ): GameCard[] {
      const p = who === "player" ? state.players[playerIndex] : state.players[opponentIndex];
      const found: GameCard[] = [];

      for (let i = 0; i < p.lostZone.cards.length && found.length < count; i++) {
        if (filter(p.lostZone.cards[i])) {
          found.push(p.lostZone.cards[i]);
        }
      }

      // Remove found cards from lost zone
      for (const card of found) {
        const idx = p.lostZone.cards.indexOf(card);
        if (idx !== -1) {
          p.lostZone.cards.splice(idx, 1);
        }
      }

      return found;
    },

    // ─── User Prompt ───

    promptUser(options): Promise<string[]> {
      // Auto-resolve when no UI callback or prompt already active (prevent nesting)
      if (!onPromptStateChange || state.prompt) {
        const autoIds = (options.targets || []).slice(0, options.min);
        return Promise.resolve(autoIds);
      }

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

      // Set up the pending resolver BEFORE notifying the UI,
      // so synchronous callbacks can resolve immediately.
      const resultPromise = new Promise<string[]>((resolve) => {
        pendingPrompts.set(promptId, (ids) => {
          state.prompt = null;
          resolve(ids);
        });
      });

      // Notify UI of prompt so it can render the selection modal immediately.
      onPromptStateChange({ ...state });

      return resultPromise;
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
