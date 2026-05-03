/**
 * Wave 12: Grass / Lugia — 草系 + Lugia 体系
 *
 * 卡效果清单:
 *  1. Sceptile ex — Overgrow / Leaf Blade
 *  2. Leafeon VSTAR — Leaf Guard / Ivy Star
 *  3. Tsareena ex — Queen's Punishment
 *  4. Forretress ex — Exploding Energy
 *  5. Vivillon — Powder Heal (每回合全场治20)
 *  6. Briar — 对手击倒时额外取1奖赏
 *  7. Gardenia's Vigor — 抽2，附加最多2草能
 *  8. Gapejaw Bog — Stadium: 放置到备战区受2伤害指示物
 *  9. Lugia V — Read the Wind / Aero Dive
 * 10. Giratina V — Abyss Seeking / Shred
 * 11. Palkia V (regular) — Spatial Rend
 * 12. Dialga V — Metal Blast (V版)
 * 13. Regidrago V — Dragon Breath attacks
 * 14. Noivern ex — Covert Flight / Domination Fang
 * 15. Fezandipiti ex — Adrenaline Veil
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const sceptileEx: NamedEffect = {
  cardId: "name:Sceptile ex",
  cardName: "Sceptile ex",
  attacks: [
    {
      name: "Leaf Blade",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        return { damage: baseDamage + (heads ? 70 : 0) };
      },
    },
  ],
  abilities: [
    {
      name: "Overgrow",
      type: "passive" as const,
      modifyDamage: (ctx, damage, isAttacker) => {
        if (!isAttacker) return damage;
        // If this Pokemon has 80 HP or less remaining, attacks do double damage
        const remaining = parseInt(ctx.source.card.hp || "0") - ctx.source.damageCounters * 10;
        if (remaining <= 80) return damage * 2;
        return damage;
      },
    },
  ],
};

const leafeonVSTAR: NamedEffect = {
  cardId: "name:Leafeon VSTAR",
  cardName: "Leafeon VSTAR",
  attacks: [
    {
      name: "Leaf Guard",
      onAttack: (ctx, baseDamage) => {
        // During opponent's next turn, this Pokemon takes -30 damage
        ctx.addMarker(ctx.source, "REDUCE_DAMAGE_30_NEXT_TURN");
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Ivy Star",
      type: "activated" as const,
      onActivate: (ctx) => {
        const key = ctx.playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
        if ((ctx.state.turnStatus as any)[key]) return;
        // Search deck for up to 4 Grass Energy, attach to your Pokemon
        const energies = ctx.searchDeck(
          (c: any) => c.card.supertype === "Energy" && c.card.name?.includes("Grass") && c.card.subtypes?.includes("Basic"),
          4
        );
        const targets = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        for (let i = 0; i < energies.length; i++) {
          const target = targets[i % Math.max(1, targets.length)];
          if (target) target.attachedEnergy.push(energies[i]);
        }
        ctx.shuffleDeck();
        (ctx.state.turnStatus as any)[key] = true;
        ctx.log(`Ivy Star (V★): 附加了 ${energies.length} 张草能量`);
      },
    },
  ],
};

// Tsareena ex — already implemented in sv-abilities.ts

const forretressEx: NamedEffect = {
  cardId: "name:Forretress ex",
  cardName: "Forretress ex",
  abilities: [
    {
      name: "Exploding Energy",
      type: "activated" as const,
      onActivate: (ctx) => {
        // KO this Pokemon, then attach 5 Basic Energy from deck to your Pokemon
        ctx.source.damageCounters = Math.ceil(parseInt(ctx.source.card.hp || "0") / 10);
        const energies = ctx.searchDeck(
          (c: any) => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"),
          5
        );
        const targets = [ctx.player.active, ...ctx.player.bench.cards]
          .filter((p: any) => p && p.instanceId !== ctx.source.instanceId);
        for (let i = 0; i < energies.length; i++) {
          const target = targets[i % Math.max(1, targets.length)];
          if (target) target.attachedEnergy.push(energies[i]);
        }
        ctx.shuffleDeck();
        ctx.log(`Exploding Energy: 自爆，附加了 ${energies.length} 张能量给场上宝可梦`);
      },
    },
  ],
};

const vivillon: NamedEffect = {
  cardId: "name:Vivillon",
  cardName: "Vivillon",
  abilities: [
    {
      name: "Powder Heal",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Heal 20 from each of your Pokemon
        const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        for (const p of allPokemon) {
          if (p.damageCounters > 0) {
            p.damageCounters = Math.max(0, p.damageCounters - 2);
          }
        }
        ctx.log("Powder Heal: 全场宝可梦各治疗20HP");
      },
    },
  ],
};

const briar: NamedEffect = {
  cardId: "name:Briar",
  cardName: "Briar",
  trainer: {
    onPlay: (ctx) => {
      // This turn, if you KO opponent's Pokemon, take 1 extra prize
      ctx.addMarker(ctx.player.active!, "BRIAR_EXTRA_PRIZE");
      ctx.log("Briar: 本回合击倒对手宝可梦时额外取1张奖赏");
    },
  },
};

const gardeniasVigor: NamedEffect = {
  cardId: "name:Gardenia's Vigor",
  cardName: "Gardenia's Vigor",
  trainer: {
    onPlay: (ctx) => {
      // Draw 2, then attach up to 2 Grass Energy from hand
      ctx.drawCards(2);
      const grassInHand = ctx.player.hand.cards.filter(
        c => c.card.supertype === "Energy" && c.card.name?.includes("Grass") && c.card.subtypes?.includes("Basic")
      );
      const toAttach = grassInHand.slice(0, 2);
      const targets = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
      for (let i = 0; i < toAttach.length && targets.length > 0; i++) {
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== toAttach[i].instanceId);
        targets[i % targets.length].attachedEnergy.push(toAttach[i]);
      }
      ctx.log(`Gardenia's Vigor: 抽了2张，附加了 ${toAttach.length} 张草能量`);
    },
  },
};

const gapejawBog: NamedEffect = {
  cardId: "name:Gapejaw Bog",
  cardName: "Gapejaw Bog",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Gapejaw Bog: 放到备战区的基础宝可梦受2个伤害指示物");
    },
  },
};

// Lugia V — already implemented in meta-attacks.ts

const giratinaV: NamedEffect = {
  cardId: "name:Giratina V",
  cardName: "Giratina V",
  attacks: [
    {
      name: "Abyss Seeking",
      onAttack: (ctx, _baseDamage) => {
        ctx.drawCards(4);
        ctx.log("Abyss Seeking: 抽了4张牌");
        return { damage: 0 };
      },
    },
    {
      name: "Shred",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
};

const dialgaV: NamedEffect = {
  cardId: "name:Origin Forme Dialga V",
  cardName: "Origin Forme Dialga V",
  attacks: [
    {
      name: "Metal Blast",
      onAttack: (ctx, _baseDamage) => {
        const metalCount = ctx.source.attachedEnergy.filter(
          (e: any) => e.card.name?.includes("Metal") || e.card.types?.includes("Metal")
        ).length;
        return { damage: 40 + metalCount * 40 };
      },
    },
  ],
};

const regidragoV: NamedEffect = {
  cardId: "name:Regidrago V",
  cardName: "Regidrago V",
  attacks: [
    { name: "Dragon Breath", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

// Noivern ex — already implemented in sv-abilities.ts
// Fezandipiti ex — already implemented in meta-attacks.ts

export const grassLugiaW12Effects: NamedEffect[] = [
  sceptileEx, leafeonVSTAR, forretressEx, vivillon,
  briar, gardeniasVigor, gapejawBog, giratinaV, dialgaV,
  regidragoV,
];
