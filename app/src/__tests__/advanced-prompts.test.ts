/**
 * Tests for Advanced Prompt System
 *
 * Tests:
 * 1. GamePrompt discriminated union types
 * 2. SelectCardsPrompt backward compatibility
 * 3. CoinFlipPrompt structure
 * 4. SelectPokemonPrompt structure
 * 5. OrderCardsPrompt structure
 * 6. ChooseOptionPrompt structure
 * 7. ConfirmPrompt structure
 * 8. Prompt can be assigned to GameState.prompt
 */

import {
  GamePrompt,
  SelectCardsPrompt,
  CoinFlipPrompt,
  SelectPokemonPrompt,
  OrderCardsPrompt,
  ChooseOptionPrompt,
  ConfirmPrompt,
  createGameState,
  createGameCard,
} from "@/engine/game-state";
import { Card } from "@/types/card";

const mockCard: Card = {
  id: "test-pikachu",
  name: "Pikachu",
  supertype: "Pokémon",
  subtypes: ["Basic"],
  number: "25",
  legalities: { standard: "Legal" },
  images: { small: "", large: "" },
  hp: "60",
  types: ["Lightning"],
};

describe("GamePrompt discriminated union", () => {
  test("SelectCardsPrompt has correct shape", () => {
    const prompt: SelectCardsPrompt = {
      id: "p1",
      type: "select_cards",
      playerIndex: 0,
      zone: "hand",
      min: 1,
      max: 2,
      message: "Select cards to discard",
    };

    expect(prompt.type).toBe("select_cards");
    expect(prompt.zone).toBe("hand");
    expect(prompt.min).toBe(1);
    expect(prompt.max).toBe(2);
  });

  test("CoinFlipPrompt has correct shape", () => {
    const prompt: CoinFlipPrompt = {
      id: "p2",
      type: "coin_flip",
      playerIndex: 0,
      count: 3,
      results: [true, false, true],
      message: "Flip 3 coins",
    };

    expect(prompt.type).toBe("coin_flip");
    expect(prompt.count).toBe(3);
    expect(prompt.results).toEqual([true, false, true]);
  });

  test("SelectPokemonPrompt has correct shape", () => {
    const prompt: SelectPokemonPrompt = {
      id: "p3",
      type: "select_pokemon",
      playerIndex: 1,
      zone: "bench",
      min: 1,
      max: 1,
      message: "Choose a Pokemon to switch",
    };

    expect(prompt.type).toBe("select_pokemon");
    expect(prompt.zone).toBe("bench");
    expect(prompt.min).toBe(1);
    expect(prompt.max).toBe(1);
  });

  test("OrderCardsPrompt has correct shape", () => {
    const gc = createGameCard(mockCard);
    const prompt: OrderCardsPrompt = {
      id: "p4",
      type: "order_cards",
      playerIndex: 0,
      cardIds: [gc.instanceId],
      cards: [gc],
      message: "Arrange these cards",
    };

    expect(prompt.type).toBe("order_cards");
    expect(prompt.cardIds).toHaveLength(1);
    expect(prompt.cards).toHaveLength(1);
  });

  test("ChooseOptionPrompt has correct shape", () => {
    const prompt: ChooseOptionPrompt = {
      id: "p5",
      type: "choose_option",
      playerIndex: 0,
      options: [
        { id: "a", label: "Option A", description: "First choice" },
        { id: "b", label: "Option B" },
      ],
      min: 1,
      max: 1,
      message: "Choose one",
    };

    expect(prompt.type).toBe("choose_option");
    expect(prompt.options).toHaveLength(2);
    expect(prompt.options[0].description).toBe("First choice");
    expect(prompt.options[1].description).toBeUndefined();
  });

  test("ConfirmPrompt has correct shape", () => {
    const prompt: ConfirmPrompt = {
      id: "p6",
      type: "confirm",
      playerIndex: 1,
      message: "Use ability?",
    };

    expect(prompt.type).toBe("confirm");
    expect(prompt.message).toBe("Use ability?");
  });
});

describe("GamePrompt union type discrimination", () => {
  test("can discriminate by type field", () => {
    const prompts: GamePrompt[] = [
      { id: "1", type: "select_cards", playerIndex: 0, zone: "hand", min: 1, max: 1, message: "Select" },
      { id: "2", type: "coin_flip", playerIndex: 0, count: 1, message: "Flip" },
      { id: "3", type: "select_pokemon", playerIndex: 0, zone: "bench", min: 1, max: 1, message: "Pick" },
      { id: "4", type: "order_cards", playerIndex: 0, cardIds: [], cards: [], message: "Order" },
      { id: "5", type: "choose_option", playerIndex: 0, options: [{ id: "a", label: "A" }], min: 1, max: 1, message: "Choose" },
      { id: "6", type: "confirm", playerIndex: 0, message: "Confirm?" },
    ];

    expect(prompts).toHaveLength(6);
    const types = prompts.map(p => p.type);
    expect(types).toEqual(["select_cards", "coin_flip", "select_pokemon", "order_cards", "choose_option", "confirm"]);
  });

  test("type narrowing works correctly", () => {
    const prompt: GamePrompt = {
      id: "test",
      type: "coin_flip",
      playerIndex: 0,
      count: 2,
      results: [true, false],
      message: "Flip coins",
    };

    if (prompt.type === "coin_flip") {
      // TypeScript should narrow this to CoinFlipPrompt
      expect(prompt.count).toBe(2);
      expect(prompt.results).toEqual([true, false]);
    }
  });
});

describe("GameState prompt field", () => {
  test("accepts any prompt type", () => {
    const state = createGameState("A", "B");

    // Assign each type
    state.prompt = { id: "1", type: "select_cards", playerIndex: 0, zone: "hand", min: 1, max: 1, message: "Select" };
    expect(state.prompt.type).toBe("select_cards");

    state.prompt = { id: "2", type: "coin_flip", playerIndex: 0, count: 1, message: "Flip" };
    expect(state.prompt.type).toBe("coin_flip");

    state.prompt = { id: "3", type: "confirm", playerIndex: 0, message: "OK?" };
    expect(state.prompt.type).toBe("confirm");

    state.prompt = null;
    expect(state.prompt).toBeNull();
  });
});
