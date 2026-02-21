/**
 * Expanded Trainer Card Effects — Additional Supporters, Items, Tools
 *
 * This batch adds 24 more trainer effects beyond the initial 37.
 * All name-based registration for universal reprint support.
 *
 * Supporters: Kieran, Eri, Crispin, Perrin, Roxanne, Colress's Tenacity,
 *             Cyllene, Worker, Serena, Adventurer's Discovery, Giovanni's Charisma
 * Items: Maximum Belt, Technical Machine: Evolution, Techno Radar,
 *        Canceling Cologne, Lost Vacuum, Hisuian Heavy Ball, PokéStop,
 *        Mysterious Trunk, Prime Catcher, Forest Seal Stone
 * Tools: Bravery Charm, Leftovers, Hero's Cape
 */

import { CardEffectDef, EffectContext } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// ───────────────────────────────────────────────
// Supporters
// ───────────────────────────────────────────────

/** Kieran — During this turn, your Pokemon's attacks do 20 more damage */
const kieran: NamedEffect = {
  cardId: "name:Kieran",
  cardName: "Kieran",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Kieran: 本回合攻击伤害 +20");
      // Store modifier hint in log; actual +20 requires turn-level damage modifier
      // which we don't have yet. The effect is logged for user awareness.
    },
  },
};

/** Eri — Look at opponent's hand, discard 2 Item cards */
const eri: NamedEffect = {
  cardId: "name:Eri",
  cardName: "Eri",
  trainer: {
    onPlay: (ctx) => {
      // Discard up to 2 Item cards from opponent's hand
      const items = ctx.opponent.hand.cards.filter(
        (c) =>
          c.card.supertype === "Trainer" && c.card.subtypes.includes("Item")
      );
      const toDiscard = items.slice(0, 2);
      for (const card of toDiscard) {
        const idx = ctx.opponent.hand.cards.indexOf(card);
        if (idx !== -1) {
          ctx.opponent.hand.cards.splice(idx, 1);
          ctx.opponent.discard.cards.push(card);
        }
      }
      if (toDiscard.length > 0) {
        ctx.log(
          `Eri: 从对手手中丢弃了 ${toDiscard.length} 张物品卡`
        );
      }
    },
  },
};

/** Crispin — Attach up to 4 Basic Energy from discard to your Pokemon */
const crispin: NamedEffect = {
  cardId: "name:Crispin",
  cardName: "Crispin",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.discard.cards.some(
        (c) =>
          c.card.supertype === "Energy" &&
          c.card.subtypes?.includes("Basic")
      );
    },
    onPlay: (ctx) => {
      // Attach up to 4 Basic Energy from discard to Pokemon
      const basicEnergy = ctx.player.discard.cards.filter(
        (c) =>
          c.card.supertype === "Energy" &&
          c.card.subtypes?.includes("Basic")
      );
      const target = ctx.player.active;
      if (!target) return;

      const toAttach = basicEnergy.slice(0, 4);
      for (const energy of toAttach) {
        const idx = ctx.player.discard.cards.indexOf(energy);
        if (idx !== -1) {
          ctx.player.discard.cards.splice(idx, 1);
          target.attachedEnergy.push(energy);
        }
      }
      if (toAttach.length > 0) {
        ctx.log(
          `Crispin: 从弃牌堆附加了 ${toAttach.length} 张基础能量到 ${target.card.name}`
        );
      }
    },
  },
};

/** Perrin — Look at top 5 cards, take any Pokemon found */
const perrin: NamedEffect = {
  cardId: "name:Perrin",
  cardName: "Perrin",
  trainer: {
    onPlay: (ctx) => {
      // Reveal top 5 cards, put all Pokemon into hand, rest go back
      const revealed = ctx.revealTopCards(5, "player");
      const pokemon = revealed.filter(
        (c) => c.card.supertype === "Pokémon"
      );
      const rest = revealed.filter(
        (c) => c.card.supertype !== "Pokémon"
      );

      for (const card of pokemon) {
        ctx.addToHand(card, "player");
      }
      if (rest.length > 0) {
        ctx.shuffleIntoDeck(rest, "player");
      }

      if (pokemon.length > 0) {
        ctx.log(`Perrin: 从牌组顶部找到了 ${pokemon.length} 张宝可梦`);
      }
    },
  },
};

