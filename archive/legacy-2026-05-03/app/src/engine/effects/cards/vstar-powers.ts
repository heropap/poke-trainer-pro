/**
 * VSTAR Power Effects — Once-per-game VSTAR abilities and attacks
 *
 * VSTAR Powers can only be used once per game per player.
 * The flag is tracked in state.turnStatus.p1VstarUsed / p2VstarUsed.
 *
 * VSTAR Powers come in two forms:
 * - Ability type (Starbirth, Star Portal, etc.) — uses ability activation
 * - Attack type (Star Requiem, Star Chronos, etc.) — uses attack execution
 */

import { CardEffectDef, AttackResult } from "../effect-types";
import { CANT_ATTACK_NEXT_TURN } from "../markers";

type NamedEffect = CardEffectDef & { cardName: string };

/** Helper to set VSTAR used flag */
function setVstarUsed(ctx: any): void {
  const key = ctx.playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
  ctx.state.turnStatus[key] = true;
  ctx.log("VSTAR 力量已使用（本局不可再用）");
}

/** Helper to check if VSTAR is available */
function isVstarAvailable(ctx: any): boolean {
  const key = ctx.playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
  return !ctx.state.turnStatus[key];
}

// ═══════════════════════════════════════════════════
// Arceus VSTAR — Universal engine (20%+ of decks)
// ═══════════════════════════════════════════════════

