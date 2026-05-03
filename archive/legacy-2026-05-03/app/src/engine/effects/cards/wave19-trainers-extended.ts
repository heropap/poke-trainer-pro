/**
 * Wave 19: Trainers Extended — F/G标剩余重要训练师
 *
 * 卡效果清单 (15):
 *  1. Klara — Recover 2 Pokemon + 2 Basic Energy from discard
 *  2. Peonia — Take up to 3 prize cards, shuffle same number back
 *  3. Melony — Attach Water energy from discard + draw 3
 *  4. Raihan — Attach any energy from discard + search any 1 card
 *  5. Elesa's Sparkle — Attach 2 Fusion Energy from deck
 *  6. Sidney — Opponent discards all Special Energy in play
 *  7. Gloria — Search deck for 3 Basic Pokemon to bench
 *  8. Cook — Both heal 70 from active
 *  9. Sky Seal Stone — VSTAR Power: take extra prize on KO
 * 10. Gutsy Pickaxe — Reveal top, if Fighting energy attach
 * 11. Ordinary Rod — Choose: 2 Pokemon or 2 Energy from discard to deck
 * 12. Quick Ball — Discard 1, search Basic Pokemon
 * 13. Evolution Incense — Search for Evolution Pokemon
 * 14. Feather Ball — Search for no-retreat-cost Pokemon
 * 15. VIP Pass — Search 2 Basic Pokemon to bench (turn 1 only)
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const klara: NamedEffect = {
  cardId: "name:Klara",
  cardName: "Klara",
  trainer: {
    onPlay: (ctx) => {
      const pokemon = ctx.searchDiscard(c => c.card.supertype === "Pokémon", 2);
      const energy = ctx.searchDiscard(
        c => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"),
        2
      );
      const all = [...pokemon, ...energy];
      if (all.length > 0) ctx.log(`Klara: 取回了 ${all.map(c => c.card.name).join(", ")}`);
    },
  },
};

const peonia: NamedEffect = {
  cardId: "name:Peonia",
  cardName: "Peonia",
  trainer: {
    canPlay: (ctx) => ctx.player.prizes.cards.length > 0,
    onPlay: (ctx) => {
      // Take up to 3 prizes to hand, shuffle same number from hand to prizes
      const toTake = Math.min(3, ctx.player.prizes.cards.length);
      const taken = ctx.player.prizes.cards.splice(0, toTake);
      for (const c of taken) ctx.player.hand.cards.push(c);
      // Shuffle same number from hand back to prizes
      const toReturn = ctx.player.hand.cards.splice(0, toTake);
      for (const c of toReturn) ctx.player.prizes.cards.push(c);
      ctx.log(`Peonia: 查看了 ${toTake} 张奖赏卡`);
    },
  },
};

const melony: NamedEffect = {
  cardId: "name:Melony",
  cardName: "Melony",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.discard.cards.some(
        c => c.card.supertype === "Energy" && c.card.name?.includes("Water") && c.card.subtypes?.includes("Basic")
      );
    },
    onPlay: (ctx) => {
      const water = ctx.player.discard.cards.find(
        c => c.card.supertype === "Energy" && c.card.name?.includes("Water") && c.card.subtypes?.includes("Basic")
      );
      if (water) {
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== water.instanceId);
        const target = ctx.player.active || ctx.player.bench.cards[0];
        if (target) target.attachedEnergy.push(water);
      }
      ctx.drawCards(3);
      ctx.log("Melony: 附加水能量，抽了3张");
    },
  },
};

const raihan: NamedEffect = {
  cardId: "name:Raihan",
  cardName: "Raihan",
  trainer: {
    onPlay: (ctx) => {
      // Attach any Basic energy from discard
      const energy = ctx.player.discard.cards.find(
        c => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic")
      );
      if (energy) {
        ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== energy.instanceId);
        const target = ctx.player.active || ctx.player.bench.cards[0];
        if (target) target.attachedEnergy.push(energy);
      }
      // Search any 1 card
      const found = ctx.searchDeck(() => true, 1);
      ctx.shuffleDeck();
      ctx.log(`Raihan: 附加能量 + 搜索了 ${found.length > 0 ? found[0].card.name : "无"}`);
    },
  },
};

const elesasSparkle: NamedEffect = {
  cardId: "name:Elesa's Sparkle",
  cardName: "Elesa's Sparkle",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(
        c => c.card.supertype === "Energy" && c.card.name?.includes("Fusion Strike"),
        2
      );
      const targets = [ctx.player.active, ...ctx.player.bench.cards]
        .filter((p: any) => p?.card.subtypes?.some((s: string) => s.includes("Fusion Strike")));
      for (let i = 0; i < found.length; i++) {
        const target = targets[i % Math.max(1, targets.length)] || ctx.player.active;
        if (target) target.attachedEnergy.push(found[i]);
      }
      ctx.shuffleDeck();
      ctx.log(`Elesa's Sparkle: 附加了 ${found.length} 张Fusion能量`);
    },
  },
};

const sidney: NamedEffect = {
  cardId: "name:Sidney",
  cardName: "Sidney",
  trainer: {
    onPlay: (ctx) => {
      // Opponent discards all Special Energy from all their Pokemon
      const allOpp = [ctx.opponent.active, ...ctx.opponent.bench.cards].filter(Boolean) as any[];
      let count = 0;
      for (const p of allOpp) {
        const specials = p.attachedEnergy.filter((e: any) => !e.card.subtypes?.includes("Basic"));
        for (const s of specials) {
          p.attachedEnergy = p.attachedEnergy.filter((e: any) => e.instanceId !== s.instanceId);
          ctx.opponent.discard.cards.push(s);
          count++;
        }
      }
      ctx.log(`Sidney: 弃掉了对手场上 ${count} 张特殊能量`);
    },
  },
};

const gloria: NamedEffect = {
  cardId: "name:Gloria",
  cardName: "Gloria",
  trainer: {
    onPlay: (ctx) => {
      const benchSpace = 5 - ctx.player.bench.cards.length;
      if (benchSpace <= 0) return;
      const found = ctx.searchDeck(
        c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic"),
        Math.min(3, benchSpace)
      );
      for (const c of found) ctx.player.bench.cards.push(c);
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Gloria: 搜索了 ${found.map(c => c.card.name).join(", ")} 到备战区`);
    },
  },
};

const skySealStone: NamedEffect = {
  cardId: "name:Sky Seal Stone",
  cardName: "Sky Seal Stone",
  trainer: {
    onPlay: (ctx) => {
      ctx.log("Sky Seal Stone: 装备成功（V宝可梦获得VSTAR Power: 击倒时额外取1奖赏）");
    },
  },
};

const gutsyPickaxe: NamedEffect = {
  cardId: "name:Gutsy Pickaxe",
  cardName: "Gutsy Pickaxe",
  trainer: {
    onPlay: (ctx) => {
      const top = ctx.revealTopCards(1);
      if (top.length > 0) {
        const card = top[0];
        if (card.card.supertype === "Energy" && (card.card.name?.includes("Fighting") || card.card.types?.includes("Fighting"))) {
          const target = ctx.player.active || ctx.player.bench.cards[0];
          if (target) {
            target.attachedEnergy.push(card);
            ctx.log(`Gutsy Pickaxe: 翻到了格斗能量，附加给 ${target.card.name}`);
            return;
          }
        }
        ctx.player.deck.cards.unshift(card); // Put back on top
        ctx.log(`Gutsy Pickaxe: 翻到了 ${card.card.name}，放回顶部`);
      }
    },
  },
};

const ordinaryRod: NamedEffect = {
  cardId: "name:Ordinary Rod",
  cardName: "Ordinary Rod",
  trainer: {
    onPlay: (ctx) => {
      // Auto: return 2 Pokemon from discard to deck
      const pokemon = ctx.player.discard.cards.filter(c => c.card.supertype === "Pokémon").slice(0, 2);
      for (const c of pokemon) {
        ctx.player.discard.cards = ctx.player.discard.cards.filter(d => d.instanceId !== c.instanceId);
        ctx.player.deck.cards.push(c);
      }
      ctx.shuffleDeck();
      ctx.log(`Ordinary Rod: 将 ${pokemon.map(c => c.card.name).join(", ")} 洗回牌组`);
    },
  },
};

const quickBall: NamedEffect = {
  cardId: "name:Quick Ball",
  cardName: "Quick Ball",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.length >= 1,
    onPlay: (ctx) => {
      // Discard 1 from hand
      if (ctx.player.hand.cards.length > 0) {
        const d = ctx.player.hand.cards.pop()!;
        ctx.player.discard.cards.push(d);
      }
      const found = ctx.searchDeck(
        c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic"),
        1
      );
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Quick Ball: 搜索了 ${found[0].card.name}`);
    },
  },
};

const evolutionIncense: NamedEffect = {
  cardId: "name:Evolution Incense",
  cardName: "Evolution Incense",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(
        c => c.card.supertype === "Pokémon" && !c.card.subtypes?.includes("Basic"),
        1
      );
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Evolution Incense: 搜索了 ${found[0].card.name}`);
    },
  },
};

const featherBall: NamedEffect = {
  cardId: "name:Feather Ball",
  cardName: "Feather Ball",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(
        c => c.card.supertype === "Pokémon" && (parseInt(c.card.retreatCost?.length?.toString() || "0") === 0),
        1
      );
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Feather Ball: 搜索了 ${found[0].card.name}`);
    },
  },
};

export const wave19TrainersExtendedEffects: NamedEffect[] = [
  klara, peonia, melony, raihan, elesasSparkle, sidney,
  gloria, skySealStone, gutsyPickaxe, ordinaryRod,
  quickBall, evolutionIncense, featherBall,
];
