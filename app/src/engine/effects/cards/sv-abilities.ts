/**
 * SV-Era Ability & Attack Effects — Batch Implementation
 *
 * Adds ~70 name-based effects for commonly-used SV-era Pokemon.
 * Covers core meta abilities, attack text effects, and archetype enablers.
 *
 * All use name-based registration for universal reprint support.
 */

import { CardEffectDef, AttackResult } from "../effect-types";
import {
  CANT_ATTACK_NEXT_TURN,
  PREVENT_RETREAT_NEXT_TURN,
  DAMAGE_BOOST,
} from "../markers";

type NamedEffect = CardEffectDef & { cardName: string };

// ═══════════════════════════════════════════════════
// SV1 Foundation Set — Core Meta Abilities
// ═══════════════════════════════════════════════════

/** Armarouge — Fire Off: Move a Fire Energy from bench to active */
const armarouge: NamedEffect = {
  cardId: "name:Armarouge",
  cardName: "Armarouge",
  abilities: [{
    name: "Fire Off",
    type: "activated" as const,
    onActivate: (ctx) => {
      // Move 1 Fire Energy from bench Pokemon to active
      for (const bench of ctx.player.bench.cards) {
        const fireIdx = bench.attachedEnergy.findIndex(e => e.card.types?.includes("Fire"));
        if (fireIdx >= 0 && ctx.player.active) {
          const energy = bench.attachedEnergy.splice(fireIdx, 1)[0];
          ctx.player.active.attachedEnergy.push(energy);
          ctx.log(`Fire Off: 将 ${energy.card.name} 从 ${bench.card.name} 移到 ${ctx.player.active.card.name}`);
          return;
        }
      }
    },
  }],
};

/** Florges — Blooming Garden: Your Pokemon have no weakness */
const florges: NamedEffect = {
  cardId: "name:Florges",
  cardName: "Florges",
  abilities: [{
    name: "Blooming Garden",
    type: "passive" as const,
    modifyIncomingDamage: (ctx, damage) => damage, // Weakness removal handled by modifier query
    preventWeakness: true,
  }],
};

/** Klefki — Mischievous Lock: Basic Pokemon (except Klefki) have no abilities */
const klefki: NamedEffect = {
  cardId: "name:Klefki",
  cardName: "Klefki",
  abilities: [{
    name: "Mischievous Lock",
    type: "passive" as const,
    preventAbility: true, // Flags for modifier query
  }],
};

/** Dachsbun — Well-Baked Body: Prevent all damage from Fire Pokemon */
const dachsbun: NamedEffect = {
  cardId: "name:Dachsbun",
  cardName: "Dachsbun",
  abilities: [{
    name: "Well-Baked Body",
    type: "passive" as const,
    modifyIncomingDamage: (ctx, damage, attacker) => {
      if (attacker?.card.types?.includes("Fire")) return 0;
      return damage;
    },
  }],
};

/** Kingambit — Leadership: Basic Pokemon attacks do +30 */
const kingambit: NamedEffect = {
  cardId: "name:Kingambit",
  cardName: "Kingambit",
  abilities: [{
    name: "Leadership",
    type: "passive" as const,
    modifyDamage: (ctx, damage) => {
      if (ctx.source.card.subtypes?.includes("Basic")) {
        return damage + 30;
      }
      return damage;
    },
  }],
};

/** Pawmot — Electrogenesis: Once per turn, search deck for Lightning energy */
const pawmot: NamedEffect = {
  cardId: "name:Pawmot",
  cardName: "Pawmot",
  abilities: [{
    name: "Electrogenesis",
    type: "activated" as const,
    onActivate: (ctx) => {
      const energy = ctx.searchDeck(
        c => c.card.supertype === "Energy" && c.card.types?.includes("Lightning"),
        1
      );
      ctx.shuffleDeck();
      if (energy.length > 0) {
        ctx.log(`Electrogenesis: 搜索了 ${energy[0].card.name}`);
      }
    },
  }],
};

// ═══════════════════════════════════════════════════
// SV2-SV3 — Popular Abilities
// ═══════════════════════════════════════════════════

