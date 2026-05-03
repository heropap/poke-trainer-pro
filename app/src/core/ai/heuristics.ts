import { getCard } from "../cards";
import type { GameCard, GameState, PlayerIndex, PlayerState } from "../state";
import type { EnergyType, PokemonAttack } from "../types";

export function asPokemonDef(card: GameCard) {
  const d = getCard(card.cardId);
  return d.kind === "Pokemon" ? d : null;
}

export function asTrainerDef(card: GameCard) {
  const d = getCard(card.cardId);
  return d.kind === "Trainer" ? d : null;
}

export function asEnergyDef(card: GameCard) {
  const d = getCard(card.cardId);
  return d.kind === "Energy" ? d : null;
}

export function isBasicPokemonCard(card: GameCard): boolean {
  const d = asPokemonDef(card);
  return !!d && d.stage === "Basic";
}

// Greedy energy cost satisfaction (matches reducer's canPayAttackCost).
export function canPayCost(attached: GameCard[], cost: EnergyType[]): boolean {
  const remaining = [...attached];
  const specific = cost.filter((c) => c !== "Colorless");
  const colorless = cost.filter((c) => c === "Colorless").length;
  for (const t of specific) {
    const idx = remaining.findIndex((e) => {
      const def = getCard(e.cardId);
      return def.kind === "Energy" && def.energyType === t;
    });
    if (idx < 0) return false;
    remaining.splice(idx, 1);
  }
  return remaining.length >= colorless;
}

export function pickBestAttack(active: GameCard): { index: number; attack: PokemonAttack } | null {
  const def = asPokemonDef(active);
  if (!def) return null;
  let best: { index: number; attack: PokemonAttack } | null = null;
  for (let i = 0; i < def.attacks.length; i++) {
    const a = def.attacks[i];
    if (!canPayCost(active.attachedEnergy, a.cost)) continue;
    if (!best || a.damage > best.attack.damage) {
      best = { index: i, attack: a };
    }
  }
  return best;
}

export function findBasicInHand(player: PlayerState): GameCard | null {
  return player.hand.find(isBasicPokemonCard) ?? null;
}

export function findEvolutionInHand(
  player: PlayerState,
): { evo: GameCard; targetUid: string } | null {
  for (const evo of player.hand) {
    const def = asPokemonDef(evo);
    if (!def) continue;
    if (def.stage !== "Stage1" && def.stage !== "Stage2") continue;
    if (!def.evolvesFrom) continue;
    // Find a Pokemon in play with that name (and not played this turn).
    const candidates: GameCard[] = [];
    if (player.active) candidates.push(player.active);
    for (const b of player.bench) if (b) candidates.push(b);
    for (const c of candidates) {
      const cd = asPokemonDef(c);
      if (!cd) continue;
      if (cd.name !== def.evolvesFrom) continue;
      if (c.markers["playedThisTurn"] === true) continue;
      return { evo, targetUid: c.uid };
    }
  }
  return null;
}

export function findEnergyInHand(player: PlayerState): GameCard | null {
  return player.hand.find((c) => getCard(c.cardId).kind === "Energy") ?? null;
}

export function findSupporterInHand(player: PlayerState): GameCard | null {
  return (
    player.hand.find((c) => {
      const d = asTrainerDef(c);
      return d?.trainerKind === "Supporter";
    }) ?? null
  );
}

export function findItemInHand(player: PlayerState, allowedIds: string[]): GameCard | null {
  return (
    player.hand.find((c) => {
      const d = asTrainerDef(c);
      return d?.trainerKind === "Item" && allowedIds.includes(c.cardId);
    }) ?? null
  );
}

export function findUsableAbility(
  player: PlayerState,
): { card: GameCard; abilityName: string } | null {
  const candidates: GameCard[] = [];
  if (player.active) candidates.push(player.active);
  for (const b of player.bench) if (b) candidates.push(b);
  for (const c of candidates) {
    if (c.markers["abilityUsedThisTurn"] === true) continue;
    const def = asPokemonDef(c);
    if (!def?.abilities) continue;
    for (const a of def.abilities) {
      // Abilities the v0 AI knows how to use:
      if (a.name === "Quick Search" && c.cardId === "obf-164") {
        if (player.deck.length > 0) return { card: c, abilityName: a.name };
      }
      if (a.name === "Psychic Embrace" && c.cardId === "svi-86") {
        if (player.discard.some((d) => d.cardId === "sve-5")) {
          return { card: c, abilityName: a.name };
        }
      }
      if (a.name === "Dynamotor" && c.cardId === "evs-55") {
        if (player.discard.some((d) => d.cardId === "sve-4")) {
          // Need a bench target.
          if (player.bench.some((b) => b !== null)) {
            return { card: c, abilityName: a.name };
          }
        }
      }
      if (a.name === "Refinement" && c.cardId === "svi-68") {
        if (player.hand.length > 0 && player.deck.length > 0) {
          return { card: c, abilityName: a.name };
        }
      }
      if (a.name === "Premonition" && c.cardId === "asr-62") {
        if (player.deck.length > 0) {
          return { card: c, abilityName: a.name };
        }
      }
    }
  }
  return null;
}

export function findFirstEmptyBenchSlot(player: PlayerState): number {
  return player.bench.findIndex((b) => b === null);
}

export function findStrongestActiveTarget(state: GameState, attacker: PlayerIndex): GameCard | null {
  const opp = state.players[(1 - attacker) as PlayerIndex];
  return opp.active;
}
