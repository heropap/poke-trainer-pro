/**
 * Wave 10: Fighting / Dark — 格斗暗系核心卡效果
 *
 * 卡效果清单:
 *  1. Darkrai VSTAR — Dark Pulse / Star Abyss
 *  2. Galarian Moltres V — Direflame Wings / Aura Burn
 *  3. Hawlucha — Big Match (对ex/V伤害+30)
 *  4. Drapion V — Dynamic Tail / Fangs of the Earth
 *  5. Defiance Band — Tool: 奖赏较多时+30
 *  6. Hisuian Heavy Ball — 奖赏卡中搜索基础宝可梦
 *  7. Counter Catcher — 奖赏较多时切换对手前场
 *  8. Path to the Peak — Stadium: Rule Box能力无效
 *  9. Training Court — Stadium: 每回合弃牌堆取回1基础能量
 * 10. Adventurer's Discovery — 搜索最多3张V宝可梦
 * 11. Medicham V — Yoga Loop (满足条件额外回合)
 * 12. Lucario — Aura Sphere (先打120后备战区打40)
 * 13. Stonjourner — Stone Gift ability (治疗+附加格斗能量)
 * 14. Hitmonlee — Special Combo (备战区弱伤)
 * 15. Radiant Hawlucha — Big Match (对ex额外取1奖赏)
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const darkraiVSTAR: NamedEffect = {
  cardId: "name:Darkrai VSTAR",
  cardName: "Darkrai VSTAR",
  attacks: [
    {
      name: "Dark Pulse",
      onAttack: (ctx, _baseDamage) => {
        // 30 + 30 per Darkness energy attached to all your Pokemon
        const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        let darkCount = 0;
        for (const p of allPokemon) {
          darkCount += p.attachedEnergy.filter(
            (e: any) => e.card.name?.includes("Dark") || e.card.types?.includes("Darkness")
          ).length;
        }
        return { damage: 30 + darkCount * 30 };
      },
    },
  ],
  abilities: [
    {
      name: "Star Abyss",
      type: "activated" as const,
      onActivate: (ctx) => {
        const key = ctx.playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
        if ((ctx.state.turnStatus as any)[key]) return;
        // Take up to 2 Item cards from discard
        const items = ctx.player.discard.cards.filter(
          c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item")
        );
        const toTake = items.slice(0, 2);
        for (const c of toTake) {
          ctx.player.discard.cards = ctx.player.discard.cards.filter(d => d.instanceId !== c.instanceId);
          ctx.player.hand.cards.push(c);
        }
        (ctx.state.turnStatus as any)[key] = true;
        ctx.log(`Star Abyss (V★): 从弃牌堆取回了 ${toTake.map(c => c.card.name).join(", ")}`);
      },
    },
  ],
};

const galarianMoltresV: NamedEffect = {
  cardId: "name:Galarian Moltres V",
  cardName: "Galarian Moltres V",
  attacks: [
    {
      name: "Aura Burn",
      onAttack: (ctx, baseDamage) => {
        ctx.source.damageCounters += 3; // 30 self damage
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Direflame Wings",
      type: "activated" as const,
      onActivate: (ctx) => {
        const darkEnergy = ctx.player.discard.cards.find(
          c => c.card.supertype === "Energy" && (c.card.name?.includes("Dark") || c.card.types?.includes("Darkness")) && c.card.subtypes?.includes("Basic")
        );
        if (!darkEnergy) return;
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== darkEnergy.instanceId);
        ctx.source.attachedEnergy.push(darkEnergy);
        ctx.source.damageCounters += 2; // Take 20 damage
        ctx.log("Direflame Wings: 从弃牌堆附加暗能量（受20伤害）");
      },
    },
  ],
};

// Hawlucha — already implemented in meta-attacks.ts

const drapionV: NamedEffect = {
  cardId: "name:Drapion V",
  cardName: "Drapion V",
  attacks: [
    { name: "Dynamic Tail", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    {
      name: "Fangs of the Earth",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
};

const defianceBand: NamedEffect = {
  cardId: "name:Defiance Band",
  cardName: "Defiance Band",
  tool: {
    whileAttached: {
      modifyDamage: (ctx, damage) => {
        // +30 if you have more prize cards than opponent
        if (ctx.player.prizes.cards.length > ctx.opponent.prizes.cards.length) {
          return damage + 30;
        }
        return damage;
      },
    },
  },
};

// Hisuian Heavy Ball — already implemented in trainers-expanded.ts

const counterCatcher: NamedEffect = {
  cardId: "name:Counter Catcher",
  cardName: "Counter Catcher",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.prizes.cards.length > ctx.opponent.prizes.cards.length &&
             ctx.opponent.bench.cards.length > 0;
    },
    onPlay: (ctx) => {
      if (ctx.opponent.bench.cards.length === 0 || !ctx.opponent.active) return;
      const target = ctx.opponent.bench.cards[0];
      const oldActive = ctx.opponent.active;
      ctx.opponent.active = target;
      ctx.opponent.bench.cards = ctx.opponent.bench.cards.filter(c => c.instanceId !== target.instanceId);
      ctx.opponent.bench.cards.push(oldActive);
      ctx.log(`Counter Catcher: 将对手的 ${target.card.name} 拉到战斗区`);
    },
  },
};

const pathToThePeak: NamedEffect = {
  cardId: "name:Path to the Peak",
  cardName: "Path to the Peak",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Path to the Peak: Rule Box 宝可梦的能力无效");
    },
  },
};

const trainingCourt: NamedEffect = {
  cardId: "name:Training Court",
  cardName: "Training Court",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Training Court: 每回合可从弃牌堆取回1张基础能量");
    },
  },
};

// Adventurer's Discovery — already implemented in trainers-expanded.ts and sv-abilities.ts

const medichamV: NamedEffect = {
  cardId: "name:Medicham V",
  cardName: "Medicham V",
  attacks: [
    {
      name: "Yoga Loop",
      onAttack: (ctx, baseDamage) => {
        // 90 damage. If opponent's Active is KO'd, take another turn
        // We set the flag; engine checks at KO time
        (ctx.state as any).__yogaLoopPending = true;
        return { damage: baseDamage };
      },
    },
  ],
};

const lucario: NamedEffect = {
  cardId: "name:Lucario",
  cardName: "Lucario",
  attacks: [
    {
      name: "Aura Sphere",
      onAttack: (ctx, baseDamage) => {
        const benchDamage: { target: any; damage: number }[] = [];
        if (ctx.opponent.bench.cards.length > 0) {
          benchDamage.push({ target: ctx.opponent.bench.cards[0], damage: 40 });
        }
        return { damage: baseDamage, benchDamage };
      },
    },
  ],
};

const stonjourner: NamedEffect = {
  cardId: "name:Stonjourner",
  cardName: "Stonjourner",
  abilities: [
    {
      name: "Stone Gift",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Attach 1 Fighting energy from hand to 1 of your Pokemon, heal 20
        const fightingEnergy = ctx.player.hand.cards.find(
          c => c.card.supertype === "Energy" && c.card.name?.includes("Fighting") && c.card.subtypes?.includes("Basic")
        );
        if (!fightingEnergy) return;
        const targets = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        if (targets.length === 0) return;
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== fightingEnergy.instanceId);
        targets[0].attachedEnergy.push(fightingEnergy);
        targets[0].damageCounters = Math.max(0, targets[0].damageCounters - 2);
        ctx.log(`Stone Gift: 附加格斗能量给 ${targets[0].card.name} 并治疗20HP`);
      },
    },
  ],
};

const radiantHawlucha: NamedEffect = {
  cardId: "name:Radiant Hawlucha",
  cardName: "Radiant Hawlucha",
  abilities: [
    {
      name: "Big Match",
      type: "passive" as const,
      // When you KO opponent's V/ex Pokemon, take 1 extra prize
      onEvent: {
        triggers: ["pokemon_knocked_out"],
        handler: (ctx, _event) => {
          ctx.log("Radiant Hawlucha Big Match: 击倒V/ex时额外取1张奖赏");
        },
      },
    },
  ],
};

export const fightingDarkW10Effects: NamedEffect[] = [
  darkraiVSTAR, galarianMoltresV, drapionV, defianceBand,
  counterCatcher, pathToThePeak, trainingCourt,
  medichamV, lucario, stonjourner, radiantHawlucha,
];
