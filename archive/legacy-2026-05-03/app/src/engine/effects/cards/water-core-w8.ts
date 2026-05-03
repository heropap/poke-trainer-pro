/**
 * Wave 8: Water Core — Palkia VSTAR 水系体系核心卡效果
 *
 * 卡效果清单:
 *  1. Baxcalibur — Super Cold (每回合从手牌附加任意数量水能)
 *  2. Frigibax — basic attacks
 *  3. Arctibax — basic attacks
 *  4. Kyurem VMAX — Glaciated World (每张水能50伤害)
 *  5. Capacious Bucket — 搜索2张水能到手牌
 *  6. Earthen Vessel — 弃1手牌，搜索2张不同基础能量
 *  7. Super Rod — 弃牌堆宝可梦/能量共3张洗回牌组
 *  8. Cross Switcher — 同时打出2张时切换对手前场
 *  9. Canceling Cologne — 本回合关闭对手能力
 * 10. Beach Court — Stadium: 基础宝可梦撤退-1
 * 11. Bibarel — Industrious Incisors (每回合抽到5张)
 * 12. Bidoof — basic attacks
 * 13. Squawkabilly ex — Squawk and Seize (弃手牌抽6)
 * 14. Lumineon V — Luminous Sign + Aqua Return (已实现? 补充攻击)
 * 15. Palkia V — Subspace Swell (V版本)
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// Baxcalibur — already implemented in sv-abilities.ts

const frigibax: NamedEffect = {
  cardId: "name:Frigibax",
  cardName: "Frigibax",
  attacks: [
    { name: "Tackle", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    { name: "Icicle", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const arctibax: NamedEffect = {
  cardId: "name:Arctibax",
  cardName: "Arctibax",
  attacks: [
    { name: "Slash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const kyuremVMAX: NamedEffect = {
  cardId: "name:Kyurem VMAX",
  cardName: "Kyurem VMAX",
  attacks: [
    {
      name: "Glaciated World",
      onAttack: (ctx, _baseDamage) => {
        // Discard all energy, do 50 for each Water energy discarded
        const waterCount = ctx.source.attachedEnergy.filter(
          (e: any) => e.card.name?.includes("Water") || e.card.types?.includes("Water")
        ).length;
        // Discard all energy
        for (const e of [...ctx.source.attachedEnergy]) {
          ctx.player.discard.cards.push(e);
        }
        ctx.source.attachedEnergy = [];
        ctx.log(`Glaciated World: 弃了全部能量，${waterCount} 张水能 × 50 伤害`);
        return { damage: waterCount * 50 };
      },
    },
  ],
};

const capaciousBucket: NamedEffect = {
  cardId: "name:Capacious Bucket",
  cardName: "Capacious Bucket",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Energy" && c.card.name?.includes("Water") && c.card.subtypes?.includes("Basic"),
        2
      );
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Capacious Bucket: 搜索了 ${found.length} 张水能量到手牌`);
    },
  },
};

// Earthen Vessel — already implemented with interactive prompts in trainers.ts

// Super Rod — already implemented with interactive prompts in trainers.ts

const crossSwitcher: NamedEffect = {
  cardId: "name:Cross Switcher",
  cardName: "Cross Switcher",
  trainer: {
    canPlay: (ctx) => {
      // Need another Cross Switcher in hand
      const crossCount = ctx.player.hand.cards.filter(c => c.card.name === "Cross Switcher").length;
      return crossCount >= 1 && ctx.opponent.bench.cards.length > 0;
    },
    onPlay: (ctx) => {
      // Discard the second Cross Switcher from hand
      const second = ctx.player.hand.cards.find(c => c.card.name === "Cross Switcher");
      if (second) {
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== second.instanceId);
        ctx.player.discard.cards.push(second);
      }
      // Switch opponent's active with bench Pokemon
      if (ctx.opponent.bench.cards.length > 0 && ctx.opponent.active) {
        const target = ctx.opponent.bench.cards[0];
        const oldActive = ctx.opponent.active;
        ctx.opponent.active = target;
        ctx.opponent.bench.cards = ctx.opponent.bench.cards.filter(c => c.instanceId !== target.instanceId);
        ctx.opponent.bench.cards.push(oldActive);
        ctx.log(`Cross Switcher: 将对手的 ${target.card.name} 拉到战斗区`);
      }
    },
  },
};

// Canceling Cologne — already implemented in trainers-expanded.ts
// Beach Court — already implemented in stadiums.ts
// Bibarel — already implemented in meta-attacks.ts

const bidoof: NamedEffect = {
  cardId: "name:Bidoof",
  cardName: "Bidoof",
  attacks: [
    { name: "Tackle", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    { name: "Gnaw", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

// Squawkabilly ex — already implemented in meta-attacks.ts

const palkiaV: NamedEffect = {
  cardId: "name:Origin Forme Palkia V",
  cardName: "Origin Forme Palkia V",
  attacks: [
    {
      name: "Subspace Swell",
      onAttack: (ctx, _baseDamage) => {
        const benchCount = ctx.player.bench.cards.length + ctx.opponent.bench.cards.length;
        return { damage: 60 + benchCount * 20 };
      },
    },
  ],
};

export const waterCoreW8Effects: NamedEffect[] = [
  frigibax, arctibax, kyuremVMAX, capaciousBucket,
  crossSwitcher,
  bidoof, palkiaV,
];
