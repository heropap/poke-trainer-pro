import { ExternalCard, ExternalPlayer, ExternalState, PokemonCardList } from "./external-types";

// ─── Mock Cards ───

export const MOCK_CARDS: Record<string, ExternalCard> = {
  // Pokemon
  charmander: {
    id: "c-charmander", name: "Charmander", superType: "Pokemon", subType: "Basic", hp: 60,
    types: ["Fire"],
    attacks: [{ name: "Scratch", damage: 10, cost: ["Colorless"] }, { name: "Ember", damage: 30, cost: ["Fire", "Colorless"] }],
    weakness: [{ type: "Water", value: "x2" }],
    retreatCost: ["Colorless"]
  },
  charmeleon: {
    id: "c-charmeleon", name: "Charmeleon", superType: "Pokemon", subType: "Stage 1", hp: 90,
    types: ["Fire"],
    attacks: [{ name: "Flamethrower", damage: 50, cost: ["Fire", "Fire", "Colorless"] }],
    weakness: [{ type: "Water", value: "x2" }],
    retreatCost: ["Colorless", "Colorless"]
  },
  squirtle: {
    id: "c-squirtle", name: "Squirtle", superType: "Pokemon", subType: "Basic", hp: 60,
    types: ["Water"],
    attacks: [{ name: "Bubble", damage: 10, cost: ["Water"] }],
    weakness: [{ type: "Lightning", value: "x2" }],
    retreatCost: ["Colorless"]
  },
  
  // Energy
  fireEnergy: { id: "e-fire", name: "Fire Energy", superType: "Energy", types: ["Fire"] },
  waterEnergy: { id: "e-water", name: "Water Energy", superType: "Energy", types: ["Water"] },

  // Trainers
  potion: {
    id: "t-potion", name: "Potion", superType: "Trainer", subType: "Item",
    text: "Heal 30 damage from one of your Pokemon."
  },
  profResearch: {
    id: "t-research", name: "Professor's Research", superType: "Trainer", subType: "Supporter",
    text: "Discard your hand and draw 7 cards."
  }
};

// ─── Initial State Helper ───

export function createMockInitialState(): ExternalState {
  const p1Id = "p1";
  const p2Id = "p2";

  // Player 1: Charmander Deck (Active: Charmander, Hand: Charmeleon, Energy, Potion)
  const p1: ExternalPlayer = {
    id: p1Id, name: "Ash (Mock)",
    active: createPokemon(MOCK_CARDS.charmander, p1Id, "active"),
    bench: [createPokemon(MOCK_CARDS.charmander, p1Id, "bench-1")], // Bench Charmander for backup
    hand: { 
      cards: [
        {...MOCK_CARDS.charmeleon, id: "c-charmeleon-1"}, // Evolution
        {...MOCK_CARDS.fireEnergy, id: "e-fire-1"},
        {...MOCK_CARDS.fireEnergy, id: "e-fire-2"},
        {...MOCK_CARDS.potion, id: "t-potion-1"},
        {...MOCK_CARDS.profResearch, id: "t-research-1"}
      ] 
    },
    deck: { cards: [] },
    discard: { cards: [] },
    prizes: [],
    energyPlayedTurn: 0,
    supporterPlayedTurn: 0
  };

  // Player 2: Squirtle Deck
  const p2: ExternalPlayer = {
    id: p2Id, name: "Gary (Mock)",
    active: createPokemon(MOCK_CARDS.squirtle, p2Id, "active"),
    bench: [],
    hand: { cards: [] }, // AI hand empty for now
    deck: { cards: [] },
    discard: { cards: [] },
    prizes: [],
    energyPlayedTurn: 0,
    supporterPlayedTurn: 0
  };

  return {
    players: [p1, p2],
    turn: 1,
    activePlayer: 0,
    phase: "PLAYER_TURN",
    log: [{ message: "Mock Battle Started!", timestamp: Date.now() }]
  };
}

function createPokemon(card: ExternalCard, ownerId: string, locationSuffix: string): PokemonCardList {
  return {
    pokemonId: `${card.id}-${ownerId}-${locationSuffix}`,
    cards: [{ ...card, id: `${card.id}-${ownerId}-${locationSuffix}-card` }], // Unique instance ID
    damage: 0,
    specialConditions: [],
    markers: []
  };
}
