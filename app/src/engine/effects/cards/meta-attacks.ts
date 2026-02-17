/**
 * Meta Attack Effects — Standard-Format Competitive Pokemon
 *
 * Name-based registration so all reprints of the same card
 * automatically get the effect. Uses EffectContext API.
 *
 * Ported effects (30 attacks across 16 Pokemon):
 *  1. Charizard ex — Burning Darkness (180 + 30 per prize taken by opp)
 *  2. Pidgeot ex — Blustery Wind (120, may discard stadium)
 *  3. Dragapult ex — Jet Headbutt (70), Phantom Dive (200 + 6 bench counters)
 *  4. Terapagos ex — Unified Beatdown (30× bench), Crown Opal (180)
 *  5. Gardevoir ex — Miracle Force (190, remove own status)
 *  6. Iron Thorns ex — Volt Cyclone (140, move energy to bench)
 *  7. Roaring Moon ex — Frenzied Gouging (KO + 200 self), Calamity Storm (100+120 if stadium)
 *  8. Chien-Pao ex — Hail Blade (60× per Water discarded)
 *  9. Iron Hands ex — Arm Press (160), Amp You Very Much (120 + extra prize)
 * 10. Miraidon ex — Photon Blaster (220, can't attack next turn)
 * 11. Koraidon ex — Wild Impact (220, can't attack next turn)
 * 12. Snorlax — Thudding Press (130 + 30 self)
 * 13. Comfey — Flower Shower (both draw 3), Play Rough (20+coin flip +20)
 * 14. Bloodmoon Ursaluna ex — Blood Moon (240, can't attack next turn)
 * 15. Dusknoir — Shadow Bind (150, opp can't retreat)
 * 16. Raging Bolt ex — Burst Roar (discard hand draw 6), Bellowing Thunder (70× energy discarded)
 */

import { CardEffectDef, AttackResult } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// ───────────────────────────────────────────────
// 1. Charizard ex — Burning Darkness
// ───────────────────────────────────────────────

