/**
 * Wave 4: Key Competitive Trainers — Most impactful support cards
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

/** Irida — Search deck for 1 Water Pokemon + 1 Item card */
const irida: NamedEffect = {
  cardId: "name:Irida",
  cardName: "Irida",
  trainer: {
    onPlay: async (ctx) => {
      const water = ctx.searchDeck(
        (c) => c.card.supertype === "Pokémon" && c.card.types?.includes("Water"), 1
      );
      const item = ctx.searchDeck(
        (c) => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item"), 1
      );
      ctx.shuffleDeck();
      const names = [...water, ...item].map(c => c.card.name).join(", ");
      if (names) ctx.log(`Irida: 搜索了 ${names}`);
    },
  },
};

/** Erika's Invitation — Switch 1 of opponent's benched Pokemon with ability to active */
const erikasInvitation: NamedEffect = {
  cardId: "name:Erika's Invitation",
  cardName: "Erika's Invitation",
  trainer: {
    canPlay: (ctx) => {
      return ctx.opponent.bench.cards.some(c => c.card.abilities && c.card.abilities.length > 0);
    },
    onPlay: (ctx) => {
      // Find bench Pokemon with abilities
      const targets = ctx.opponent.bench.cards.filter(c => c.card.abilities && c.card.abilities.length > 0);
      if (targets.length === 0 || !ctx.opponent.active) return;

      const target = targets[0]; // Auto-select first
      const oldActive = ctx.opponent.active;
      ctx.opponent.active = target;
      ctx.opponent.bench.cards = ctx.opponent.bench.cards.filter(c => c.instanceId !== target.instanceId);
      ctx.opponent.bench.cards.push(oldActive);
      ctx.log(`Erika's Invitation: 将对手的 ${target.card.name} 拉到战斗区`);
    },
  },
};

/** Unfair Stamp — Both players shuffle hands into deck. You draw 5, opponent draws 2 */
const unfairStamp: NamedEffect = {
  cardId: "name:Unfair Stamp",
  cardName: "Unfair Stamp",
  trainer: {
    onPlay: (ctx) => {
      // Both players shuffle hands into deck
      const myHandSize = ctx.player.hand.cards.length;
      const oppHandSize = ctx.opponent.hand.cards.length;

      ctx.shuffleIntoDeck([...ctx.player.hand.cards]);
      ctx.player.hand.cards = [];
      // Opponent
      for (const c of ctx.opponent.hand.cards) {
        ctx.opponent.deck.cards.push(c);
      }
      ctx.opponent.hand.cards = [];
      ctx.shuffleDeck("opponent" as any);

      // Draw
      ctx.drawCards(5);
      ctx.drawCards(2, "opponent");
      ctx.log(`Unfair Stamp: 双方洗回手牌，你抽5张，对手抽2张`);
    },
  },
};

/** Dark Patch — Attach Basic Darkness Energy from discard to benched Dark Pokemon */
const darkPatch: NamedEffect = {
  cardId: "name:Dark Patch",
  cardName: "Dark Patch",
  trainer: {
    canPlay: (ctx) => {
      const hasDarkEnergy = ctx.player.discard.cards.some(
        c => c.card.supertype === "Energy" && c.card.types?.includes("Darkness") && c.card.subtypes?.includes("Basic")
      );
      const hasDarkBench = ctx.player.bench.cards.some(c => c.card.types?.includes("Darkness"));
      return hasDarkEnergy && hasDarkBench;
    },
    onPlay: (ctx) => {
      const energy = ctx.player.discard.cards.find(
        c => c.card.supertype === "Energy" && c.card.types?.includes("Darkness") && c.card.subtypes?.includes("Basic")
      );
      const target = ctx.player.bench.cards.find(c => c.card.types?.includes("Darkness"));
      if (!energy || !target) return;

      ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== energy.instanceId);
      target.attachedEnergy.push(energy);
      ctx.log(`Dark Patch: 从弃牌堆附加暗能量给 ${target.card.name}`);
    },
  },
};

