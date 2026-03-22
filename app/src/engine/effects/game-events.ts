/**
 * Game Effect Events
 *
 * Defines the event types that flow through the Effect Event Bus.
 * These events are emitted after key game actions and consumed by
 * abilities registered with `onEvent` triggers.
 *
 * The event bus enables chain reactions:
 *   attack → DAMAGE_DEALT → ability triggers → POKEMON_KO → ability triggers → ...
 */

import { GameCard, StatusCondition } from "../game-state";

// ───────────────────────────────────────────────
// Event Type Definitions
// ───────────────────────────────────────────────

export type GameEffectEvent =
  | DamageDealtEvent
  | PokemonKOEvent
  | CardPlayedEvent
  | PokemonEnteredEvent
  | EnergyAttachedEvent
  | StatusAppliedEvent
  | StatusRemovedEvent
  | RetreatEvent
  | EvolutionEvent
  | TurnEndEvent
  | PrizeTakenEvent;

export interface DamageDealtEvent {
  type: "DAMAGE_DEALT";
  source: GameCard;
  target: GameCard;
  amount: number;
  attackName?: string;
  playerIndex: 0 | 1;
}

export interface PokemonKOEvent {
  type: "POKEMON_KO";
  pokemon: GameCard;
  knockedBy?: GameCard;
  playerIndex: 0 | 1;
}

export interface CardPlayedEvent {
  type: "CARD_PLAYED";
  card: GameCard;
  cardType: "supporter" | "item" | "stadium" | "pokemon" | "energy" | "tool";
  playerIndex: 0 | 1;
}

export interface PokemonEnteredEvent {
  type: "POKEMON_ENTERED";
  pokemon: GameCard;
  from: "hand" | "bench" | "evolution";
  playerIndex: 0 | 1;
}

export interface EnergyAttachedEvent {
  type: "ENERGY_ATTACHED";
  pokemon: GameCard;
  energy: GameCard;
  playerIndex: 0 | 1;
}

export interface StatusAppliedEvent {
  type: "STATUS_APPLIED";
  pokemon: GameCard;
  status: StatusCondition;
  playerIndex: 0 | 1;
}

export interface StatusRemovedEvent {
  type: "STATUS_REMOVED";
  pokemon: GameCard;
  status: StatusCondition;
  playerIndex: 0 | 1;
}

export interface RetreatEvent {
  type: "RETREAT";
  pokemon: GameCard;
  playerIndex: 0 | 1;
}

export interface EvolutionEvent {
  type: "EVOLUTION";
  pokemon: GameCard;
  from: GameCard;
  playerIndex: 0 | 1;
}

export interface TurnEndEvent {
  type: "TURN_END";
  playerIndex: 0 | 1;
}

export interface PrizeTakenEvent {
  type: "PRIZE_TAKEN";
  playerIndex: 0 | 1;
  count: number;
}
