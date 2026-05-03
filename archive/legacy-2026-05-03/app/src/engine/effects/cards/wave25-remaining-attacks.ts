/**
 * Wave 25: Remaining Competitive Attacks — 剩余竞技攻击宝可梦
 *
 * 卡效果清单 (20):
 *  1. Zoroark — Phantom Transformation copies bench Pokemon attacks
 *  2. Gallade VSTAR — Resolute Blade (50× opponent's bench) + VSTAR Search
 *  3. Decidueye — Deep Forest Camo ability (prevent V damage)
 *  4. Hisuian Zoroark VSTAR — Phantom Star search + Void Return
 *  5. Machamp V — Revenge Buster (160+bonus if KO'd)
 *  6. Blaziken V — High Jump Kick 50 / Blaze Kick 130+burn
 *  7. Solrock — Sun Catcher (switch opponent)
 *  8. Lunatone — Moon Watching (draw 2)
 *  9. Granbull — Jaw Lock (prevent retreat)
 * 10. Zangoose — Revenge (70, +90 if Pokemon was KO'd)
 * 11. Dugtrio — Sand Pulse 60 × 3 bench flip
 * 12. Swellow — Fast Wing attack
 * 13. Dodrio — Triple Kick flip 3 × 50
 * 14. Arbok — Acid Spray (discard energy)
 * 15. Wigglytuff — Balloon Barrage flip × 60
 * 16. Dusknoir V — Shadow Bind 150 prevent retreat
 * 17. Lumineon — Waterfall 120
 * 18. Oricorio — Passionate Dance (bench Pokemon placement)
 * 19. Mew VMAX — Cross Fusion Strike (copy any Fusion attack)
 * 20. Genesect (non-V) — basic attacks
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const zoroarkAttack: NamedEffect = {
  cardId: "name:Zoroark",
  cardName: "Zoroark",
  attacks: [
    {
      name: "Phantom Transformation",
      onAttack: (ctx, baseDamage) => {
        // Copy an attack from a benched Pokemon — simplified: use baseDamage + bench bonus
        const benchCount = ctx.player.bench.cards.length;
        ctx.log(`Phantom Transformation: 后备区有 ${benchCount} 只宝可梦`);
        return { damage: baseDamage + benchCount * 10 };
      },
    },
  ],
};

const galladeVSTAR: NamedEffect = {
  cardId: "name:Gallade VSTAR",
  cardName: "Gallade VSTAR",
  attacks: [
    {
      name: "Resolute Blade",
      onAttack: (ctx, _baseDamage) => {
        // 50 damage for each of opponent's benched Pokemon
        const benchCount = ctx.opponent.bench.cards.length;
        ctx.log(`Resolute Blade: 对手后备区 ${benchCount} 只`);
        return { damage: benchCount * 50 };
      },
    },
  ],
  abilities: [
    {
      name: "VSTAR Search",
      type: "activated" as const,
      onActivate: (ctx) => {
        // VSTAR Power: search deck for any card
        const found = ctx.searchDeck(() => true, 1);
        ctx.shuffleDeck();
        if (found.length > 0) ctx.log(`VSTAR Search: 搜索了 ${found[0].card.name}`);
        ctx.addMarker(ctx.source, "vstar_used");
      },
    },
  ],
};

const decidueye: NamedEffect = {
  cardId: "name:Decidueye",
  cardName: "Decidueye",
  abilities: [
    {
      name: "Deep Forest Camo",
      type: "passive" as const,
      modifyIncomingDamage: (ctx, damage) => {
        // Prevent all damage from V Pokemon
        const attacker = ctx.opponent.active;
        if (attacker?.card.subtypes?.some(s => s.includes("V"))) {
          ctx.log("Deep Forest Camo: 防止了来自V宝可梦的伤害");
          return 0;
        }
        return damage;
      },
    },
  ],
  attacks: [
    { name: "Splitting Arrow", onAttack: (ctx, baseDamage) => {
      // Also do 20 to 2 benched Pokemon
      const benchTargets = ctx.opponent.bench.cards.slice(0, 2);
      return {
        damage: baseDamage,
        benchDamage: benchTargets.map(t => ({ target: t, damage: 20 })),
      };
    }},
  ],
};

const hisuianZoroarkVSTAR: NamedEffect = {
  cardId: "name:Hisuian Zoroark VSTAR",
  cardName: "Hisuian Zoroark VSTAR",
  attacks: [
    {
      name: "Void Return",
      onAttack: (ctx, baseDamage) => {
        // Switch self with a benched Pokemon after attack
        if (ctx.player.bench.cards.length > 0) {
          ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
          ctx.log("Void Return: 攻击后切换到后备区");
        }
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Phantom Star",
      type: "activated" as const,
      onActivate: (ctx) => {
        // VSTAR Power: search deck for any 3 cards
        const found = ctx.searchDeck(() => true, 3);
        ctx.shuffleDeck();
        ctx.log(`Phantom Star: 搜索了 ${found.length} 张卡（VSTAR力量）`);
        ctx.addMarker(ctx.source, "vstar_used");
      },
    },
  ],
};

const machampV: NamedEffect = {
  cardId: "name:Machamp V",
  cardName: "Machamp V",
  attacks: [
    {
      name: "Revenge Buster",
      onAttack: (ctx, baseDamage) => {
        // 160 + 80 if a Pokemon was KO'd last turn
        const wasKOd = (ctx.state as any).lastTurnKO;
        const bonus = wasKOd ? 80 : 0;
        if (bonus) ctx.log("Revenge Buster: KO加成 +80");
        return { damage: baseDamage + bonus };
      },
    },
  ],
};

const blazikenV: NamedEffect = {
  cardId: "name:Blaziken V",
  cardName: "Blaziken V",
  attacks: [
    { name: "High Jump Kick", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    {
      name: "Blaze Kick",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ target: "defender" as const, status: "burned" as any }],
      }),
    },
  ],
};

const solrock: NamedEffect = {
  cardId: "name:Solrock",
  cardName: "Solrock",
  attacks: [
    {
      name: "Sun Catcher",
      onAttack: (ctx, baseDamage) => {
        // Switch opponent's active with a bench Pokemon
        if (ctx.opponent.bench.cards.length > 0) {
          const target = ctx.opponent.bench.cards[0];
          ctx.switchOpponentActive(target.instanceId);
          ctx.log(`Sun Catcher: 切换了对手的 ${target.card.name}`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const lunatone: NamedEffect = {
  cardId: "name:Lunatone",
  cardName: "Lunatone",
  abilities: [
    {
      name: "Moon Watching",
      type: "activated" as const,
      onActivate: (ctx) => {
        ctx.drawCards(2);
        ctx.log("Moon Watching: 抽了2张");
      },
    },
  ],
};

const granbull: NamedEffect = {
  cardId: "name:Granbull",
  cardName: "Granbull",
  attacks: [
    {
      name: "Jaw Lock",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        preventRetreat: true,
      }),
    },
  ],
};

const zangoose: NamedEffect = {
  cardId: "name:Zangoose",
  cardName: "Zangoose",
  attacks: [
    {
      name: "Revenge",
      onAttack: (ctx, baseDamage) => {
        // 70, +90 if a Pokemon was KO'd last turn
        const wasKOd = (ctx.state as any).lastTurnKO;
        const bonus = wasKOd ? 90 : 0;
        if (bonus) ctx.log("Revenge: KO加成 +90");
        return { damage: baseDamage + bonus };
      },
    },
  ],
};

const dugtrio: NamedEffect = {
  cardId: "name:Dugtrio",
  cardName: "Dugtrio",
  attacks: [
    {
      name: "Sand Pulse",
      onAttack: (ctx, _baseDamage) => {
        // Flip 3 coins, 60 for each heads
        const { heads } = ctx.flipCoins(3);
        ctx.log(`Sand Pulse: ${heads} 枚正面`);
        return { damage: heads * 60 };
      },
    },
  ],
};

const swellow: NamedEffect = {
  cardId: "name:Swellow",
  cardName: "Swellow",
  attacks: [
    { name: "Fast Wing", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const dodrio: NamedEffect = {
  cardId: "name:Dodrio",
  cardName: "Dodrio",
  attacks: [
    {
      name: "Triple Kick",
      onAttack: (ctx, _baseDamage) => {
        const { heads } = ctx.flipCoins(3);
        ctx.log(`Triple Kick: ${heads} 枚正面`);
        return { damage: heads * 50 };
      },
    },
  ],
};

const arbok: NamedEffect = {
  cardId: "name:Arbok",
  cardName: "Arbok",
  attacks: [
    {
      name: "Acid Spray",
      onAttack: (ctx, baseDamage) => {
        // Flip coin, if heads discard energy from opponent's active
        const heads = ctx.flipCoin();
        if (heads && ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
          const energy = ctx.opponent.active.attachedEnergy.pop()!;
          ctx.opponent.discard.cards.push(energy);
          ctx.log(`Acid Spray: 弃掉了对手的 ${energy.card.name}`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const wigglytuff: NamedEffect = {
  cardId: "name:Wigglytuff",
  cardName: "Wigglytuff",
  attacks: [
    {
      name: "Balloon Barrage",
      onAttack: (ctx, _baseDamage) => {
        // Flip coins for each energy attached, 60 per heads
        const energyCount = ctx.source.attachedEnergy.length;
        const { heads } = ctx.flipCoins(Math.max(1, energyCount));
        ctx.log(`Balloon Barrage: ${energyCount} 个能量, ${heads} 枚正面`);
        return { damage: heads * 60 };
      },
    },
  ],
};

const dusknoirV: NamedEffect = {
  cardId: "name:Dusknoir V",
  cardName: "Dusknoir V",
  attacks: [
    {
      name: "Shadow Bind",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        preventRetreat: true,
      }),
    },
  ],
};

const lumineon: NamedEffect = {
  cardId: "name:Lumineon",
  cardName: "Lumineon",
  attacks: [
    { name: "Waterfall", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const oricorio: NamedEffect = {
  cardId: "name:Oricorio",
  cardName: "Oricorio",
  abilities: [
    {
      name: "Passionate Dance",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Search deck for a Basic Pokemon and put on bench
        const found = ctx.searchDeck(
          c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic"),
          1
        );
        ctx.shuffleDeck();
        if (found.length > 0) {
          ctx.player.bench.cards.push(found[0]);
          ctx.log(`Passionate Dance: 放置了 ${found[0].card.name} 到后备区`);
        }
      },
    },
  ],
};

const mewVMAX: NamedEffect = {
  cardId: "name:Mew VMAX",
  cardName: "Mew VMAX",
  attacks: [
    {
      name: "Cross Fusion Strike",
      onAttack: (ctx, baseDamage) => {
        // Copy any Fusion Strike Pokemon's attack from bench — simplified
        const benchFusion = ctx.player.bench.cards.find(
          p => p.card.subtypes?.includes("Fusion Strike")
        );
        if (benchFusion) {
          ctx.log(`Cross Fusion Strike: 复制了 ${benchFusion.card.name} 的攻击`);
          return { damage: baseDamage + 30 };
        }
        return { damage: baseDamage };
      },
    },
    { name: "Max Miracle", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const genesect: NamedEffect = {
  cardId: "name:Genesect",
  cardName: "Genesect",
  attacks: [
    { name: "Rapid Fire", onAttack: (ctx, baseDamage) => {
      const heads = ctx.flipCoin();
      return { damage: heads ? baseDamage + 40 : baseDamage };
    }},
    { name: "Techno Blast", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

export const wave25RemainingAttacksEffects: NamedEffect[] = [
  zoroarkAttack, galladeVSTAR, decidueye, hisuianZoroarkVSTAR,
  machampV, blazikenV, solrock, lunatone, granbull, zangoose,
  dugtrio, swellow, dodrio, arbok, wigglytuff, dusknoirV,
  lumineon, oricorio, mewVMAX, genesect,
];