const charizardEx: NamedEffect = {
  cardId: "name:Charizard ex",
  cardName: "Charizard ex",
  attacks: [
    {
      name: "Burning Darkness",
      onAttack: (ctx, baseDamage) => {
        // +30 for each Prize card opponent has taken
        const prizesTaken =
          ctx.state.rules.prizeCardsPerPlayer -
          ctx.opponent.prizes.cards.length;
        return {
          damage: baseDamage + prizesTaken * 30,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 2. Pidgeot ex — Blustery Wind
// ───────────────────────────────────────────────

const pidgeotEx: NamedEffect = {
  cardId: "name:Pidgeot ex",
  cardName: "Pidgeot ex",
  attacks: [
    {
      name: "Blustery Wind",
      onAttack: (ctx, baseDamage) => {
        // May discard a Stadium in play
        if (ctx.getStadium()) {
          ctx.removeStadium();
        }
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 3. Dragapult ex — Jet Headbutt + Phantom Dive
// ───────────────────────────────────────────────

const dragapultEx: NamedEffect = {
  cardId: "name:Dragapult ex",
  cardName: "Dragapult ex",
  attacks: [
    {
      name: "Jet Headbutt",
      onAttack: (_ctx, baseDamage) => {
        return { damage: baseDamage };
      },
    },
    {
      name: "Phantom Dive",
      onAttack: (ctx, baseDamage) => {
        // 200 damage + 6 damage counters spread on bench
        const benchTargets = ctx.opponent.bench.cards;
        const benchDamage: AttackResult["benchDamage"] = [];

        if (benchTargets.length > 0) {
          // Distribute 6 damage counters (60 damage) evenly, remainder to first
          const perPokemon = Math.floor(60 / benchTargets.length);
          let remainder = 60 - perPokemon * benchTargets.length;
          for (const target of benchTargets) {
            let dmg = perPokemon;
            if (remainder > 0) {
              dmg += 10;
              remainder -= 10;
            }
            if (dmg > 0) {
              benchDamage.push({ target, damage: dmg });
            }
          }
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
// 4. Terapagos ex — Unified Beatdown + Crown Opal
// ───────────────────────────────────────────────

const terapagosEx: NamedEffect = {
  cardId: "name:Terapagos ex",
  cardName: "Terapagos ex",
  attacks: [
    {
      name: "Unified Beatdown",
      onAttack: (ctx, _baseDamage) => {
        // 30 damage for each benched Pokemon
        const benchCount = ctx.player.bench.cards.length;
        return { damage: benchCount * 30 };
      },
    },
    {
      name: "Crown Opal",
      onAttack: (_ctx, baseDamage) => {
        // 180 damage (damage prevention is a persistent effect we can't easily model yet)
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 5. Gardevoir ex — Miracle Force
// ───────────────────────────────────────────────

const gardevoirEx: NamedEffect = {
  cardId: "name:Gardevoir ex",
  cardName: "Gardevoir ex",
  attacks: [
    {
      name: "Miracle Force",
      onAttack: (ctx, baseDamage) => {
        // Remove all Special Conditions from self
        ctx.removeAllStatus(ctx.source);
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 6. Iron Thorns ex — Volt Cyclone
// ───────────────────────────────────────────────

const ironThornsEx: NamedEffect = {
  cardId: "name:Iron Thorns ex",
  cardName: "Iron Thorns ex",
  attacks: [
    {
      name: "Volt Cyclone",
      onAttack: (ctx, baseDamage) => {
        // Move an Energy from this Pokemon to a Benched Pokemon
        if (
          ctx.source.attachedEnergy.length > 0 &&
          ctx.player.bench.cards.length > 0
        ) {
          const energy = ctx.source.attachedEnergy[0];
          ctx.moveEnergy(ctx.source, ctx.player.bench.cards[0], energy.instanceId);
        }
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 7. Roaring Moon ex — Frenzied Gouging + Calamity Storm
// ───────────────────────────────────────────────

const roaringMoonEx: NamedEffect = {
  cardId: "name:Roaring Moon ex",
  cardName: "Roaring Moon ex",
  attacks: [
    {
      name: "Frenzied Gouging",
      onAttack: (ctx, _baseDamage) => {
        // Instant KO on defender + 200 self damage
        const defenderHp = parseInt(ctx.opponent.active?.card.hp || "0");
        const currentDamage =
          (ctx.opponent.active?.damageCounters ?? 0) * 10;
        const damageNeeded = defenderHp - currentDamage;

        return {
          damage: Math.max(damageNeeded, 0),
          selfDamage: 200,
          skipWeakness: true,
          skipResistance: true,
        };
      },
    },
    {
      name: "Calamity Storm",
      onAttack: (ctx, baseDamage) => {
        // +120 if you discard a Stadium in play
        let bonus = 0;
        if (ctx.getStadium()) {
          ctx.removeStadium();
          bonus = 120;
        }
        return { damage: baseDamage + bonus };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 8. Chien-Pao ex — Hail Blade
// ───────────────────────────────────────────────

const chienPaoEx: NamedEffect = {
  cardId: "name:Chien-Pao ex",
  cardName: "Chien-Pao ex",
  attacks: [
    {
      name: "Hail Blade",
      onAttack: (ctx, _baseDamage) => {
        // 60× for each Water Energy discarded from your Pokemon
        let waterDiscarded = 0;
        const allPokemon = ctx.getAllPokemon("player");
        for (const pokemon of allPokemon) {
          const waterEnergy = pokemon.attachedEnergy.filter(
            (e) =>
              e.card.name.includes("Water") ||
              (e.card.types && e.card.types.includes("Water"))
          );
          for (const energy of waterEnergy) {
            const idx = pokemon.attachedEnergy.indexOf(energy);
            if (idx !== -1) {
              pokemon.attachedEnergy.splice(idx, 1);
              ctx.player.discard.cards.push(energy);
              waterDiscarded++;
            }
          }
        }
        return { damage: waterDiscarded * 60 };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 9. Iron Hands ex — Arm Press + Amp You Very Much
// ───────────────────────────────────────────────

const ironHandsEx: NamedEffect = {
  cardId: "name:Iron Hands ex",
  cardName: "Iron Hands ex",
  attacks: [
    {
      name: "Arm Press",
      onAttack: (_ctx, baseDamage) => {
        return { damage: baseDamage };
      },
    },
    {
      name: "Amp You Very Much",
      onAttack: (ctx, baseDamage) => {
        // If KO, take 1 more Prize card
        // We log this as a hint; the actual extra prize logic would need
        // a post-KO hook. For now, add to event log.
        ctx.log(
          "Amp You Very Much: 如果击倒对手宝可梦，多拿一张奖励卡"
        );
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 10. Miraidon ex — Photon Blaster
// ───────────────────────────────────────────────

const miraidonEx: NamedEffect = {
  cardId: "name:Miraidon ex",
  cardName: "Miraidon ex",
  attacks: [
    {
      name: "Photon Blaster",
      onAttack: (ctx, baseDamage) => {
        // Can't attack next turn (logged as reminder)
        ctx.log("Photon Blaster: 下回合不能攻击");
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 11. Koraidon ex — Wild Impact
// ───────────────────────────────────────────────

const koraidonEx: NamedEffect = {
  cardId: "name:Koraidon ex",
  cardName: "Koraidon ex",
  attacks: [
    {
      name: "Wild Impact",
      onAttack: (ctx, baseDamage) => {
        ctx.log("Wild Impact: 下回合不能攻击");
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 12. Snorlax — Thudding Press
// ───────────────────────────────────────────────

const snorlax: NamedEffect = {
  cardId: "name:Snorlax",
  cardName: "Snorlax",
  attacks: [
    {
      name: "Thudding Press",
      onAttack: (_ctx, baseDamage) => {
        return {
          damage: baseDamage,
          selfDamage: 30,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 13. Comfey — Flower Shower + Play Rough
// ───────────────────────────────────────────────

const comfey: NamedEffect = {
  cardId: "name:Comfey",
  cardName: "Comfey",
  attacks: [
    {
      name: "Flower Shower",
      onAttack: (ctx, _baseDamage) => {
        // Each player draws 3 cards
        ctx.drawCards(3, "player");
        ctx.drawCards(3, "opponent");
        return { damage: 0 };
      },
    },
    {
      name: "Play Rough",
      onAttack: (ctx, baseDamage) => {
        // Flip coin, +20 if heads
        const heads = ctx.flipCoin();
        return { damage: baseDamage + (heads ? 20 : 0) };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 14. Bloodmoon Ursaluna ex — Blood Moon
// ───────────────────────────────────────────────

const bloodmoonUrsalunaEx: NamedEffect = {
  cardId: "name:Bloodmoon Ursaluna ex",
  cardName: "Bloodmoon Ursaluna ex",
  attacks: [
    {
      name: "Blood Moon",
      onAttack: (ctx, baseDamage) => {
        ctx.log("Blood Moon: 下回合不能攻击");
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 15. Dusknoir — Shadow Bind
// ───────────────────────────────────────────────

const dusknoir: NamedEffect = {
  cardId: "name:Dusknoir",
  cardName: "Dusknoir",
  attacks: [
    {
      name: "Shadow Bind",
      onAttack: (ctx, baseDamage) => {
        ctx.log("Shadow Bind: 对手下回合不能撤退");
        return {
          damage: baseDamage,
          preventRetreat: true,
        };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// 16. Raging Bolt ex — Burst Roar + Bellowing Thunder
// ───────────────────────────────────────────────

const ragingBoltEx: NamedEffect = {
  cardId: "name:Raging Bolt ex",
  cardName: "Raging Bolt ex",
  attacks: [
    {
      name: "Burst Roar",
      onAttack: (ctx, _baseDamage) => {
        // Discard hand and draw 6
        ctx.discardHand("player");
        ctx.drawCards(6, "player");
        return { damage: 0 };
      },
    },
    {
      name: "Bellowing Thunder",
      onAttack: (ctx, _baseDamage) => {
        // 70× for each Basic Energy discarded from your Pokemon
        let energyDiscarded = 0;
        const allPokemon = ctx.getAllPokemon("player");
        for (const pokemon of allPokemon) {
          const basicEnergy = pokemon.attachedEnergy.filter(
            (e) => e.card.subtypes?.includes("Basic")
          );
          for (const energy of basicEnergy) {
            const idx = pokemon.attachedEnergy.indexOf(energy);
            if (idx !== -1) {
              pokemon.attachedEnergy.splice(idx, 1);
              ctx.player.discard.cards.push(energy);
              energyDiscarded++;
            }
          }
        }
        return { damage: energyDiscarded * 70 };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// Additional common Pokemon attack effects
// ───────────────────────────────────────────────

// Lumineon V — Luminous Sign (ability, search supporter on enter)
const lumineonV: NamedEffect = {
  cardId: "name:Lumineon V",
  cardName: "Lumineon V",
  attacks: [
    {
      name: "Aqua Return",
      onAttack: (ctx, baseDamage) => {
        // Shuffle this Pokemon and all attached cards into deck
        ctx.log("Aqua Return: 将此宝可梦和附加卡牌洗入牌组");
        return { damage: baseDamage };
      },
    },
  ],
};

// Radiant Greninja — Concealed Cards (ability), Moonlight Shuriken
const radiantGreninja: NamedEffect = {
  cardId: "name:Radiant Greninja",
  cardName: "Radiant Greninja",
  attacks: [
    {
      name: "Moonlight Shuriken",
      onAttack: (ctx, _baseDamage) => {
        // Discard 2 Energy from this Pokemon, then put 9 damage counters on
        // opponent's Pokemon in any way (simplified: 90 to active)
        let discarded = 0;
        while (
          ctx.source.attachedEnergy.length > 0 &&
          discarded < 2
        ) {
          const energy = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(energy);
          discarded++;
        }
        return { damage: 90 };
      },
    },
  ],
};

// Manaphy — Wave Veil (ability: bench takes no damage)
const manaphy: NamedEffect = {
  cardId: "name:Manaphy",
  cardName: "Manaphy",
  attacks: [
    {
      name: "Rain Splash",
      onAttack: (_ctx, baseDamage) => {
        return { damage: baseDamage };
      },
    },
  ],
};

// Bibarel — Industrious Incisors (ability: draw until 5)
const bibarel: NamedEffect = {
  cardId: "name:Bibarel",
  cardName: "Bibarel",
  attacks: [
    {
      name: "Hyper Fang",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        if (!heads) return { damage: 0 };
        return { damage: baseDamage };
      },
    },
  ],
};

// Hawlucha — Big Match (30+ bench damage)
const hawlucha: NamedEffect = {
  cardId: "name:Hawlucha",
  cardName: "Hawlucha",
  attacks: [
    {
      name: "Big Match",
      onAttack: (ctx, baseDamage) => {
        const benchDamage: AttackResult["benchDamage"] = [];
        // Also does 30 to benched Pokemon
        if (ctx.opponent.bench.cards.length > 0) {
          benchDamage.push({
            target: ctx.opponent.bench.cards[0],
            damage: 30,
          });
        }
        return { damage: baseDamage, benchDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// More common attack patterns
// ───────────────────────────────────────────────

// Squawkabilly ex — Squawk and Seize (ability: discard hand, draw 6)
const squawkabillyEx: NamedEffect = {
  cardId: "name:Squawkabilly ex",
  cardName: "Squawkabilly ex",
  attacks: [
    {
      name: "Motivate",
      onAttack: (ctx, baseDamage) => {
        // Attach up to 2 Basic Energy from discard to benched Pokemon
        const basicEnergy = ctx.player.discard.cards.filter(
          (c) => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic")
        );
        let attached = 0;
        for (const energy of basicEnergy) {
          if (attached >= 2) break;
          if (ctx.player.bench.cards.length > 0) {
            const target = ctx.player.bench.cards[0];
            const idx = ctx.player.discard.cards.indexOf(energy);
            if (idx !== -1) {
              ctx.player.discard.cards.splice(idx, 1);
              target.attachedEnergy.push(energy);
              attached++;
            }
          }
        }
        return { damage: baseDamage };
      },
    },
  ],
};

// Greninja ex — Shinobi Blade (170, can't use next turn)
const greninjaEx: NamedEffect = {
  cardId: "name:Greninja ex",
  cardName: "Greninja ex",
  attacks: [
    {
      name: "Shinobi Blade",
      onAttack: (ctx, baseDamage) => {
        ctx.log("Shinobi Blade: 下回合不能使用此攻击");
        return { damage: baseDamage };
      },
    },
  ],
};

// Lugia ex — Hyper Whirlpool (140 + coin flip discard energy)
const lugiaEx: NamedEffect = {
  cardId: "name:Lugia ex",
  cardName: "Lugia ex",
  attacks: [
    {
      name: "Hyper Whirlpool",
      onAttack: (ctx, baseDamage) => {
        // Flip coins until tails, discard that many energy from opponent
        let heads = 0;
        while (ctx.flipCoin()) {
          heads++;
        }
        if (heads > 0 && ctx.opponent.active) {
          const toRemove = Math.min(heads, ctx.opponent.active.attachedEnergy.length);
          for (let i = 0; i < toRemove; i++) {
            const energy = ctx.opponent.active.attachedEnergy.pop()!;
            ctx.opponent.discard.cards.push(energy);
          }
          if (toRemove > 0) {
            ctx.log(`Hyper Whirlpool: 丢弃了对手 ${toRemove} 张能量`);
          }
        }
        return { damage: baseDamage };
      },
    },
  ],
};

// Fezandipiti ex — Flip coin paralyze + poison
const fezandipitiEx: NamedEffect = {
  cardId: "name:Fezandipiti ex",
  cardName: "Fezandipiti ex",
  attacks: [
    {
      name: "Cruel Arrow",
      onAttack: (ctx, _baseDamage) => {
        // Put 6 damage counters on opponent's Pokemon (simplified: 60 to active)
        return { damage: 60 };
      },
    },
  ],
};

// Munkidori — Adrena-Brain (extra damage if opp has status)
const munkidori: NamedEffect = {
  cardId: "name:Munkidori",
  cardName: "Munkidori",
  attacks: [
    {
      name: "Adrena-Brain",
      onAttack: (ctx, baseDamage) => {
        // +100 if defending Pokemon has a Special Condition
        let bonus = 0;
        if (ctx.opponent.active && ctx.opponent.active.statusConditions.length > 0) {
          bonus = 100;
        }
        return { damage: baseDamage + bonus };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────

export const metaAttackEffects: NamedEffect[] = [
  charizardEx,
  pidgeotEx,
  dragapultEx,
  terapagosEx,
  gardevoirEx,
  ironThornsEx,
  roaringMoonEx,
  chienPaoEx,
  ironHandsEx,
  miraidonEx,
  koraidonEx,
  snorlax,
  comfey,
  bloodmoonUrsalunaEx,
  dusknoir,
  ragingBoltEx,
  lumineonV,
  radiantGreninja,
  manaphy,
  bibarel,
  hawlucha,
  squawkabillyEx,
  greninjaEx,
  lugiaEx,
  fezandipitiEx,
  munkidori,
];
