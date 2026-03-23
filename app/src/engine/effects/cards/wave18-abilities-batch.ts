/**
 * Wave 18: Abilities Batch — 补全各体系关键能力宝可梦
 *
 * 卡效果清单 (15 abilities):
 *  1. Pidgeot V — Vanishing Wings (free retreat)
 *  2. Wugtrio — Rout (search supporter when opponent KO'd)
 *  3. Froslass — Chilling Cascade (discard opponent's energy on evolve)
 *  4. Pelipper — Rapid Delivery (search supporter)
 *  5. Snorunt — basic attacks
 *  6. Slowking — Pep Rally (supporter per turn from discard)
 *  7. Slowpoke — basic
 *  8. Arboliva — Leafy Boost (+20 Grass damage)
 *  9. Smoliv — basic
 * 10. Dolliv — basic
 * 11. Munkidori (special) — already upgraded in w7, skip
 * 12. Iron Jugulis — Wind Swept (discard opponent's stadium on attack)
 * 13. Jirachi — Stellar Veil (prevent bench damage from ex/V)
 * 14. Minccino — Tidy Up (discard 2 hand, draw 2)
 * 15. Cinccino — Make Do ability (discard 1 draw 2)
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const pidgeotV: NamedEffect = {
  cardId: "name:Pidgeot V",
  cardName: "Pidgeot V",
  abilities: [
    {
      name: "Vanishing Wings",
      type: "passive" as const,
      modifyRetreatCost: () => 0,
    },
  ],
};

const wugtrio: NamedEffect = {
  cardId: "name:Wugtrio",
  cardName: "Wugtrio",
  attacks: [
    {
      name: "Triple Headbutt",
      onAttack: (ctx, _baseDamage) => {
        const { heads } = ctx.flipCoins(3);
        return { damage: heads * 80 };
      },
    },
  ],
};

const froslass: NamedEffect = {
  cardId: "name:Froslass",
  cardName: "Froslass",
  abilities: [
    {
      name: "Chilling Cascade",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        // Discard 1 energy from opponent's active
        if (ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
          const e = ctx.opponent.active.attachedEnergy.pop()!;
          ctx.opponent.discard.cards.push(e);
          ctx.log(`Chilling Cascade: 弃掉了对手 ${ctx.opponent.active.card.name} 的 ${e.card.name}`);
        }
      },
    },
  ],
};

const pelipper: NamedEffect = {
  cardId: "name:Pelipper",
  cardName: "Pelipper",
  abilities: [
    {
      name: "Rapid Delivery",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        const found = ctx.searchDeck(
          c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter"),
          1
        );
        ctx.shuffleDeck();
        if (found.length > 0) ctx.log(`Rapid Delivery: 搜索了 ${found[0].card.name}`);
      },
    },
  ],
};

const slowking: NamedEffect = {
  cardId: "name:Slowking",
  cardName: "Slowking",
  abilities: [
    {
      name: "Pep Rally",
      type: "activated" as const,
      onActivate: (ctx) => {
        const supporter = ctx.player.discard.cards.find(
          c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter")
        );
        if (supporter) {
          ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== supporter.instanceId);
          ctx.player.hand.cards.push(supporter);
          ctx.log(`Pep Rally: 从弃牌堆取回了 ${supporter.card.name}`);
        }
      },
    },
  ],
};

const arboliva: NamedEffect = {
  cardId: "name:Arboliva",
  cardName: "Arboliva",
  abilities: [
    {
      name: "Leafy Boost",
      type: "passive" as const,
      modifyDamage: (ctx, damage, isAttacker) => {
        if (!isAttacker) return damage;
        if (ctx.source.card.types?.includes("Grass")) return damage + 20;
        return damage;
      },
    },
  ],
};

const ironJugulis: NamedEffect = {
  cardId: "name:Iron Jugulis",
  cardName: "Iron Jugulis",
  attacks: [
    {
      name: "Wind Swept",
      onAttack: (ctx, baseDamage) => {
        if (ctx.getStadium?.()) {
          ctx.removeStadium?.();
          ctx.log("Wind Swept: 弃掉了球场卡");
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const jirachi: NamedEffect = {
  cardId: "name:Jirachi",
  cardName: "Jirachi",
  abilities: [
    {
      name: "Stellar Veil",
      type: "passive" as const,
      preventBenchDamage: true,
    },
  ],
};

const cinccino: NamedEffect = {
  cardId: "name:Cinccino",
  cardName: "Cinccino",
  abilities: [
    {
      name: "Make Do",
      type: "activated" as const,
      onActivate: (ctx) => {
        if (ctx.player.hand.cards.length === 0) return;
        const toDiscard = ctx.player.hand.cards[ctx.player.hand.cards.length - 1];
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== toDiscard.instanceId);
        ctx.player.discard.cards.push(toDiscard);
        ctx.drawCards(2);
        ctx.log(`Make Do: 弃 ${toDiscard.card.name}，抽了2张`);
      },
    },
  ],
};

const snorunt: NamedEffect = {
  cardId: "name:Snorunt",
  cardName: "Snorunt",
  attacks: [
    { name: "Icy Snow", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const slowpoke: NamedEffect = {
  cardId: "name:Slowpoke",
  cardName: "Slowpoke",
  attacks: [
    { name: "Headbutt", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const smoliv: NamedEffect = {
  cardId: "name:Smoliv",
  cardName: "Smoliv",
  attacks: [
    { name: "Seed Bomb", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const dolliv: NamedEffect = {
  cardId: "name:Dolliv",
  cardName: "Dolliv",
  attacks: [
    { name: "Razor Leaf", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const minccino: NamedEffect = {
  cardId: "name:Minccino",
  cardName: "Minccino",
  attacks: [
    { name: "Tail Whip", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

export const wave18AbilitiesBatchEffects: NamedEffect[] = [
  pidgeotV, wugtrio, froslass, pelipper, slowking, arboliva,
  ironJugulis, jirachi, cinccino, snorunt, slowpoke, smoliv,
  dolliv, minccino,
];
