/**
 * Wave 21: Eeveelution Line Effects — 伊布进化全家族
 *
 * 卡效果清单 (15):
 *  1. Vaporeon — Water Splash 60 / Rain Splash 120
 *  2. Jolteon — Pin Missile: flip 4 coins × 30 / Thunder Shock paralysis
 *  3. Flareon — Heat Breath: flip coin + 90 / Flamethrower discard energy
 *  4. Umbreon V — Dark Signal ability: switch opp active on evolve
 *  5. Umbreon VMAX — Dark Signal + Max Darkness 160+20 per energy on opp
 *  6. Sylveon V — Dream Gift: search any Item
 *  7. Glaceon VSTAR — Crystal Star VSTAR: prevent all damage next turn
 *  8. Espeon VMAX — Max Mindstorm: 60 per energy on all opp
 *  9. Leafeon V — Greening Cells: attach Grass from deck to bench
 * 10. Zorua (illusion line) — basic attacks
 * 11. Zoroark — Phantom Transformation ability: copy attack
 * 12. Vaporeon VMAX — Bubble Pod bench snipe
 * 13. Jolteon VMAX — Max Thunder Rumble
 * 14. Flareon VMAX — Max Detonate
 * 15. Eevee VMAX — G-Max Cuddle prevent retreat
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const vaporeon: NamedEffect = {
  cardId: "name:Vaporeon",
  cardName: "Vaporeon",
  attacks: [
    { name: "Water Splash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    { name: "Rain Splash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const jolteon: NamedEffect = {
  cardId: "name:Jolteon",
  cardName: "Jolteon",
  attacks: [
    {
      name: "Pin Missile",
      onAttack: (ctx, _baseDamage) => {
        const { heads } = ctx.flipCoins(4);
        ctx.log(`Pin Missile: ${heads} 枚正面`);
        return { damage: heads * 30 };
      },
    },
    {
      name: "Thunder Shock",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        return {
          damage: baseDamage,
          statusEffects: heads
            ? [{ target: "defender" as const, status: "paralyzed" as any }]
            : [],
        };
      },
    },
  ],
};

const flareon: NamedEffect = {
  cardId: "name:Flareon",
  cardName: "Flareon",
  attacks: [
    {
      name: "Heat Breath",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        return { damage: baseDamage + (heads ? 90 : 0) };
      },
    },
    {
      name: "Flamethrower",
      onAttack: (_ctx, baseDamage) => {
        return { damage: baseDamage, discardEnergy: 1 };
      },
    },
  ],
};

const umbreonV: NamedEffect = {
  cardId: "name:Umbreon V",
  cardName: "Umbreon V",
  attacks: [
    { name: "Mean Look", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage, preventRetreat: true }) },
  ],
};

const umbreonVMAX: NamedEffect = {
  cardId: "name:Umbreon VMAX",
  cardName: "Umbreon VMAX",
  abilities: [
    {
      name: "Dark Signal",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        // When evolved, switch opponent's active with a bench Pokemon
        if (ctx.opponent.bench.cards.length > 0) {
          const target = ctx.opponent.bench.cards[0];
          ctx.switchOpponentActive(target.instanceId);
          ctx.log(`Dark Signal: 切换了对手的活跃宝可梦为 ${target.card.name}`);
        }
      },
    },
  ],
  attacks: [
    {
      name: "Max Darkness",
      onAttack: (ctx, baseDamage) => {
        // 160 + 20 for each energy on opponent's active
        const oppEnergy = ctx.opponent.active?.attachedEnergy.length ?? 0;
        return { damage: baseDamage + oppEnergy * 20 };
      },
    },
  ],
};

const sylveonV: NamedEffect = {
  cardId: "name:Sylveon V",
  cardName: "Sylveon V",
  abilities: [
    {
      name: "Dream Gift",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Search deck for any Item card
        const found = ctx.searchDeck(
          c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item"),
          1
        );
        ctx.shuffleDeck();
        if (found.length > 0) ctx.log(`Dream Gift: 搜索了 ${found[0].card.name}`);
      },
    },
  ],
};

const glaceonVSTAR: NamedEffect = {
  cardId: "name:Glaceon VSTAR",
  cardName: "Glaceon VSTAR",
  attacks: [
    { name: "Icicle Shot", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
  abilities: [
    {
      name: "Crystal Star",
      type: "activated" as const,
      onActivate: (ctx) => {
        // VSTAR Power: prevent all damage from attacks next turn
        ctx.addMarker(ctx.source, "crystal_star_protection");
        ctx.log("Crystal Star: 下回合防止所有攻击伤害（VSTAR力量）");
        ctx.addMarker(ctx.source, "vstar_used");
      },
    },
  ],
};

const espeonVMAX: NamedEffect = {
  cardId: "name:Espeon VMAX",
  cardName: "Espeon VMAX",
  attacks: [
    {
      name: "Max Mindstorm",
      onAttack: (ctx, _baseDamage) => {
        // 60 damage for each energy attached to all opponent's Pokemon
        const allOpp = ctx.getAllPokemon("opponent");
        let totalEnergy = 0;
        for (const p of allOpp) {
          totalEnergy += p.attachedEnergy.length;
        }
        ctx.log(`Max Mindstorm: 对手全场共 ${totalEnergy} 个能量`);
        return { damage: totalEnergy * 60 };
      },
    },
  ],
};

const leafeonV: NamedEffect = {
  cardId: "name:Leafeon V",
  cardName: "Leafeon V",
  abilities: [
    {
      name: "Greening Cells",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Attach Grass energy from deck to a benched Pokemon
        if (ctx.player.bench.cards.length > 0) {
          const target = ctx.player.bench.cards[0];
          const attached = ctx.attachEnergyFromDeck(
            c => c.card.name?.includes("Grass") && c.card.subtypes?.includes("Basic"),
            target
          );
          if (attached) ctx.log(`Greening Cells: 给 ${target.card.name} 附加了草能量`);
        }
      },
    },
  ],
};

const zoruaIllusion: NamedEffect = {
  cardId: "name:Zorua",
  cardName: "Zorua",
  attacks: [{ name: "Scratch", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const zoroark: NamedEffect = {
  cardId: "name:Zoroark",
  cardName: "Zoroark",
  abilities: [
    {
      name: "Phantom Transformation",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Copy an attack from a benched Pokemon — simplified: log intent
        if (ctx.player.bench.cards.length > 0) {
          const benchMon = ctx.player.bench.cards[0];
          ctx.log(`Phantom Transformation: 复制了 ${benchMon.card.name} 的攻击`);
        }
      },
    },
  ],
  attacks: [
    { name: "Night Burst", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const vaporeonVMAX: NamedEffect = {
  cardId: "name:Vaporeon VMAX",
  cardName: "Vaporeon VMAX",
  attacks: [
    {
      name: "Bubble Pod",
      onAttack: (ctx, _baseDamage) => {
        // Search deck for Water Pokemon and put on bench
        const found = ctx.searchDeck(
          c => c.card.supertype === "Pokémon" && c.card.types?.includes("Water"),
          1
        );
        ctx.shuffleDeck();
        if (found.length > 0) {
          ctx.player.bench.cards.push(found[0]);
          ctx.log(`Bubble Pod: 放置了 ${found[0].card.name} 到后备区`);
        }
        return { damage: 0 };
      },
    },
    { name: "Max Torrent", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const jolteonVMAX: NamedEffect = {
  cardId: "name:Jolteon VMAX",
  cardName: "Jolteon VMAX",
  attacks: [
    {
      name: "Max Thunder Rumble",
      onAttack: (ctx, baseDamage) => {
        // Damage + snipe 100 to benched Pokemon
        if (ctx.opponent.bench.cards.length > 0) {
          return {
            damage: baseDamage,
            benchDamage: [{ target: ctx.opponent.bench.cards[0], damage: 100 }],
          };
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const flareonVMAX: NamedEffect = {
  cardId: "name:Flareon VMAX",
  cardName: "Flareon VMAX",
  attacks: [
    {
      name: "Max Detonate",
      onAttack: (ctx, baseDamage) => {
        // Discard top 5, +100 per energy found
        const revealed = ctx.revealTopCards(5);
        const energyCount = revealed.filter(c => c.card.supertype === "Energy").length;
        // Put non-energy back on top, energy to discard
        const nonEnergy = revealed.filter(c => c.card.supertype !== "Energy");
        ctx.putOnTopOfDeck(nonEnergy);
        ctx.log(`Max Detonate: 翻出 ${energyCount} 个能量`);
        return { damage: baseDamage + energyCount * 100 };
      },
    },
  ],
};

const eeveeVMAX: NamedEffect = {
  cardId: "name:Eevee VMAX",
  cardName: "Eevee VMAX",
  attacks: [
    {
      name: "G-Max Cuddle",
      onAttack: (_ctx, baseDamage) => {
        return { damage: baseDamage, preventRetreat: true };
      },
    },
  ],
};

export const wave21EeveelutionsEffects: NamedEffect[] = [
  vaporeon, jolteon, flareon, umbreonV, umbreonVMAX,
  sylveonV, glaceonVSTAR, espeonVMAX, leafeonV,
  zoruaIllusion, zoroark, vaporeonVMAX, jolteonVMAX,
  flareonVMAX, eeveeVMAX,
];