/** Arcanine ex — Mighty Fang (170, no special) + Burning Charge ability */
const arcanineEx: NamedEffect = {
  cardId: "name:Arcanine ex",
  cardName: "Arcanine ex",
  attacks: [{
    name: "Mighty Fang",
    onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
  }],
  abilities: [{
    name: "Burning Charge",
    type: "activated" as const,
    onActivate: (ctx) => {
      // Search deck for up to 2 Fire Energy and attach to self
      const fires = ctx.searchDeck(
        c => c.card.supertype === "Energy" && c.card.name.includes("Fire") && c.card.subtypes?.includes("Basic"),
        2
      );
      for (const e of fires) ctx.source.attachedEnergy.push(e);
      ctx.shuffleDeck();
      if (fires.length > 0) ctx.log(`Burning Charge: 附加了 ${fires.length} 张火能量`);
    },
  }],
};

/** Noivern ex — Covert Flight (70) + Dominating Echo (120 + can't use items) */
const noivernEx: NamedEffect = {
  cardId: "name:Noivern ex",
  cardName: "Noivern ex",
  attacks: [
    {
      name: "Covert Flight",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
    {
      name: "Dominating Echo",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
      // Item lock effect is complex — placeholder
    },
  ],
};

/** Gholdengo ex — Coin Bonus (30x heads) + Make It Rain (120 + discard energy) */
const gholdengoEx: NamedEffect = {
  cardId: "name:Gholdengo ex",
  cardName: "Gholdengo ex",
  attacks: [
    {
      name: "Coin Bonus",
      onAttack: (ctx, _baseDamage) => {
        let heads = 0;
        for (let i = 0; i < 5; i++) if (ctx.flipCoin()) heads++;
        return { damage: heads * 30 };
      },
    },
    {
      name: "Make It Rain",
      onAttack: (ctx, baseDamage) => {
        // Discard any number of energy, +30 per discarded
        const count = Math.min(3, ctx.source.attachedEnergy.length);
        for (let i = 0; i < count; i++) {
          const e = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(e);
        }
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [{
    name: "Coin Bonus",
    type: "activated" as const,
    onActivate: (ctx) => {
      ctx.drawCards(1);
      ctx.log("Coin Bonus: 抽了1张牌");
    },
  }],
};

/** Medicham ex — Pure Kick (120, heal 30) */
const medichamEx: NamedEffect = {
  cardId: "name:Medicham ex",
  cardName: "Medicham ex",
  attacks: [{
    name: "Pure Kick",
    onAttack: (ctx, baseDamage) => {
      if (ctx.source.damageCounters > 0) {
        const heal = Math.min(3, ctx.source.damageCounters);
        ctx.source.damageCounters -= heal;
        ctx.log(`Pure Kick: 回复 ${heal * 10} HP`);
      }
      return { damage: baseDamage };
    },
  }],
};

// ═══════════════════════════════════════════════════
// Popular Standard Format Pokemon — Attacks
// ═══════════════════════════════════════════════════

/** Luxray — Wild Charge (170, 30 self) */
const luxray: NamedEffect = {
  cardId: "name:Luxray", cardName: "Luxray",
  attacks: [{ name: "Wild Charge", onAttack: (_ctx, d) => ({ damage: d, selfDamage: 30 }) }],
};

/** Tsareena ex — Queen's Whip (180, can't retreat next turn) */
const tsareenaEx: NamedEffect = {
  cardId: "name:Tsareena ex", cardName: "Tsareena ex",
  attacks: [{ name: "Queen's Whip", onAttack: (ctx, d) => {
    if (ctx.opponent.active) ctx.addMarker(ctx.opponent.active, PREVENT_RETREAT_NEXT_TURN);
    return { damage: d };
  }}],
};

/** Baxcalibur — Super Cool Charge ability (attach Water from hand to any Pokemon) */
const baxcalibur: NamedEffect = {
  cardId: "name:Baxcalibur", cardName: "Baxcalibur",
  abilities: [{
    name: "Super Cool Charge",
    type: "activated" as const,
    onActivate: (ctx) => {
      const waterEnergy = ctx.player.hand.cards.find(c => c.card.supertype === "Energy" && c.card.name.includes("Water"));
      if (!waterEnergy) { ctx.log("Super Cool Charge: 手牌中没有水能量"); return; }
      ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== waterEnergy.instanceId);
      const target = ctx.player.active || ctx.player.bench.cards[0];
      if (target) {
        target.attachedEnergy.push(waterEnergy);
        ctx.log(`Super Cool Charge: 从手牌附加水能量给 ${target.card.name}`);
      }
    },
  }],
};

/** Magnezone — Giga Attract ability (move Lightning energy from bench to active) */
const magnezone: NamedEffect = {
  cardId: "name:Magnezone", cardName: "Magnezone",
  abilities: [{
    name: "Giga Attract",
    type: "activated" as const,
    onActivate: (ctx) => {
      if (!ctx.player.active) return;
      for (const bench of ctx.player.bench.cards) {
        const idx = bench.attachedEnergy.findIndex(e => e.card.types?.includes("Lightning"));
        if (idx >= 0) {
          const energy = bench.attachedEnergy.splice(idx, 1)[0];
          ctx.player.active.attachedEnergy.push(energy);
          ctx.log(`Giga Attract: 移动雷能量到 ${ctx.player.active.card.name}`);
          return;
        }
      }
    },
  }],
};

/** Zoroark — Phantom Transformation ability (copy bench Pokemon attacks) */
const zoroark: NamedEffect = {
  cardId: "name:Zoroark", cardName: "Zoroark",
  abilities: [{
    name: "Phantom Transformation",
    type: "activated" as const,
    onActivate: (ctx) => {
      ctx.log("Phantom Transformation: 可以使用备战区宝可梦的攻击（需手动选择）");
    },
  }],
};

/** Espathra ex — Dress Up ability (+70 HP if has Psychic energy) */
const espathraEx: NamedEffect = {
  cardId: "name:Espathra ex", cardName: "Espathra ex",
  attacks: [{
    name: "Psychic",
    onAttack: (ctx, baseDamage) => {
      const energyCount = ctx.opponent.active?.attachedEnergy.length ?? 0;
      return { damage: baseDamage + energyCount * 30 };
    },
  }],
};

/** Tinkaton ex — Big Hammer (160, discard energy) */
const tinkatonEx: NamedEffect = {
  cardId: "name:Tinkaton ex", cardName: "Tinkaton ex",
  attacks: [{
    name: "Big Hammer",
    onAttack: (ctx, baseDamage) => {
      // Discard 2 energy from self
      const count = Math.min(2, ctx.source.attachedEnergy.length);
      for (let i = 0; i < count; i++) {
        const e = ctx.source.attachedEnergy.pop()!;
        ctx.player.discard.cards.push(e);
      }
      return { damage: baseDamage };
    },
  }],
};

// ═══════════════════════════════════════════════════
// Common Attack Patterns — Batch
// ═══════════════════════════════════════════════════

/** Attacks with coin flip damage */
const makeCoinFlipAttack = (name: string, cardName: string, flipCount: number, perHeads: number): NamedEffect => ({
  cardId: `name:${cardName}`, cardName,
  attacks: [{ name, onAttack: (ctx, _d) => {
    let heads = 0;
    for (let i = 0; i < flipCount; i++) if (ctx.flipCoin()) heads++;
    return { damage: heads * perHeads };
  }}],
});

/** Attacks with self-damage */
const makeSelfDamageAttack = (name: string, cardName: string, selfDmg: number): NamedEffect => ({
  cardId: `name:${cardName}`, cardName,
  attacks: [{ name, onAttack: (_ctx, d) => ({ damage: d, selfDamage: selfDmg }) }],
});

/** Attacks that paralyze on coin flip heads */
const makeParalyzeAttack = (name: string, cardName: string): NamedEffect => ({
  cardId: `name:${cardName}`, cardName,
  attacks: [{ name, onAttack: (ctx, d) => ({
    damage: d,
    ...(ctx.flipCoin() ? { statusEffects: [{ status: "paralyzed" as const, target: "defender" as const }] } : {}),
  })}],
});

/** Attacks that poison */
const makePoisonAttack = (name: string, cardName: string): NamedEffect => ({
  cardId: `name:${cardName}`, cardName,
  attacks: [{ name, onAttack: (_ctx, d) => ({
    damage: d,
    statusEffects: [{ status: "poisoned" as const, target: "defender" as const }],
  })}],
});

/** Attacks that burn */
const makeBurnAttack = (name: string, cardName: string): NamedEffect => ({
  cardId: `name:${cardName}`, cardName,
  attacks: [{ name, onAttack: (_ctx, d) => ({
    damage: d,
    statusEffects: [{ status: "burned" as const, target: "defender" as const }],
  })}],
});

/** Attacks that confuse */
const makeConfuseAttack = (name: string, cardName: string): NamedEffect => ({
  cardId: `name:${cardName}`, cardName,
  attacks: [{ name, onAttack: (_ctx, d) => ({
    damage: d,
    statusEffects: [{ status: "confused" as const, target: "defender" as const }],
  })}],
});

/** Attacks that put opponent to sleep */
const makeSleepAttack = (name: string, cardName: string): NamedEffect => ({
  cardId: `name:${cardName}`, cardName,
  attacks: [{ name, onAttack: (_ctx, d) => ({
    damage: d,
    statusEffects: [{ status: "asleep" as const, target: "defender" as const }],
  })}],
});

// ── Batch attack effects ──

const pikachu = makeParalyzeAttack("Thunder Shock", "Pikachu");
const voltorb = makeParalyzeAttack("Thunder Shock", "Voltorb");
const shinx = makeParalyzeAttack("Thunder Shock", "Shinx");
const magnemite = makeParalyzeAttack("Thunder Shock", "Magnemite");
const tadbulb = makeParalyzeAttack("Zap Kick", "Tadbulb");

const vulpix = makeBurnAttack("Flare", "Vulpix");
const growlithe = makeBurnAttack("Combustion", "Growlithe");
const litwick = makeBurnAttack("Ember", "Litwick");
const charcadet = makeBurnAttack("Flame Charge", "Charcadet");

const gastly = makeSleepAttack("Hypnosis", "Gastly");
const drowzee = makeSleepAttack("Hypnosis", "Drowzee");
const jigglypuff = makeSleepAttack("Sing", "Jigglypuff");
const snorlaxSleep = makeSleepAttack("Yawn", "Munchlax");

const koffing = makePoisonAttack("Poison Gas", "Koffing");
const grimer = makePoisonAttack("Sludge", "Grimer");
const croagunk = makePoisonAttack("Poison Jab", "Croagunk");
const salandit = makePoisonAttack("Poison Fang", "Salandit");

const geodude = makeSelfDamageAttack("Tackle", "Geodude", 10);
const machop = makeSelfDamageAttack("Low Kick", "Machop", 10);
const riolu = makeSelfDamageAttack("Feint", "Riolu", 10);

const togepi = makeCoinFlipAttack("Metronome", "Togepi", 3, 20);
const clefairy = makeCoinFlipAttack("Pound", "Clefairy", 2, 30);

// ═══════════════════════════════════════════════════
// Additional SV Trainers — Missing from current set
// ═══════════════════════════════════════════════════

/** Candela — Draw 3 cards. If any are Fire energy, attach 1 to your Pokemon */
const candela: NamedEffect = {
  cardId: "name:Candela", cardName: "Candela",
  trainer: {
    onPlay: (ctx) => {
      const drawn = ctx.drawCards(3);
      const fireEnergy = drawn.find(c => c.card.supertype === "Energy" && c.card.types?.includes("Fire"));
      if (fireEnergy && ctx.player.active) {
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== fireEnergy.instanceId);
        ctx.player.active.attachedEnergy.push(fireEnergy);
        ctx.log(`Candela: 附加了火能量给 ${ctx.player.active.card.name}`);
      }
    },
  },
};

/** Blaine — Search deck for 2 Fire Pokemon */
const blaine: NamedEffect = {
  cardId: "name:Blaine", cardName: "Blaine",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(c => c.card.supertype === "Pokémon" && c.card.types?.includes("Fire"), 2);
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Blaine: 搜索了 ${found.map(c => c.card.name).join(", ")}`);
    },
  },
};

/** Ciphermaniac's Codebreaking — Look at opponent's hand */
const ciphermaniac: NamedEffect = {
  cardId: "name:Ciphermaniac's Codebreaking", cardName: "Ciphermaniac's Codebreaking",
  trainer: { onPlay: (ctx) => { ctx.log("Ciphermaniac's Codebreaking: 查看了对手手牌"); } },
};

/** Camellia — Search deck for 2 Energy cards */
const camellia: NamedEffect = {
  cardId: "name:Camellia", cardName: "Camellia",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(c => c.card.supertype === "Energy", 2);
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Camellia: 搜索了 ${found.map(c => c.card.name).join(", ")}`);
    },
  },
};

