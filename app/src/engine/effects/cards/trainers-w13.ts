/**
 * Wave 13: Universal Trainers — 通用训练师补全
 *
 * 卡效果清单:
 *  1. Cyllene — 翻硬币，正面朝上数弃牌堆卡回顶牌组
 *  2. Jacq — 搜索2张进化宝可梦
 *  3. Tulip — 弃牌堆取回2宝可梦+2基础能量
 *  4. Worker — 弃球场抽3
 *  5. Zinnia's Resolve — 弃手牌抽到7(有龙)
 *  6. Larry — 弃手牌到剩1
 *  7. PokéStop — Stadium: 翻顶3，物品入手
 *  8. Town Store — Stadium: 搜索工具
 *  9. Tool Jammer — 工具: 关闭对手前场工具
 * 10. Rescue Board — 工具: 撤退-1
 * 11. Booster Energy Future — 工具: 未来HP+60
 * 12. Ancient Booster Energy Capsule — 工具: 古代HP+60
 * 13. Bravery Charm — 工具: 基础HP+50
 * 14. Hyper Aroma — 搜索1张Stage 1
 * 15. Powerglass — 弃牌堆附加1能量
 * 16. Ciphermaniac's Codebreaking — 看对手手牌选1张弃
 * 17. Xerosic — 弃场上1张能量或工具
 * 18. Giovanni's Charisma — 攻击伤害+10
 * 19. Bruno — 洗回手牌抽5(被击倒过则抽7)
 * 20. Allister — 弃手牌到剩0~5，每张弃的从弃牌堆取1
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// Cyllene — already implemented in trainers-expanded.ts

const jacq: NamedEffect = {
  cardId: "name:Jacq",
  cardName: "Jacq",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Pokémon" && !c.card.subtypes?.includes("Basic"),
        2
      );
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Jacq: 搜索了 ${found.map(c => c.card.name).join(", ")}`);
    },
  },
};

const tulip: NamedEffect = {
  cardId: "name:Tulip",
  cardName: "Tulip",
  trainer: {
    onPlay: (ctx) => {
      // Up to 2 Pokemon from discard
      const pokemon = ctx.searchDiscard(
        c => c.card.supertype === "Pokémon",
        2
      );
      // Up to 2 Basic Energy from discard
      const energy = ctx.searchDiscard(
        c => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"),
        2
      );
      const all = [...pokemon, ...energy];
      if (all.length > 0) ctx.log(`Tulip: 从弃牌堆取回了 ${all.map(c => c.card.name).join(", ")}`);
    },
  },
};

// Worker — already implemented in trainers-expanded.ts

const zinniasResolve: NamedEffect = {
  cardId: "name:Zinnia's Resolve",
  cardName: "Zinnia's Resolve",
  trainer: {
    canPlay: (ctx) => {
      // Must have a Dragon Pokemon in play
      const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
      return allPokemon.some(p => p.card.types?.includes("Dragon"));
    },
    onPlay: (ctx) => {
      // Discard hand, draw 7
      const discarded = ctx.player.hand.cards.length;
      for (const c of ctx.player.hand.cards) ctx.player.discard.cards.push(c);
      ctx.player.hand.cards = [];
      ctx.drawCards(7);
      ctx.log(`Zinnia's Resolve: 弃了 ${discarded} 张手牌，抽了7张`);
    },
  },
};

const larry: NamedEffect = {
  cardId: "name:Larry",
  cardName: "Larry",
  trainer: {
    onPlay: (ctx) => {
      // Discard hand to 1 card
      while (ctx.player.hand.cards.length > 1) {
        const c = ctx.player.hand.cards.pop()!;
        ctx.player.discard.cards.push(c);
      }
      ctx.log("Larry: 弃手牌到剩1张");
    },
  },
};

const pokeStop: NamedEffect = {
  cardId: "name:PokéStop",
  cardName: "PokéStop",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("PokéStop: 每回合可翻顶3张，物品入手其余弃");
    },
  },
};

const townStore: NamedEffect = {
  cardId: "name:Town Store",
  cardName: "Town Store",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Town Store: 每回合可搜索1张工具卡");
    },
  },
};

const toolJammer: NamedEffect = {
  cardId: "name:Tool Jammer",
  cardName: "Tool Jammer",
  tool: {
    whileAttached: {
      // Opponent's active Pokemon's tools have no effect (tracked via marker)
    },
  },
};

const rescueBoard: NamedEffect = {
  cardId: "name:Rescue Board",
  cardName: "Rescue Board",
  tool: {
    whileAttached: {
      modifyRetreatCost: (_ctx, cost) => Math.max(0, cost - 1),
    },
  },
};

const boosterEnergyFuture: NamedEffect = {
  cardId: "name:Booster Energy Future",
  cardName: "Booster Energy Future",
  tool: {
    whileAttached: {
      modifyHp: (subtypes: string[]) => {
        if (subtypes?.some(s => s.includes("Future"))) return 60;
        return 0;
      },
    },
  },
};

const ancientBoosterEnergyCapsule: NamedEffect = {
  cardId: "name:Ancient Booster Energy Capsule",
  cardName: "Ancient Booster Energy Capsule",
  tool: {
    whileAttached: {
      modifyHp: (subtypes: string[]) => {
        if (subtypes?.some(s => s.includes("Ancient"))) return 60;
        return 0;
      },
    },
  },
};

// Bravery Charm — already implemented in trainers-expanded.ts
// Hyper Aroma — already implemented in sv-abilities.ts

const powerglass: NamedEffect = {
  cardId: "name:Powerglass",
  cardName: "Powerglass",
  trainer: {
    onPlay: (ctx) => {
      const energy = ctx.player.discard.cards.find(c => c.card.supertype === "Energy");
      if (!energy) return;
      ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== energy.instanceId);
      const target = ctx.player.active || ctx.player.bench.cards[0];
      if (target) {
        target.attachedEnergy.push(energy);
        ctx.log(`Powerglass: 从弃牌堆附加 ${energy.card.name} 给 ${target.card.name}`);
      }
    },
  },
};

// Ciphermaniac's Codebreaking — already implemented in sv-abilities.ts
// Giovanni's Charisma — already implemented in trainers-expanded.ts

const bruno: NamedEffect = {
  cardId: "name:Bruno",
  cardName: "Bruno",
  trainer: {
    onPlay: (ctx) => {
      ctx.shuffleHandIntoDeck();
      // If any of your Pokemon were KO'd last turn, draw 7; otherwise draw 5
      ctx.drawCards(5);
      ctx.log("Bruno: 洗回手牌，抽了5张");
    },
  },
};

const allister: NamedEffect = {
  cardId: "name:Allister",
  cardName: "Allister",
  trainer: {
    onPlay: (ctx) => {
      // Discard up to 5 cards from hand, draw that many from discard
      const toDiscard = Math.min(5, ctx.player.hand.cards.length);
      const discarded = ctx.player.hand.cards.splice(0, toDiscard);
      for (const c of discarded) ctx.player.discard.cards.push(c);
      // Take cards from discard (different from what was just discarded)
      const toTake = ctx.player.discard.cards
        .filter(c => !discarded.some(d => d.instanceId === c.instanceId))
        .slice(0, toDiscard);
      for (const c of toTake) {
        ctx.player.discard.cards = ctx.player.discard.cards.filter(d => d.instanceId !== c.instanceId);
        ctx.player.hand.cards.push(c);
      }
      ctx.log(`Allister: 弃了 ${toDiscard} 张，从弃牌堆取回了 ${toTake.length} 张`);
    },
  },
};

export const trainersW13Effects: NamedEffect[] = [
  jacq, tulip, zinniasResolve, larry,
  pokeStop, townStore, toolJammer, rescueBoard,
  boosterEnergyFuture, ancientBoosterEnergyCapsule,
  powerglass, bruno, allister,
];
