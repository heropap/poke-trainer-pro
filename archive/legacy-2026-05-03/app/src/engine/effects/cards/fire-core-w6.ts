/**
 * Wave 6: Fire Core — Charizard 体系 + 火系核心卡效果
 *
 * 卡效果清单:
 *  1. Charmeleon — Slash 60
 *  2. Charmander — Ember 30 / Scratch 10
 *  3. Pidgeotto — Wing Attack
 *  4. Pidgey — Gust 20
 *  5. Arcanine ex — Fierce Fang / Blazing Fire
 *  6. Entei V — Fleet-Footed / Burning Rondo
 *  7. Moltres — Fiery Migration (ability)
 *  8. Magma Basin — Stadium: 弃牌堆火能附加(受20伤)
 *  9. Radiant Charizard — Combustion Blast 250
 * 10. Fire Crystal — 弃牌堆取回3火能
 * 11. Armarouge — Fire Off ability (move fire energy from bench to active)
 * 12. Volcarona V — Scattered Sparks (弃火能，对手全场各20伤害×弃能数)
 * 13. Delphox V — Bright Flame (190, 弃2火能)
 * 14. Heatmor — Fire Claws 100 / Singe 10+burn
 * 15. Growlithe — Bite 20
 */

import { CardEffectDef, AttackResult } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// Charmeleon — already implemented in meta-attacks.ts
// Charmander — already implemented in meta-attacks.ts

const pidgeotto: NamedEffect = {
  cardId: "name:Pidgeotto",
  cardName: "Pidgeotto",
  attacks: [
    { name: "Wing Attack", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const pidgey: NamedEffect = {
  cardId: "name:Pidgey",
  cardName: "Pidgey",
  attacks: [
    { name: "Gust", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

// Arcanine ex — already implemented in sv-abilities.ts

const enteiV: NamedEffect = {
  cardId: "name:Entei V",
  cardName: "Entei V",
  attacks: [
    {
      name: "Burning Rondo",
      onAttack: (ctx, _baseDamage) => {
        // 20 × number of all Pokemon on both benches
        const total = ctx.player.bench.cards.length + ctx.opponent.bench.cards.length;
        return { damage: 20 + total * 20 };
      },
    },
  ],
  abilities: [
    {
      name: "Fleet-Footed",
      type: "passive" as const,
      onActivate: (ctx) => {
        ctx.drawCards(1);
        ctx.log("Fleet-Footed: 抽了1张卡");
      },
    },
  ],
};

const moltres: NamedEffect = {
  cardId: "name:Moltres",
  cardName: "Moltres",
  abilities: [
    {
      name: "Fiery Migration",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Move 1 Fire energy from discard to self (then Moltres gets KO'd / takes damage)
        const fireEnergy = ctx.player.discard.cards.find(
          (c: any) => c.card.supertype === "Energy" && c.card.name.includes("Fire") && c.card.subtypes?.includes("Basic")
        );
        if (!fireEnergy) return;
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== fireEnergy.instanceId);
        ctx.source.attachedEnergy.push(fireEnergy);
        ctx.log("Fiery Migration: 从弃牌堆附加了1张火能量");
      },
    },
  ],
};

const magmaBasin: NamedEffect = {
  cardId: "name:Magma Basin",
  cardName: "Magma Basin",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Magma Basin: 每回合可将1张弃牌堆火能附加到备战区宝可梦（该宝可梦受20伤害）");
    },
  },
};

const radiantCharizard: NamedEffect = {
  cardId: "name:Radiant Charizard",
  cardName: "Radiant Charizard",
  attacks: [
    {
      name: "Combustion Blast",
      onAttack: (ctx, baseDamage) => {
        // Can't use next turn
        ctx.addMarker(ctx.source, "CANT_ATTACK_NEXT_TURN");
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Excited Heart",
      type: "passive" as const,
      modifyDamage: (ctx, damage, isAttacker) => {
        if (!isAttacker) return damage;
        // -30 attack cost for each prize card opponent has taken
        // (Simplified: this reduces energy cost, but we model as ability context)
        const prizesTaken = ctx.state.rules.prizeCardsPerPlayer - ctx.opponent.prizes.cards.length;
        return damage; // Cost reduction handled at engine level
      },
    },
  ],
};

const fireCrystal: NamedEffect = {
  cardId: "name:Fire Crystal",
  cardName: "Fire Crystal",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.discard.cards.some(
        c => c.card.supertype === "Energy" && c.card.name.includes("Fire") && c.card.subtypes?.includes("Basic")
      );
    },
    onPlay: (ctx) => {
      const fires = ctx.player.discard.cards.filter(
        c => c.card.supertype === "Energy" && c.card.name.includes("Fire") && c.card.subtypes?.includes("Basic")
      );
      const toReturn = fires.slice(0, 3);
      for (const e of toReturn) {
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== e.instanceId);
        ctx.player.hand.cards.push(e);
      }
      ctx.log(`Fire Crystal: 从弃牌堆取回了 ${toReturn.length} 张火能量`);
    },
  },
};

const volcaronaV: NamedEffect = {
  cardId: "name:Volcarona V",
  cardName: "Volcarona V",
  attacks: [
    {
      name: "Scattered Sparks",
      onAttack: (ctx, _baseDamage) => {
        // Discard all Fire energy, do 20 damage to each opponent Pokemon for each discarded
        const fireEnergies = ctx.source.attachedEnergy.filter(
          (e: any) => e.card.name?.includes("Fire") || e.card.types?.includes("Fire")
        );
        const count = fireEnergies.length;
        for (const e of fireEnergies) {
          ctx.source.attachedEnergy = ctx.source.attachedEnergy.filter(
            (ae: any) => ae.instanceId !== e.instanceId
          );
          ctx.player.discard.cards.push(e);
        }
        // Damage all opponent Pokemon
        const allOpp = [ctx.opponent.active, ...ctx.opponent.bench.cards].filter(Boolean) as any[];
        for (const target of allOpp) {
          target.damageCounters += count * 2; // 20 per energy = 2 counters
        }
        ctx.log(`Scattered Sparks: 弃了 ${count} 张火能，对手全场各受 ${count * 20} 伤害`);
        return { damage: 0 };
      },
    },
  ],
};

const delphoxV: NamedEffect = {
  cardId: "name:Delphox V",
  cardName: "Delphox V",
  attacks: [
    {
      name: "Bright Flame",
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

const heatmor: NamedEffect = {
  cardId: "name:Heatmor",
  cardName: "Heatmor",
  attacks: [
    {
      name: "Singe",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ target: "defender" as const, status: "burned" as any }],
      }),
    },
    { name: "Fire Claws", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const growlithe: NamedEffect = {
  cardId: "name:Growlithe",
  cardName: "Growlithe",
  attacks: [
    { name: "Bite", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

export const fireCoreW6Effects: NamedEffect[] = [
  pidgeotto, pidgey, enteiV,
  moltres, magmaBasin, radiantCharizard, fireCrystal, volcaronaV,
  delphoxV, heatmor, growlithe,
];
