// ─── External Engine Interfaces (Source Format) ───
// This represents the state structure of a robust external engine (e.g., RyuuPlay/ptcg-server).
// The goal is to map this to our Frontend GameState.

export type CardSuperType = "Pokemon" | "Trainer" | "Energy";
export type CardType = "Grass" | "Fire" | "Water" | "Lightning" | "Psychic" | "Fighting" | "Darkness" | "Metal" | "Fairy" | "Dragon" | "Colorless";

export interface ExternalCard {
  id: string; // unique ID in DB
  name: string;
  superType: CardSuperType;
  subType?: string; // Stage 1, Item, Supporter, etc.
  hp?: number;
  types?: CardType[];
  retreatCost?: CardType[];
  weakness?: { type: CardType; value?: number | string }[];
  resistance?: { type: CardType; value?: number | string }[];
  attacks?: any[]; // Simplified
  abilities?: any[]; // Simplified
  text?: string;
}

export interface CardList {
  cards: ExternalCard[];
}

export interface PokemonCardList extends CardList {
  damage: number;
  specialConditions: string[];
  markers: { name: string; count: number }[];
  // Note: RyuuPlay stores attached cards (Energy, Tools) in the `cards` array.
  // Index 0 is the Pokemon, 1+ are attached cards.
  pokemonId: string; // The ID of the Pokemon card (for reference)
}

export interface ExternalPlayer {
  id: string;
  name: string;
  active: PokemonCardList | null;
  bench: PokemonCardList[];
  hand: CardList;
  deck: CardList;
  discard: CardList;
  prizes: CardList[]; // Prizes are individual CardLists or a list of cards
  supporterPlayedTurn: number;
  energyPlayedTurn: number;
}

export interface ExternalState {
  players: ExternalPlayer[];
  turn: number;
  activePlayer: number; // 0 or 1
  phase: "SETUP" | "PLAYER_TURN" | "ATTACK" | "BETWEEN_TURNS" | "END_GAME";
  winner?: number; // 0 or 1
  log: { message: string; timestamp: number }[];
}
