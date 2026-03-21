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
import { DAMAGE_BOOST, ABILITY_BLOCKED_TEMP } from "../markers";
import { onPromptStateChange } from "../effect-context";

type NamedEffect = CardEffectDef & { cardName: string };

// ───────────────────────────────────────────────
// Supporters
// ───────────────────────────────────────────────

/** Kieran — During this turn, your Pokemon's attacks do 20 more damage to the opponent's Active */
const kieran: NamedEffect = {
  cardId: "name:Kieran",
  cardName: "Kieran",
  trainer: {
    onPlay: (ctx) => {
      if (ctx.player.active) {
        ctx.addMarker(ctx.player.active, DAMAGE_BOOST, 20);
        ctx.log("Kieran: 本回合攻击伤害 +20");
      }
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
      } else {
        ctx.log("Eri: 对手手中没有物品卡");
      }
    },
  },
};

/** Crispin — Attach up to 4 Basic Energy from discard to one of your Pokemon */
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
    onPlay: async (ctx) => {
      const basicEnergy = ctx.player.discard.cards.filter(
        (c) =>
          c.card.supertype === "Energy" &&
          c.card.subtypes?.includes("Basic")
      );
      const toAttach = basicEnergy.slice(0, 4);
      if (toAttach.length === 0) return;

      // Let user choose which Pokemon to attach all energy to (only when UI is available)
      const allPokemon = ctx.getAllPokemon("player");
      let target = ctx.player.active;

      if (allPokemon.length > 1 && onPromptStateChange) {
        const selection = await ctx.promptUser({
          message: "Crispin: 选择要附加能量的宝可梦",
          min: 1,
          max: 1,
          zone: "own_field",
          targets: allPokemon.map((c) => c.instanceId),
        });
        if (selection && selection.length > 0) {
          target = ctx.findPokemon(selection[0]) || target;
        }
      }

      if (!target) return;

      for (const energy of toAttach) {
        const idx = ctx.player.discard.cards.indexOf(energy);
        if (idx !== -1) {
          ctx.player.discard.cards.splice(idx, 1);
          target.attachedEnergy.push(energy);
        }
      }
      ctx.log(
        `Crispin: 从弃牌堆附加了 ${toAttach.length} 张基础能量到 ${target.card.name}`
      );
    },
  },
};

