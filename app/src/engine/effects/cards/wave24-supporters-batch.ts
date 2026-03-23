/**
 * Wave 24: Remaining Important Supporters — 剩余重要支持者
 *
 * 卡效果清单 (15):
 *  1. Cynthia's Ambition — draw 4 (draw 8 if Pokemon was KO'd)
 *  2. Marnie's Pride — attach Basic energy from discard to bench
 *  3. Cheren's Care — heal and return V to hand
 *  4. Serena — discard 3 or switch opponent active
 *  5. Colress — draw based on bench count (both sides)
 *  6. Kindler — discard 1 fire, draw 3
 *  7. Professor Burnet — discard top 3 of deck
 *  8. Roseanne's Backup — 4 cards from discard (Pokemon/Energy/Stadium combo)
 *  9. Miriam — shuffle 5 Pokemon from discard to deck
 * 10. Hassel — draw until 8 (must have Stage 2)
 * 11. Poppy — return energy from active to hand
 * 12. Volo — draw until both hands equal
 * 13. Saguaro — heal 50 from 1 Pokemon
 * 14. Kofu — discard 1, search 2 items
 * 15. Nessa — return up to 4 Water Pokemon/Energy from discard
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const cynthiasAmbition: NamedEffect = {
  cardId: "name:Cynthia's Ambition",
  cardName: "Cynthia's Ambition",
  trainer: {
    onPlay: (ctx) => {
      // Draw 4; if a Pokemon was KO'd last turn, draw 8 instead
      const wasKOd = ctx.hasMarker(ctx.source, "pokemon_koed_last_turn") ||
        (ctx.state as any).lastTurnKO;
      const drawCount = wasKOd ? 8 : 4;
      ctx.drawCards(drawCount);
      ctx.log(`Cynthia's Ambition: 抽了 ${drawCount} 张`);
    },
  },
};

const marniesPride: NamedEffect = {
  cardId: "name:Marnie's Pride",
  cardName: "Marnie's Pride",
  trainer: {
    onPlay: (ctx) => {
      // Attach Basic energy from discard to a benched Pokemon
      if (ctx.player.bench.cards.length > 0) {
        const target = ctx.player.bench.cards[0];
        const attached = ctx.attachEnergyFromDiscard(
          c => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"),
          1,
          target
        );
        if (attached.length > 0) {
          ctx.log(`Marnie's Pride: 给 ${target.card.name} 附加了 ${attached[0].card.name}`);
        }
      }
    },
  },
};

const cherensCare: NamedEffect = {
  cardId: "name:Cheren's Care",
  cardName: "Cheren's Care",
  trainer: {
    canPlay: (ctx) => {
      // Must have a V Pokemon with damage
      const allPokemon = ctx.getAllPokemon();
      return allPokemon.some(
        p => p.card.subtypes?.some(s => s.includes("V")) && p.damageCounters > 0
      );
    },
    onPlay: (ctx) => {
      // Heal all damage from a V Pokemon, return it to hand (discard energy)
      const allPokemon = ctx.getAllPokemon();
      const target = allPokemon.find(
        p => p.card.subtypes?.some(s => s.includes("V")) && p.damageCounters > 0
      );
      if (target) {
        const pickedUp = ctx.pickUpPokemon(target.instanceId);
        // Only the Pokemon goes to hand, energy is discarded
        for (const c of pickedUp) {
          if (c.card.supertype === "Energy") {
            ctx.player.discard.cards.push(c);
          } else {
            ctx.addToHand(c);
          }
        }
        ctx.log(`Cheren's Care: ${target.card.name} 回到手牌并完全治愈`);
      }
    },
  },
};

const serena: NamedEffect = {
  cardId: "name:Serena",
  cardName: "Serena",
  trainer: {
    onPlay: (ctx) => {
      // Choose: discard 3, draw 3 OR switch opponent's active
      // Simplified: if opponent has bench, switch; otherwise draw
      if (ctx.opponent.bench.cards.length > 0) {
        const target = ctx.opponent.bench.cards[0];
        ctx.switchOpponentActive(target.instanceId);
        ctx.log(`Serena: 切换了对手活跃宝可梦为 ${target.card.name}`);
      } else {
        ctx.discardFromHand(3);
        ctx.drawCards(3);
        ctx.log("Serena: 弃3抽3");
      }
    },
  },
};

const colress: NamedEffect = {
  cardId: "name:Colress",
  cardName: "Colress",
  trainer: {
    onPlay: (ctx) => {
      // Draw cards equal to total bench Pokemon (both players)
      const totalBench = ctx.player.bench.cards.length + ctx.opponent.bench.cards.length;
      const drawCount = Math.min(totalBench, 10);
      ctx.drawCards(drawCount);
      ctx.log(`Colress: 后备区共 ${totalBench} 只，抽了 ${drawCount} 张`);
    },
  },
};

const kindler: NamedEffect = {
  cardId: "name:Kindler",
  cardName: "Kindler",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.hand.cards.some(
        c => c.card.supertype === "Energy" && c.card.name?.includes("Fire")
      );
    },
    onPlay: (ctx) => {
      // Discard 1 Fire energy from hand, draw 3
      const fireIdx = ctx.player.hand.cards.findIndex(
        c => c.card.supertype === "Energy" && c.card.name?.includes("Fire")
      );
      if (fireIdx >= 0) {
        const [fire] = ctx.player.hand.cards.splice(fireIdx, 1);
        ctx.player.discard.cards.push(fire);
      }
      ctx.drawCards(3);
      ctx.log("Kindler: 弃掉1张火能量，抽了3张");
    },
  },
};

const professorBurnet: NamedEffect = {
  cardId: "name:Professor Burnet",
  cardName: "Professor Burnet",
  trainer: {
    onPlay: (ctx) => {
      // Discard top 3 cards of deck
      const top3 = ctx.revealTopCards(3);
      for (const c of top3) {
        ctx.player.discard.cards.push(c);
      }
      ctx.log(`Professor Burnet: 弃掉了卡组顶部 ${top3.length} 张`);
    },
  },
};

const roseannesBackup: NamedEffect = {
  cardId: "name:Roseanne's Backup",
  cardName: "Roseanne's Backup",
  trainer: {
    onPlay: (ctx) => {
      // Recover up to 4 cards from discard (combo of Pokemon, Energy, Stadium)
      const recovered = ctx.searchDiscard(() => true, 4);
      for (const c of recovered) {
        ctx.shuffleIntoDeck([c]);
      }
      ctx.log(`Roseanne's Backup: 回收了 ${recovered.length} 张到卡组`);
    },
  },
};

const miriam: NamedEffect = {
  cardId: "name:Miriam",
  cardName: "Miriam",
  trainer: {
    onPlay: (ctx) => {
      // Shuffle up to 5 Pokemon from discard into deck
      const pokemon = ctx.searchDiscard(
        c => c.card.supertype === "Pokémon",
        5
      );
      if (pokemon.length > 0) {
        ctx.shuffleIntoDeck(pokemon);
        ctx.log(`Miriam: 回收了 ${pokemon.length} 只宝可梦到卡组`);
      }
    },
  },
};

const hassel: NamedEffect = {
  cardId: "name:Hassel",
  cardName: "Hassel",
  trainer: {
    canPlay: (ctx) => {
      // Must have a Stage 2 Pokemon in play
      const allPokemon = ctx.getAllPokemon();
      return allPokemon.some(p => p.card.subtypes?.includes("Stage 2"));
    },
    onPlay: (ctx) => {
      // Draw until you have 8 cards in hand
      const toDraw = Math.max(0, 8 - ctx.player.hand.cards.length);
      if (toDraw > 0) {
        ctx.drawCards(toDraw);
        ctx.log(`Hassel: 补到8张，抽了 ${toDraw} 张`);
      }
    },
  },
};

const poppy: NamedEffect = {
  cardId: "name:Poppy",
  cardName: "Poppy",
  trainer: {
    canPlay: (ctx) => {
      return (ctx.player.active?.attachedEnergy.length ?? 0) > 0;
    },
    onPlay: (ctx) => {
      // Return up to 2 energy from active to hand
      if (ctx.player.active) {
        const toReturn = Math.min(2, ctx.player.active.attachedEnergy.length);
        for (let i = 0; i < toReturn; i++) {
          const energy = ctx.player.active.attachedEnergy.pop()!;
          ctx.addToHand(energy);
        }
        ctx.log(`Poppy: 回收了 ${toReturn} 个能量到手牌`);
      }
    },
  },
};

const volo: NamedEffect = {
  cardId: "name:Volo",
  cardName: "Volo",
  trainer: {
    onPlay: (ctx) => {
      // Draw until both hands are equal (the smaller hand draws)
      const playerCount = ctx.player.hand.cards.length;
      const oppCount = ctx.opponent.hand.cards.length;
      if (playerCount < oppCount) {
        const toDraw = oppCount - playerCount;
        ctx.drawCards(toDraw);
        ctx.log(`Volo: 你抽了 ${toDraw} 张使手牌数相等`);
      } else if (oppCount < playerCount) {
        const toDraw = playerCount - oppCount;
        ctx.drawCards(toDraw, "opponent");
        ctx.log(`Volo: 对手抽了 ${toDraw} 张使手牌数相等`);
      }
    },
  },
};

const saguaro: NamedEffect = {
  cardId: "name:Saguaro",
  cardName: "Saguaro",
  trainer: {
    onPlay: (ctx) => {
      // Heal 50 from 1 Pokemon
      if (ctx.player.active && ctx.player.active.damageCounters > 0) {
        ctx.heal(50, ctx.player.active);
        ctx.log(`Saguaro: 治愈了 ${ctx.player.active.card.name} 50HP`);
      }
    },
  },
};

const kofu: NamedEffect = {
  cardId: "name:Kofu",
  cardName: "Kofu",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 1,
    onPlay: (ctx) => {
      // Discard 1 card, search deck for 2 Item cards
      ctx.discardFromHand(1);
      const found = ctx.searchDeck(
        c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item"),
        2
      );
      ctx.shuffleDeck();
      if (found.length > 0) {
        ctx.log(`Kofu: 搜索了 ${found.map(c => c.card.name).join(", ")}`);
      }
    },
  },
};

const nessa: NamedEffect = {
  cardId: "name:Nessa",
  cardName: "Nessa",
  trainer: {
    onPlay: (ctx) => {
      // Return up to 4 Water Pokemon/Energy from discard to hand
      const waterCards = ctx.searchDiscard(
        c =>
          (c.card.supertype === "Pokémon" && c.card.types?.includes("Water")) ||
          (c.card.supertype === "Energy" && c.card.name?.includes("Water")),
        4
      );
      for (const c of waterCards) {
        ctx.addToHand(c);
      }
      ctx.log(`Nessa: 从弃牌区回收了 ${waterCards.length} 张水系卡`);
    },
  },
};

export const wave24SupportersBatchEffects: NamedEffect[] = [
  cynthiasAmbition, marniesPride, cherensCare, serena, colress,
  kindler, professorBurnet, roseannesBackup, miriam, hassel,
  poppy, volo, saguaro, kofu, nessa,
];