const arceusVSTAR: NamedEffect = {
  cardId: "name:Arceus VSTAR",
  cardName: "Arceus VSTAR",
  attacks: [
    {
      name: "Trinity Nova",
      onAttack: (ctx, baseDamage) => {
        // 200 damage, then search deck for up to 3 Basic Energy and attach to V Pokemon
        const energies = ctx.searchDeck(
          (c: any) => c.card.supertype === "Energy" && c.card.subtypes?.includes("Basic"),
          3
        );
        // Auto-attach: distribute among V Pokemon on field
        const vPokemon = [ctx.player.active, ...ctx.player.bench.cards]
          .filter((p: any) => p && p.card.subtypes?.some((s: string) => s === "V" || s === "VSTAR" || s === "VMAX"));
        for (let i = 0; i < energies.length && vPokemon.length > 0; i++) {
          const target = vPokemon[i % vPokemon.length];
          target.attachedEnergy.push(energies[i]);
        }
        ctx.shuffleDeck();
        if (energies.length > 0) ctx.log(`Trinity Nova: 附加了 ${energies.length} 张基本能量`);
        return { damage: baseDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Starbirth",
      type: "activated" as const,
      onActivate: (ctx: any) => {
        if (!isVstarAvailable(ctx)) return;
        // Search deck for any 2 cards
        const found = ctx.searchDeck(() => true, 2);
        ctx.shuffleDeck();
        setVstarUsed(ctx);
        if (found.length > 0) ctx.log(`Starbirth (V★): 从牌组搜索了 ${found.length} 张卡`);
      },
    },
  ],
};

// ═══════════════════════════════════════════════════
// Giratina VSTAR — Lost Zone archetype
// ═══════════════════════════════════════════════════

const giratinaVSTAR: NamedEffect = {
  cardId: "name:Giratina VSTAR",
  cardName: "Giratina VSTAR",
  attacks: [
    {
      name: "Lost Impact",
      onAttack: (ctx, baseDamage) => {
        // 280 damage, put 2 Energy attached to this Pokemon in Lost Zone
        const toRemove = Math.min(2, ctx.source.attachedEnergy.length);
        for (let i = 0; i < toRemove; i++) {
          const energy = ctx.source.attachedEnergy.pop()!;
          ctx.moveToLostZone(energy);
        }
        if (toRemove > 0) ctx.log(`Lost Impact: ${toRemove} 张能量放入失落区`);
        return { damage: baseDamage };
      },
    },
    {
      name: "Star Requiem",
      onAttack: (ctx, _baseDamage) => {
        // VSTAR Power: If 10+ cards in Lost Zone, KO opponent's active
        if (ctx.player.lostZone.cards.length < 10) {
          ctx.log("Star Requiem: 失落区不足10张，无法使用");
          return { damage: 0 };
        }
        if (!isVstarAvailable(ctx)) return { damage: 0 };
        setVstarUsed(ctx);
        // KO: set damage equal to max HP
        if (ctx.opponent.active) {
          const maxHp = parseInt(ctx.opponent.active.card.hp || "0");
          ctx.log(`Star Requiem (V★): 无条件击倒 ${ctx.opponent.active.card.name}！`);
          return { damage: maxHp + ctx.opponent.active.damageCounters * 10 };
        }
        return { damage: 0 };
      },
    },
  ],
};

// ═══════════════════════════════════════════════════
// Origin Forme Palkia VSTAR — Water archetype
// ═══════════════════════════════════════════════════

const palkiaVSTAR: NamedEffect = {
  cardId: "name:Origin Forme Palkia VSTAR",
  cardName: "Origin Forme Palkia VSTAR",
  attacks: [
    {
      name: "Subspace Swell",
      onAttack: (ctx, _baseDamage) => {
        // 60 + 20 for each benched Pokemon (both sides)
        const benchCount = ctx.player.bench.cards.length + ctx.opponent.bench.cards.length;
        return { damage: 60 + benchCount * 20 };
      },
    },
  ],
  abilities: [
    {
      name: "Star Portal",
      type: "activated" as const,
      onActivate: (ctx: any) => {
        if (!isVstarAvailable(ctx)) return;
        // Attach up to 3 Water Energy from discard to your Water Pokemon
        const waterEnergies = ctx.player.discard.cards.filter(
          (c: any) => c.card.supertype === "Energy" && c.card.name.includes("Water") && c.card.subtypes?.includes("Basic")
        );
        const toAttach = waterEnergies.slice(0, 3);
        const targets = [ctx.player.active, ...ctx.player.bench.cards]
          .filter((p: any) => p && p.card.types?.includes("Water"));
        if (targets.length === 0 && ctx.player.active) targets.push(ctx.player.active);

        for (let i = 0; i < toAttach.length; i++) {
          const energy = toAttach[i];
          ctx.player.discard.cards = ctx.player.discard.cards.filter((c: any) => c.instanceId !== energy.instanceId);
          const target = targets[i % targets.length];
          target.attachedEnergy.push(energy);
        }
        setVstarUsed(ctx);
        if (toAttach.length > 0) ctx.log(`Star Portal (V★): 从弃牌堆附加了 ${toAttach.length} 张水能量`);
      },
    },
  ],
};

// ═══════════════════════════════════════════════════
// Origin Forme Dialga VSTAR — Metal archetype
// ═══════════════════════════════════════════════════

const dialgaVSTAR: NamedEffect = {
  cardId: "name:Origin Forme Dialga VSTAR",
  cardName: "Origin Forme Dialga VSTAR",
  attacks: [
    {
      name: "Metal Blast",
      onAttack: (ctx, _baseDamage) => {
        // 40 + 40 per Metal Energy attached
        const metalCount = ctx.source.attachedEnergy.filter(
          (e: any) => e.card.types?.includes("Metal")
        ).length;
        return { damage: 40 + metalCount * 40 };
      },
    },
    {
      name: "Star Chronos",
      onAttack: (ctx, baseDamage) => {
        // VSTAR Power: 220 damage, take another turn after this one
        if (!isVstarAvailable(ctx)) return { damage: 0 };
        setVstarUsed(ctx);
        // Set extra turn flag (consumed by turn transition logic)
        (ctx.state as any).__extraTurn = true;
        ctx.log("Star Chronos (V★): 本回合结束后再进行一个回合！");
        return { damage: baseDamage };
      },
    },
  ],
};

// ═══════════════════════════════════════════════════
// Regidrago VSTAR — Dragon archetype
// ═══════════════════════════════════════════════════

const regidragoVSTAR: NamedEffect = {
  cardId: "name:Regidrago VSTAR",
  cardName: "Regidrago VSTAR",
  attacks: [
    {
      name: "Apex Dragon",
      onAttack: (ctx, _baseDamage) => {
        // Copy an attack from a Dragon Pokemon in discard pile
        // Simplified: find strongest Dragon attack damage
        const dragons = ctx.player.discard.cards.filter(
          (c: any) => c.card.supertype === "Pokémon" && c.card.types?.includes("Dragon")
        );
        if (dragons.length === 0) {
          ctx.log("Apex Dragon: 弃牌堆没有龙系宝可梦");
          return { damage: 0 };
        }
        // Find best attack damage
        let bestDamage = 0;
        let bestName = "";
        for (const dragon of dragons) {
          for (const atk of dragon.card.attacks || []) {
            const dmg = parseInt(atk.damage || "0");
            if (dmg > bestDamage) {
              bestDamage = dmg;
              bestName = `${dragon.card.name} 的 ${atk.name}`;
            }
          }
        }
        ctx.log(`Apex Dragon: 复制了 ${bestName} (${bestDamage} 伤害)`);
        return { damage: bestDamage };
      },
    },
  ],
  abilities: [
    {
      name: "Legacy Star",
      type: "activated" as const,
      onActivate: (ctx: any) => {
        if (!isVstarAvailable(ctx)) return;
        // Discard top 7 cards, then search discard for 2 cards
        const discarded = ctx.revealTopCards(7);
        for (const c of discarded) ctx.player.discard.cards.push(c);

        // Search discard for up to 2 cards
        const found: any[] = [];
        for (let i = 0; i < 2 && ctx.player.discard.cards.length > 0; i++) {
          const best = ctx.player.discard.cards[0]; // Auto-select first
          ctx.player.discard.cards = ctx.player.discard.cards.filter((c: any) => c.instanceId !== best.instanceId);
          ctx.player.hand.cards.push(best);
          found.push(best);
        }
        setVstarUsed(ctx);
        ctx.log(`Legacy Star (V★): 弃了7张牌，从弃牌堆取回 ${found.map((c: any) => c.card.name).join(", ")}`);
      },
    },
  ],
};

// ═══════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════

export const vstarPowerEffects: NamedEffect[] = [
  arceusVSTAR,
  giratinaVSTAR,
  palkiaVSTAR,
  dialgaVSTAR,
  regidragoVSTAR,
];