/** Perrin — Look at top 5 cards, take any Pokemon found */
const perrin: NamedEffect = {
  cardId: "name:Perrin",
  cardName: "Perrin",
  trainer: {
    onPlay: (ctx) => {
      // Reveal top 5 cards, put all Pokemon into hand, shuffle rest back
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
      } else {
        ctx.log("Perrin: 未找到宝可梦，其他牌已洗回牌组");
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

/** Colress's Tenacity — Discard a card from your hand, then draw 5 */
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

/** Cyllene — Flip 2 coins. For each heads, put a card of your choice from discard on top of deck */
const cyllene: NamedEffect = {
  cardId: "name:Cyllene",
  cardName: "Cyllene",
  trainer: {
    onPlay: async (ctx) => {
      const result = ctx.flipCoins(2);
      ctx.log(`Cyllene: 翻出 ${result.heads} 个正面`);

      if (result.heads > 0 && ctx.player.discard.cards.length > 0) {
        const eligible = ctx.player.discard.cards;
        const count = Math.min(result.heads, eligible.length);

        const selection = await ctx.promptUser({
          message: `Cyllene: 选择 ${count} 张牌放到牌组顶部`,
          min: count,
          max: count,
          zone: "discard",
          targets: eligible.map((c) => c.instanceId),
        });

        if (selection && selection.length > 0) {
          const selectedCards = selection
            .map((id) => eligible.find((c) => c.instanceId === id))
            .filter(Boolean) as typeof eligible;

          for (const card of selectedCards) {
            const idx = ctx.player.discard.cards.indexOf(card);
            if (idx !== -1) ctx.player.discard.cards.splice(idx, 1);
          }
          ctx.putOnTopOfDeck(selectedCards, "player");
          ctx.log(
            `Cyllene: 将 ${selectedCards.length} 张牌从弃牌堆放回牌组顶`
          );
        }
      }
    },
  },
};

/** Worker — Draw 3 cards. If a Stadium is in play, it is also discarded. */
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

/** Serena — Choose 1: switch opponent's active, OR discard up to 3 cards then draw until 5 */
const serena: NamedEffect = {
  cardId: "name:Serena",
  cardName: "Serena",
  trainer: {
    onPlay: async (ctx) => {
      // Present choice via opponent bench selection (min:0 = skip → draw effect)
      if (ctx.opponent.bench.cards.length > 0) {
        const selection = await ctx.promptUser({
          message:
            "Serena: 选择对手备战宝可梦切换（跳过则丢弃手牌并摸牌至5张）",
          min: 0,
          max: 1,
          zone: "opponent_bench",
          targets: ctx.opponent.bench.cards.map((c) => c.instanceId),
        });
        if (selection && selection.length > 0) {
          ctx.switchOpponentActive(selection[0]);
          ctx.log(`Serena: 对手的宝可梦被切换到了战斗区`);
          return;
        }
      }
      // Discard up to 3, draw until 5
      const canDiscard = Math.min(3, ctx.player.hand.cards.length);
      if (canDiscard > 0) {
        await ctx.promptDiscardFromHand(canDiscard, "player");
      }
      const toDraw = Math.max(0, 5 - ctx.player.hand.cards.length);
      if (toDraw > 0) ctx.drawCards(toDraw, "player");
      ctx.log("Serena: 丢弃手牌并摸牌至5张");
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
        "player",
        0 // minCount: up to 3
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
      if (ctx.player.active) {
        ctx.addMarker(ctx.player.active, DAMAGE_BOOST, 10);
        ctx.log("Giovanni's Charisma: 本回合攻击伤害 +10");
      }
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

/** Techno Radar — Discard 2 cards, search deck for up to 2 Pokemon */
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
        "player",
        0 // minCount: up to 2
      );
      for (const card of found) {
        ctx.addToHand(card, "player");
      }
      ctx.shuffleDeck("player");
    },
  },
};

/** Canceling Cologne — Until end of this turn, the opponent's Active Pokemon's abilities are blocked */
const cancelingCologne: NamedEffect = {
  cardId: "name:Canceling Cologne",
  cardName: "Canceling Cologne",
  trainer: {
    canPlay: (ctx) => ctx.opponent.active !== null,
    onPlay: (ctx) => {
      if (ctx.opponent.active) {
        // Set ABILITY_BLOCKED_TEMP (turn-based, auto-clears at end of turn)
        ctx.addMarker(ctx.opponent.active, ABILITY_BLOCKED_TEMP, 1);
        ctx.log(
          `Canceling Cologne: ${ctx.opponent.active.card.name} 本回合特性无效`
        );
      }
    },
  },
};

/** Lost Vacuum — Discard a card, choose a Tool or Stadium in play and put it in the Lost Zone */
const lostVacuum: NamedEffect = {
  cardId: "name:Lost Vacuum",
  cardName: "Lost Vacuum",
  trainer: {
    canPlay: (ctx) => {
      if (ctx.player.hand.cards.length < 1) return false;
      // Must have something to remove: a stadium or at least one tool on opponent's Pokémon
      const hasStadium = !!ctx.getStadium();
      const allOpponentPokemon = [
        ctx.opponent.active,
        ...ctx.opponent.bench.cards,
      ].filter(Boolean);
      const hasTools = allOpponentPokemon.some(p => p!.attachedTools.length > 0);
      return hasStadium || hasTools;
    },
    onPlay: (ctx) => {
      ctx.discardFromHand(1, "player");

      // Collect all opponent tools (active first, then bench)
      const allOpponentPokemon = [
        ctx.opponent.active,
        ...ctx.opponent.bench.cards,
      ].filter(Boolean);
      const pokemonWithTools = allOpponentPokemon.filter(p => p!.attachedTools.length > 0);

      const hasStadium = !!ctx.getStadium();
      const hasTools = pokemonWithTools.length > 0;

      // If only stadium: remove it; if only tools: remove first tool; if both: remove stadium
      // (proper user choice between stadium vs tool requires choose_option prompt — future work)
      if (hasStadium && !hasTools) {
        ctx.removeStadium();
      } else if (hasTools) {
        // Remove the first available tool (active Pokémon's tool takes priority)
        const target = pokemonWithTools[0]!;
        const tool = target.attachedTools.pop()!;
        ctx.opponent.discard.cards.push(tool);
        ctx.log(`Lost Vacuum: 移除了 ${target.card.name} 的道具 ${tool.card.name}`);
      } else if (hasStadium) {
        ctx.removeStadium();
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
    canPlay: (ctx) =>
      ctx.player.bench.cards.length > 0 && ctx.opponent.bench.cards.length > 0,
    onPlay: async (ctx) => {
      const switchedOwn = await ctx.promptSwitchOwnActive?.(
        "Prime Catcher: 选择自己的备战宝可梦切换到战斗区"
      );
      if (!switchedOwn) return;
      await ctx.promptSwitchOpponentActive?.(
        "Prime Catcher: 选择对手的备战宝可梦切换到战斗区"
      );
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
      /** +50 HP: raises the effective HP used for KO checks */
      modifyHp: 50,
    },
  },
};

/** Leftovers — Tool: Heal 20 HP between turns */
const leftovers: NamedEffect = {
  cardId: "name:Leftovers",
  cardName: "Leftovers",
  tool: {
    whileAttached: {
      /** Heal 20 HP at the end of each turn via status-effects.ts */
      healBetweenTurns: 20,
    },
  },
};

/** Hero's Cape — Tool: +100 HP */
const herosCape: NamedEffect = {
  cardId: "name:Hero's Cape",
  cardName: "Hero's Cape",
  tool: {
    whileAttached: {
      /** +100 HP: raises the effective HP used for KO checks */
      modifyHp: 100,
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
        min: 0,
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

/** Mysterious Trunk — Look at top 2 cards of deck, choose 1 for hand, put other on bottom */
const mysteriousTrunk: NamedEffect = {
  cardId: "name:Mysterious Trunk",
  cardName: "Mysterious Trunk",
  trainer: {
    canPlay: (ctx) => ctx.player.deck.cards.length >= 1,
    onPlay: async (ctx) => {
      const revealed = ctx.revealTopCards(2, "player");
      if (revealed.length === 0) return;
      if (revealed.length === 1) {
        ctx.addToHand(revealed[0], "player");
        ctx.log(`Mysterious Trunk: 将 ${revealed[0].card.name} 加入手牌`);
        return;
      }

      // Put both in hand temporarily so promptUser can reference them
      for (const c of revealed) ctx.addToHand(c, "player");

      // Prompt user to choose 1 to keep in hand; the other goes to bottom of deck
      const selection = await ctx.promptUser({
        message: "Mysterious Trunk: 选择1张加入手牌（另1张放到牌组底部）",
        min: 1,
        max: 1,
        zone: "hand",
        targets: revealed.map((c) => c.instanceId),
      });

      const keepId = selection?.[0];
      const keepCard = revealed.find((c) => c.instanceId === keepId) || revealed[0];
      const bottomCard = revealed.find((c) => c.instanceId !== keepId) || revealed[1];

      // Remove bottomCard from hand and put on deck bottom
      const idx = ctx.player.hand.cards.indexOf(bottomCard);
      if (idx !== -1) ctx.player.hand.cards.splice(idx, 1);
      ctx.player.deck.cards.push(bottomCard);

      ctx.log(
        `Mysterious Trunk: 将 ${keepCard.card.name} 加入手牌，${bottomCard.card.name} 放到牌组底部`
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
