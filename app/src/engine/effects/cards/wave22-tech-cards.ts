/**
 * Wave 22: Tech/Situational Cards — 技术卡/环境对策卡
 *
 * 卡效果清单 (15):
 *  1. Ditto V — Metamorph: copy V from discard
 *  2. Chatot — Echolocation (look at top, take or put back)
 *  3. Spinda — Stagger Step (confusion attack)
 *  4. Sudowoodo — Roadblock ability (opp bench max 4)
 *  5. Aerodactyl VSTAR — Lost Dive + Star Landing
 *  6. Iron Treads ex — Steel Stomp + Cyber Return
 *  7. Wo-Chien ex — Entangling Ivy
 *  8. Chi-Yu ex — Flame Surge
 *  9. Ting-Lu ex — Land Ruin ability (draw -1)
 * 10. Chien-Pao — Shivery Chill (discard opponent's tool)
 * 11. Palossand ex — Sand Tomb + Lost Mine
 * 12. Banette ex — Puppet ability (discard from opponent hand)
 * 13. Luxray V — Fang Snipe (discard+damage)
 * 14. Hoopa V — Shadow Impact 170
 * 15. Raichu V — Lightning Strike 210
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const dittoV: NamedEffect = {
  cardId: "name:Ditto V",
  cardName: "Ditto V",
  abilities: [
    {
      name: "Metamorph",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Copy a V Pokemon from discard — simplified: become a copy
        const vPokemon = ctx.player.discard.cards.find(
          c => c.card.supertype === "Pokémon" && c.card.subtypes?.some(s => s.includes("V"))
        );
        if (vPokemon) {
          ctx.log(`Metamorph: 变身为 ${vPokemon.card.name}`);
        }
      },
    },
  ],
};

const chatot: NamedEffect = {
  cardId: "name:Chatot",
  cardName: "Chatot",
  abilities: [
    {
      name: "Echolocation",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Look at top card, choose to keep or put back
        const top = ctx.revealTopCards(1);
        if (top.length > 0) {
          // Simplified: add to hand
          ctx.addToHand(top[0]);
          ctx.log(`Echolocation: 查看了顶牌 ${top[0].card.name}`);
        }
      },
    },
  ],
};

const spinda: NamedEffect = {
  cardId: "name:Spinda",
  cardName: "Spinda",
  attacks: [
    {
      name: "Stagger Step",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ target: "defender" as const, status: "confused" as any }],
      }),
    },
  ],
};

const sudowoodo: NamedEffect = {
  cardId: "name:Sudowoodo",
  cardName: "Sudowoodo",
  abilities: [
    {
      name: "Roadblock",
      type: "passive" as const,
      // Opponent's bench is limited to 4 — enforced by game engine via marker check
      onEnter: (ctx) => {
        ctx.addMarker(ctx.source, "roadblock_active");
        ctx.log("Roadblock: 对手后备区上限减为4");
      },
    },
  ],
};

const aerodactylVSTAR: NamedEffect = {
  cardId: "name:Aerodactyl VSTAR",
  cardName: "Aerodactyl VSTAR",
  attacks: [
    {
      name: "Lost Dive",
      onAttack: (ctx, baseDamage) => {
        // Discard top 3 cards to Lost Zone
        const top = ctx.revealTopCards(3);
        if (ctx.moveToLostZoneMultiple) {
          ctx.moveToLostZoneMultiple(top);
        }
        ctx.log(`Lost Dive: 放逐了 ${top.length} 张卡到迷失区`);
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Star Landing",
      type: "activated" as const,
      onActivate: (ctx) => {
        // VSTAR Power: put any card from discard into hand
        if (ctx.player.discard.cards.length > 0) {
          const card = ctx.player.discard.cards[0];
          ctx.player.discard.cards = ctx.player.discard.cards.filter(
            c => c.instanceId !== card.instanceId
          );
          ctx.addToHand(card);
          ctx.log(`Star Landing: 从弃牌区取回 ${card.card.name}（VSTAR力量）`);
        }
        ctx.addMarker(ctx.source, "vstar_used");
      },
    },
  ],
};

const ironTreadsEx: NamedEffect = {
  cardId: "name:Iron Treads ex",
  cardName: "Iron Treads ex",
  attacks: [
    { name: "Steel Stomp", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    {
      name: "Cyber Return",
      onAttack: (ctx, baseDamage) => {
        // Shuffle self and all attached cards into deck
        ctx.log("Cyber Return: 攻击后自身回到卡组");
        return { damage: baseDamage, shuffleSelf: true };
      },
    },
  ],
};

const woChienEx: NamedEffect = {
  cardId: "name:Wo-Chien ex",
  cardName: "Wo-Chien ex",
  attacks: [
    {
      name: "Entangling Ivy",
      onAttack: (ctx, baseDamage) => {
        // Prevent opponent's active from retreating
        ctx.log("Entangling Ivy: 对手活跃宝可梦无法撤退");
        return { damage: baseDamage, preventRetreat: true };
      },
    },
  ],
};

const chiYuEx: NamedEffect = {
  cardId: "name:Chi-Yu ex",
  cardName: "Chi-Yu ex",
  attacks: [
    {
      name: "Flame Surge",
      onAttack: (ctx, baseDamage) => {
        // Attach Fire energy from discard to benched Pokemon
        if (ctx.player.bench.cards.length > 0) {
          const target = ctx.player.bench.cards[0];
          const attached = ctx.attachEnergyFromDiscard(
            c => c.card.name?.includes("Fire") && c.card.subtypes?.includes("Basic"),
            1,
            target
          );
          if (attached.length > 0) ctx.log(`Flame Surge: 给 ${target.card.name} 附加了火能量`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const tingLuEx: NamedEffect = {
  cardId: "name:Ting-Lu ex",
  cardName: "Ting-Lu ex",
  abilities: [
    {
      name: "Land Ruin",
      type: "passive" as const,
      // Opponent draws 1 fewer card during their draw step — marker-based
      onEnter: (ctx) => {
        ctx.addMarker(ctx.source, "land_ruin_active");
        ctx.log("Land Ruin: 对手抽卡-1");
      },
    },
  ],
  attacks: [
    { name: "Rumbling Earth", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const chienPao: NamedEffect = {
  cardId: "name:Chien-Pao",
  cardName: "Chien-Pao",
  abilities: [
    {
      name: "Shivery Chill",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Discard a tool from opponent's active
        if (ctx.opponent.active && ctx.opponent.active.attachedTools &&
            ctx.opponent.active.attachedTools.length > 0) {
          const tool = ctx.opponent.active.attachedTools.pop()!;
          ctx.opponent.discard.cards.push(tool);
          ctx.log(`Shivery Chill: 弃掉了对手的 ${tool.card.name}`);
        }
      },
    },
  ],
};

const palossandEx: NamedEffect = {
  cardId: "name:Palossand ex",
  cardName: "Palossand ex",
  attacks: [
    {
      name: "Sand Tomb",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        preventRetreat: true,
      }),
    },
    {
      name: "Lost Mine",
      onAttack: (ctx, _baseDamage) => {
        // Place 12 damage counters (120 damage) on opponent's Pokemon in any way
        const targets = ctx.getAllPokemon("opponent");
        if (ctx.spreadDamage && targets.length > 0) {
          ctx.spreadDamage(12, targets);
        }
        ctx.log("Lost Mine: 分配了12个伤害指示物");
        return { damage: 0 };
      },
    },
  ],
};

const banetteEx: NamedEffect = {
  cardId: "name:Banette ex",
  cardName: "Banette ex",
  abilities: [
    {
      name: "Puppet",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Discard 1 card from opponent's hand
        const discarded = ctx.discardFromHand(1, "opponent");
        if (discarded.length > 0) {
          ctx.log(`Puppet: 弃掉了对手手牌中的 ${discarded[0].card.name}`);
        }
      },
    },
  ],
  attacks: [
    { name: "Poltergeist", onAttack: (ctx, _baseDamage) => {
      // Count Trainer cards in opponent's hand
      const trainerCount = ctx.opponent.hand.cards.filter(
        c => c.card.supertype === "Trainer"
      ).length;
      return { damage: trainerCount * 60 };
    }},
  ],
};

const luxrayV: NamedEffect = {
  cardId: "name:Luxray V",
  cardName: "Luxray V",
  attacks: [
    {
      name: "Fang Snipe",
      onAttack: (ctx, baseDamage) => {
        // Discard 1 card from opponent's hand
        const discarded = ctx.discardFromHand(1, "opponent");
        if (discarded.length > 0) {
          ctx.log(`Fang Snipe: 弃掉了 ${discarded[0].card.name}`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const hoopaV: NamedEffect = {
  cardId: "name:Hoopa V",
  cardName: "Hoopa V",
  attacks: [
    {
      name: "Shadow Impact",
      onAttack: (ctx, baseDamage) => {
        // 170 damage, also place 3 damage counters on own benched Pokemon
        if (ctx.player.bench.cards.length > 0) {
          const target = ctx.player.bench.cards[0];
          target.damageCounters = (target.damageCounters || 0) + 3;
          ctx.log(`Shadow Impact: 自己后备区 ${target.card.name} 受到30伤害`);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const raichuV: NamedEffect = {
  cardId: "name:Raichu V",
  cardName: "Raichu V",
  attacks: [
    {
      name: "Lightning Strike",
      onAttack: (ctx, baseDamage) => {
        // 210 damage, may discard all Lightning energy for extra effect
        const heads = ctx.flipCoin();
        if (!heads) {
          return { damage: baseDamage, discardEnergy: 2 };
        }
        return { damage: baseDamage };
      },
    },
  ],
};

export const wave22TechCardsEffects: NamedEffect[] = [
  dittoV, chatot, spinda, sudowoodo, aerodactylVSTAR,
  ironTreadsEx, woChienEx, chiYuEx, tingLuEx, chienPao,
  palossandEx, banetteEx, luxrayV, hoopaV, raichuV,
];
