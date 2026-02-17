
import { createGameState, createGameCard, createZone, GameState, GameCard } from "../game-state";
import { attachEnergy } from "../turn-actions";
import { checkEnergyCostDetailed } from "../game-actions";
import { Card } from "@/types/card";

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: overrides.id ?? "test-card",
    name: overrides.name ?? "Test Card",
    supertype: overrides.supertype ?? "Trainer",
    subtypes: overrides.subtypes ?? [],
    number: overrides.number ?? "0",
    legalities: overrides.legalities ?? {},
    images: overrides.images ?? { small: "", large: "" },
    ...overrides,
  };
}

describe("Energy Attachment Logic", () => {
  let state: GameState;
  const playerIndex: 0 | 1 = 0;
  let energyCard: GameCard;
  let pokemonCard: GameCard;

  beforeEach(() => {
    state = createGameState("Player 1", "Player 2");
    state.phase = "main";
    state.currentPlayer = playerIndex;
    
    const p1 = state.players[0];
    
    // Create Energy
    energyCard = createGameCard(makeCard({
      id: "energy-1",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      types: ["Fire"],
    }));
    
    // Create Pokemon
    pokemonCard = createGameCard(makeCard({
      id: "charmander-1",
      name: "Charmander",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hp: "60",
      number: "1",
    }));

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
    const trainerCard = createGameCard(makeCard({
      id: "potion",
      name: "Potion",
      supertype: "Trainer",
      subtypes: ["Item"]
    }));
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

describe("Energy Cost Calculation", () => {
  test("basic energy matches specific costs", () => {
    const fire1 = createGameCard(makeCard({
      id: "fire-1",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      types: ["Fire"],
    }));
    const fire2 = createGameCard(makeCard({
      id: "fire-2",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      types: ["Fire"],
    }));

    const result = checkEnergyCostDetailed([fire1, fire2], ["Fire", "Fire"]);
    expect(result.sufficient).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test("colorless cost can be paid by any remaining energy", () => {
    const fire = createGameCard(makeCard({
      id: "fire-1",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      types: ["Fire"],
    }));
    const water = createGameCard(makeCard({
      id: "water-1",
      name: "Water Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      types: ["Water"],
    }));

    const result = checkEnergyCostDetailed(
      [fire, water],
      ["Fire", "Colorless"]
    );
    expect(result.sufficient).toBe(true);
  });

  test("luminous energy can satisfy any specific color", () => {
    const luminous = createGameCard(makeCard({
      id: "luminous-1",
      name: "Luminous Energy",
      supertype: "Energy",
      subtypes: ["Special"],
    }));

    const result = checkEnergyCostDetailed([luminous], ["Fire"]);
    expect(result.sufficient).toBe(true);
  });

  test("double turbo energy can pay two colorless", () => {
    const doubleTurbo = createGameCard(makeCard({
      id: "double-turbo-1",
      name: "Double Turbo Energy",
      supertype: "Energy",
      subtypes: ["Special"],
    }));

    const result = checkEnergyCostDetailed(
      [doubleTurbo],
      ["Colorless", "Colorless"]
    );
    expect(result.sufficient).toBe(true);
  });

  test("missing costs are reported", () => {
    const fire = createGameCard(makeCard({
      id: "fire-1",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      types: ["Fire"],
    }));

    const result = checkEnergyCostDetailed([fire], ["Fire", "Colorless"]);
    expect(result.sufficient).toBe(false);
    expect(result.missing).toEqual(["Colorless"]);
  });
});
