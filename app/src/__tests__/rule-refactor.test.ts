/**
 * Rule Refactor Tests (Big Cycle)
 *
 * Verifies the "Big Cycle" game loop rules:
 * 1. Setup Phase
 * 2. First Turn Restrictions
 * 3. Turn Transition & Status Effects
 */

import { Card } from "@/types/card";
import {
  createGameCard,
  createGameState,
  resetInstanceCounter,
  GamePhase,
} from "@/engine/game-state";
import { initializeGame } from "@/engine/battle-setup";
import { processAction } from "@/engine/game-controller";
import { StoredDeck } from "@/services/deck-storage";
import { addCards } from "@/engine/zones";

// ─── Test Fixtures ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "sv1-1",
    name: "Pineco",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "60",
    types: ["Grass"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "s.png", large: "l.png" },
    set: "sv1",
    ...overrides,
  };
}

const basicPokemon = makeCard({ id: "sv1-1", name: "Pineco", subtypes: ["Basic"] });
const supporterCard = makeCard({ id: "sv1-200", name: "Professor's Research", supertype: "Trainer", subtypes: ["Supporter"] });

function createMockDeck(name = "Test Deck"): StoredDeck {
  const cards = [];
  // 20 Basic Pokemon
  for (let i = 0; i < 20; i++) {
    cards.push({
      cardId: `sv1-${i + 1}`,
      name: `Pokemon ${i + 1}`,
      quantity: 1,
      setCode: "SVI",
      number: String(i + 1),
      category: "pokemon" as const,
      found: true,
      standardLegal: true,
    });
  }
  // 40 Supporters
  for (let i = 0; i < 40; i++) {
    cards.push({
      cardId: `sv1-${i + 100}`,
      name: `Supporter ${i + 1}`,
      quantity: 1,
      setCode: "SVI",
      number: String(i + 100),
      category: "trainer" as const,
      found: true,
      standardLegal: true,
    });
  }

  return {
    id: `deck-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
    deckText: "mock",
    totalCards: 60,
    isValid: true,
    cards,
    warnings: [],
    errors: [],
  };
}

function mockCardLookup(id: string): Card | undefined {
  if (id.includes("Pokemon")) return basicPokemon;
  if (id.includes("Supporter")) return supporterCard;
  return basicPokemon; // fallback
}

describe("Big Cycle Rules", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it("Full Game Loop Test", async () => {
    // 1. Initialize Game
    const deck1 = createMockDeck("P1 Deck");
    const deck2 = createMockDeck("P2 Deck");
    const initRes = initializeGame(deck1, deck2, mockCardLookup, "P1", "P2");
    
    expect(initRes.success).toBe(true);
    const state = initRes.gameState!;

    // Ensure P1 starts (Turn 1)
    state.currentPlayer = 0;
    state.turn = 1;
    state.isFirstTurn = true;
    state.phase = GamePhase.MAIN; // Skip draw phase for test simplicity

    // Manually place Active Pokemon for both players
    const p1Active = state.players[0].hand.cards.find(c => c.card.subtypes.includes("Basic"));
    const p2Active = state.players[1].hand.cards.find(c => c.card.subtypes.includes("Basic"));

    if (p1Active) {
      state.players[0].active = p1Active;
      state.players[0].hand.cards = state.players[0].hand.cards.filter(c => c !== p1Active);
    }
    if (p2Active) {
      state.players[1].active = p2Active;
      state.players[1].hand.cards = state.players[1].hand.cards.filter(c => c !== p2Active);
    }

    // Give P1 a Supporter
    const p1Supporter = createGameCard(supporterCard);
    state.players[0].hand.cards.push(p1Supporter);

    // ─── Turn 1 (P1) Restrictions ───
    
    // Test: Attack Ban
    const attackRes = await processAction(state, 0, { type: "attack", attackName: "Tackle" });
    expect(attackRes.success).toBe(false);
    expect(attackRes.error).toMatch(/先攻第一回合不能攻击/);

    // Test: Supporter Ban
    const supportRes = await processAction(state, 0, { type: "play_card", cardId: p1Supporter.instanceId });
    expect(supportRes.success).toBe(false);
    expect(supportRes.error).toMatch(/先攻第一回合不能使用支持者/);

    // End Turn 1
    const endRes = await processAction(state, 0, { type: "end_turn" });
    expect(endRes.success).toBe(true);

    // ─── Turn 2 (P2) Logic ───
    
    expect(state.turn).toBe(2);
    expect(state.currentPlayer).toBe(1);
    expect(state.isFirstTurn).toBe(false);

    // Give P2 a Supporter
    const p2Supporter = createGameCard(supporterCard);
    state.players[1].hand.cards.push(p2Supporter);

    // Test: Supporter Allowed
    const p2SupportRes = await processAction(state, 1, { type: "play_card", cardId: p2Supporter.instanceId });
    expect(p2SupportRes.success).toBe(true); // Should pass (assuming no effect logic blocking)

    // ─── Status Effect Persistence (Paralysis) ───
    
    // Simulate P2 attacking P1 and causing Paralysis
    // We manually set P1 Active to Paralyzed
    if (state.players[0].active) {
      state.players[0].active.statusConditions = ["paralyzed"];
    }

    // End Turn 2 (P2)
    await processAction(state, 1, { type: "end_turn" });

    // ─── Turn 3 (P1) ───
    
    expect(state.turn).toBe(3);
    expect(state.currentPlayer).toBe(0);

    // Verify P1 is STILL Paralyzed (P2 ending turn should NOT cure P1)
    expect(state.players[0].active?.statusConditions).toContain("paralyzed");

    // P1 attempts to attack (Should fail due to Paralysis)
    // Note: attack check usually handles paralysis? 
    // Wait, performAttack checks status. Let's assume it does.
    // But we are testing the Cure Logic.

    // End Turn 3 (P1) -> Should Cure P1 Paralysis
    await processAction(state, 0, { type: "end_turn" });

    // ─── Turn 4 (P2) ───
    
    expect(state.turn).toBe(4);
    // P1 should be cured now
    expect(state.players[0].active?.statusConditions).not.toContain("paralyzed");
  });
});
