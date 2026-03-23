/**
 * Wave 3: Current Meta Attackers — Top competitive Pokemon
 *
 * These are the most played attackers in Chinese PTCG Standard.
 */

import { CardEffectDef, AttackResult } from "../effect-types";
import { CANT_ATTACK_NEXT_TURN, PREVENT_RETREAT_NEXT_TURN, cantUseAttackMarker } from "../markers";

type NamedEffect = CardEffectDef & { cardName: string };

/** Iron Valiant ex — Tachyon Bits ability + Laser Blade attack */
const ironValiantEx: NamedEffect = {
  cardId: "name:Iron Valiant ex",
  cardName: "Iron Valiant ex",
  attacks: [{
    name: "Laser Blade",
    onAttack: (ctx, baseDamage) => {
      ctx.addMarker(ctx.source, CANT_ATTACK_NEXT_TURN);
      return { damage: baseDamage };
    },
  }],
  abilities: [{
    name: "Tachyon Bits",
    type: "activated" as const,
    onActivate: (ctx) => {
      // Place 2 damage counters on 1 of opponent's bench Pokemon
      if (ctx.opponent.bench.cards.length === 0) return;
      // Auto: target lowest HP bench Pokemon
      const target = ctx.opponent.bench.cards.reduce((best, curr) => {
        const bestHp = parseInt(best.card.hp || "999") - best.damageCounters * 10;
        const currHp = parseInt(curr.card.hp || "999") - curr.damageCounters * 10;
        return currHp < bestHp ? curr : best;
      });
      target.damageCounters += 2;
      ctx.log(`Tachyon Bits: 在 ${target.card.name} 上放置了2个伤害指示物`);
    },
  }],
};

/** Iron Crown ex — Cobalt Command ability + Twin Shotels attack */
const ironCrownEx: NamedEffect = {
  cardId: "name:Iron Crown ex",
  cardName: "Iron Crown ex",
  attacks: [{
    name: "Twin Shotels",
    onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
  }],
  abilities: [{
    name: "Cobalt Command",
    type: "passive" as const,
    modifyDamage: (ctx, damage) => {
      // +20 for each Future Pokemon in play (your side)
      const futureCount = [ctx.player.active, ...ctx.player.bench.cards]
        .filter(p => p?.card.subtypes?.some(s => s.includes("Future"))).length;
      return damage + futureCount * 20;
    },
  }],
};

/** Gouging Fire ex — Heat Blast + Burning Crimson (280, discard top 5) */
const gougingFireEx: NamedEffect = {
  cardId: "name:Gouging Fire ex",
  cardName: "Gouging Fire ex",
  attacks: [
    {
      name: "Heat Blast",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
    {
      name: "Burning Crimson",
      onAttack: (ctx, baseDamage) => {
        // Discard top 5 cards of deck
        const discarded = ctx.revealTopCards(5);
        for (const c of discarded) ctx.player.discard.cards.push(c);
        ctx.log(`Burning Crimson: 弃掉了牌组顶部 ${discarded.length} 张牌`);
        return { damage: baseDamage };
      },
    },
  ],
};

/** Great Tusk ex — Bonk Heads (80+coin flip 80) + Great Stomp (260, discard stadium) */
const greatTuskEx: NamedEffect = {
  cardId: "name:Great Tusk ex",
  cardName: "Great Tusk ex",
  attacks: [
    {
      name: "Bonk Heads",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        return { damage: baseDamage + (heads ? 80 : 0) };
      },
    },
    {
      name: "Great Stomp",
      onAttack: (ctx, baseDamage) => {
        // Discard 2 energy from self
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

/** Walking Wake ex — Cathartic Roar (draw until 8) + Hydro Launcher (120 snipe) */
const walkingWakeEx: NamedEffect = {
  cardId: "name:Walking Wake ex",
  cardName: "Walking Wake ex",
  attacks: [
    {
      name: "Cathartic Roar",
      onAttack: (ctx, _baseDamage) => {
        const toDraw = Math.max(0, 8 - ctx.player.hand.cards.length);
        if (toDraw > 0) ctx.drawCards(toDraw);
        ctx.log(`Cathartic Roar: 抽牌到8张（抽了 ${toDraw} 张）`);
        return { damage: 0 };
      },
    },
    {
      name: "Hydro Launcher",
      onAttack: (ctx, _baseDamage) => {
        // 120 damage to any of opponent's Pokemon (snipe)
        // Auto: target bench Pokemon closest to KO, or active
        if (ctx.opponent.bench.cards.length > 0) {
          const target = ctx.opponent.bench.cards.reduce((best, curr) => {
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

/** Ceruledge ex — Blazing Slash (130) + Amethyst Rage (50 + 10 per damage counter) */
const ceruledgeEx: NamedEffect = {
  cardId: "name:Ceruledge ex",
  cardName: "Ceruledge ex",
  attacks: [
    {
      name: "Blazing Slash",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
    {
      name: "Bitter Blade",
      onAttack: (ctx, baseDamage) => {
        // 160 damage, heal all damage from self
        const healed = ctx.source.damageCounters * 10;
        ctx.source.damageCounters = 0;
        if (healed > 0) ctx.log(`Bitter Blade: 回复了 ${healed} HP`);
        return { damage: baseDamage };
      },
    },
  ],
};

/** Gallade — Buddy Catch ability + Swirling Slice attack */
const gallade: NamedEffect = {
  cardId: "name:Gallade",
  cardName: "Gallade",
  attacks: [{
    name: "Swirling Slice",
    onAttack: (ctx, baseDamage) => {
      // Move 1 energy from self to bench
      if (ctx.source.attachedEnergy.length > 0 && ctx.player.bench.cards.length > 0) {
        const energy = ctx.source.attachedEnergy.pop()!;
        ctx.player.bench.cards[0].attachedEnergy.push(energy);
        ctx.log(`Swirling Slice: 移动能量到 ${ctx.player.bench.cards[0].card.name}`);
      }
      return { damage: baseDamage };
    },
  }],
  abilities: [{
    name: "Buddy Catch",
    type: "activated" as const,
    onActivate: (ctx) => {
      const found = ctx.searchDeck(
        (c: any) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter"),
        1
      );
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Buddy Catch: 搜索了支持者 ${found[0].card.name}`);
    },
  }],
};

/** Mimikyu — Safeguard ability (prevent damage from ex/V Pokemon) */
const mimikyu: NamedEffect = {
  cardId: "name:Mimikyu",
  cardName: "Mimikyu",
  abilities: [{
    name: "Safeguard",
    type: "passive" as const,
    modifyIncomingDamage: (_ctx, damage, attacker) => {
      if (attacker?.card.subtypes?.some((s: string) => ["V", "VSTAR", "VMAX", "ex"].includes(s))) {
        return 0;
      }
      return damage;
    },
  }],
};

export const metaAttackersW3Effects: NamedEffect[] = [
  ironValiantEx,
  ironCrownEx,
  gougingFireEx,
  greatTuskEx,
  walkingWakeEx,
  ceruledgeEx,
  gallade,
  mimikyu,
];
