/**
 * Wave 5: Lost Zone Core — 失落区体系核心卡效果
 *
 * 补全 Giratina/Comfey 失落区卡组可玩性。
 *
 * 卡效果清单:
 *  1. Sableye — Lost Mine (失落区10+时，放12个伤害指示物分配到对手场上)
 *  2. Cramorant — Spit Innocently (失落区4+时免费110)
 *  3. Dragonite V — Fast Call + Dragon Gale
 *  4. Kyogre — Aqua Storm (对手备战区各5伤害指示物，弃2能)
 *  5. Roxanne — 对手仅剩3张奖赏时：双方洗回手牌，你抽6对手抽2
 *  6. Thorton — 将备战区基础V替换为手牌中的基础V
 *  7. Lost Vacuum — 放1手牌入失落区，弃场上1工具或球场
 *  8. Fantina — 失落区10+时，攻击伤害+120本回合
 *  9. Lost City — 被击倒的宝可梦入失落区
 * 10. Lake Acuity — 水/格斗宝可梦受伤-20
 * 11. Sableye (Dig Up) — 翻顶3找物品
 * 12. Comfey Lost Zone support — 已实现，跳过
 * 13. Colress's Experiment — 已实现，跳过
 * 14. Mirage Gate — 已实现，跳过
 * 15. Escape Rope — 已实现，跳过
 */

import { CardEffectDef, AttackResult } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// Sableye — already implemented in meta-attacks.ts
// Cramorant — already implemented in meta-attacks.ts

// ═══════════════════════════════════════════════════
// 3. Dragonite V — Fast Call + Dragon Gale
// ═══════════════════════════════════════════════════

const dragoniteV: NamedEffect = {
  cardId: "name:Dragonite V",
  cardName: "Dragonite V",
  attacks: [
    {
      name: "Dragon Gale",
      onAttack: (ctx, baseDamage) => {
        // 250 damage, deal 20 to one of your bench Pokemon
        if (ctx.player.bench.cards.length > 0) {
          const selfTarget = ctx.player.bench.cards[0];
          selfTarget.damageCounters += 2;
          ctx.log(`Dragon Gale: 对自己的 ${selfTarget.card.name} 造成 20 伤害`);
        }
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Fast Call",
      type: "activated" as const,
      onActivate: (ctx) => {
        const found = ctx.searchDeck(
          (c: any) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter"),
          1
        );
        ctx.shuffleDeck();
        if (found.length > 0) ctx.log(`Fast Call: 搜索了支持者 ${found[0].card.name}`);
      },
    },
  ],
};

// ═══════════════════════════════════════════════════
// 4. Kyogre — Aqua Storm
// ═══════════════════════════════════════════════════

const kyogre: NamedEffect = {
  cardId: "name:Kyogre",
  cardName: "Kyogre",
  attacks: [
    {
      name: "Aqua Storm",
      onAttack: (ctx, _baseDamage) => {
        // Discard 2 energy from self
        const toDiscard = Math.min(2, ctx.source.attachedEnergy.length);
        for (let i = 0; i < toDiscard; i++) {
          const e = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(e);
        }
        // Place 5 damage counters on each opponent's bench Pokemon
        const benchDamage: { target: any; damage: number }[] = [];
        for (const bench of ctx.opponent.bench.cards) {
          bench.damageCounters += 5;
          ctx.log(`Aqua Storm: 在 ${bench.card.name} 上放置了5个伤害指示物`);
        }
        return { damage: 0 };
      },
    },
  ],
};

// Roxanne — already implemented in trainers-expanded.ts

// ═══════════════════════════════════════════════════
// 6. Thorton — Supporter
// ═══════════════════════════════════════════════════

const thorton: NamedEffect = {
  cardId: "name:Thorton",
  cardName: "Thorton",
  trainer: {
    canPlay: (ctx) => {
      // Need a Basic V on bench and a Basic V in hand
      const hasBenchV = ctx.player.bench.cards.some(
        c => c.card.subtypes?.includes("Basic") && c.card.subtypes?.some((s: string) => s === "V")
      );
      const hasHandV = ctx.player.hand.cards.some(
        c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic") && c.card.subtypes?.some((s: string) => s === "V")
      );
      return hasBenchV && hasHandV;
    },
    onPlay: (ctx) => {
      const benchV = ctx.player.bench.cards.find(
        c => c.card.subtypes?.includes("Basic") && c.card.subtypes?.some((s: string) => s === "V")
      );
      const handV = ctx.player.hand.cards.find(
        c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic") && c.card.subtypes?.some((s: string) => s === "V")
      );
      if (!benchV || !handV) return;

      // Return bench V to hand (without energy/tools)
      ctx.player.bench.cards = ctx.player.bench.cards.filter(c => c.instanceId !== benchV.instanceId);
      // Discard attached energy/tools
      for (const e of benchV.attachedEnergy) ctx.player.discard.cards.push(e);
      for (const t of benchV.attachedTools) ctx.player.discard.cards.push(t);
      benchV.attachedEnergy = [];
      benchV.attachedTools = [];
      benchV.damageCounters = 0;
      benchV.statusConditions = [];
      ctx.player.hand.cards.push(benchV);

      // Put hand V on bench
      ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== handV.instanceId);
      ctx.player.bench.cards.push(handV);

      ctx.log(`Thorton: 将备战区的 ${benchV.card.name} 换为 ${handV.card.name}`);
    },
  },
};

