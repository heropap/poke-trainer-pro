/**
 * Wave 11: Dragon / Metal / Colorless — 龙金属无色体系
 *
 * 卡效果清单:
 *  1. Arceus V — Trinity Charge (搜索3基础能量附加)
 *  2. Dunsparce — Mysterious Nest (龙无弱点)
 *  3. Duraludon VMAX — Skyscraper (特殊能量宝可梦攻击无效)
 *  4. Flygon ex — Sand Pulse / Scorching Sand
 *  5. Bronzong — Metal Transfer (移动金属能量)
 *  6. Cobalion — Iron Revenge (弃对手特殊能量)
 *  7. Metal Saucer — 弃牌堆金属能附加到备战区
 *  8. Jet Energy — 附加时切换到前场
 *  9. Therapeutic Energy — 防止特殊状态
 * 10. Mist Energy — 防止备战区伤害
 * 11. Luminous Energy — 只有1种宝可梦时提供任意类型
 * 12. Powerful Colorless Energy — 无色+20伤害
 * 13. Lucky Energy — 被攻击时抽1
 * 14. Capture Energy — 附加时搜索基础宝可梦到备战区
 * 15. Charizard VSTAR — Star Blaze / Vstar ability
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const arceusV: NamedEffect = {
  cardId: "name:Arceus V",
  cardName: "Arceus V",
  attacks: [
    {
      name: "Trinity Charge",
      onAttack: (ctx, _baseDamage) => {
        // Search deck for up to 3 Basic Energy, attach to V Pokemon
        const energies = ctx.searchDeck(
          (c: any) => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"),
          3
        );
        const vPokemon = [ctx.player.active, ...ctx.player.bench.cards]
          .filter((p: any) => p && p.card.subtypes?.some((s: string) => ["V", "VSTAR", "VMAX"].includes(s)));
        for (let i = 0; i < energies.length; i++) {
          const target = vPokemon[i % Math.max(1, vPokemon.length)] || ctx.player.active;
          if (target) target.attachedEnergy.push(energies[i]);
        }
        ctx.shuffleDeck();
        ctx.log(`Trinity Charge: 附加了 ${energies.length} 张基础能量给V宝可梦`);
        return { damage: 0 };
      },
    },
  ],
};

const dunsparce: NamedEffect = {
  cardId: "name:Dunsparce",
  cardName: "Dunsparce",
  abilities: [
    {
      name: "Mysterious Nest",
      type: "passive" as const,
      // Dragon Pokemon have no weakness
      onActivate: (ctx) => {
        ctx.log("Mysterious Nest: 龙系宝可梦没有弱点");
      },
    },
  ],
};

const duraludonVMAX: NamedEffect = {
  cardId: "name:Duraludon VMAX",
  cardName: "Duraludon VMAX",
  attacks: [
    { name: "Rend", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
  ],
  abilities: [
    {
      name: "Skyscraper",
      type: "passive" as const,
      modifyIncomingDamage: (ctx, damage) => {
        // Prevent damage from Pokemon with Special Energy attached
        const attacker = ctx.opponent.active;
        if (attacker) {
          const hasSpecial = attacker.attachedEnergy.some(
            (e: any) => !e.card.subtypes?.includes("Basic")
          );
          if (hasSpecial) return 0;
        }
        return damage;
      },
    },
  ],
};

const flygonEx: NamedEffect = {
  cardId: "name:Flygon ex",
  cardName: "Flygon ex",
  attacks: [
    {
      name: "Sand Pulse",
      onAttack: (ctx, baseDamage) => {
        // 40 damage to 2 of opponent's bench
        const benchDamage: { target: any; damage: number }[] = [];
        for (let i = 0; i < Math.min(2, ctx.opponent.bench.cards.length); i++) {
          benchDamage.push({ target: ctx.opponent.bench.cards[i], damage: 40 });
        }
        return { damage: baseDamage, benchDamage };
      },
    },
  ],
};

const bronzong: NamedEffect = {
  cardId: "name:Bronzong",
  cardName: "Bronzong",
  abilities: [
    {
      name: "Metal Transfer",
      type: "activated" as const,
      onActivate: (ctx) => {
        // Move 1 Metal energy from 1 Pokemon to another
        const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
        for (const source of allPokemon) {
          const metalEnergy = source.attachedEnergy.find(
            (e: any) => e.card.name?.includes("Metal") || e.card.types?.includes("Metal")
          );
          if (metalEnergy) {
            const targets = allPokemon.filter((p: any) => p.instanceId !== source.instanceId);
            if (targets.length > 0) {
              source.attachedEnergy = source.attachedEnergy.filter(
                (e: any) => e.instanceId !== metalEnergy.instanceId
              );
              targets[0].attachedEnergy.push(metalEnergy);
              ctx.log(`Metal Transfer: 将金属能量从 ${source.card.name} 移到 ${targets[0].card.name}`);
              return;
            }
          }
        }
      },
    },
  ],
};

const cobalion: NamedEffect = {
  cardId: "name:Cobalion",
  cardName: "Cobalion",
  attacks: [
    {
      name: "Iron Revenge",
      onAttack: (ctx, baseDamage) => {
        // Discard a Special Energy from opponent's active
        if (ctx.opponent.active) {
          const special = ctx.opponent.active.attachedEnergy.find(
            (e: any) => !e.card.subtypes?.includes("Basic")
          );
          if (special) {
            ctx.opponent.active.attachedEnergy = ctx.opponent.active.attachedEnergy.filter(
              (e: any) => e.instanceId !== special.instanceId
            );
            ctx.opponent.discard.cards.push(special);
            ctx.log(`Iron Revenge: 弃掉了对手的特殊能量 ${special.card.name}`);
          }
        }
        return { damage: baseDamage };
      },
    },
  ],
};

const metalSaucer: NamedEffect = {
  cardId: "name:Metal Saucer",
  cardName: "Metal Saucer",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.discard.cards.some(
        c => c.card.supertype === "Energy" && (c.card.name?.includes("Metal") || c.card.types?.includes("Metal")) && c.card.subtypes?.includes("Basic")
      ) && ctx.player.bench.cards.length > 0;
    },
    onPlay: (ctx) => {
      const energy = ctx.player.discard.cards.find(
        c => c.card.supertype === "Energy" && (c.card.name?.includes("Metal") || c.card.types?.includes("Metal")) && c.card.subtypes?.includes("Basic")
      );
      const target = ctx.player.bench.cards.find(c => c.card.types?.includes("Metal")) || ctx.player.bench.cards[0];
      if (!energy || !target) return;
      ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== energy.instanceId);
      target.attachedEnergy.push(energy);
      ctx.log(`Metal Saucer: 从弃牌堆附加金属能量给 ${target.card.name}`);
    },
  },
};

const charizardVSTAR: NamedEffect = {
  cardId: "name:Charizard VSTAR",
  cardName: "Charizard VSTAR",
  attacks: [
    {
      name: "Star Blaze",
      onAttack: (ctx, baseDamage) => {
        const key = ctx.playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
        if ((ctx.state.turnStatus as any)[key]) return { damage: 0 };
        // Discard 3 energy
        const count = Math.min(3, ctx.source.attachedEnergy.length);
        for (let i = 0; i < count; i++) {
          const e = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(e);
        }
        (ctx.state.turnStatus as any)[key] = true;
        ctx.log(`Star Blaze (V★): 弃了 ${count} 张能量，造成 ${baseDamage} 伤害！`);
        return { damage: baseDamage };
      },
    },
    {
      name: "Burning Darkness",
      onAttack: (ctx, baseDamage) => {
        const prizesTaken = ctx.state.rules.prizeCardsPerPlayer - ctx.opponent.prizes.cards.length;
        return { damage: baseDamage + prizesTaken * 30 };
      },
    },
  ],
};

// Special energies with passive effects (simplified registration)
const jetEnergy: NamedEffect = {
  cardId: "name:Jet Energy",
  cardName: "Jet Energy",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Jet Energy: 从手牌附加到基础宝可梦时，可切换到战斗区");
    },
  },
};

const therapeuticEnergy: NamedEffect = {
  cardId: "name:Therapeutic Energy",
  cardName: "Therapeutic Energy",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Therapeutic Energy: 附加的宝可梦不受特殊状态影响");
    },
  },
};

const mistEnergy: NamedEffect = {
  cardId: "name:Mist Energy",
  cardName: "Mist Energy",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Mist Energy: 附加的备战区宝可梦不受对手攻击伤害");
    },
  },
};

const powerfulColorlessEnergy: NamedEffect = {
  cardId: "name:Powerful Colorless Energy",
  cardName: "Powerful Colorless Energy",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Powerful Colorless Energy: 无色宝可梦攻击伤害+20");
    },
  },
};

const luckyEnergy: NamedEffect = {
  cardId: "name:Lucky Energy",
  cardName: "Lucky Energy",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Lucky Energy: 附加的宝可梦被攻击时抽1张卡");
    },
  },
};

const captureEnergy: NamedEffect = {
  cardId: "name:Capture Energy",
  cardName: "Capture Energy",
  trainer: {
    onPlay: (ctx) => {
      // When attached, search for a Basic Pokemon and put on bench
      const benchSpace = 5 - ctx.player.bench.cards.length;
      if (benchSpace > 0) {
        const found = ctx.searchDeck(
          c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic"),
          1
        );
        if (found.length > 0) {
          ctx.player.bench.cards.push(found[0]);
          ctx.shuffleDeck();
          ctx.log(`Capture Energy: 搜索了 ${found[0].card.name} 到备战区`);
        }
      }
    },
  },
};

const luminousEnergy: NamedEffect = {
  cardId: "name:Luminous Energy",
  cardName: "Luminous Energy",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Luminous Energy: 只有1种宝可梦类型时提供任意类型能量");
    },
  },
};

export const dragonMetalW11Effects: NamedEffect[] = [
  arceusV, dunsparce, duraludonVMAX, flygonEx, bronzong, cobalion,
  metalSaucer, charizardVSTAR, jetEnergy, therapeuticEnergy, mistEnergy,
  powerfulColorlessEnergy, luckyEnergy, captureEnergy, luminousEnergy,
];
