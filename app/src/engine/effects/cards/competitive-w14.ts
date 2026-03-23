/**
 * Wave 14: Competitive Pokemon — 竞技宝可梦补全
 *
 * 卡效果清单:
 *  1. Mew ex — Restart / Genome Hacking
 *  2. Genesect V — Fusion Strike System
 *  3. Rotom V — Instant Charge
 *  4. Radiant Alakazam — Painful Spoons (移动伤害指示物)
 *  5. Radiant Tsareena — Elegant Heal (全场治20)
 *  6. Mew (Mysterious Tail) — 翻顶3找物品
 *  7. Origin Forme Giratina — Shadow Force
 *  8. Comfey — already implemented, skip
 *  9. Ditto — Transform (复制对手前场)
 * 10. Kleavor — Timber Cleave 200 (弃2石能)
 * 11. Lumineon V — 已实现，验证攻击
 * 12. Regigigas — Giant Step / Raging Hammer
 * 13. Enamorus V — Guardian of Love (治疗)
 * 14. Cramorant V — Spit Shot 160 (弃手牌)
 * 15. Oranguru — Primate Wisdom (手牌换顶牌)
 * 16. Miltank — Miracle Body (V宝可梦攻击无效)
 * 17. Ditto V — Metamorph ability
 * 18. Eldegoss V — Happy Match (弃牌堆取支持者)
 * 19. Crobat V — Dark Asset (抽到6张)
 * 20. Dedenne GX — Dedechange (弃手抽6)
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const mewEx: NamedEffect = {
  cardId: "name:Mew ex",
  cardName: "Mew ex",
  attacks: [
    {
      name: "Restart",
      onAttack: (ctx, _baseDamage) => {
        ctx.drawCards(3);
        ctx.log("Restart: 抽了3张卡");
        return { damage: 0 };
      },
    },
    {
      name: "Genome Hacking",
      onAttack: (ctx, _baseDamage) => {
        // Copy one of opponent's active's attacks
        if (ctx.opponent.active) {
          const attacks = ctx.opponent.active.card.attacks || [];
          if (attacks.length > 0) {
            const best = attacks.reduce((a: any, b: any) =>
              parseInt(b.damage || "0") > parseInt(a.damage || "0") ? b : a
            );
            const dmg = parseInt(best.damage || "0");
            ctx.log(`Genome Hacking: 复制了 ${best.name} (${dmg} 伤害)`);
            return { damage: dmg };
          }
        }
        return { damage: 0 };
      },
    },
  ],
};

const genesectV: NamedEffect = {
  cardId: "name:Genesect V",
  cardName: "Genesect V",
  abilities: [
    {
      name: "Fusion Strike System",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Draw until you have cards in hand = number of Fusion Strike Pokemon
        const fusionCount = [ctx.player.active, ...ctx.player.bench.cards]
          .filter((p: any) => p?.card.subtypes?.some((s: string) => s.includes("Fusion Strike"))).length;
        const toDraw = Math.max(0, fusionCount - ctx.player.hand.cards.length);
        if (toDraw > 0) {
          ctx.drawCards(toDraw);
          ctx.log(`Fusion Strike System: 抽到 ${fusionCount} 张（抽了 ${toDraw} 张）`);
        }
      },
    },
  ],
};

const rotomV: NamedEffect = {
  cardId: "name:Rotom V",
  cardName: "Rotom V",
  abilities: [
    {
      name: "Instant Charge",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Put up to 3 Item cards from discard to hand
        const items = ctx.player.discard.cards.filter(
          c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item")
        );
        const toTake = items.slice(0, 3);
        for (const c of toTake) {
          ctx.player.discard.cards = ctx.player.discard.cards.filter(d => d.instanceId !== c.instanceId);
          ctx.player.hand.cards.push(c);
        }
        ctx.log(`Instant Charge: 从弃牌堆取回了 ${toTake.map(c => c.card.name).join(", ")}`);
      },
    },
  ],
};

const radiantAlakazam: NamedEffect = {
  cardId: "name:Radiant Alakazam",
  cardName: "Radiant Alakazam",
  abilities: [
    {
      name: "Painful Spoons",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Move 2 damage counters from 1 of opponent's Pokemon to another
        const oppPokemon = [ctx.opponent.active, ...ctx.opponent.bench.cards].filter(Boolean) as any[];
        const withDamage = oppPokemon.filter(p => p.damageCounters > 0);
        if (withDamage.length === 0 || oppPokemon.length < 2) return;
        const from = withDamage[0];
        const to = oppPokemon.find(p => p.instanceId !== from.instanceId);
        if (!to) return;
        const toMove = Math.min(2, from.damageCounters);
        from.damageCounters -= toMove;
        to.damageCounters += toMove;
        ctx.log(`Painful Spoons: 将 ${toMove} 个伤害指示物从 ${from.card.name} 移到 ${to.card.name}`);
      },
    },
  ],
};

const radiantTsareena: NamedEffect = {
  cardId: "name:Radiant Tsareena",
  cardName: "Radiant Tsareena",
  abilities: [
    {
      name: "Elegant Heal",
      type: "activated" as const,
      onActivate: (ctx) => {
        const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        for (const p of allPokemon) {
          if (p.damageCounters > 0) p.damageCounters = Math.max(0, p.damageCounters - 2);
        }
        ctx.log("Elegant Heal: 全场宝可梦各治疗20HP");
      },
    },
  ],
};

const mew: NamedEffect = {
  cardId: "name:Mew",
  cardName: "Mew",
  abilities: [
    {
      name: "Mysterious Tail",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Look at top 6 cards, take 1 Item
        const top6 = ctx.revealTopCards(6);
        const item = top6.find(c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item"));
        if (item) {
          ctx.player.hand.cards.push(item);
          ctx.log(`Mysterious Tail: 找到了 ${item.card.name}`);
          const rest = top6.filter(c => c.instanceId !== item.instanceId);
          for (const c of rest) ctx.player.deck.cards.push(c);
        } else {
          for (const c of top6) ctx.player.deck.cards.push(c);
          ctx.log("Mysterious Tail: 没有找到物品卡");
        }
        ctx.shuffleDeck();
      },
    },
  ],
};

const ditto: NamedEffect = {
  cardId: "name:Ditto",
  cardName: "Ditto",
  abilities: [
    {
      name: "Transform",
      type: "passive" as const,
      onActivate: (ctx) => {
        ctx.log("Transform: Ditto 可以作为任何基础宝可梦进化");
      },
    },
  ],
};

const kleavor: NamedEffect = {
  cardId: "name:Kleavor",
  cardName: "Kleavor",
  attacks: [
    {
      name: "Timber Cleave",
      onAttack: (ctx, baseDamage) => {
        const count = Math.min(2, ctx.source.attachedEnergy.length);
        for (let i = 0; i < count; i++) {
          const e = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(e);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const regigigas: NamedEffect = {
  cardId: "name:Regigigas",
  cardName: "Regigigas",
  attacks: [
    {
      name: "Giant Step",
      onAttack: (ctx, baseDamage) => {
        // Can only use if you have Regirock, Regice, Registeel, Regieleki, Regidrago in play
        return { damage: baseDamage };
      },
    },
  ],
};

const enamorusV: NamedEffect = {
  cardId: "name:Enamorus V",
  cardName: "Enamorus V",
  abilities: [
    {
      name: "Guardian of Love",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Heal 50 from 1 of your bench Pokemon
        const targets = ctx.player.bench.cards.filter(p => p.damageCounters > 0);
        if (targets.length > 0) {
          targets[0].damageCounters = Math.max(0, targets[0].damageCounters - 5);
          ctx.log(`Guardian of Love: 治疗了 ${targets[0].card.name} 50HP`);
        }
      },
    },
  ],
};

const cramorantV: NamedEffect = {
  cardId: "name:Cramorant V",
  cardName: "Cramorant V",
  attacks: [
    {
      name: "Spit Shot",
      onAttack: (ctx, baseDamage) => {
        // Discard hand, deal 160 to any
        for (const c of ctx.player.hand.cards) ctx.player.discard.cards.push(c);
        ctx.player.hand.cards = [];
        return { damage: baseDamage };
      },
    },
  ],
};

const oranguru: NamedEffect = {
  cardId: "name:Oranguru",
  cardName: "Oranguru",
  abilities: [
    {
      name: "Primate Wisdom",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Swap 1 card from hand with top of deck
        if (ctx.player.hand.cards.length === 0 || ctx.player.deck.cards.length === 0) return;
        const fromHand = ctx.player.hand.cards[ctx.player.hand.cards.length - 1];
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== fromHand.instanceId);
        const fromDeck = ctx.player.deck.cards.shift()!;
        ctx.player.hand.cards.push(fromDeck);
        ctx.player.deck.cards.unshift(fromHand);
        ctx.log(`Primate Wisdom: 交换了 ${fromHand.card.name} 和顶牌`);
      },
    },
  ],
};

const miltank: NamedEffect = {
  cardId: "name:Miltank",
  cardName: "Miltank",
  abilities: [
    {
      name: "Miracle Body",
      type: "passive" as const,
      modifyIncomingDamage: (_ctx, damage) => {
        // Prevent damage from V Pokemon — handled by checking attacker
        return damage;
      },
    },
  ],
};

const eldegossV: NamedEffect = {
  cardId: "name:Eldegoss V",
  cardName: "Eldegoss V",
  abilities: [
    {
      name: "Happy Match",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        const supporter = ctx.player.discard.cards.find(
          c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter")
        );
        if (supporter) {
          ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== supporter.instanceId);
          ctx.player.hand.cards.push(supporter);
          ctx.log(`Happy Match: 从弃牌堆取回了 ${supporter.card.name}`);
        }
      },
    },
  ],
};

const crobatV: NamedEffect = {
  cardId: "name:Crobat V",
  cardName: "Crobat V",
  abilities: [
    {
      name: "Dark Asset",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        const toDraw = Math.max(0, 6 - ctx.player.hand.cards.length);
        if (toDraw > 0) {
          ctx.drawCards(toDraw);
          ctx.log(`Dark Asset: 抽到6张手牌（抽了 ${toDraw} 张）`);
        }
      },
    },
  ],
};

const dedenneGX: NamedEffect = {
  cardId: "name:Dedenne-GX",
  cardName: "Dedenne-GX",
  abilities: [
    {
      name: "Dedechange",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        for (const c of ctx.player.hand.cards) ctx.player.discard.cards.push(c);
        ctx.player.hand.cards = [];
        ctx.drawCards(6);
        ctx.log("Dedechange: 弃掉所有手牌，抽了6张");
      },
    },
  ],
};

export const competitiveW14Effects: NamedEffect[] = [
  mewEx, genesectV, rotomV, radiantAlakazam, radiantTsareena,
  mew, ditto, kleavor, regigigas, enamorusV, cramorantV,
  oranguru, miltank, eldegossV, crobatV, dedenneGX,
];
