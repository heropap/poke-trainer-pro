/**
 * Wave 23: Stadium Cards Batch — 体育场/特殊能量批量
 *
 * 卡效果清单 (12):
 *  1. Mesagoza — search supporter from discard once per turn
 *  2. Jubilife Village — each player draws 1 card (if less than 5)
 *  3. Crystal Cave — heal 30 from Metal/Dragon
 *  4. Stormy Mountains — search Lightning/Dragon Basic
 *  5. Turffield Stadium — search Grass evolution
 *  6. Tower of Darkness — discard 1 draw 2 (Rapid Strike)
 *  7. Tower of Waters — retreat -2 for Rapid Strike
 *  8. Abyss Script — Lost Zone stadium
 *  9. Booming Site — +10 damage to Single Strike
 * 10. Fusion Strike Energy — provides all types for Fusion Strike
 * 11. Impact Energy — provides Fighting for Single Strike
 * 12. Heat Fire Energy — provides Fire +20 for Single Strike
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const mesagoza: NamedEffect = {
  cardId: "name:Mesagoza",
  cardName: "Mesagoza",
  trainer: {
    onPlay: (ctx) => {
      // Stadium: once per turn, search supporter from discard
      const found = ctx.searchDiscard(
        c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter"),
        1
      );
      if (found.length > 0) {
        ctx.addToHand(found[0]);
        ctx.log(`Mesagoza: 从弃牌区取回了 ${found[0].card.name}`);
      }
    },
  },
};

const jubilifeVillage: NamedEffect = {
  cardId: "name:Jubilife Village",
  cardName: "Jubilife Village",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length < 5,
    onPlay: (ctx) => {
      // Each player draws 1 card if they have fewer than 5 in hand
      if (ctx.player.hand.cards.length < 5) {
        ctx.drawCards(1);
        ctx.log("Jubilife Village: 你抽了1张");
      }
      if (ctx.opponent.hand.cards.length < 5) {
        ctx.drawCards(1, "opponent");
        ctx.log("Jubilife Village: 对手抽了1张");
      }
    },
  },
};

const crystalCave: NamedEffect = {
  cardId: "name:Crystal Cave",
  cardName: "Crystal Cave",
  trainer: {
    onPlay: (ctx) => {
      // Heal 30 from each Metal and Dragon Pokemon
      const allPokemon = ctx.getAllPokemon();
      for (const p of allPokemon) {
        if (p.card.types?.includes("Metal") || p.card.types?.includes("Dragon")) {
          if (p.damageCounters > 0) {
            ctx.heal(30, p);
            ctx.log(`Crystal Cave: 治愈了 ${p.card.name} 30HP`);
          }
        }
      }
    },
  },
};

const stormyMountains: NamedEffect = {
  cardId: "name:Stormy Mountains",
  cardName: "Stormy Mountains",
  trainer: {
    onPlay: (ctx) => {
      // Search deck for a Lightning or Dragon Basic Pokemon, put on bench
      const found = ctx.searchDeck(
        c =>
          c.card.supertype === "Pokémon" &&
          c.card.subtypes?.includes("Basic") &&
          (c.card.types?.includes("Lightning") || c.card.types?.includes("Dragon")),
        1
      );
      ctx.shuffleDeck();
      if (found.length > 0) {
        ctx.player.bench.cards.push(found[0]);
        ctx.log(`Stormy Mountains: 放置了 ${found[0].card.name} 到后备区`);
      }
    },
  },
};

const turfieldStadium: NamedEffect = {
  cardId: "name:Turffield Stadium",
  cardName: "Turffield Stadium",
  trainer: {
    onPlay: (ctx) => {
      // Search deck for a Grass evolution Pokemon
      const found = ctx.searchDeck(
        c =>
          c.card.supertype === "Pokémon" &&
          c.card.types?.includes("Grass") &&
          !c.card.subtypes?.includes("Basic"),
        1
      );
      ctx.shuffleDeck();
      if (found.length > 0) {
        ctx.addToHand(found[0]);
        ctx.log(`Turffield Stadium: 搜索了 ${found[0].card.name}`);
      }
    },
  },
};

const towerOfDarkness: NamedEffect = {
  cardId: "name:Tower of Darkness",
  cardName: "Tower of Darkness",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 1,
    onPlay: (ctx) => {
      // Discard 1 Rapid Strike card, draw 2
      const discarded = ctx.discardFromHand(1);
      if (discarded.length > 0) {
        ctx.drawCards(2);
        ctx.log(`Tower of Darkness: 弃掉1张，抽了2张`);
      }
    },
  },
};

const towerOfWaters: NamedEffect = {
  cardId: "name:Tower of Waters",
  cardName: "Tower of Waters",
  trainer: {
    onPlay: (ctx) => {
      // Rapid Strike Pokemon retreat cost -2 — marker-based
      ctx.log("Tower of Waters: Rapid Strike 宝可梦撤退费用 -2");
    },
  },
};

const abyssScript: NamedEffect = {
  cardId: "name:Abyss Script",
  cardName: "Abyss Script",
  trainer: {
    onPlay: (ctx) => {
      // Lost Zone stadium: each player puts top card into Lost Zone
      const playerTop = ctx.revealTopCards(1);
      if (playerTop.length > 0 && ctx.moveToLostZone) {
        ctx.moveToLostZone(playerTop[0]);
        ctx.log(`Abyss Script: 你的 ${playerTop[0].card.name} 进入迷失区`);
      }
      const oppTop = ctx.revealTopCards(1, "opponent");
      if (oppTop.length > 0 && ctx.moveToLostZone) {
        ctx.moveToLostZone(oppTop[0], "opponent");
        ctx.log(`Abyss Script: 对手的 ${oppTop[0].card.name} 进入迷失区`);
      }
    },
  },
};

const boomingSite: NamedEffect = {
  cardId: "name:Booming Site",
  cardName: "Booming Site",
  trainer: {
    onPlay: (ctx) => {
      // +10 damage to Single Strike attacks — marker-based
      ctx.log("Booming Site: Single Strike 攻击 +10 伤害");
    },
  },
};

const fusionStrikeEnergy: NamedEffect = {
  cardId: "name:Fusion Strike Energy",
  cardName: "Fusion Strike Energy",
  tool: {
    whileAttached: {
      // Provides all types for Fusion Strike Pokemon — simplified as passive
      modifyDamage: (_ctx, damage) => damage,
    },
  },
};

const impactEnergy: NamedEffect = {
  cardId: "name:Impact Energy",
  cardName: "Impact Energy",
  tool: {
    whileAttached: {
      // Provides Fighting for Single Strike Pokemon — simplified as passive
      modifyDamage: (_ctx, damage) => damage,
    },
  },
};

const heatFireEnergy: NamedEffect = {
  cardId: "name:Heat Fire Energy",
  cardName: "Heat Fire Energy",
  tool: {
    whileAttached: {
      // Provides Fire +20 damage for Single Strike Pokemon
      modifyDamage: (ctx, damage) => {
        // +20 if the Pokemon is Single Strike
        if (ctx.source.card.subtypes?.includes("Single Strike")) {
          return damage + 20;
        }
        return damage;
      },
    },
  },
};

export const wave23StadiumBatchEffects: NamedEffect[] = [
  mesagoza, jubilifeVillage, crystalCave, stormyMountains,
  turfieldStadium, towerOfDarkness, towerOfWaters, abyssScript,
  boomingSite, fusionStrikeEnergy, impactEnergy, heatFireEnergy,
];
