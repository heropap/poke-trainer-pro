/**
 * ACE SPEC Trainer Effects — One-per-deck powerful trainers
 *
 * ACE SPEC cards are limited to 1 per deck and have uniquely powerful effects.
 * These are the most commonly played ACE SPECs in Chinese PTCG Standard.
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

/** Master Ball — Search deck for any 1 Pokemon */
const masterBall: NamedEffect = {
  cardId: "name:Master Ball",
  cardName: "Master Ball",
  trainer: {
    onPlay: async (ctx) => {
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Pokémon",
        1
      );
      ctx.shuffleDeck();
      if (found.length > 0) {
        ctx.log(`Master Ball (ACE SPEC): 搜索了 ${found[0].card.name}`);
      }
    },
  },
};

/** Secret Box — Discard 3 cards, then search for 1 Item + 1 Supporter + 1 Tool + 1 Stadium */
const secretBox: NamedEffect = {
  cardId: "name:Secret Box",
  cardName: "Secret Box",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 3, // Need 3 cards to discard (excluding Secret Box itself which is already in discard)
    onPlay: async (ctx) => {
      // Discard 3 cards from hand
      const toDiscard = ctx.player.hand.cards.slice(0, 3);
      for (const card of toDiscard) {
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== card.instanceId);
        ctx.player.discard.cards.push(card);
      }
      ctx.log(`Secret Box (ACE SPEC): 弃掉了 ${toDiscard.length} 张手牌`);

      // Search for 1 of each category
      const categories: { name: string; filter: (c: any) => boolean }[] = [
        { name: "物品", filter: (c) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item") },
        { name: "支持者", filter: (c) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter") },
        { name: "宝可梦道具", filter: (c) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Pokémon Tool") },
        { name: "球场", filter: (c) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Stadium") },
      ];

      for (const cat of categories) {
        const found = ctx.searchDeck(cat.filter, 1);
        if (found.length > 0) {
          ctx.log(`  → 搜索了${cat.name}: ${found[0].card.name}`);
        }
      }
      ctx.shuffleDeck();
    },
  },
};

/** Scoop Up Cyclone — Return 1 of your Pokemon and all cards attached to it to your hand */
const scoopUpCyclone: NamedEffect = {
  cardId: "name:Scoop Up Cyclone",
  cardName: "Scoop Up Cyclone",
  trainer: {
    onPlay: (ctx) => {
      // Pick up active Pokemon (or first bench if no active)
      const target = ctx.player.active || ctx.player.bench.cards[0];
      if (!target) return;

      // Return all attached cards to hand
      for (const energy of target.attachedEnergy) ctx.player.hand.cards.push(energy);
      for (const tool of target.attachedTools) ctx.player.hand.cards.push(tool);
      target.attachedEnergy = [];
      target.attachedTools = [];
      target.damageCounters = 0;
      target.statusConditions = [];

      // Return the Pokemon itself
      if (ctx.player.active?.instanceId === target.instanceId) {
        ctx.player.active = null;
      } else {
        ctx.player.bench.cards = ctx.player.bench.cards.filter(c => c.instanceId !== target.instanceId);
      }
      ctx.player.hand.cards.push(target);

      ctx.log(`Scoop Up Cyclone (ACE SPEC): ${target.card.name} 和所有附加卡返回手牌`);
    },
  },
};

/** Scramble Switch — Switch active with bench, move all energy from old active to new */
const scrambleSwitch: NamedEffect = {
  cardId: "name:Scramble Switch",
  cardName: "Scramble Switch",
  trainer: {
    canPlay: (ctx) => ctx.player.bench.cards.length > 0 && ctx.player.active !== null,
    onPlay: (ctx) => {
      if (!ctx.player.active || ctx.player.bench.cards.length === 0) return;
      const oldActive = ctx.player.active;
      const newActive = ctx.player.bench.cards[0]; // Auto-select first bench

      // Switch
      ctx.player.active = newActive;
      ctx.player.bench.cards = ctx.player.bench.cards.filter(c => c.instanceId !== newActive.instanceId);
      ctx.player.bench.cards.push(oldActive);

      // Move ALL energy from old active to new active
      for (const energy of oldActive.attachedEnergy) {
        newActive.attachedEnergy.push(energy);
      }
      oldActive.attachedEnergy = [];

      ctx.log(`Scramble Switch (ACE SPEC): ${newActive.card.name} 上场，所有能量从 ${oldActive.card.name} 转移`);
    },
  },
};

/** Hero's Cape — Already implemented in trainers-expanded.ts, skip */
/** Prime Catcher — Already implemented in trainers-expanded.ts, skip */

export const aceSpecEffects: NamedEffect[] = [
  masterBall,
  secretBox,
  scoopUpCyclone,
  scrambleSwitch,
];
