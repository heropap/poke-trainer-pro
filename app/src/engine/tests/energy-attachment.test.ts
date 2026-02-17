
import { createGameState, createGameCard, createZone, GameState, GameCard } from "../game-state";
import { attachEnergy } from "../turn-actions";

// Mock logEvent since it's not exported or mockable easily without dependency injection
// But here we import the module directly. We can mock the module if needed.
// For unit test, we just want to check state mutation.

describe("Energy Attachment Logic", () => {
  let state: GameState;
  let playerIndex: 0 | 1 = 0;
  let energyCard: GameCard;
  let pokemonCard: GameCard;

  beforeEach(() => {
    state = createGameState("Player 1", "Player 2");
    state.phase = "main";
    state.currentPlayer = playerIndex;
    
    const p1 = state.players[0];
    
    // Create Energy
    energyCard = createGameCard({
      id: "energy-1",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    
    // Create Pokemon
    pokemonCard = createGameCard({
      id: "charmander-1",
      name: "Charmander",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hp: "60"
    });

    // Setup Hand and Active
    p1.hand = createZone([energyCard]);
    p1.active = pokemonCard;
  });

  test("should attach energy successfully", () => {
    const result = attachEnergy(state, energyCard.instanceId, pokemonCard.instanceId);
    
    expect(result.success).toBe(true);
    
    const p1 = state.players[0];
    // Energy removed from hand
    expect(p1.hand.cards).toHaveLength(0);
    // Energy added to Pokemon
    expect(p1.active?.attachedEnergy).toHaveLength(1);
    expect(p1.active?.attachedEnergy[0].instanceId).toBe(energyCard.instanceId);
    // Flag set
    expect(p1.energyAttachedThisTurn).toBe(true);
  });

  test("should prevent attaching twice per turn", () => {
    const p1 = state.players[0];
    p1.energyAttachedThisTurn = true;
    
    const result = attachEnergy(state, energyCard.instanceId, pokemonCard.instanceId);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("每回合只能附加一次能量");
    
    // State unchanged
    expect(p1.hand.cards).toHaveLength(1);
    expect(p1.active?.attachedEnergy).toHaveLength(0);
  });

  test("should prevent attaching non-energy card", () => {
    const p1 = state.players[0];
    const trainerCard = createGameCard({
      id: "potion",
      name: "Potion",
      supertype: "Trainer",
      subtypes: ["Item"]
    });
    p1.hand = createZone([trainerCard]);
    
    const result = attachEnergy(state, trainerCard.instanceId, pokemonCard.instanceId);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("所选卡牌不是能量卡");
  });

  test("should update attachedEnergy array reference (immutability check)", () => {
    const p1 = state.players[0];
    const initialAttachedArray = p1.active!.attachedEnergy;
    
    attachEnergy(state, energyCard.instanceId, pokemonCard.instanceId);
    
    const newAttachedArray = p1.active!.attachedEnergy;
    
    expect(newAttachedArray).not.toBe(initialAttachedArray);
    expect(newAttachedArray).toHaveLength(1);
  });
});