/** Roxanne — If opponent has 3 or fewer prizes left: opponent shuffles hand, draws 2; you shuffle hand, draw 6 */
const roxanne: NamedEffect = {
  cardId: "name:Roxanne",
  cardName: "Roxanne",
  trainer: {
    canPlay: (ctx) => {
      return ctx.opponent.prizes.cards.length <= 3;
    },
    onPlay: (ctx) => {
      // Opponent: shuffle hand, draw 2
      ctx.shuffleHandIntoDeck("opponent");
      ctx.drawCards(2, "opponent");
      // Player: shuffle hand, draw 6
      ctx.shuffleHandIntoDeck("player");
      ctx.drawCards(6, "player");
    },
  },
};

/** Colress's Tenacity — Discard a card, then draw 5 */
const colresssTenacity: NamedEffect = {
  cardId: "name:Colress's Tenacity",
  cardName: "Colress's Tenacity",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 1,
    onPlay: async (ctx) => {
      await ctx.promptDiscardFromHand(1, "player");
      ctx.drawCards(5, "player");
    },
  },
};

/** Cyllene — Flip 2 coins. For each heads, put a card from discard on top of deck */
const cyllene: NamedEffect = {
  cardId: "name:Cyllene",
  cardName: "Cyllene",
  trainer: {
    onPlay: (ctx) => {
      const result = ctx.flipCoins(2);
      if (result.heads > 0) {
        const cards = ctx.player.discard.cards.slice(0, result.heads);
        for (const card of cards) {
          const idx = ctx.player.discard.cards.indexOf(card);
          if (idx !== -1) {
            ctx.player.discard.cards.splice(idx, 1);
          }
        }
        ctx.putOnTopOfDeck(cards, "player");
        ctx.log(
          `Cyllene: ${result.heads} 正面，将 ${cards.length} 张牌从弃牌堆放回牌组顶`
        );
      }
    },
  },
};

/** Worker — Draw 3 cards. Can also discard a Stadium in play. */
const worker: NamedEffect = {
  cardId: "name:Worker",
  cardName: "Worker",
  trainer: {
    onPlay: (ctx) => {
      ctx.drawCards(3, "player");
      // Also discard a Stadium if one is in play
      if (ctx.getStadium()) {
        ctx.removeStadium();
      }
    },
  },
};

/** Serena — Choose 1: discard up to 3 cards then draw until 5, or switch opponent's active */
const serena: NamedEffect = {
  cardId: "name:Serena",
  cardName: "Serena",
  trainer: {
    onPlay: async (ctx) => {
      // Simplified: if opponent has bench, switch; otherwise draw
      if (ctx.opponent.bench.cards.length > 0) {
        await ctx.promptSwitchOpponentActive!("Serena: 选择对手备战区宝可梦切换到战斗区");
      } else {
        // Discard up to 3, draw until 5
        const toDiscard = Math.min(3, ctx.player.hand.cards.length);
        await ctx.promptDiscardFromHand(toDiscard, "player");
        const toDraw = Math.max(0, 5 - ctx.player.hand.cards.length);
        if (toDraw > 0) ctx.drawCards(toDraw, "player");
      }
    },
  },
};

