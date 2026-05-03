// ─── Demo / Test Script ───
// Run this to verify the Mock Engine's strict rules.

import { MockEngine } from "./mock-engine";
import { ExternalState, ExternalPlayer, PokemonCardList, ExternalCard, CardList } from "./external-types";

// 1. Setup Mock State
const mockCard: ExternalCard = {
  id: "c1", name: "Charmander", superType: "Pokemon", hp: 60,
  attacks: [{ name: "Scratch", damage: 10, cost: ["Fire"] }],
  weakness: [{ type: "Water", value: "x2" }],
  retreatCost: ["Colorless"]
};

const mockEnergy: ExternalCard = {
  id: "e1", name: "Fire Energy", superType: "Energy"
};

const mockPlayer1: ExternalPlayer = {
  id: "p1", name: "Ash",
  active: { cards: [mockCard], damage: 0, specialConditions: [], markers: [], pokemonId: "poke1" },
  bench: [],
  hand: { cards: [mockEnergy, mockEnergy] }, // Two energies
  deck: { cards: [] },
  discard: { cards: [] },
  prizes: [],
  energyPlayedTurn: 0,
  supporterPlayedTurn: 0
};

const mockPlayer2: ExternalPlayer = {
  id: "p2", name: "Gary",
  active: { cards: [{ ...mockCard, id: "c2", name: "Squirtle", weakness: [{ type: "Lightning", value: "x2" }] }], damage: 0, specialConditions: [], markers: [], pokemonId: "poke2" },
  bench: [],
  hand: { cards: [] },
  deck: { cards: [] },
  discard: { cards: [] },
  prizes: [],
  energyPlayedTurn: 0,
  supporterPlayedTurn: 0
};

const initialState: ExternalState = {
  players: [mockPlayer1, mockPlayer2],
  turn: 1,
  activePlayer: 0, // Player 1 starts
  phase: "PLAYER_TURN",
  log: []
};

// 2. Initialize Engine
const engine = new MockEngine(initialState);
console.log("=== Game Start ===");

// 3. Test Energy Attachment Rule
console.log("\n--- Testing Energy Rule ---");
const result1 = engine.playEnergy("p1", "e1", "poke1");
console.log(`Attach 1st Energy: ${result1.success ? "Success" : "Failed"}`); // Should be Success

const result2 = engine.playEnergy("p1", "e1", "poke1");
console.log(`Attach 2nd Energy: ${result2.success ? "Success" : "Failed"} (${result2.message})`); // Should be Failed

// 4. Test Attack & Weakness
console.log("\n--- Testing Attack ---");
// Ash attacks Squirtle (Water type, no weakness to Fire)
// Wait, Squirtle is Water type? I defined it as just a card named Squirtle.
// Let's assume types are handled correctly in a real engine.
// Here mockCard (Charmander) is attacking Squirtle.
// Charmander is Fire. Squirtle has weakness to Lightning.
// So damage should be base 10.

engine.attack("p1", "Scratch");
const stateAfterAttack = engine.getState();
const squirtleDamage = stateAfterAttack.players[1].active?.damage;
console.log(`Squirtle Damage: ${squirtleDamage}`); // Should be 10

console.log("\n=== Demo Complete ===");