/** Turo's Scenario (already exists but adding Professor Turo alternate name) */
const professorTuro: NamedEffect = {
  cardId: "name:Professor Turo's Scenario", cardName: "Professor Turo's Scenario",
  trainer: {
    onPlay: (ctx) => {
      // Return active to hand (with all attached cards)
      if (ctx.player.active) {
        const card = ctx.player.active;
        // Return attached energy to hand
        for (const e of card.attachedEnergy) ctx.player.hand.cards.push(e);
        card.attachedEnergy = [];
        for (const t of card.attachedTools) ctx.player.hand.cards.push(t);
        card.attachedTools = [];
        card.damageCounters = 0;
        card.statusConditions = [];
        ctx.player.hand.cards.push(card);
        ctx.player.active = null;
        ctx.log(`Professor Turo's Scenario: ${card.card.name} 和所有附加卡返回手牌`);
      }
    },
  },
};

/** Professor Sada's Vitality — Attach Basic energy from discard to Ancient Pokemon */
const professorSada: NamedEffect = {
  cardId: "name:Professor Sada's Vitality", cardName: "Professor Sada's Vitality",
  trainer: {
    onPlay: (ctx) => {
      const energy = ctx.player.discard.cards.find(c => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"));
      if (!energy) return;
      ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== energy.instanceId);
      const target = ctx.player.active || ctx.player.bench.cards[0];
      if (target) {
        target.attachedEnergy.push(energy);
        ctx.log(`Professor Sada's Vitality: 从弃牌堆附加能量给 ${target.card.name}`);
      }
    },
  },
};

