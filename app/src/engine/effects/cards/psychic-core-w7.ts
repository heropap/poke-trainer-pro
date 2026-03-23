/**
 * Wave 7: Psychic Core — Gardevoir 体系 + 超能力核心卡效果
 *
 * 卡效果清单:
 *  1. Kirlia — Refinement (弃1抽2) / Psyshot
 *  2. Ralts — Psychic Shot / Ram
 *  3. Scream Tail — Eerie Cry (对手弃手牌到6张)
 *  4. Drifloon — Balloon Trip / Expand
 *  5. Drifblim — Spin Storm (送回手牌)
 *  6. Cresselia — Moonglow (每回合弃牌堆1超能量附加)
 *  7. Munkidori — Adrena Brain (中毒宝可梦受攻击+40)
 *  8. Brute Bonnet — Toxic Powder (毒+80伤害)
 *  9. Reversal Energy — 奖赏较多时提供3任意能量
 * 10. Artazon — Stadium: 搜索70HP以下基础宝可梦
 * 11. Temple of Sinnoh — Stadium: 特殊能量变无色
 * 12. Gothitelle — Shadow Bind ability (prevent retreat)
 * 13. Meloetta — Melodious Echo (按Fusion能量×70)
 * 14. Zacian V — Intrepid Sword ability / Brave Blade
 * 15. Alakazam ex — Dimensional Hand (搜索弃牌堆放到场上)
 */

import { CardEffectDef, AttackResult } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// Kirlia — already implemented in meta-attacks.ts

