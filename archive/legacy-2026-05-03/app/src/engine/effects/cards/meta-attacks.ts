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
import { CANT_ATTACK_NEXT_TURN, PREVENT_RETREAT_NEXT_TURN } from "../markers";
import { getEffectiveHp } from "../../game-actions";
import { getBenchSpace } from "../../bench-rules";

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
  abilities: [
    {
      name: "Infernal Reign",
      type: "on_enter" as const,
      onEnter: async (ctx) => {
        // When this Pokemon evolves, search deck for up to 3 Basic Fire Energy
        // and attach them to your Pokemon in any way you like.
        const toAttach = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(
              (c) =>
                c.card.supertype === "Energy" &&
                c.card.subtypes.includes("Basic") &&
                (c.card.types?.includes("Fire") || c.card.name.includes("Fire")),
              3,
              "Infernal Reign: 选择最多 3 张基础火能量附加给自己的宝可梦",
              "player",
              0,
            )
          : ctx.searchDeck(
              (c) =>
                c.card.supertype === "Energy" &&
                c.card.subtypes.includes("Basic") &&
                (c.card.types?.includes("Fire") || c.card.name.includes("Fire")),
              3
            );
        const targets = ctx.getAllPokemon("player");
        if (targets.length === 0) {
          ctx.shuffleDeck();
          return;
        }

        for (const energy of toAttach) {
          const selected = await ctx.promptUser({
            message: `Infernal Reign: 选择 ${energy.card.name} 要附加到哪只宝可梦`,
            min: 1,
            max: 1,
            zone: "own_field",
            targets: targets.map((pokemon) => pokemon.instanceId),
          });
          const target = targets.find((pokemon) => pokemon.instanceId === selected[0]) ?? targets[0];
          target.attachedEnergy.push(energy);
          ctx.log(`Infernal Reign: 将 ${energy.card.name} 附加给 ${target.card.name}`);
        }

        ctx.shuffleDeck();
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
        // "You may discard a Stadium in play" — discard any stadium.
        if (ctx.state.stadium) {
          ctx.removeStadium();
        }
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Quick Search",
      type: "activated" as const,
      onActivate: async (ctx) => {
        // Once per turn: search deck for any 1 card and put it in hand.
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(
              () => true,
              1,
              "Quick Search: 选择 1 张牌加入手牌",
              "player",
            )
          : ctx.searchDeck(() => true, 1);
        if (found.length > 0) {
          ctx.addToHand(found[0]);
        }
        ctx.shuffleDeck();
        if (found.length > 0) {
          ctx.log(`Quick Search: 从牌组搜索了 ${found[0].card.name}`);
        }
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
  abilities: [
    {
      name: "Psychic Embrace",
      repeatable: true,
      type: "activated" as const,
      canActivate: (ctx) => {
        const hasPsychicEnergy = ctx.player.discard.cards.some(
          (c) =>
            c.card.supertype === "Energy" &&
            c.card.subtypes.includes("Basic") &&
            (c.card.types?.includes("Psychic") || c.card.name.includes("Psychic"))
        );
        const hasValidBenchTarget = ctx.player.bench.cards.some((pokemon) => {
          const isPsychic = pokemon.card.types?.includes("Psychic");
          const remainingHp = getEffectiveHp(pokemon) - pokemon.damageCounters * 10;
          return !!isPsychic && remainingHp > 20;
        });
        return hasPsychicEnergy && hasValidBenchTarget;
      },
      getDisabledReason: (ctx) => {
        const hasPsychicEnergy = ctx.player.discard.cards.some(
          (c) =>
            c.card.supertype === "Energy" &&
            c.card.subtypes.includes("Basic") &&
            (c.card.types?.includes("Psychic") || c.card.name.includes("Psychic"))
        );
        if (!hasPsychicEnergy) return "Psychic Embrace 需要弃牌堆里有基础超能量";
        return "Psychic Embrace 需要有不会因此气绝的备战超系宝可梦";
      },
      onActivate: async (ctx) => {
        const energies = ctx.player.discard.cards.filter(
          (c) =>
            c.card.supertype === "Energy" &&
            c.card.subtypes.includes("Basic") &&
            (c.card.types?.includes("Psychic") || c.card.name.includes("Psychic"))
        );
        const targets = ctx.player.bench.cards.filter((pokemon) => {
          const remainingHp = getEffectiveHp(pokemon) - pokemon.damageCounters * 10;
          return pokemon.card.types?.includes("Psychic") && remainingHp > 20;
        });
        if (energies.length === 0 || targets.length === 0) {
          ctx.log("Psychic Embrace: 当前没有可附加的基础超能量或合法目标");
          return;
        }
        const selectedEnergy = ctx.promptSearchDiscard
          ? (await ctx.promptSearchDiscard(
              (c) =>
                c.card.supertype === "Energy" &&
                c.card.subtypes.includes("Basic") &&
                (c.card.types?.includes("Psychic") || c.card.name.includes("Psychic")),
              1,
              "Psychic Embrace: 选择 1 张基础超能量附加",
              "player",
            ))[0]
          : ctx.searchDiscard(
              (c) =>
                c.card.supertype === "Energy" &&
                c.card.subtypes.includes("Basic") &&
                (c.card.types?.includes("Psychic") || c.card.name.includes("Psychic")),
              1
            )[0];
        if (!selectedEnergy) return;
        const selectedTargetIds = await ctx.promptUser({
          message: "Psychic Embrace: 选择 1 只备战超系宝可梦",
          min: 1,
          max: 1,
          zone: "bench",
          targets: targets.map((pokemon) => pokemon.instanceId),
        });
        const target = targets.find((pokemon) => pokemon.instanceId === selectedTargetIds[0]) ?? targets[0];
        target.attachedEnergy.push(selectedEnergy);
        target.damageCounters += 2;
        ctx.log(`Psychic Embrace: 从弃牌堆附加超能量给 ${target.card.name}，并放置 2 个伤害指示物`);
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
        // "Move an Energy from this Pokémon to 1 of your Benched Pokémon."
        // Auto-select: pick bench Pokemon with fewest attached energy (needs it most)
        if (
          ctx.source.attachedEnergy.length > 0 &&
          ctx.player.bench.cards.length > 0
        ) {
          const bench = ctx.player.bench.cards;
          const target = bench.reduce((best, curr) =>
            curr.attachedEnergy.length < best.attachedEnergy.length ? curr : best
          , bench[0]);
          const energy = ctx.source.attachedEnergy[0];
          ctx.moveEnergy(ctx.source, target, energy.instanceId);
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
        // Must account for HP-boosting tools (Bravery Charm +50, Hero's Cape +100)
        const defender = ctx.opponent.active;
        let defenderHp = parseInt(defender?.card.hp || "0");
        for (const tool of (defender?.attachedTools || [])) {
          if (tool.card.name === "Bravery Charm") defenderHp += 50;
          if (tool.card.name === "Hero's Cape") defenderHp += 100;
        }
        const currentDamage = (defender?.damageCounters ?? 0) * 10;
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
        // "If this attack Knocks Out your opponent's Active Pokémon, take 1 more Prize card."
        ctx.log("Amp You Very Much: 如果击倒对手宝可梦，多拿一张奖励卡");
        return { damage: baseDamage, extraPrize: 1 };
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
        // Can't attack next turn
        ctx.addMarker(ctx.source, CANT_ATTACK_NEXT_TURN);
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Tandem Unit",
      type: "activated" as const,
      onActivate: async (ctx) => {
        // Search deck for up to 2 Basic Lightning Pokemon and put them on bench
        const benchSpace = getBenchSpace(ctx.state, ctx.playerIndex);
        if (benchSpace <= 0) {
          ctx.log("Tandem Unit: 备战区已满");
          return;
        }
        const count = Math.min(2, benchSpace);
        const basics = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(
              (c) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic") && c.card.types?.includes("Lightning"),
              count,
              "Tandem Unit: 选择最多 2 只基础雷属性宝可梦放到备战区",
              "player",
              0,
            )
          : ctx.searchDeck(
              (c) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic") && c.card.types?.includes("Lightning"),
              count
            );
        for (const card of basics) {
          card.playedThisTurn = true;
          ctx.player.bench.cards.push(card);
        }
        ctx.shuffleDeck();
        if (basics.length > 0) {
          ctx.log(`Tandem Unit: 搜索了 ${basics.map(c => c.card.name).join(", ")} 到备战区`);
        }
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
        // Can't attack next turn
        ctx.addMarker(ctx.source, CANT_ATTACK_NEXT_TURN);
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
  abilities: [
    {
      name: "Flower Selecting",
      type: "activated" as const,
      canActivate: (ctx) => ctx.player.active?.instanceId === ctx.source.instanceId,
      getDisabledReason: () => "Flower Selecting 只能在战斗区使用",
      onActivate: async (ctx) => {
        // Look at the top 2 cards, put 1 into hand, and the other into the Lost Zone.
        const top2 = ctx.revealTopCards(2);
        if (top2.length === 0) return;

        let handCard = top2[0];
        if (top2.length > 1) {
          const selection = await ctx.promptUser({
            message: "Flower Selecting: 选择 1 张加入手牌，另一张放入失落区",
            min: 1,
            max: 1,
            zone: "deck",
            targets: top2.map((card) => card.instanceId),
          });
          handCard = top2.find((card) => card.instanceId === selection[0]) ?? top2[0];
        }

        const lostZoneCards = top2.filter((card) => card.instanceId !== handCard.instanceId);
        ctx.player.hand.cards.push(handCard);
        for (const card of lostZoneCards) {
          ctx.moveToLostZone(card);
        }
        ctx.log(
          `Flower Selecting: ${handCard.card.name} 加入手牌${lostZoneCards.length > 0 ? `，${lostZoneCards.map((card) => card.card.name).join("、")} 放入失落区` : ""}`
        );
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
        // Can't attack next turn
        ctx.addMarker(ctx.source, CANT_ATTACK_NEXT_TURN);
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
        // Opponent's active can't retreat next turn
        if (ctx.opponent.active) {
          ctx.addMarker(ctx.opponent.active, PREVENT_RETREAT_NEXT_TURN);
        }
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
        // "Shuffle this Pokémon and all attached cards into your deck."
        ctx.log("Aqua Return: 将此宝可梦和附加卡牌洗入牌组");
        return { damage: baseDamage, shuffleSelf: true };
      },
    },
  ],
  abilities: [
    {
      name: "Luminous Sign",
      type: "on_enter" as const,
      onEnter: (ctx) => {
        // When you play this from hand to bench, search deck for a Supporter
        const supporters = ctx.searchDeck(
          (c) => c.card.supertype === "Trainer" && c.card.subtypes.includes("Supporter"),
          1
        );
        if (supporters.length > 0) {
          ctx.addToHand(supporters[0]);
        }
        ctx.shuffleDeck();
        if (supporters.length > 0) {
          ctx.log(`Luminous Sign: 搜索了支持者 ${supporters[0].card.name}`);
        }
      },
    },
  ],
};

// Radiant Greninja — Concealed Cards (ability), Moonlight Shuriken
const radiantGreninja: NamedEffect = {
  cardId: "name:Radiant Greninja",
  cardName: "Radiant Greninja",
  abilities: [
    {
      name: "Concealed Cards",
      type: "activated" as const,
      onActivate: async (ctx) => {
        // Discard 1 Energy from hand, then draw 2 cards
        const energyInHand = ctx.player.hand.cards.filter(c => c.card.supertype === "Energy");
        if (energyInHand.length === 0) {
          ctx.log("Concealed Cards: 手牌中没有能量卡可弃");
          return;
        }
        const selection = await ctx.promptUser({
          message: "Concealed Cards: 选择 1 张能量牌弃掉并抽 2 张",
          min: 1,
          max: 1,
          zone: "hand",
          targets: energyInHand.map((card) => card.instanceId),
        });
        const toDiscard = energyInHand.find((card) => card.instanceId === selection[0]) ?? energyInHand[0];
        ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== toDiscard.instanceId);
        ctx.player.discard.cards.push(toDiscard);
        ctx.drawCards(2);
        ctx.log(`Concealed Cards: 弃掉 ${toDiscard.card.name}，抽了 2 张牌`);
      },
    },
  ],
  attacks: [
    {
      name: "Moonlight Shuriken",
      canAttack: (ctx) => ctx.source.attachedEnergy.length >= 2,
      getDisabledReason: () => "Moonlight Shuriken 需要弃掉 2 张能量",
      onAttack: (ctx, _baseDamage) => {
        // "Discard 2 Energy from this Pokémon. This attack does 90 damage
        //  to 2 of your opponent's Pokémon."
        // Discard exactly 2 energy
        for (let i = 0; i < 2; i++) {
          const energy = ctx.source.attachedEnergy.pop()!;
          ctx.player.discard.cards.push(energy);
        }
        // 90 damage to 2 of opponent's Pokemon (any combination of active/bench)
        // Auto-select: pick the 2 Pokemon closest to KO
        const allOpponent = [
          ctx.opponent.active,
          ...ctx.opponent.bench.cards,
        ].filter(Boolean) as typeof ctx.opponent.bench.cards;

        // Sort by remaining HP ascending (closest to KO first)
        const sorted = [...allOpponent].sort((a, b) => {
          const aRemaining = parseInt(a.card.hp || "999") - a.damageCounters * 10;
          const bRemaining = parseInt(b.card.hp || "999") - b.damageCounters * 10;
          return aRemaining - bRemaining;
        });

        const targets = sorted.slice(0, 2);
        let mainDamage = 0;
        const benchDamage: AttackResult["benchDamage"] = [];

        for (const target of targets) {
          if (target === ctx.opponent.active) {
            mainDamage += 90;
          } else {
            benchDamage.push({ target, damage: 90 });
          }
        }

        return { damage: mainDamage, benchDamage };
      },
    },
  ],
};

// Manaphy — Wave Veil (ability: bench takes no damage from attacks)
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
  abilities: [
    {
      name: "Wave Veil",
      type: "passive" as const,
      preventBenchDamage: true,
    },
  ],
};

// Bibarel — Industrious Incisors (ability: draw until 5)
const bibarel: NamedEffect = {
  cardId: "name:Bibarel",
  cardName: "Bibarel",
  attacks: [
    {
      name: "Tail Smash",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        if (!heads) return { damage: 0 };
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Industrious Incisors",
      type: "activated" as const,
      canActivate: (ctx) => ctx.player.hand.cards.length < 5,
      onActivate: (ctx) => {
        const toDraw = 5 - ctx.player.hand.cards.length;
        if (toDraw > 0) {
          ctx.drawCards(toDraw, "player");
          ctx.log(`Industrious Incisors: 抽牌直到手牌达到 5 张 (抽了 ${toDraw} 张)`);
        }
      },
    },
  ],
};

// Hawlucha — Wing Attack (70, no special effect)
const hawlucha: NamedEffect = {
  cardId: "name:Hawlucha",
  cardName: "Hawlucha",
  attacks: [
    {
      name: "Wing Attack",
      onAttack: (_ctx, baseDamage) => {
        return { damage: baseDamage };
      },
    },
  ],
};

// ───────────────────────────────────────────────
// More common attack patterns
// ───────────────────────────────────────────────

// Squawkabilly ex — Squawk and Seize (ability: discard hand, draw 6 — once per game)
const squawkabillyEx: NamedEffect = {
  cardId: "name:Squawkabilly ex",
  cardName: "Squawkabilly ex",
  attacks: [
    {
      name: "Motivate",
      onAttack: (ctx, baseDamage) => {
        // "Attach up to 2 Basic Energy cards from your discard pile to 1 of your Benched Pokémon."
        // Auto-select: bench Pokemon with fewest energy (needs it most)
        if (ctx.player.bench.cards.length === 0) return { damage: baseDamage };
        const bench = ctx.player.bench.cards;
        const target = bench.reduce((best, curr) =>
          curr.attachedEnergy.length < best.attachedEnergy.length ? curr : best
        , bench[0]);
        const basicEnergy = ctx.player.discard.cards.filter(
          (c) => c.card.supertype === "Energy" &&
                 (c.card.subtypes?.includes("Basic") ?? false)
        );
        let attached = 0;
        for (const energy of basicEnergy) {
          if (attached >= 2) break;
          const idx = ctx.player.discard.cards.indexOf(energy);
          if (idx !== -1) {
            ctx.player.discard.cards.splice(idx, 1);
            target.attachedEnergy.push(energy);
            attached++;
          }
        }
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Squawk and Seize",
      type: "activated" as const,
      canActivate: (ctx) => {
        // Once per game, only on your first turn
        return !ctx.source.markers["SQUAWK_AND_SEIZE_USED"] && ctx.state.isFirstTurn;
      },
      onActivate: (ctx) => {
        // Discard hand and draw 6
        ctx.discardHand("player");
        ctx.drawCards(6, "player");
        ctx.addMarker(ctx.source, "SQUAWK_AND_SEIZE_USED");
        ctx.log("Squawk and Seize: 弃掉全部手牌，抽 6 张牌");
      },
    },
  ],
};

// Greninja ex — Shinobi Blade (170, search deck for 1 card, add to hand, shuffle)
const greninjaEx: NamedEffect = {
  cardId: "name:Greninja ex",
  cardName: "Greninja ex",
  attacks: [
    {
      name: "Shinobi Blade",
      onAttack: (ctx, baseDamage) => {
        // Search deck for any 1 card, add to hand, shuffle deck
        const found = ctx.searchDeck(() => true, 1, "player");
        if (found.length > 0) {
          ctx.addToHand(found[0], "player");
          ctx.log(`Shinobi Blade: 从牌组中搜索了 1 张卡牌加入手牌`);
        }
        ctx.shuffleDeck("player");
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

// Fezandipiti ex — Cruel Arrow (100 damage to 1 of opponent's Pokemon)
const fezandipitiEx: NamedEffect = {
  cardId: "name:Fezandipiti ex",
  cardName: "Fezandipiti ex",
  attacks: [
    {
      name: "Cruel Arrow",
      onAttack: (ctx, _baseDamage) => {
        // "This attack does 100 damage to 1 of your opponent's Pokémon."
        // Auto-select: target the opponent Pokemon closest to KO.
        const allOpponent = [
          ctx.opponent.active,
          ...ctx.opponent.bench.cards,
        ].filter(Boolean) as typeof ctx.opponent.bench.cards;

        if (allOpponent.length === 0) return { damage: 0 };

        // Pick target closest to KO
        const target = allOpponent.reduce((best, curr) => {
          const bestRemaining = parseInt(best.card.hp || "999") - best.damageCounters * 10;
          const currRemaining = parseInt(curr.card.hp || "999") - curr.damageCounters * 10;
          return currRemaining < bestRemaining ? curr : best;
        }, allOpponent[0]);

        // If target is the active, apply as main attack damage (with W/R)
        if (target === ctx.opponent.active) {
          return { damage: 100 };
        }
        // If target is on bench, use benchDamage (no W/R for bench)
        return {
          damage: 0,
          benchDamage: [{ target, damage: 100 }],
        };
      },
    },
  ],
};

// Munkidori — full implementation (attack + Adrena Brain ability) is in psychic-core-w7.ts

// ───────────────────────────────────────────────
// Prebuilt Deck: Evolution Line Attack Effects
// ───────────────────────────────────────────────

// Charmander — Heat Tackle (30 damage, 10 self-damage)
const charmander: NamedEffect = {
  cardId: "name:Charmander",
  cardName: "Charmander",
  attacks: [
    {
      name: "Heat Tackle",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage, selfDamage: 10 }),
    },
  ],
};

// Charmeleon — Heat Tackle (70 damage, 20 self-damage)
const charmeleon: NamedEffect = {
  cardId: "name:Charmeleon",
  cardName: "Charmeleon",
  attacks: [
    {
      name: "Heat Tackle",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage, selfDamage: 20 }),
    },
  ],
};

// Kirlia — Psychic (60 + 20 per energy on opponent's active)
const kirlia: NamedEffect = {
  cardId: "name:Kirlia",
  cardName: "Kirlia",
  attacks: [
    {
      name: "Psychic",
      onAttack: (ctx, baseDamage) => {
        const energyCount = ctx.opponent.active?.attachedEnergy.length ?? 0;
        return { damage: baseDamage + energyCount * 20 };
      },
    },
  ],
};

// Flaaffy — Thunder Shock (flip coin, paralyze if heads)
const flaaffy: NamedEffect = {
  cardId: "name:Flaaffy",
  cardName: "Flaaffy",
  attacks: [
    {
      name: "Thunder Shock",
      onAttack: (ctx, baseDamage) => {
        const heads = ctx.flipCoin();
        return {
          damage: baseDamage,
          ...(heads ? { statusEffects: [{ status: "paralyzed" as const, target: "defender" as const }] } : {}),
        };
      },
    },
  ],
  abilities: [
    {
      name: "Dynamotor",
      type: "activated" as const,
      canActivate: (ctx) => {
        const hasLightningEnergy = ctx.player.discard.cards.some(
          (c) =>
            c.card.supertype === "Energy" &&
            c.card.subtypes.includes("Basic") &&
            (c.card.types?.includes("Lightning") || c.card.name.includes("Lightning"))
        );
        return hasLightningEnergy && ctx.player.bench.cards.length > 0;
      },
      getDisabledReason: (ctx) => {
        const hasLightningEnergy = ctx.player.discard.cards.some(
          (c) =>
            c.card.supertype === "Energy" &&
            c.card.subtypes.includes("Basic") &&
            (c.card.types?.includes("Lightning") || c.card.name.includes("Lightning"))
        );
        if (!hasLightningEnergy) return "Dynamotor 需要弃牌堆里有基础雷能量";
        return "Dynamotor 需要有备战区宝可梦";
      },
      onActivate: async (ctx) => {
        const energy = ctx.promptSearchDiscard
          ? (await ctx.promptSearchDiscard(
              (c) =>
                c.card.supertype === "Energy" &&
                c.card.subtypes.includes("Basic") &&
                (c.card.types?.includes("Lightning") || c.card.name.includes("Lightning")),
              1,
              "Dynamotor: 选择 1 张基础雷能量附加到备战区宝可梦",
              "player",
            ))[0]
          : ctx.searchDiscard(
              (c) =>
                c.card.supertype === "Energy" &&
                c.card.subtypes.includes("Basic") &&
                (c.card.types?.includes("Lightning") || c.card.name.includes("Lightning")),
              1
            )[0];
        if (!energy || ctx.player.bench.cards.length === 0) return;
        const selection = await ctx.promptUser({
          message: "Dynamotor: 选择 1 只备战区宝可梦",
          min: 1,
          max: 1,
          zone: "bench",
          targets: ctx.player.bench.cards.map((pokemon) => pokemon.instanceId),
        });
        const target = ctx.player.bench.cards.find((pokemon) => pokemon.instanceId === selection[0]) ?? ctx.player.bench.cards[0];
        target.attachedEnergy.push(energy);
        ctx.log(`Dynamotor: 将 ${energy.card.name} 附加给 ${target.card.name}`);
      },
    },
  ],
};

// Raikou V — Lightning Rondo (20 + 20 per benched Pokemon on both sides)
const raikouV: NamedEffect = {
  cardId: "name:Raikou V",
  cardName: "Raikou V",
  abilities: [
    {
      name: "Fleet-Footed",
      type: "activated" as const,
      canActivate: (ctx) => ctx.player.active?.instanceId === ctx.source.instanceId,
      getDisabledReason: () => "Fleet-Footed 只能在战斗区使用",
      onActivate: (ctx) => {
        ctx.drawCards(1);
        ctx.log("Fleet-Footed: 抽了 1 张牌");
      },
    },
  ],
  attacks: [
    {
      name: "Lightning Rondo",
      onAttack: (ctx, baseDamage) => {
        const benchCount = ctx.player.bench.cards.length + ctx.opponent.bench.cards.length;
        return { damage: baseDamage + benchCount * 20 };
      },
    },
  ],
};

// Sableye — Lost Mine (put 12 damage counters on opponent's Pokemon in any way, requires 10+ Lost Zone)
const sableye: NamedEffect = {
  cardId: "name:Sableye",
  cardName: "Sableye",
  attacks: [
    {
      name: "Lost Mine",
      canAttack: (ctx) => ctx.player.lostZone.cards.length >= 10,
      getDisabledReason: () => "失落区不足 10 张",
      onAttack: (ctx, _baseDamage) => {
        // Place 12 damage counters (120 damage) distributed among opponent's Pokemon
        // Auto: spread to benched Pokemon closest to KO
        const allOpp = [ctx.opponent.active, ...ctx.opponent.bench.cards].filter(Boolean) as any[];
        let remaining = 12;
        const benchDamage: { target: any; damage: number }[] = [];

        for (const target of allOpp) {
          if (remaining <= 0) break;
          const hp = parseInt(target.card.hp || "0");
          const currentHp = hp - target.damageCounters * 10;
          const countersNeeded = Math.ceil(currentHp / 10);
          const toPlace = Math.min(remaining, countersNeeded);
          if (target === ctx.opponent.active) {
            // Active damage handled by main damage
          } else {
            benchDamage.push({ target, damage: toPlace * 10 });
          }
          remaining -= toPlace;
        }
        // Put remaining counters on active
        const activeDamage = (12 - remaining - benchDamage.reduce((s, b) => s + b.damage / 10, 0)) * 10;
        return { damage: Math.max(0, activeDamage), benchDamage };
      },
    },
  ],
};

// Cramorant — Spit Innocently (110, no weakness applied — but engine handles W/R separately)
const cramorant: NamedEffect = {
  cardId: "name:Cramorant",
  cardName: "Cramorant",
  attacks: [
    {
      name: "Spit Innocently",
      ignoreEnergyCost: (ctx) => ctx.player.lostZone.cards.length >= 4,
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
};

// ───────────────────────────────────────────────
// Prebuilt Deck: Lugia VSTAR additions
// ───────────────────────────────────────────────

// Lugia V — Read the Wind (discard top 3, draw 3) + Aero Dive (discard stadium)
const lugiaV: NamedEffect = {
  cardId: "name:Lugia V",
  cardName: "Lugia V",
  attacks: [
    {
      name: "Read the Wind",
      onAttack: (ctx, _baseDamage) => {
        // Discard top 3 cards, then draw 3
        const discarded = ctx.revealTopCards(3);
        for (const c of discarded) {
          ctx.player.discard.cards.push(c);
        }
        ctx.drawCards(3);
        ctx.log(`Read the Wind: 弃掉牌组顶部 ${discarded.length} 张，抽了 3 张`);
        return { damage: 0 };
      },
    },
    {
      name: "Aero Dive",
      onAttack: (ctx, baseDamage) => {
        if (ctx.state.stadium) {
          ctx.removeStadium();
          ctx.log("Aero Dive: 移除了场地卡");
        }
        return { damage: baseDamage };
      },
    },
  ],
};

// Lugia VSTAR — Tempest Dive (220, discard stadium) + VSTAR Power: Summoning Star
const lugiaVSTAR: NamedEffect = {
  cardId: "name:Lugia VSTAR",
  cardName: "Lugia VSTAR",
  attacks: [
    {
      name: "Tempest Dive",
      onAttack: (ctx, baseDamage) => {
        if (ctx.state.stadium) {
          ctx.removeStadium();
        }
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Summoning Star",
      type: "activated" as const,
      onActivate: async (ctx) => {
        // VSTAR Power: Put up to 2 Colorless Pokemon that don't have a Rule Box from discard to bench.
        const benchSpace = getBenchSpace(ctx.state, ctx.playerIndex);
        if (benchSpace <= 0) return;

        const toPlace = ctx.promptSearchDiscard
          ? await ctx.promptSearchDiscard(
              (c) =>
                c.card.supertype === "Pokémon" &&
                c.card.types?.includes("Colorless") &&
                !c.card.subtypes.some((s) => ["V", "ex", "GX", "VSTAR", "VMAX"].includes(s)),
              Math.min(2, benchSpace),
              "Summoning Star: 选择最多 2 只无规则框的无色宝可梦放到备战区",
              "player",
              0,
            )
          : ctx.searchDiscard(
              (c) =>
                c.card.supertype === "Pokémon" &&
                c.card.types?.includes("Colorless") &&
                !c.card.subtypes.some((s) => ["V", "ex", "GX", "VSTAR", "VMAX"].includes(s)),
              Math.min(2, benchSpace)
            );

        for (const card of toPlace) {
          card.playedThisTurn = true;
          ctx.player.bench.cards.push(card);
        }
        if (toPlace.length > 0) {
          ctx.log(`Summoning Star (VSTAR): 从弃牌堆放置 ${toPlace.map(c => c.card.name).join(", ")} 到备战区`);
        }
        const vstarKey = ctx.playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
        ctx.state.turnStatus[vstarKey] = true;
      },
    },
  ],
};

// Archeops — Primal Turbo ability (attach 2 Special Energy from deck to 1 Pokemon)
const archeops: NamedEffect = {
  cardId: "name:Archeops",
  cardName: "Archeops",
  attacks: [
    {
      name: "Primal Wingbeat",
      onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }),
    },
  ],
  abilities: [
    {
      name: "Primal Turbo",
      type: "activated" as const,
      onActivate: async (ctx) => {
        // Search deck for up to 2 Special Energy cards and attach them to 1 of your Pokemon.
        const toAttach = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(
              (c) => c.card.supertype === "Energy" && !c.card.subtypes.includes("Basic"),
              2,
              "Primal Turbo: 选择最多 2 张特殊能量附加给 1 只自己的宝可梦",
              "player",
              0,
            )
          : ctx.searchDeck(
              (c) => c.card.supertype === "Energy" && !c.card.subtypes.includes("Basic"),
              2
            );
        const targets = ctx.getAllPokemon("player");
        if (targets.length === 0 || toAttach.length === 0) {
          ctx.shuffleDeck();
          return;
        }
        const selected = await ctx.promptUser({
          message: "Primal Turbo: 选择要附加能量的宝可梦",
          min: 1,
          max: 1,
          zone: "own_field",
          targets: targets.map((pokemon) => pokemon.instanceId),
        });
        const target = targets.find((pokemon) => pokemon.instanceId === selected[0]) ?? targets[0];
        for (const energy of toAttach) {
          target.attachedEnergy.push(energy);
        }
        ctx.shuffleDeck();
        ctx.log(`Primal Turbo: 附加了 ${toAttach.length} 张特殊能量给 ${target.card.name}`);
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
  lugiaV,
  lugiaVSTAR,
  archeops,
  // Evolution line effects
  charmander,
  charmeleon,
  kirlia,
  flaaffy,
  raikouV,
  sableye,
  cramorant,
];