/** Superior Energy Retrieval — Discard 2 cards, put up to 4 Basic Energy from discard to hand */
const superiorEnergyRetrieval: NamedEffect = {
  cardId: "name:Superior Energy Retrieval",
  cardName: "Superior Energy Retrieval",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 2,
    onPlay: (ctx) => {
      // Discard 2 cards from hand
      const toDiscard = ctx.player.hand.cards.slice(0, 2);
      for (const c of toDiscard) {
        ctx.player.hand.cards = ctx.player.hand.cards.filter(h => h.instanceId !== c.instanceId);
        ctx.player.discard.cards.push(c);
      }

      // Retrieve up to 4 Basic Energy from discard
      const energies = ctx.player.discard.cards.filter(
        c => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic")
      );
      const toRetrieve = energies.slice(0, 4);
      for (const e of toRetrieve) {
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== e.instanceId);
        ctx.player.hand.cards.push(e);
      }
      ctx.log(`Superior Energy Retrieval: 弃2张手牌，取回 ${toRetrieve.length} 张基本能量`);
    },
  },
};

/** Luxurious Cape — Tool: non-Rule-Box Pokemon gets +100 HP */
const luxuriousCape: NamedEffect = {
  cardId: "name:Luxurious Cape",
  cardName: "Luxurious Cape",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Luxurious Cape: 装备成功（非规则盒宝可梦 HP+100）");
    },
  },
};

/** Supereffective Glasses — Tool: +30 damage when hitting weakness */
const supereffectiveGlasses: NamedEffect = {
  cardId: "name:Supereffective Glasses",
  cardName: "Supereffective Glasses",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Supereffective Glasses: 装备成功（打弱点时额外+30伤害）");
    },
  },
};

/** Heavy Baton — Tool: when KO'd, move up to 2 basic energy to bench Pokemon */
const heavyBaton: NamedEffect = {
  cardId: "name:Heavy Baton",
  cardName: "Heavy Baton",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Heavy Baton: 装备成功（被击倒时将最多2张基本能量转移给备战区宝可梦）");
    },
  },
};

/** Night Stretcher — Put 1 Pokemon or Basic Energy from discard to hand */
const nightStretcher: NamedEffect = {
  cardId: "name:Night Stretcher",
  cardName: "Night Stretcher",
  trainer: {
    onPlay: (ctx) => {
      // Search discard for 1 Pokemon or Basic Energy
      const target = ctx.player.discard.cards.find(
        c => c.card.supertype === "Pokémon" || (c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"))
      );
      if (target) {
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== target.instanceId);
        ctx.player.hand.cards.push(target);
        ctx.log(`Night Stretcher: 从弃牌堆取回 ${target.card.name}`);
      }
    },
  },
};

/** Buddy-Buddy Poffin — Search deck for up to 2 Basic Pokemon with 70 HP or less */
const buddyBuddyPoffin: NamedEffect = {
  cardId: "name:Buddy-Buddy Poffin",
  cardName: "Buddy-Buddy Poffin",
  trainer: {
    onPlay: (ctx) => {
      const benchSpace = 5 - ctx.player.bench.cards.length;
      if (benchSpace <= 0) return;
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic") && parseInt(c.card.hp || "999") <= 70,
        Math.min(2, benchSpace)
      );
      for (const card of found) {
        card.playedThisTurn = true;
        ctx.player.bench.cards.push(card);
      }
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Buddy-Buddy Poffin: 搜索了 ${found.map(c => c.card.name).join(", ")} 到备战区`);
    },
  },
};

export const metaTrainersW4Effects: NamedEffect[] = [
  irida,
  erikasInvitation,
  unfairStamp,
  darkPatch,
  superiorEnergyRetrieval,
  luxuriousCape,
  supereffectiveGlasses,
  heavyBaton,
  nightStretcher,
  buddyBuddyPoffin,
];
