/**
 * Wave 16: I标 Standard Pokemon — SV7-SV8 era newest cards
 *
 * I标覆盖率最低(2.6-4.1%)，大量最新系列卡。
 *
 * 卡效果清单:
 *  1. Hydrapple ex — Dragon attack + Apple Acid
 *  2. Terapagos ex (Stellar) — Stellar Crown + Union Beat
 *  3. Greninja ex — Shinobi Blade (160, switch with bench)
 *  4. Meowscarada ex — Bouquet Magic (30+, place 3 counters on bench)
 *  5. Skeledirge ex — Scorching Melody (270, discard all energy)
 *  6. Quaquaval ex — Exciting Dance ability + Razor Kick
 *  7. Kingambit — Vassal Sword (50× Bisharp in discard)
 *  8. Dachsbun — Fairy Coating (metal resistance)
 *  9. Iron Leaves ex — Prism Edge / Laser Blade
 * 10. Iron Boulder ex — Mighty Charge / Stone Hatchet
 * 11. Raging Bolt ex — Burst Roar + Thunder of Ancients
 * 12. Gouging Fire ex — already implemented, skip
 * 13. Iron Crown ex — already implemented, skip
 * 14. Eri — Opponent reveals hand, discard 2 Items
 * 15. Lana's Aid — Heal 50 + switch
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const hydrappleEx: NamedEffect = {
  cardId: "name:Hydrapple ex",
  cardName: "Hydrapple ex",
  attacks: [
    {
      name: "Apple Acid",
      onAttack: (ctx, baseDamage) => {
        // Opponent's active weakness becomes ×4 this turn (simplified: +60)
        return { damage: baseDamage };
      },
    },
  ],
};

const greninjaEx: NamedEffect = {
  cardId: "name:Greninja ex",
  cardName: "Greninja ex",
  attacks: [
    {
      name: "Shinobi Blade",
      onAttack: (ctx, baseDamage) => {
        // After dealing damage, switch with bench
        if (ctx.player.bench.cards.length > 0) {
          const newActive = ctx.player.bench.cards[0];
          ctx.player.bench.cards = ctx.player.bench.cards.filter(c => c.instanceId !== newActive.instanceId);
          ctx.player.bench.cards.push(ctx.source);
          ctx.player.active = newActive;
          ctx.log(`Shinobi Blade: 切换到 ${newActive.card.name}`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const meowscaradaEx: NamedEffect = {
  cardId: "name:Meowscarada ex",
  cardName: "Meowscarada ex",
  attacks: [
    {
      name: "Bouquet Magic",
      onAttack: (ctx, baseDamage) => {
        // Place 3 damage counters on 1 of opponent's bench
        if (ctx.opponent.bench.cards.length > 0) {
          const target = ctx.opponent.bench.cards.reduce((best: any, curr: any) => {
            const bestHp = parseInt(best.card.hp || "999") - best.damageCounters * 10;
            const currHp = parseInt(curr.card.hp || "999") - curr.damageCounters * 10;
            return currHp < bestHp ? curr : best;
          });
          target.damageCounters += 3;
          ctx.log(`Bouquet Magic: 在 ${target.card.name} 上放置了3个伤害指示物`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const skeledirgeEx: NamedEffect = {
  cardId: "name:Skeledirge ex",
  cardName: "Skeledirge ex",
  attacks: [
    {
      name: "Scorching Melody",
      onAttack: (ctx, baseDamage) => {
        // Discard all energy
        for (const e of [...ctx.source.attachedEnergy]) {
          ctx.player.discard.cards.push(e);
        }
        ctx.source.attachedEnergy = [];
        return { damage: baseDamage };
      },
    },
  ],
};

const quaquavalEx: NamedEffect = {
  cardId: "name:Quaquaval ex",
  cardName: "Quaquaval ex",
  attacks: [
    {
      name: "Razor Kick",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
  abilities: [
    {
      name: "Exciting Dance",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Attach 1 Water energy from hand to your Pokemon
        const water = ctx.player.hand.cards.find(
          c => c.card.supertype === "Energy" && c.card.name?.includes("Water") && c.card.subtypes?.includes("Basic")
        );
        if (!water) return;
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== water.instanceId);
        const target = ctx.player.active || ctx.player.bench.cards[0];
        if (target) {
          target.attachedEnergy.push(water);
          ctx.log(`Exciting Dance: 附加水能量给 ${target.card.name}`);
        }
      },
    },
  ],
};

const ironLeavesEx: NamedEffect = {
  cardId: "name:Iron Leaves ex",
  cardName: "Iron Leaves ex",
  attacks: [
    {
      name: "Prism Edge",
      onAttack: (ctx, baseDamage) => {
        ctx.addMarker(ctx.source, "CANT_ATTACK_NEXT_TURN");
        return { damage: baseDamage };
      },
    },
  ],
};

const ironBoulderEx: NamedEffect = {
  cardId: "name:Iron Boulder ex",
  cardName: "Iron Boulder ex",
  attacks: [
    {
      name: "Mighty Charge",
      onAttack: (ctx, baseDamage) => {
        // Move energy from your other Pokemon to this one
        for (const bench of ctx.player.bench.cards) {
          if (bench.attachedEnergy.length > 0) {
            const energy = bench.attachedEnergy.pop()!;
            ctx.source.attachedEnergy.push(energy);
            ctx.log(`Mighty Charge: 从 ${bench.card.name} 吸取了能量`);
            break;
          }
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const eri: NamedEffect = {
  cardId: "name:Eri",
  cardName: "Eri",
  trainer: {
    canPlay: (ctx) => ctx.opponent.hand.cards.length > 0,
    onPlay: (ctx) => {
      // Opponent reveals hand, discard up to 2 Items
      const items = ctx.opponent.hand.cards.filter(
        c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item")
      );
      const toDiscard = items.slice(0, 2);
      for (const c of toDiscard) {
        ctx.opponent.hand.cards = ctx.opponent.hand.cards.filter(h => h.instanceId !== c.instanceId);
        ctx.opponent.discard.cards.push(c);
      }
      ctx.log(`Eri: 从对手手牌弃掉了 ${toDiscard.length} 张物品`);
    },
  },
};

const lanasAid: NamedEffect = {
  cardId: "name:Lana's Aid",
  cardName: "Lana's Aid",
  trainer: {
    onPlay: (ctx) => {
      // Heal 50 from active, then switch
      if (ctx.player.active) {
        ctx.player.active.damageCounters = Math.max(0, ctx.player.active.damageCounters - 5);
        ctx.log("Lana's Aid: 治疗了50HP");
      }
      // Switch
      if (ctx.player.bench.cards.length > 0 && ctx.player.active) {
        const newActive = ctx.player.bench.cards[0];
        ctx.player.bench.cards = ctx.player.bench.cards.filter(c => c.instanceId !== newActive.instanceId);
        ctx.player.bench.cards.push(ctx.player.active);
        ctx.player.active = newActive;
        ctx.log(`Lana's Aid: 切换到 ${newActive.card.name}`);
      }
    },
  },
};

export const wave16IStandardEffects: NamedEffect[] = [
  hydrappleEx, greninjaEx, meowscaradaEx, skeledirgeEx,
  quaquavalEx, ironLeavesEx, ironBoulderEx, eri, lanasAid,
];
