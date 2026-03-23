/**
 * Wave 9: Electric / Future — Miraidon / Iron Hands 电系体系
 *
 * 卡效果清单:
 *  1. Regieleki VMAX — Transistor ability / Max Thunder & Lightning
 *  2. Flaaffy — Dynamotor (弃牌堆电能附加到备战区)
 *  3. Mareep — basic attacks
 *  4. Electric Generator — 看顶5，最多2张电能附加
 *  5. Techno Radar — 弃2搜索2张未来宝可梦
 *  6. Forest Seal Stone — VSTAR Power 搜索任意1张
 *  7. Pal Pad — 弃牌堆2张支持者洗回牌组
 *  8. Penny — 捡回基础宝可梦和所有附加卡
 *  9. Arven — 搜索1物品+1工具
 * 10. Judge — 双方洗手牌各抽4 (已实现? 补充)
 * 11. Pokegear 3.0 — 看顶7搜支持者
 * 12. Trekking Shoes — 看顶1，拿或弃
 * 13. Iron Bundle — Homing Heads (120 snipe bench)
 * 14. Iron Moth ex — Energy Burn (弃牌堆能量附加)
 * 15. Sandy Shocks ex — Ground Spike (按能量弃150+)
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const regielekiVMAX: NamedEffect = {
  cardId: "name:Regieleki VMAX",
  cardName: "Regieleki VMAX",
  attacks: [
    {
      name: "Max Thunder and Lightning",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
  abilities: [
    {
      name: "Transistor",
      type: "passive" as const,
      modifyDamage: (ctx, damage, isAttacker) => {
        if (!isAttacker) return damage;
        // Lightning Pokemon attacks do +30
        if (ctx.source.card.types?.includes("Lightning")) return damage + 30;
        return damage;
      },
    },
  ],
};

// Flaaffy — already implemented in meta-attacks.ts

const mareep: NamedEffect = {
  cardId: "name:Mareep",
  cardName: "Mareep",
  attacks: [
    { name: "Tackle", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    {
      name: "Thunder Shock",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        return {
          damage: baseDamage,
          statusEffects: heads ? [{ target: "defender" as const, status: "paralyzed" as any }] : [],
        };
      },
    },
  ],
};

// Electric Generator — already implemented with interactive prompts in trainers.ts

// Techno Radar — already implemented in trainers-expanded.ts
// Forest Seal Stone — already implemented in trainers-expanded.ts

// Pal Pad — already implemented with interactive prompts in trainers.ts

// Penny — already implemented with interactive prompts in trainers.ts

// Arven — already implemented with interactive prompts in trainers.ts

const pokegear: NamedEffect = {
  cardId: "name:Pokégear 3.0",
  cardName: "Pokégear 3.0",
  trainer: {
    onPlay: (ctx) => {
      // Look at top 7, search for Supporter
      const top7 = ctx.revealTopCards(7);
      const supporter = top7.find(c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter"));
      if (supporter) {
        ctx.player.hand.cards.push(supporter);
        ctx.log(`Pokégear 3.0: 找到了 ${supporter.card.name}`);
        const rest = top7.filter(c => c.instanceId !== supporter.instanceId);
        for (const c of rest) ctx.player.deck.cards.push(c);
      } else {
        for (const c of top7) ctx.player.deck.cards.push(c);
        ctx.log("Pokégear 3.0: 没有找到支持者");
      }
      ctx.shuffleDeck();
    },
  },
};

const trekkingShoes: NamedEffect = {
  cardId: "name:Trekking Shoes",
  cardName: "Trekking Shoes",
  trainer: {
    onPlay: (ctx) => {
      // Look at top card, either take it or discard it
      const top = ctx.revealTopCards(1);
      if (top.length > 0) {
        // Auto: take if it's useful (Trainer or Energy), discard otherwise
        const card = top[0];
        if (card.card.supertype === "Trainer" || card.card.supertype === "Energy") {
          ctx.player.hand.cards.push(card);
          ctx.log(`Trekking Shoes: 取得了 ${card.card.name}`);
        } else {
          ctx.player.discard.cards.push(card);
          ctx.log(`Trekking Shoes: 弃掉了 ${card.card.name}`);
          // Draw the next card instead
          ctx.drawCards(1);
        }
      }
    },
  },
};

const ironBundle: NamedEffect = {
  cardId: "name:Iron Bundle",
  cardName: "Iron Bundle",
  attacks: [
    {
      name: "Homing Heads",
      onAttack: (ctx, _baseDamage) => {
        // 120 to bench Pokemon
        if (ctx.opponent.bench.cards.length > 0) {
          const target = ctx.opponent.bench.cards.reduce((best: any, curr: any) => {
            const bestHp = parseInt(best.card.hp || "999") - best.damageCounters * 10;
            const currHp = parseInt(curr.card.hp || "999") - curr.damageCounters * 10;
            return currHp < bestHp ? curr : best;
          });
          return { damage: 0, benchDamage: [{ target, damage: 120 }] };
        }
        return { damage: 120 };
      },
    },
  ],
};

const ironMothEx: NamedEffect = {
  cardId: "name:Iron Moth ex",
  cardName: "Iron Moth ex",
  attacks: [
    {
      name: "Flame Surge",
      onAttack: (ctx, baseDamage) => {
        // Attach up to 3 Basic Fire energy from discard to bench
        const fires = ctx.player.discard.cards.filter(
          c => c.card.supertype === "Energy" && c.card.name?.includes("Fire") && c.card.subtypes?.includes("Basic")
        );
        const toAttach = fires.slice(0, 3);
        const targets = ctx.player.bench.cards.filter(Boolean);
        for (let i = 0; i < toAttach.length && targets.length > 0; i++) {
          const e = toAttach[i];
          ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== e.instanceId);
          targets[i % targets.length].attachedEnergy.push(e);
        }
        if (toAttach.length > 0) ctx.log(`Flame Surge: 从弃牌堆附加了 ${toAttach.length} 张火能量`);
        return { damage: baseDamage };
      },
    },
  ],
};

const sandyShocksEx: NamedEffect = {
  cardId: "name:Sandy Shocks ex",
  cardName: "Sandy Shocks ex",
  attacks: [
    {
      name: "Ground Spike",
      onAttack: (ctx, baseDamage) => {
        // Discard top 3 from deck. +60 for each energy found
        const top3 = ctx.revealTopCards(3);
        let energyCount = 0;
        for (const c of top3) {
          if (c.card.supertype === "Energy") energyCount++;
          ctx.player.discard.cards.push(c);
        }
        ctx.log(`Ground Spike: 弃了顶部3张，找到 ${energyCount} 张能量`);
        return { damage: baseDamage + energyCount * 60 };
      },
    },
  ],
};

export const electricFutureW9Effects: NamedEffect[] = [
  regielekiVMAX, mareep,
  pokegear, trekkingShoes,
  ironBundle, ironMothEx, sandyShocksEx,
];