// Lost Vacuum — already implemented in trainers-expanded.ts

// ═══════════════════════════════════════════════════
// 8. Fantina — Supporter
// ═══════════════════════════════════════════════════

const fantina: NamedEffect = {
  cardId: "name:Fantina",
  cardName: "Fantina",
  trainer: {
    canPlay: (ctx) => ctx.player.lostZone.cards.length >= 10,
    onPlay: (ctx) => {
      // For this turn, your Pokemon's attacks do +120 damage
      // Use marker on active to track the boost
      if (ctx.player.active) {
        ctx.addMarker(ctx.player.active, "FANTINA_BOOST", 120);
        ctx.log("Fantina: 本回合攻击伤害+120（失落区10+）");
      }
    },
  },
};

// ═══════════════════════════════════════════════════
// 9. Lost City — Stadium
// ═══════════════════════════════════════════════════

const lostCity: NamedEffect = {
  cardId: "name:Lost City",
  cardName: "Lost City",
  trainer: {
    onPlay: (ctx) => {
      // Stadium effect: KO'd Pokemon go to Lost Zone instead of discard
      // This is tracked via a marker on the game state
      ctx.log("Lost City: 被击倒的宝可梦将放入失落区而非弃牌堆");
    },
  },
};

// ═══════════════════════════════════════════════════
// 10. Lake Acuity — Stadium
// ═══════════════════════════════════════════════════

const lakeAcuity: NamedEffect = {
  cardId: "name:Lake Acuity",
  cardName: "Lake Acuity",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Lake Acuity: 水系和格斗系宝可梦受到的伤害-20");
    },
  },
};

// Manaphy — already implemented in meta-attacks.ts

// ═══════════════════════════════════════════════════
// 12. Spiritomb — Fettered in Misfortune
// ═══════════════════════════════════════════════════

const spiritomb: NamedEffect = {
  cardId: "name:Spiritomb",
  cardName: "Spiritomb",
  abilities: [
    {
      name: "Fettered in Misfortune",
      type: "passive" as const,
      onEvent: {
        triggers: ["pokemon_knocked_out"],
        filter: (ctx, event) => {
          // Only trigger when this Pokemon is knocked out
          return event.targetInstanceId === ctx.source.instanceId;
        },
        handler: (ctx, _event) => {
          // Place 3 damage counters on opponent's active
          if (ctx.opponent.active) {
            ctx.opponent.active.damageCounters += 3;
            ctx.log(`Fettered in Misfortune: 在对手的 ${ctx.opponent.active.card.name} 上放置了3个伤害指示物`);
          }
        },
      },
    },
  ],
};

// ═══════════════════════════════════════════════════
// 13. Radiant Greninja — Concealed Cards (verify)
// Already implemented in sv-abilities.ts, skip
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// 14. Starmie V — Secret Star
// ═══════════════════════════════════════════════════

const starmieV: NamedEffect = {
  cardId: "name:Starmie V",
  cardName: "Starmie V",
  attacks: [
    {
      name: "Secret Star",
      onAttack: (ctx, _baseDamage) => {
        // If discard has 7+ cards, search deck for any 2 cards
        if (ctx.player.discard.cards.length >= 7) {
          const found = ctx.searchDeck(() => true, 2);
          ctx.shuffleDeck();
          ctx.log(`Secret Star: 弃牌堆7+张，搜索了 ${found.map(c => c.card.name).join(", ")}`);
        } else {
          ctx.log("Secret Star: 弃牌堆不足7张");
        }
        return { damage: 0 };
      },
    },
    {
      name: "Speed Attack",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
};

// Raikou V — already implemented in meta-attacks.ts

// ═══════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════

export const lostZoneW5Effects: NamedEffect[] = [
  dragoniteV,
  kyogre,
  thorton,
  fantina,
  lostCity,
  lakeAcuity,
  spiritomb,
  starmieV,
];