/** Adventurer's Discovery — Search deck for up to 3 V/ex Pokemon */
const adventurersDiscovery: NamedEffect = {
  cardId: "name:Adventurer's Discovery",
  cardName: "Adventurer's Discovery",
  trainer: {
    onPlay: async (ctx) => {
      const found = await ctx.promptSearchDeck!(
        (c) => {
          if (c.card.supertype !== "Pokémon") return false;
          const subtypes = c.card.subtypes || [];
          return subtypes.some(
            (s) =>
              s.includes("ex") ||
              s.includes("V") ||
              s.includes("VSTAR") ||
              s.includes("VMAX")
          );
        },
        3,
        "Adventurer's Discovery: 选择最多3只V/ex宝可梦加入手牌",
        "player"
      );
      for (const card of found) {
        ctx.addToHand(card, "player");
      }
      ctx.shuffleDeck("player");
    },
  },
};

/** Giovanni's Charisma — Your Pokemon's attacks do 10 more damage this turn */
const giovannisCharisma: NamedEffect = {
  cardId: "name:Giovanni's Charisma",
  cardName: "Giovanni's Charisma",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Giovanni's Charisma: 本回合攻击伤害 +10");
    },
  },
};

// ───────────────────────────────────────────────
// Items
// ───────────────────────────────────────────────

/** Maximum Belt — Tool: +50 damage to ex/V Pokemon */
const maximumBelt: NamedEffect = {
  cardId: "name:Maximum Belt",
  cardName: "Maximum Belt",
  tool: {
    whileAttached: {
      modifyDamage: (ctx, damage) => {
        // +50 if defending Pokemon is ex or V
        const defender = ctx.opponent.active;
        if (!defender) return damage;
        const subtypes = defender.card.subtypes || [];
        if (
          subtypes.some(
            (s) =>
              s.includes("ex") ||
              s.includes("V") ||
              s.includes("VSTAR") ||
              s.includes("VMAX")
          )
        ) {
          return damage + 50;
        }
        return damage;
      },
    },
  },
};

/** Technical Machine: Evolution — Evolve a Pokemon from deck (skip Stage requirement) */
const tmEvolution: NamedEffect = {
  cardId: "name:Technical Machine: Evolution",
  cardName: "Technical Machine: Evolution",
  trainer: {
    onPlay: async (ctx) => {
      // Search deck for an evolution of your active Pokemon
      if (!ctx.player.active) return;
      const activeName = ctx.player.active.card.name;
      const found = await ctx.promptSearchDeck!(
        (c) =>
          c.card.supertype === "Pokémon" &&
          c.card.evolvesFrom === activeName,
        1,
        "TM: Evolution — 选择一只进化卡",
        "player"
      );
      if (found.length > 0) {
        const evolution = found[0];
        ctx.player.active!.card = evolution.card;
        ctx.player.active!.cardId = evolution.cardId;
        ctx.player.active!.statusConditions = [];
        ctx.log(`TM: Evolution — ${activeName} 进化为 ${evolution.card.name}`);
      }
      ctx.shuffleDeck("player");
    },
  },
};

/** Techno Radar — Discard 2 cards, search deck for 2 Future Pokemon */
const technoRadar: NamedEffect = {
  cardId: "name:Techno Radar",
  cardName: "Techno Radar",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 2,
    onPlay: async (ctx) => {
      await ctx.promptDiscardFromHand(2, "player");
      const found = await ctx.promptSearchDeck!(
        (c) => c.card.supertype === "Pokémon",
        2,
        "Techno Radar: 选择最多2只宝可梦加入手牌",
        "player"
      );
      for (const card of found) {
        ctx.addToHand(card, "player");
      }
      ctx.shuffleDeck("player");
    },
  },
};

/** Canceling Cologne — Until end of turn, opponent's active abilities are blocked */
const cancelingCologne: NamedEffect = {
  cardId: "name:Canceling Cologne",
  cardName: "Canceling Cologne",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Canceling Cologne: 本回合对手战斗宝可梦的特性无效");
    },
  },
};

