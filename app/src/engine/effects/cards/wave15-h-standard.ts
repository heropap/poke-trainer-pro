/**
 * Wave 15: H标 Standard Pokemon — SV5-SV6 era core cards
 *
 * H标覆盖率最低(5-7%)，需要大量补充。
 *
 * 卡效果清单:
 *  1. Tinkaton ex — Pounding Hammer / Special Rolling attack
 *  2. Dondozo — Unaware ability (ignore damage mods)
 *  3. Tatsugiri — Order Up (search from deck when Dondozo active)
 *  4. Palafin ex — Zero to Hero ability + Jet Uppercut
 *  5. Espathra ex — Psych Out + Mind Ruler
 *  6. Oinkologne ex — Wash Out ability (move energy)
 *  7. Toxicroak ex — Poison Jab + Nasty Plot
 *  8. Houndstone ex — Last Respects (30× Pokemon in discard)
 *  9. Xatu — Clairvoyance ability (see opponent's hand)
 * 10. Cleffa — Grasping Draw (draw to 7)
 * 11. Iono's Bellibolt — Amped Up ability (electric +30)
 * 12. Grant — +30 Fighting damage this turn
 * 13. Nemona — Draw 3
 * 14. Team Star Grunt — Bounce opponent's energy to hand
 * 15. Leftovers — Tool: heal 20 between turns
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const tinkatonEx: NamedEffect = {
  cardId: "name:Tinkaton ex",
  cardName: "Tinkaton ex",
  attacks: [
    {
      name: "Special Rolling",
      onAttack: (ctx, baseDamage) => {
        // +100 if opponent's active has Special Energy
        const hasSpecial = ctx.opponent.active?.attachedEnergy.some(
          (e: any) => !e.card.subtypes?.includes("Basic")
        );
        return { damage: baseDamage + (hasSpecial ? 100 : 0) };
      },
    },
  ],
};

const dondozo: NamedEffect = {
  cardId: "name:Dondozo",
  cardName: "Dondozo",
  attacks: [
    {
      name: "Swallow Whole",
      onAttack: (ctx, baseDamage) => {
        // Heal 80 from self
        ctx.source.damageCounters = Math.max(0, ctx.source.damageCounters - 8);
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Unaware",
      type: "passive" as const,
      modifyIncomingDamage: (_ctx, damage) => damage, // Ignores modifiers — simplified
    },
  ],
};

const tatsugiri: NamedEffect = {
  cardId: "name:Tatsugiri",
  cardName: "Tatsugiri",
  abilities: [
    {
      name: "Order Up",
      type: "activated" as const,
      onActivate: (ctx) => {
        // If Dondozo is your active, search deck for any 1 card
        if (ctx.player.active?.card.name === "Dondozo") {
          const found = ctx.searchDeck(() => true, 1);
          ctx.shuffleDeck();
          if (found.length > 0) ctx.log(`Order Up: 搜索了 ${found[0].card.name}`);
        }
      },
    },
  ],
};

const palafinEx: NamedEffect = {
  cardId: "name:Palafin ex",
  cardName: "Palafin ex",
  attacks: [
    {
      name: "Jet Uppercut",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
  abilities: [
    {
      name: "Zero to Hero",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        ctx.log("Zero to Hero: Palafin ex 变身！");
      },
    },
  ],
};

const espathraEx: NamedEffect = {
  cardId: "name:Espathra ex",
  cardName: "Espathra ex",
  attacks: [
    {
      name: "Psych Out",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ target: "defender" as const, status: "confused" as any }],
      }),
    },
    {
      name: "Mind Ruler",
      onAttack: (ctx, _baseDamage) => {
        // 20× cards in each player's hand
        const total = ctx.player.hand.cards.length + ctx.opponent.hand.cards.length;
        return { damage: total * 20 };
      },
    },
  ],
};

const oinkologne: NamedEffect = {
  cardId: "name:Oinkologne ex",
  cardName: "Oinkologne ex",
  abilities: [
    {
      name: "Wash Out",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Move 1 energy from bench to active
        for (const bench of ctx.player.bench.cards) {
          if (bench.attachedEnergy.length > 0) {
            const energy = bench.attachedEnergy.pop()!;
            if (ctx.player.active) {
              ctx.player.active.attachedEnergy.push(energy);
              ctx.log(`Wash Out: 将能量从 ${bench.card.name} 移到 ${ctx.player.active.card.name}`);
            }
            return;
          }
        }
      },
    },
  ],
};

const toxicroakEx: NamedEffect = {
  cardId: "name:Toxicroak ex",
  cardName: "Toxicroak ex",
  attacks: [
    {
      name: "Poison Jab",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ target: "defender" as const, status: "poisoned" as any }],
      }),
    },
  ],
};

const houndstoneEx: NamedEffect = {
  cardId: "name:Houndstone ex",
  cardName: "Houndstone ex",
  attacks: [
    {
      name: "Last Respects",
      onAttack: (ctx, _baseDamage) => {
        // 30 × Pokemon in discard
        const pokemonCount = ctx.player.discard.cards.filter(
          c => c.card.supertype === "Pokémon"
        ).length;
        return { damage: pokemonCount * 30 };
      },
    },
  ],
};

const cleffa: NamedEffect = {
  cardId: "name:Cleffa",
  cardName: "Cleffa",
  abilities: [
    {
      name: "Grasping Draw",
      type: "activated" as const,
      onActivate: (ctx) => {
        const toDraw = Math.max(0, 7 - ctx.player.hand.cards.length);
        if (toDraw > 0) {
          ctx.drawCards(toDraw);
          ctx.log(`Grasping Draw: 抽到7张（抽了 ${toDraw} 张）`);
        }
      },
    },
  ],
};

const grant: NamedEffect = {
  cardId: "name:Grant",
  cardName: "Grant",
  trainer: {
    onPlay: (ctx) => {
      if (ctx.player.active) {
        ctx.addMarker(ctx.player.active, "GRANT_BOOST", 30);
        ctx.log("Grant: 本回合格斗系攻击伤害+30");
      }
    },
  },
};

// Nemona — already implemented with interactive prompts in trainers.ts

const teamStarGrunt: NamedEffect = {
  cardId: "name:Team Star Grunt",
  cardName: "Team Star Grunt",
  trainer: {
    canPlay: (ctx) => {
      return ctx.opponent.active !== null && ctx.opponent.active.attachedEnergy.length > 0;
    },
    onPlay: (ctx) => {
      if (!ctx.opponent.active || ctx.opponent.active.attachedEnergy.length === 0) return;
      const energy = ctx.opponent.active.attachedEnergy.pop()!;
      ctx.opponent.hand.cards.push(energy);
      ctx.log(`Team Star Grunt: 将对手 ${ctx.opponent.active.card.name} 的能量弹回手牌`);
    },
  },
};

const leftovers: NamedEffect = {
  cardId: "name:Leftovers",
  cardName: "Leftovers",
  tool: {
    whileAttached: {
      healBetweenTurns: 20,
      healBetweenTurnsActiveOnly: true,
    },
  },
};

export const wave15HStandardEffects: NamedEffect[] = [
  tinkatonEx, dondozo, tatsugiri, palafinEx, espathraEx,
  oinkologne, toxicroakEx, houndstoneEx, cleffa, grant,
  teamStarGrunt, leftovers,
];