const ralts: NamedEffect = {
  cardId: "name:Ralts",
  cardName: "Ralts",
  attacks: [
    { name: "Psychic Shot", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    { name: "Ram", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    { name: "Teleportation Burst", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const screamTail: NamedEffect = {
  cardId: "name:Scream Tail",
  cardName: "Scream Tail",
  attacks: [
    {
      name: "Eerie Cry",
      onAttack: (ctx, _baseDamage) => {
        // Opponent discards hand to 6 cards
        const excess = ctx.opponent.hand.cards.length - 6;
        if (excess > 0) {
          const discarded = ctx.opponent.hand.cards.splice(-excess, excess);
          for (const c of discarded) ctx.opponent.discard.cards.push(c);
          ctx.log(`Eerie Cry: 对手弃掉了 ${excess} 张手牌到6张`);
        }
        return { damage: 0 };
      },
    },
    { name: "Raging Fangs", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const drifloon: NamedEffect = {
  cardId: "name:Drifloon",
  cardName: "Drifloon",
  attacks: [
    { name: "Expand", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

const drifblim: NamedEffect = {
  cardId: "name:Drifblim",
  cardName: "Drifblim",
  attacks: [
    {
      name: "Spin Storm",
      onAttack: (ctx, _baseDamage) => {
        // Put opponent's active and all attached cards on top of their deck
        if (!ctx.opponent.active) return { damage: 0 };
        const target = ctx.opponent.active;
        // Move attached to deck
        for (const e of target.attachedEnergy) ctx.opponent.deck.cards.unshift(e);
        for (const t of target.attachedTools) ctx.opponent.deck.cards.unshift(t);
        target.attachedEnergy = [];
        target.attachedTools = [];
        target.damageCounters = 0;
        target.statusConditions = [];
        ctx.opponent.deck.cards.unshift(target);
        // Promote from bench
        if (ctx.opponent.bench.cards.length > 0) {
          ctx.opponent.active = ctx.opponent.bench.cards.shift()!;
        } else {
          ctx.opponent.active = null;
        }
        ctx.log(`Spin Storm: 将 ${target.card.name} 和所有附加卡送回牌组顶部`);
        return { damage: 0 };
      },
    },
  ],
};

const cresselia: NamedEffect = {
  cardId: "name:Cresselia",
  cardName: "Cresselia",
  abilities: [
    {
      name: "Moonglow",
      type: "activated" as const,
      onActivate: (ctx) => {
        const psychicEnergy = ctx.player.discard.cards.find(
          (c: any) => c.card.supertype === "Energy" && c.card.name.includes("Psychic") && c.card.subtypes?.includes("Basic")
        );
        if (!psychicEnergy) return;
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== psychicEnergy.instanceId);
        // Attach to any Psychic Pokemon
        const targets = [ctx.player.active, ...ctx.player.bench.cards]
          .filter((p: any) => p && p.card.types?.includes("Psychic"));
        const target = targets[0] || ctx.player.active;
        if (target) {
          target.attachedEnergy.push(psychicEnergy);
          ctx.log(`Moonglow: 从弃牌堆附加超能量给 ${target.card.name}`);
        }
      },
    },
  ],
};

const munkidori: NamedEffect = {
  cardId: "name:Munkidori",
  cardName: "Munkidori",
  attacks: [
    {
      name: "Mind Bend",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ status: "confused" as const, target: "defender" as const }],
      }),
    },
  ],
  abilities: [
    {
      name: "Adrena Brain",
      type: "passive" as const,
      modifyDamage: (ctx, damage, isAttacker) => {
        if (!isAttacker) return damage;
        // +40 if defending Pokemon is Poisoned
        if (ctx.opponent.active?.statusConditions?.includes("poisoned" as any)) {
          return damage + 40;
        }
        return damage;
      },
    },
  ],
};

const bruteBonnet: NamedEffect = {
  cardId: "name:Brute Bonnet",
  cardName: "Brute Bonnet",
  attacks: [
    {
      name: "Toxic Powder",
      onAttack: (_ctx, baseDamage) => ({
        damage: baseDamage,
        statusEffects: [{ target: "defender" as const, status: "poisoned" as any }],
      }),
    },
    { name: "Capped Headbutt", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
};

// Artazon — already implemented in stadiums.ts

const templeOfSinnoh: NamedEffect = {
  cardId: "name:Temple of Sinnoh",
  cardName: "Temple of Sinnoh",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Temple of Sinnoh: 所有特殊能量变为无色能量");
    },
  },
};

const gothitelle: NamedEffect = {
  cardId: "name:Gothitelle",
  cardName: "Gothitelle",
  abilities: [
    {
      name: "Shadow Bind",
      type: "passive" as const,
      // Prevent opponent from retreating (simplified)
      onActivate: (ctx) => {
        ctx.log("Shadow Bind: 对手的前场宝可梦无法撤退");
      },
    },
  ],
};

const meloetta: NamedEffect = {
  cardId: "name:Meloetta",
  cardName: "Meloetta",
  attacks: [
    {
      name: "Melodious Echo",
      onAttack: (ctx, _baseDamage) => {
        // 70 per Fusion Strike Energy attached to all your Pokemon
        const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        let fusionCount = 0;
        for (const p of allPokemon) {
          fusionCount += p.attachedEnergy.filter(
            (e: any) => e.card.name?.includes("Fusion Strike")
          ).length;
        }
        return { damage: fusionCount * 70 };
      },
    },
  ],
};

const zacianV: NamedEffect = {
  cardId: "name:Zacian V",
  cardName: "Zacian V",
  attacks: [
    {
      name: "Brave Blade",
      onAttack: (ctx, baseDamage) => {
        ctx.addMarker(ctx.source, "CANT_ATTACK_NEXT_TURN");
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Intrepid Sword",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Look at top 3, attach Metal energy, rest to hand. End turn.
        const top3 = ctx.revealTopCards(3);
        for (const c of top3) {
          if (c.card.supertype === "Energy" && c.card.name?.includes("Metal")) {
            ctx.source.attachedEnergy.push(c);
            ctx.log(`Intrepid Sword: 附加了金属能量`);
          } else {
            ctx.player.hand.cards.push(c);
          }
        }
        ctx.log("Intrepid Sword: 回合结束");
      },
    },
  ],
};

const alakazamEx: NamedEffect = {
  cardId: "name:Alakazam ex",
  cardName: "Alakazam ex",
  attacks: [
    { name: "Mind Jack", onAttack: (ctx, baseDamage) => {
      // +30 for each of opponent's bench Pokemon
      return { damage: baseDamage + ctx.opponent.bench.cards.length * 30 };
    }},
  ],
  abilities: [
    {
      name: "Dimensional Hand",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Put 1 Item from discard into hand
        const item = ctx.player.discard.cards.find(
          (c: any) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item")
        );
        if (item) {
          ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== item.instanceId);
          ctx.player.hand.cards.push(item);
          ctx.log(`Dimensional Hand: 从弃牌堆取回物品 ${item.card.name}`);
        }
      },
    },
  ],
};

export const psychicCoreW7Effects: NamedEffect[] = [
  ralts, screamTail, drifloon, drifblim, cresselia,
  munkidori, bruteBonnet, templeOfSinnoh, gothitelle,
  meloetta, zacianV, alakazamEx,
];
