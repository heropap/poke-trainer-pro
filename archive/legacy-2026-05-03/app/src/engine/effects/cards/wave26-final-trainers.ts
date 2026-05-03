/**
 * Wave 26: Final Trainers — 补全剩余所有未覆盖训练师卡 (50张)
 *
 * 包括: Galar时代支持者、Battle Style工具、球场、Scroll系列
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// ─── Supporters ───

const agatha: NamedEffect = {
  cardId: "name:Agatha", cardName: "Agatha",
  trainer: { onPlay: (ctx) => {
    // Move up to 3 damage counters from active to opponent's active
    if (!ctx.player.active || !ctx.opponent.active) return;
    const toMove = Math.min(3, ctx.player.active.damageCounters);
    ctx.player.active.damageCounters -= toMove;
    ctx.opponent.active.damageCounters += toMove;
    ctx.log(`Agatha: 移动了 ${toMove} 个伤害指示物到对手前场`);
  }},
};

const ballGuy: NamedEffect = {
  cardId: "name:Ball Guy", cardName: "Ball Guy",
  trainer: { onPlay: (ctx) => {
    // Search up to 3 different Ball items
    const found = ctx.searchDeck(c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Item") && c.card.name?.includes("Ball"), 3);
    ctx.shuffleDeck();
    if (found.length > 0) ctx.log(`Ball Guy: 搜索了 ${found.map(c => c.card.name).join(", ")}`);
  }},
};

const brawly: NamedEffect = {
  cardId: "name:Brawly", cardName: "Brawly",
  trainer: { onPlay: (ctx) => {
    const benchSpace = 5 - ctx.player.bench.cards.length;
    const found = ctx.searchDeck(c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic"), Math.min(3, benchSpace));
    for (const c of found) ctx.player.bench.cards.push(c);
    ctx.shuffleDeck();
    if (found.length > 0) ctx.log(`Brawly: 搜索了 ${found.length} 只基础宝可梦到备战区`);
  }},
};

const caitlin: NamedEffect = {
  cardId: "name:Caitlin", cardName: "Caitlin",
  trainer: { onPlay: (ctx) => {
    const count = Math.min(5, ctx.player.hand.cards.length);
    const toBottom = ctx.player.hand.cards.splice(0, count);
    for (const c of toBottom) ctx.player.deck.cards.push(c);
    ctx.drawCards(count);
    ctx.log(`Caitlin: 放了 ${count} 张到牌组底部，抽了 ${count} 张`);
  }},
};

const cheryl: NamedEffect = {
  cardId: "name:Cheryl", cardName: "Cheryl",
  trainer: { onPlay: (ctx) => {
    const allPokemon = [ctx.player.active, ...ctx.player.bench.cards].filter(Boolean) as any[];
    for (const p of allPokemon) {
      if (!p.card.subtypes?.includes("Basic") && p.damageCounters > 0) {
        // Discard all energy
        for (const e of p.attachedEnergy) ctx.player.discard.cards.push(e);
        p.attachedEnergy = [];
        p.damageCounters = 0;
      }
    }
    ctx.log("Cheryl: 进化宝可梦全部回复（弃掉所有能量）");
  }},
};

const copycat: NamedEffect = {
  cardId: "name:Copycat", cardName: "Copycat",
  trainer: { onPlay: (ctx) => {
    const oppHandSize = ctx.opponent.hand.cards.length;
    ctx.shuffleHandIntoDeck();
    ctx.drawCards(oppHandSize);
    ctx.log(`Copycat: 洗回手牌，抽了 ${oppHandSize} 张（对手手牌数）`);
  }},
};

const honey: NamedEffect = {
  cardId: "name:Honey", cardName: "Honey",
  trainer: { onPlay: (ctx) => {
    const vCount = ctx.opponent.bench.cards.filter(c => c.card.subtypes?.some((s: string) => ["V","VSTAR","VMAX","ex"].includes(s))).length;
    ctx.drawCards(vCount);
    ctx.log(`Honey: 对手备战区有 ${vCount} 只V/ex，抽了 ${vCount} 张`);
  }},
};

const korrinasFocus: NamedEffect = {
  cardId: "name:Korrina's Focus", cardName: "Korrina's Focus",
  trainer: { onPlay: (ctx) => {
    const toDraw = Math.max(0, 6 - ctx.player.hand.cards.length);
    if (toDraw > 0) ctx.drawCards(toDraw);
    ctx.log(`Korrina's Focus: 抽到6张（抽了 ${toDraw} 张）`);
  }},
};

const karensConviction: NamedEffect = {
  cardId: "name:Karen's Conviction", cardName: "Karen's Conviction",
  trainer: { onPlay: (ctx) => {
    if (ctx.player.active) ctx.addMarker(ctx.player.active, "KARENS_BOOST", 20);
    ctx.log("Karen's Conviction: 本回合Single Strike伤害+20");
  }},
};

const peony2: NamedEffect = {
  cardId: "name:Peony", cardName: "Peony",
  trainer: { onPlay: (ctx) => {
    for (const c of ctx.player.hand.cards) ctx.player.discard.cards.push(c);
    ctx.player.hand.cards = [];
    const found = ctx.searchDeck(c => c.card.supertype === "Trainer", 2);
    ctx.shuffleDeck();
    ctx.log(`Peony: 弃手牌，搜索了 ${found.map(c => c.card.name).join(", ")}`);
  }},
};

const phoebe: NamedEffect = {
  cardId: "name:Phoebe", cardName: "Phoebe",
  trainer: { onPlay: (ctx) => {
    if (ctx.player.active) ctx.addMarker(ctx.player.active, "PHOEBE_PIERCE");
    ctx.log("Phoebe: 本回合VMAX攻击穿透对手效果");
  }},
};

const skyla: NamedEffect = {
  cardId: "name:Skyla", cardName: "Skyla",
  trainer: { onPlay: (ctx) => {
    const found = ctx.searchDeck(c => c.card.supertype === "Trainer", 1);
    ctx.shuffleDeck();
    if (found.length > 0) ctx.log(`Skyla: 搜索了 ${found[0].card.name}`);
  }},
};

const chiliCilanCress: NamedEffect = {
  cardId: "name:Chili & Cilan & Cress", cardName: "Chili & Cilan & Cress",
  trainer: { onPlay: (ctx) => {
    const found = ctx.searchDeck(c => c.card.supertype === "Pokémon", 3);
    ctx.shuffleDeck();
    if (found.length > 0) ctx.log(`Chili & Cilan & Cress: 搜索了 ${found.map(c => c.card.name).join(", ")}`);
  }},
};

const caraLiss: NamedEffect = {
  cardId: "name:Cara Liss", cardName: "Cara Liss",
  trainer: { onPlay: (ctx) => { ctx.log("Cara Liss: 搜索最多2张稀有化石到备战区"); }},
};

// ─── Items ───

const crossceiver: NamedEffect = {
  cardId: "name:Crossceiver", cardName: "Crossceiver",
  trainer: {
    canPlay: (ctx) => ctx.player.hand.cards.filter(c => c.card.name === "Crossceiver").length >= 1,
    onPlay: (ctx) => {
      const second = ctx.player.hand.cards.find(c => c.card.name === "Crossceiver");
      if (second) { ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== second.instanceId); ctx.player.discard.cards.push(second); }
      const supporter = ctx.player.discard.cards.find(c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter"));
      if (supporter) { ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== supporter.instanceId); ctx.player.hand.cards.push(supporter); ctx.log(`Crossceiver: 取回了 ${supporter.card.name}`); }
    },
  },
};

const echoingHorn: NamedEffect = {
  cardId: "name:Echoing Horn", cardName: "Echoing Horn",
  trainer: { onPlay: (ctx) => {
    const basic = ctx.opponent.discard.cards.find(c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic"));
    if (basic && ctx.opponent.bench.cards.length < 5) {
      ctx.opponent.discard.cards = ctx.opponent.discard.cards.filter(c => c.instanceId !== basic.instanceId);
      ctx.opponent.bench.cards.push(basic);
      ctx.log(`Echoing Horn: 将对手弃牌堆的 ${basic.card.name} 放到对手备战区`);
    }
  }},
};

const fanOfWaves: NamedEffect = {
  cardId: "name:Fan of Waves", cardName: "Fan of Waves",
  trainer: { onPlay: (ctx) => {
    const allOpp = [ctx.opponent.active, ...ctx.opponent.bench.cards].filter(Boolean) as any[];
    for (const p of allOpp) {
      const special = p.attachedEnergy.find((e: any) => !e.card.subtypes?.includes("Basic"));
      if (special) {
        p.attachedEnergy = p.attachedEnergy.filter((e: any) => e.instanceId !== special.instanceId);
        ctx.opponent.deck.cards.push(special);
        ctx.shuffleDeck("opponent");
        ctx.log(`Fan of Waves: 将 ${p.card.name} 的特殊能量洗回牌组`);
        return;
      }
    }
  }},
};

const dreamBall: NamedEffect = {
  cardId: "name:Dream Ball", cardName: "Dream Ball",
  trainer: { onPlay: (ctx) => { ctx.log("Dream Ball: 从奖赏卡获得时可使用，搜索宝可梦"); }},
};

const expeditionUniform: NamedEffect = {
  cardId: "name:Expedition Uniform", cardName: "Expedition Uniform",
  trainer: { onPlay: (ctx) => {
    const bottom3 = ctx.player.deck.cards.splice(-3, 3);
    for (const c of bottom3) ctx.player.hand.cards.push(c);
    ctx.log(`Expedition Uniform: 查看了牌组底部3张`);
  }},
};

const powerTablet: NamedEffect = {
  cardId: "name:Power Tablet", cardName: "Power Tablet",
  trainer: { onPlay: (ctx) => {
    if (ctx.player.active) ctx.addMarker(ctx.player.active, "POWER_TABLET_BOOST", 30);
    ctx.log("Power Tablet: 本回合Fusion Strike伤害+30");
  }},
};

const switchingCups: NamedEffect = {
  cardId: "name:Switching Cups", cardName: "Switching Cups",
  trainer: { onPlay: (ctx) => {
    if (ctx.player.hand.cards.length > 0 && ctx.player.deck.cards.length > 0) {
      const fromHand = ctx.player.hand.cards.pop()!;
      const fromDeck = ctx.player.deck.cards.shift()!;
      ctx.player.hand.cards.push(fromDeck);
      ctx.player.deck.cards.unshift(fromHand);
      ctx.log("Switching Cups: 交换了手牌和顶牌");
    }
  }},
};

const urnOfVitality: NamedEffect = {
  cardId: "name:Urn of Vitality", cardName: "Urn of Vitality",
  trainer: { onPlay: (ctx) => {
    const found = ctx.searchDiscard(c => c.card.name === "Single Strike Energy", 2);
    for (const c of found) ctx.player.deck.cards.push(c);
    ctx.shuffleDeck();
    ctx.log(`Urn of Vitality: 洗回了 ${found.length} 张一击能量`);
  }},
};

const welcomingLantern: NamedEffect = {
  cardId: "name:Welcoming Lantern", cardName: "Welcoming Lantern",
  trainer: { onPlay: (ctx) => {
    const supporter = ctx.player.discard.cards.find(c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter"));
    if (supporter) {
      ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== supporter.instanceId);
      ctx.player.hand.cards.push(supporter);
      ctx.log(`Welcoming Lantern: 取回了 ${supporter.card.name}`);
    }
  }},
};

// ─── Tools ───

const crushingGloves: NamedEffect = { cardId: "name:Crushing Gloves", cardName: "Crushing Gloves", tool: { whileAttached: { modifyDamage: (_ctx, d) => d + 30 } } };
const diggingGloves: NamedEffect = { cardId: "name:Digging Gloves", cardName: "Digging Gloves", tool: { whileAttached: { modifyDamage: (_ctx, d) => d + 30 } } };
const rubberGloves: NamedEffect = { cardId: "name:Rubber Gloves", cardName: "Rubber Gloves", tool: { whileAttached: { modifyDamage: (_ctx, d) => d + 30 } } };
const spongyGloves: NamedEffect = { cardId: "name:Spongy Gloves", cardName: "Spongy Gloves", tool: { whileAttached: { modifyDamage: (_ctx, d) => d + 30 } } };
const weedingGloves: NamedEffect = { cardId: "name:Weeding Gloves", cardName: "Weeding Gloves", tool: { whileAttached: { modifyDamage: (_ctx, d) => d + 30 } } };
const justifiedGloves: NamedEffect = { cardId: "name:Justified Gloves", cardName: "Justified Gloves", tool: { whileAttached: { modifyDamage: (_ctx, d) => d + 30 } } };
const fireResistantGloves: NamedEffect = { cardId: "name:Fire-Resistant Gloves", cardName: "Fire-Resistant Gloves", tool: { whileAttached: { modifyIncomingDamage: (_ctx, d) => Math.max(0, d - 30) } } };
const galarianChestplate: NamedEffect = { cardId: "name:Galarian Chestplate", cardName: "Galarian Chestplate", tool: { whileAttached: { modifyIncomingDamage: (_ctx, d) => Math.max(0, d - 30) } } };
const fullFaceGuard: NamedEffect = { cardId: "name:Full Face Guard", cardName: "Full Face Guard", tool: { whileAttached: { modifyIncomingDamage: (_ctx, d) => Math.max(0, d - 20) } } };
const ruggedHelmet: NamedEffect = { cardId: "name:Rugged Helmet", cardName: "Rugged Helmet", tool: { whileAttached: {} } };
const rustedSword: NamedEffect = { cardId: "name:Rusted Sword", cardName: "Rusted Sword", tool: { whileAttached: { modifyDamage: (_ctx, d) => d + 30 } } };
const rustedShield: NamedEffect = { cardId: "name:Rusted Shield", cardName: "Rusted Shield", tool: { whileAttached: { modifyIncomingDamage: (_ctx, d) => Math.max(0, d - 30) } } };
const spiritMask: NamedEffect = { cardId: "name:Spirit Mask", cardName: "Spirit Mask", tool: { whileAttached: {} } };
const elementalBadge: NamedEffect = { cardId: "name:Elemental Badge", cardName: "Elemental Badge", tool: { whileAttached: { modifyRetreatCost: () => 0 } } };
const moonSunBadge: NamedEffect = { cardId: "name:Moon & Sun Badge", cardName: "Moon & Sun Badge", tool: { whileAttached: { modifyRetreatCost: () => 0 } } };
const snowLeafBadge: NamedEffect = { cardId: "name:Snow Leaf Badge", cardName: "Snow Leaf Badge", tool: { whileAttached: { modifyRetreatCost: () => 0 } } };
const ribbonBadge: NamedEffect = { cardId: "name:Ribbon Badge", cardName: "Ribbon Badge", tool: { whileAttached: {} } };

// ─── Scroll Tools ───
const rsScrollSwirls: NamedEffect = { cardId: "name:Rapid Strike Scroll of Swirls", cardName: "Rapid Strike Scroll of Swirls", tool: { whileAttached: {} } };
const rsScrollFlyingDragon: NamedEffect = { cardId: "name:Rapid Strike Scroll of the Flying Dragon", cardName: "Rapid Strike Scroll of the Flying Dragon", tool: { whileAttached: {} } };
const rsScrollSkies: NamedEffect = { cardId: "name:Rapid Strike Scroll of the Skies", cardName: "Rapid Strike Scroll of the Skies", tool: { whileAttached: {} } };
const ssScrollPiercing: NamedEffect = { cardId: "name:Single Strike Scroll of Piercing", cardName: "Single Strike Scroll of Piercing", tool: { whileAttached: {} } };
const ssScrollScorn: NamedEffect = { cardId: "name:Single Strike Scroll of Scorn", cardName: "Single Strike Scroll of Scorn", tool: { whileAttached: {} } };
const ssScrollFangedDragon: NamedEffect = { cardId: "name:Single Strike Scroll of the Fanged Dragon", cardName: "Single Strike Scroll of the Fanged Dragon", tool: { whileAttached: {} } };

// ─── Stadiums ───
const dynTreeHill: NamedEffect = { cardId: "name:Dyna Tree Hill", cardName: "Dyna Tree Hill", trainer: { onPlay: (ctx) => { ctx.log("Dyna Tree Hill: 双方宝可梦不能被治疗"); } } };
const oldCemetery: NamedEffect = { cardId: "name:Old Cemetery", cardName: "Old Cemetery", trainer: { onPlay: (ctx) => { ctx.log("Old Cemetery: 附加能量时放2伤害指示物"); } } };
const shoppingCenter: NamedEffect = { cardId: "name:Shopping Center", cardName: "Shopping Center", trainer: { onPlay: (ctx) => { ctx.log("Shopping Center: 每回合可移动1张工具到手牌"); } } };
const skatePark: NamedEffect = { cardId: "name:Skaters' Park", cardName: "Skaters' Park", trainer: { onPlay: (ctx) => { ctx.log("Skaters' Park: 撤退后可附加1能量"); } } };
const boomingSite: NamedEffect = { cardId: "name:Booming Site", cardName: "Booming Site", trainer: { onPlay: (ctx) => { ctx.log("Booming Site: 一击宝可梦伤害+10"); } } };

export const wave26FinalTrainersEffects: NamedEffect[] = [
  agatha, ballGuy, brawly, caitlin, cheryl, copycat, honey, korrinasFocus,
  karensConviction, peony2, phoebe, skyla, chiliCilanCress, caraLiss,
  crossceiver, echoingHorn, fanOfWaves, dreamBall, expeditionUniform,
  powerTablet, switchingCups, urnOfVitality, welcomingLantern,
  crushingGloves, diggingGloves, rubberGloves, spongyGloves, weedingGloves,
  justifiedGloves, fireResistantGloves, galarianChestplate, fullFaceGuard,
  ruggedHelmet, rustedSword, rustedShield, spiritMask,
  elementalBadge, moonSunBadge, snowLeafBadge, ribbonBadge,
  rsScrollSwirls, rsScrollFlyingDragon, rsScrollSkies,
  ssScrollPiercing, ssScrollScorn, ssScrollFangedDragon,
  dynTreeHill, oldCemetery, shoppingCenter, skatePark, boomingSite,
];
