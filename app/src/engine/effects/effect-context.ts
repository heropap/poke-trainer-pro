/**
 * Effect Context Factory
 *
 * Creates EffectContext objects that provide helper methods for card effects.
 * Each method operates directly on the GameState and logs appropriate events.
 */

import { GameState, GameCard, Player, StatusCondition, logEvent } from "../game-state";
import { removeCard, addToBottom, shuffleZone, findCard, drawMultiple } from "../zones";
import { flipCoin as coinFlip, flipCoins as coinFlips } from "./coin";
import { checkKnockout, takePrizes, getPrizeCount, checkWinCondition } from "../game-actions";
import { EffectContext } from "./effect-types";

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

      logEvent(state, playerIndex, "retreat",
        `${source.card.name} 的效果将 ${benchCard.card.name} 拖到了战斗区!`,
        { newActive: benchCard.card.name, oldActive: currentActive.card.name }
      );

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

    // ─── Logging ───

    log(message: string): void {
      logEvent(state, playerIndex, "use_ability" as any, message);
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