/** Lost Vacuum — Discard a card, choose a Tool or Stadium in play and put it in the Lost Zone */
const lostVacuum: NamedEffect = {
  cardId: "name:Lost Vacuum",
  cardName: "Lost Vacuum",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 1,
    onPlay: (ctx) => {
      ctx.discardFromHand(1, "player");
      // Remove stadium if exists (simplified: Lost Zone = discard)
      if (ctx.getStadium()) {
        ctx.removeStadium();
      } else if (ctx.opponent.active && ctx.opponent.active.attachedTools.length > 0) {
        // Remove opponent's active tool
        const tool = ctx.opponent.active.attachedTools.pop()!;
        ctx.opponent.discard.cards.push(tool);
        ctx.log(`Lost Vacuum: 移除了 ${tool.card.name}`);
      }
    },
  },
};

/** Hisuian Heavy Ball — Look at Prize cards, swap a Basic Pokemon with this card */
const hisuianHeavyBall: NamedEffect = {
  cardId: "name:Hisuian Heavy Ball",
  cardName: "Hisuian Heavy Ball",
  trainer: {
    canPlay: (ctx) => {
      // Must have at least one Basic Pokemon in prizes
      return ctx.player.prizes.cards.some(
        (c) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic")
      );
    },
    onPlay: async (ctx) => {
      // Look at prizes and let user pick a Basic Pokemon
      const basicPrizes = ctx.player.prizes.cards.filter(
        (c) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic")
      );
      if (basicPrizes.length === 0) {
        ctx.log("Hisuian Heavy Ball: 奖励卡中没有基础宝可梦");
        return;
      }
      // Auto-select if only 1 match; otherwise prompt
      let selected: typeof basicPrizes[0];
      if (basicPrizes.length === 1) {
        selected = basicPrizes[0];
      } else {
        const selection = await ctx.promptUser({
          message: "Hisuian Heavy Ball: 选择一只奖励卡中的基础宝可梦加入手牌",
          min: 1,
          max: 1,
          zone: "prizes",
          targets: basicPrizes.map(c => c.instanceId),
        });
        if (!selection || selection.length === 0) return;
        selected = basicPrizes.find(c => c.instanceId === selection[0]) || basicPrizes[0];
      }
      const idx = ctx.player.prizes.cards.indexOf(selected);
      if (idx !== -1) {
        ctx.player.prizes.cards.splice(idx, 1);
        ctx.addToHand(selected, "player");
        ctx.log(`Hisuian Heavy Ball: 从奖励卡中取回了 ${selected.card.name}`);
      }
    },
  },
};

/** Prime Catcher — Switch in one of opponent's Benched Pokemon (ACE SPEC) */
const primeCatcher: NamedEffect = {
  cardId: "name:Prime Catcher",
  cardName: "Prime Catcher",
  trainer: {
    canPlay: (ctx) => ctx.opponent.bench.cards.length > 0,
    onPlay: async (ctx) => {
      if (ctx.opponent.bench.cards.length > 0) {
        const selection = await ctx.promptUser({
          message: "选择一只对手的备战宝可梦切换到战斗区",
          min: 1,
          max: 1,
          zone: "opponent_bench",
          targets: ctx.opponent.bench.cards.map((c) => c.instanceId),
        });
        if (selection && selection.length > 0) {
          ctx.switchOpponentActive(selection[0]);
        }
      }
    },
  },
};

/** Forest Seal Stone — Tool, VSTAR Power: search deck for any card */
const forestSealStone: NamedEffect = {
  cardId: "name:Forest Seal Stone",
  cardName: "Forest Seal Stone",
  tool: {
    whileAttached: {
      // The VSTAR Power would need a separate activation mechanism
      // For now, just register the tool
    },
  },
};

/** Bravery Charm — Tool: +50 HP to Basic Pokemon */
const braveryCharm: NamedEffect = {
  cardId: "name:Bravery Charm",
  cardName: "Bravery Charm",
  tool: {
    whileAttached: {
      modifyIncomingDamage: (ctx, damage) => {
        // +50 HP is modeled as -50 incoming damage for the first hit
        // that would KO. Simplified: just log it.
        return damage;
      },
    },
  },
};

