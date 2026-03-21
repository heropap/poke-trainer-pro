/**
 * Attack Effect Implementations
 *
 * Initial batch of 8 attack effects covering the most common patterns:
 * 1. Status attacks (poison, burn, paralyzed, sleep)
 * 2. Coin flip conditional damage
 * 3. Self-damage attacks
 * 4. Bench damage attacks
 * 5. Energy discard attacks
 * 6. Energy acceleration from deck
 * 7. Damage per energy attached
 */

import { CardEffectDef, AttackResult } from "../effect-types";

// ───────────────────────────────────────────────
// 1. Status Attacks
// ───────────────────────────────────────────────

/**
 * Tangela (me1-6) — Poison Powder: opponent's Active is now Poisoned (0 damage)
 */
const tangela: CardEffectDef = {
  cardId: "me1-6",
  cardName: "Tangela",
  attacks: [
    {
      name: "Poison Powder",
      onAttack: (ctx, baseDamage) => {
        return {
          damage: baseDamage,
          statusEffects: [{ target: "defender", status: "poisoned" }],
        };
      },
    },
  ],
};

/**
 * Shroodle (me1-91) — Poison Jab: 20 damage + Poisoned
 */
const shroodle: CardEffectDef = {
  cardId: "me1-91",
  cardName: "Shroodle",
  attacks: [
    {
      name: "Poison Jab",
      onAttack: (ctx, baseDamage) => {
        return {
          damage: baseDamage,
          statusEffects: [{ target: "defender", status: "poisoned" }],
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 2. Coin Flip Conditional Damage
// ───────────────────────────────────────────────

/**
 * Tyrogue (me1-71) — Pow-Pow Punching: 10+ damage.
 * Flip a coin until tails. +30 for each heads.
 */
const tyrogue: CardEffectDef = {
  cardId: "me1-71",
  cardName: "Tyrogue",
  attacks: [
    {
      name: "Pow-Pow Punching",
      onAttack: (ctx, baseDamage) => {
        let extraDamage = 0;
        // Flip until tails
        while (ctx.flipCoin()) {
          extraDamage += 30;
        }
        return {
          damage: baseDamage + extraDamage,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 3. Self-Damage Attacks
// ───────────────────────────────────────────────

/**
 * Corphish (me1-33) — Take Down: 30 damage + 10 self-damage
 */
const corphish: CardEffectDef = {
  cardId: "me1-33",
  cardName: "Corphish",
  attacks: [
    {
      name: "Take Down",
      onAttack: (ctx, baseDamage) => {
        return {
          damage: baseDamage,
          selfDamage: 10,
        };
      },
    },
  ],
};

/**
 * Electrike (me1-49) — Thunder Jolt: 30 damage + 10 self-damage
 */
const electrike: CardEffectDef = {
  cardId: "me1-49",
  cardName: "Electrike",
  attacks: [
    {
      name: "Thunder Jolt",
      onAttack: (ctx, baseDamage) => {
        return {
          damage: baseDamage,
          selfDamage: 10,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 4. Bench Damage Attacks
// ───────────────────────────────────────────────

/**
 * Stonjourner (me1-81) — Stony Kick: 20 damage + 20 to a bench Pokemon
 * "This attack also does 20 damage to 1 of your opponent's Benched Pokemon."
 */
const stonjourner: CardEffectDef = {
  cardId: "me1-81",
  cardName: "Stonjourner",
  attacks: [
    {
      name: "Stony Kick",
      onAttack: (ctx, baseDamage) => {
        // "This attack also does 20 damage to 1 of your opponent's Benched Pokémon."
        // Auto-select: target bench Pokemon closest to KO
        const benchDamage: AttackResult["benchDamage"] = [];
        if (ctx.opponent.bench.cards.length > 0) {
          const bench = ctx.opponent.bench.cards;
          const target = bench.reduce((best, curr) => {
            const bestRemaining = parseInt(best.card.hp || "999") - best.damageCounters * 10;
            const currRemaining = parseInt(curr.card.hp || "999") - curr.damageCounters * 10;
            return currRemaining < bestRemaining ? curr : best;
          }, bench[0]);
          benchDamage.push({ target, damage: 20 });
        }
        return {
          damage: baseDamage,
          benchDamage,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 5. Energy Discard Attacks
// ───────────────────────────────────────────────

/**
 * Mega Camerupt ex (me1-22) — Volcanic Meteor: 280 damage, discard 2 energy
 */
const megaCameruptEx: CardEffectDef = {
  cardId: "me1-22",
  cardName: "Mega Camerupt ex",
  attacks: [
    {
      name: "Volcanic Meteor",
      onAttack: (ctx, baseDamage) => {
        return {
          damage: baseDamage,
          discardEnergy: 2,
        };
      },
    },
  ],
};

/**
 * Kyogre (me1-34) — Swirling Waves: 130 damage, discard 2 energy
 */
const kyogre: CardEffectDef = {
  cardId: "me1-34",
  cardName: "Kyogre",
  attacks: [
    {
      name: "Swirling Waves",
      onAttack: (ctx, baseDamage) => {
        return {
          damage: baseDamage,
          discardEnergy: 2,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 6. Energy Acceleration from Deck
// ───────────────────────────────────────────────

/**
 * Exeggcute (me1-4) — Jam-Packed: 0 damage.
 * Search deck for a Basic Grass Energy and attach to this Pokemon. Shuffle deck.
 */
const exeggcute: CardEffectDef = {
  cardId: "me1-4",
  cardName: "Exeggcute",
  attacks: [
    {
      name: "Jam-Packed",
      onAttack: (ctx, baseDamage) => {
        // Search for Basic Grass Energy and attach to self
        ctx.attachEnergyFromDeck(
          (c) =>
            c.card.supertype === "Energy" &&
            c.card.subtypes.includes("Basic") &&
            c.card.name.includes("Grass"),
          ctx.source
        );
        ctx.shuffleDeck("player");
        return { damage: 0 };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 7. Damage Per Energy Attached
// ───────────────────────────────────────────────

/**
 * Exeggutor (me1-5) — Stomping Wood: 60+ damage.
 * +30 more damage for each Grass Energy attached to this Pokemon.
 */
const exeggutor: CardEffectDef = {
  cardId: "me1-5",
  cardName: "Exeggutor",
  attacks: [
    {
      name: "Stomping Wood",
      onAttack: (ctx, baseDamage) => {
        // Count Grass Energy attached
        const grassEnergy = ctx.source.attachedEnergy.filter(
          (e) => e.card.name.includes("Grass")
        ).length;

        return {
          damage: baseDamage + grassEnergy * 30,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// Export all attack effects
// ───────────────────────────────────────────────

export const attackEffects: CardEffectDef[] = [
  tangela,
  shroodle,
  tyrogue,
  corphish,
  electrike,
  stonjourner,
  megaCameruptEx,
  kyogre,
  exeggcute,
  exeggutor,
];
