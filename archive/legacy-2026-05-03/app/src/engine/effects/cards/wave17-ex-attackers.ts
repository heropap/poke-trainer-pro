/**
 * Wave 17: ex Attackers — 补全主要ex攻击手
 *
 * 卡效果清单:
 *  1. Gardevoir ex (SV) — Miracle Force (190, remove own status) — already in meta-attacks, check
 *  2. Gholdengo ex — Coin Bonus + Make It Rain (30× energy in discard)
 *  3. Revavroom ex — Nitro Boost ability + Rush Crash
 *  4. Annihilape ex — Angry Grudge (30× damage counters on self)
 *  5. Armarouge ex — Fire Off + Crimson Storm
 *  6. Kingdra ex — Hydro Splash + Waterspout
 *  7. Gengar ex — Phantom Dive + Shadow Attack
 *  8. Gyarados ex — Tyrannical Tail + Waterfall
 *  9. Okidogi ex — Poison Rush + Pummel
 * 10. Munkidori ex — Mind Bend + Psychedelic (poison all bench)
 * 11. Farigiraf ex — Armor Tail ability (block supporters)
 * 12. Mimikyu ex — Trick ability + Curse of Shadows
 * 13. Glimmora ex — Reactive Toxin ability + Poisonous Gem
 * 14. Scizor ex — Punishing Scissors + Metal Edge
 * 15. Torterra ex — Evolving Canopy + Land Crush
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const gholdengoEx: NamedEffect = {
  cardId: "name:Gholdengo ex",
  cardName: "Gholdengo ex",
  attacks: [
    {
      name: "Make It Rain",
      onAttack: (ctx, _baseDamage) => {
        // 30 × Basic Energy in discard. Discard 1 energy from self after.
        const energyCount = ctx.player.discard.cards.filter(
          c => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic")
        ).length;
        if (ctx.source.attachedEnergy.length > 0) {
          const e = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(e);
        }
        return { damage: energyCount * 30 };
      },
    },
  ],
  abilities: [
    {
      name: "Coin Bonus",
      type: "activated" as const,
      onActivate: (ctx) => {
        ctx.drawCards(1);
        ctx.log("Coin Bonus: 抽了1张卡");
      },
    },
  ],
};

const revavroomEx: NamedEffect = {
  cardId: "name:Revavroom ex",
  cardName: "Revavroom ex",
  attacks: [
    { name: "Rush Crash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
  abilities: [
    {
      name: "Nitro Boost",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Attach 1 Metal energy from deck
        const found = ctx.searchDeck(
          c => c.card.supertype === "Energy" && (c.card.name?.includes("Metal") || c.card.types?.includes("Metal")) && c.card.subtypes?.includes("Basic"),
          1
        );
        if (found.length > 0 && ctx.player.active) {
          ctx.player.active.attachedEnergy.push(found[0]);
          ctx.shuffleDeck();
          ctx.log(`Nitro Boost: 从牌组附加了金属能量`);
        }
      },
    },
  ],
};

const annihilapeEx: NamedEffect = {
  cardId: "name:Annihilape ex",
  cardName: "Annihilape ex",
  attacks: [
    {
      name: "Angry Grudge",
      onAttack: (ctx, _baseDamage) => {
        // 30 × damage counters on this Pokemon
        return { damage: ctx.source.damageCounters * 30 };
      },
    },
  ],
};

const armarougeEx: NamedEffect = {
  cardId: "name:Armarouge ex",
  cardName: "Armarouge ex",
  attacks: [
    {
      name: "Crimson Storm",
      onAttack: (ctx, baseDamage) => {
        const count = Math.min(3, ctx.source.attachedEnergy.length);
        for (let i = 0; i < count; i++) {
          const e = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(e);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const kingdraEx: NamedEffect = {
  cardId: "name:Kingdra ex",
  cardName: "Kingdra ex",
  attacks: [
    {
      name: "Waterspout",
      onAttack: (ctx, _baseDamage) => {
        // 40× Water energy attached to all your Pokemon
        const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        let waterCount = 0;
        for (const p of allPokemon) {
          waterCount += p.attachedEnergy.filter(
            (e: any) => e.card.name?.includes("Water") || e.card.types?.includes("Water")
          ).length;
        }
        return { damage: waterCount * 40 };
      },
    },
  ],
};

const gengarEx: NamedEffect = {
  cardId: "name:Gengar ex",
  cardName: "Gengar ex",
  attacks: [
    {
      name: "Phantom Dive",
      onAttack: (ctx, baseDamage) => {
        // Place 4 damage counters on opponent's bench
        if (ctx.opponent.bench.cards.length > 0) {
          const target = ctx.opponent.bench.cards[0];
          target.damageCounters += 4;
          ctx.log(`Phantom Dive: 在 ${target.card.name} 上放置了4个伤害指示物`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const gyaradosEx: NamedEffect = {
  cardId: "name:Gyarados ex",
  cardName: "Gyarados ex",
  attacks: [
    {
      name: "Tyrannical Tail",
      onAttack: (ctx, baseDamage) => {
        // +100 if opponent has exactly 1 prize card left
        if (ctx.opponent.prizes.cards.length === 1) return { damage: baseDamage + 100 };
        return { damage: baseDamage };
      },
    },
  ],
};

const okidogiEx: NamedEffect = {
  cardId: "name:Okidogi ex",
  cardName: "Okidogi ex",
  attacks: [
    {
      name: "Pummel",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        return { damage: baseDamage + (heads ? 80 : 0) };
      },
    },
  ],
};

const farigirafEx: NamedEffect = {
  cardId: "name:Farigiraf ex",
  cardName: "Farigiraf ex",
  abilities: [
    {
      name: "Armor Tail",
      type: "passive" as const,
      // Blocks opponent's Supporter effects on your Pokemon
      onActivate: (ctx) => {
        ctx.log("Armor Tail: 对手的支持者不能影响你的宝可梦");
      },
    },
  ],
};

const mimikyu_ex: NamedEffect = {
  cardId: "name:Mimikyu ex",
  cardName: "Mimikyu ex",
  attacks: [
    {
      name: "Curse of Shadows",
      onAttack: (ctx, baseDamage) => {
        // Place 7 damage counters on opponent's active between turns
        ctx.addMarker(ctx.opponent.active!, "SHADOW_CURSE_COUNTERS", 7);
        return { damage: baseDamage };
      },
    },
  ],
};

const glimmoraEx: NamedEffect = {
  cardId: "name:Glimmora ex",
  cardName: "Glimmora ex",
  attacks: [
    {
      name: "Poisonous Gem",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ target: "defender" as const, status: "poisoned" as any }],
      }),
    },
  ],
};

const scizorEx: NamedEffect = {
  cardId: "name:Scizor ex",
  cardName: "Scizor ex",
  attacks: [
    {
      name: "Punishing Scissors",
      onAttack: (ctx, baseDamage) => {
        // +50 for each Special Energy on opponent's active
        const specialCount = ctx.opponent.active?.attachedEnergy.filter(
          (e: any) => !e.card.subtypes?.includes("Basic")
        ).length || 0;
        return { damage: baseDamage + specialCount * 50 };
      },
    },
  ],
};

const torterraEx: NamedEffect = {
  cardId: "name:Torterra ex",
  cardName: "Torterra ex",
  attacks: [
    { name: "Land Crush", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
  abilities: [
    {
      name: "Evolving Canopy",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        // Search deck for up to 3 Grass Basic Pokemon
        const found = ctx.searchDeck(
          c => c.card.supertype === "Pokémon" && c.card.types?.includes("Grass") && c.card.subtypes?.includes("Basic"),
          3
        );
        const benchSpace = 5 - ctx.player.bench.cards.length;
        for (let i = 0; i < Math.min(found.length, benchSpace); i++) {
          ctx.player.bench.cards.push(found[i]);
        }
        ctx.shuffleDeck();
        if (found.length > 0) ctx.log(`Evolving Canopy: 搜索了 ${found.length} 只草系基础宝可梦到备战区`);
      },
    },
  ],
};

export const wave17ExAttackersEffects: NamedEffect[] = [
  gholdengoEx, revavroomEx, annihilapeEx, armarougeEx,
  kingdraEx, gengarEx, gyaradosEx, okidogiEx, farigirafEx,
  mimikyu_ex, glimmoraEx, scizorEx, torterraEx,
];