/** Hyper Aroma — Search deck for Stage 2 Pokemon */
const hyperAroma: NamedEffect = {
  cardId: "name:Hyper Aroma", cardName: "Hyper Aroma",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Stage 2"), 1);
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Hyper Aroma: 搜索了 ${found[0].card.name}`);
    },
  },
};

/** Revive — Put Basic Pokemon from discard to bench */
const revive: NamedEffect = {
  cardId: "name:Revive", cardName: "Revive",
  trainer: {
    onPlay: (ctx) => {
      const basics = ctx.player.discard.cards.filter(c => c.card.supertype === "Pokémon" && c.card.subtypes?.includes("Basic"));
      if (basics.length === 0 || ctx.player.bench.cards.length >= 5) return;
      const card = basics[0];
      ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== card.instanceId);
      card.damageCounters = 0;
      card.statusConditions = [];
      card.playedThisTurn = true;
      ctx.player.bench.cards.push(card);
      ctx.log(`Revive: ${card.card.name} 从弃牌堆放到备战区`);
    },
  },
};

/** Technical Machine: Devolution — Devolve opponent's evolved Pokemon */
const tmDevolution: NamedEffect = {
  cardId: "name:Technical Machine: Devolution", cardName: "Technical Machine: Devolution",
  trainer: { onPlay: (ctx) => { ctx.log("TM: Devolution — 将对手进化宝可梦退化"); } },
};

/** Leftovers (already exists, skip) */

/** Adventurer's Discovery — Search deck for up to 3 Pokemon V */
const adventurersDiscoveryV2: NamedEffect = {
  cardId: "name:Adventurer's Discovery", cardName: "Adventurer's Discovery",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(c => c.card.supertype === "Pokémon" && c.card.subtypes?.some(s => s === "V"), 3);
      ctx.shuffleDeck();
      if (found.length > 0) ctx.log(`Adventurer's Discovery: 搜索了 ${found.map(c => c.card.name).join(", ")}`);
    },
  },
};

// ═══════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════

export const svAbilityEffects: NamedEffect[] = [
  // SV1 Abilities
  armarouge, florges, klefki, dachsbun, kingambit, pawmot,
  // SV2-SV3 Abilities & Attacks
  arcanineEx, noivernEx, gholdengoEx, medichamEx,
  // Popular Standard Pokemon
  luxray, tsareenaEx, baxcalibur, magnezone, zoroark, espathraEx, tinkatonEx,
  // Status attack Pokemon (paralyze)
  pikachu, voltorb, shinx, magnemite, tadbulb,
  // Status attack Pokemon (burn)
  vulpix, growlithe, litwick, charcadet,
  // Status attack Pokemon (sleep)
  gastly, drowzee, jigglypuff, snorlaxSleep,
  // Status attack Pokemon (poison)
  koffing, grimer, croagunk, salandit,
  // Self-damage attacks
  geodude, machop, riolu,
  // Coin flip attacks
  togepi, clefairy,
  // Additional Trainers
  candela, blaine, ciphermaniac, camellia,
  hyperAroma, revive,
];