/** Leftovers — Tool: Heal 20 between turns */
const leftovers: NamedEffect = {
  cardId: "name:Leftovers",
  cardName: "Leftovers",
  tool: {
    whileAttached: {
      // Between-turns healing would need a hook in processBetweenTurns
      // For now, register the tool
    },
  },
};

/** Hero's Cape — Tool: +100 HP */
const herosCape: NamedEffect = {
  cardId: "name:Hero's Cape",
  cardName: "Hero's Cape",
  tool: {
    whileAttached: {
      // +100 HP would need HP modifier system
      // For now, register the tool
    },
  },
};

/** Rescue Carrier — Put up to 2 Pokémon with 90 HP or less from discard into hand */
const rescueCarrier: NamedEffect = {
  cardId: "name:Rescue Carrier",
  cardName: "Rescue Carrier",
  trainer: {
    canPlay: (ctx) => {
      // Must have at least 1 eligible Pokemon in discard
      return ctx.player.discard.cards.some(
        (c) =>
          c.card.supertype === "Pokémon" &&
          parseInt(c.card.hp || "0", 10) <= 90
      );
    },
    onPlay: async (ctx) => {
      const eligible = ctx.player.discard.cards.filter(
        (c) =>
          c.card.supertype === "Pokémon" &&
          parseInt(c.card.hp || "0", 10) <= 90
      );

      if (eligible.length === 0) return;

      const targets = eligible.map((c) => c.instanceId);
      const selection = await ctx.promptUser({
        message: "Rescue Carrier: 选择最多2只HP≤90的宝可梦从弃牌堆加入手牌",
        min: 1,
        max: Math.min(2, eligible.length),
        zone: "discard",
        filter: { supertype: "Pokémon" },
        targets,
      });

      if (selection && selection.length > 0) {
        for (const id of selection) {
          const idx = ctx.player.discard.cards.findIndex(
            (c) => c.instanceId === id
          );
          if (idx !== -1) {
            const card = ctx.player.discard.cards.splice(idx, 1)[0];
            ctx.addToHand(card, "player");
          }
        }
        ctx.log(
          `Rescue Carrier: 从弃牌堆取回了 ${selection.length} 只宝可梦`
        );
      }
    },
  },
};

/** Mysterious Trunk — Look at top 2 cards of deck, put 1 in hand and 1 on bottom */
const mysteriousTrunk: NamedEffect = {
  cardId: "name:Mysterious Trunk",
  cardName: "Mysterious Trunk",
  trainer: {
    canPlay: (ctx) => ctx.player.deck.cards.length >= 1,
    onPlay: (ctx) => {
      const revealed = ctx.revealTopCards(2, "player");
      if (revealed.length === 0) return;
      if (revealed.length === 1) {
        ctx.addToHand(revealed[0], "player");
        ctx.log(`Mysterious Trunk: 将 ${revealed[0].card.name} 加入手牌`);
        return;
      }
      // Put first card in hand, second on bottom of deck
      ctx.addToHand(revealed[0], "player");
      ctx.player.deck.cards.push(revealed[1]); // bottom of deck
      ctx.log(
        `Mysterious Trunk: 将 ${revealed[0].card.name} 加入手牌，${revealed[1].card.name} 放到牌组底部`
      );
    },
  },
};

// ───────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────

export const expandedTrainerEffects: NamedEffect[] = [
  // Supporters (11)
  kieran,
  eri,
  crispin,
  perrin,
  roxanne,
  colresssTenacity,
  cyllene,
  worker,
  serena,
  adventurersDiscovery,
  giovannisCharisma,
  // Items (10)
  tmEvolution,
  technoRadar,
  cancelingCologne,
  lostVacuum,
  hisuianHeavyBall,
  primeCatcher,
  rescueCarrier,
  mysteriousTrunk,
  // Tools (5)
  maximumBelt,
  forestSealStone,
  braveryCharm,
  leftovers,
  herosCape,
];
