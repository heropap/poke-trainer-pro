
import { createGameState, GamePhase } from "@/engine/game-state";
import { processAction } from "@/engine/game-controller";
import { createGameCard } from "@/engine/game-state";

// Mock Data Helpers
const MOCK_ENERGY = {
  id: "basic-energy-water",
  name: "Water Energy",
  supertype: "Energy",
  subtypes: ["Basic"],
  set: "SVI",
  number: "1",
} as any;

const MOCK_SUPPORTER = {
  id: "supporter-research",
  name: "Professor's Research",
  supertype: "Trainer",
  subtypes: ["Supporter"],
  set: "SVI",
  number: "2",
} as any;

const MOCK_POKEMON = {
  id: "pokemon-greninja",
  name: "Greninja",
  supertype: "Pokémon",
  subtypes: ["Basic"],
  hp: "100",
  types: ["Water"],
  retreatCost: ["Colorless"],
  attacks: [
    { name: "Water Shuriken", cost: ["Water"], damage: "20", text: "" }
  ],
  set: "SVI",
  number: "3",
} as any;

describe("Game FSM & Action Dispatcher", () => {
  let state: any;

  beforeEach(() => {
    state = createGameState("Player 1", "Player 2");
    // Manually advance to MAIN phase for testing main actions
    state.phase = GamePhase.MAIN;
    state.turnStatus.currentPhase = GamePhase.MAIN;
    state.currentPlayer = 0;
    
    // Setup Active Pokemon for both players
    const active = createGameCard(MOCK_POKEMON);
    state.players[0].active = active;
    state.players[0].hand.cards = [];

    // Player 2 needs active + deck for proper turn transition
    state.players[1].active = createGameCard(MOCK_POKEMON);
    for (let i = 0; i < 10; i++) {
      state.players[1].deck.cards.push(createGameCard(MOCK_POKEMON));
    }
  });

  it("should enforce ONE energy attachment per turn", async () => {
    const energy1 = createGameCard(MOCK_ENERGY);
    const energy2 = createGameCard(MOCK_ENERGY);
    state.players[0].hand.cards.push(energy1, energy2);

    // 1. Attach First Energy -> Success
    const res1 = await processAction(state, 0, {
      type: "play_card",
      cardId: energy1.instanceId,
      targetId: state.players[0].active.instanceId
    });
    expect(res1.success).toBe(true);
    state = res1.newState; // Update state
    expect(state.turnStatus.hasAttachedEnergy).toBe(true);

    // 2. Attach Second Energy -> Fail
    const res2 = await processAction(state, 0, {
      type: "play_card",
      cardId: energy2.instanceId,
      targetId: state.players[0].active.instanceId
    });
    expect(res2.success).toBe(false);
    expect(res2.error).toMatch(/每回合只能附加一次能量/);
  });

  it("should enforce ONE supporter per turn", async () => {
    const sup1 = createGameCard(MOCK_SUPPORTER);
    const sup2 = createGameCard(MOCK_SUPPORTER);
    state.players[0].hand.cards.push(sup1, sup2);

    // 1. Play First Supporter -> Success
    const res1 = await processAction(state, 0, {
      type: "play_card",
      cardId: sup1.instanceId
    });
    expect(res1.success).toBe(true);
    state = res1.newState; // Update state
    expect(state.turnStatus.hasPlayedSupporter).toBe(true);

    // 2. Play Second Supporter -> Fail
    const res2 = await processAction(state, 0, {
      type: "play_card",
      cardId: sup2.instanceId
    });
    expect(res2.success).toBe(false);
    expect(res2.error).toMatch(/每回合只能使用一张支持者/);
  });

  it("should enforce ONE retreat per turn", async () => {
    // Setup Bench
    const bench = createGameCard(MOCK_POKEMON);
    state.players[0].bench.cards.push(bench);
    
    // Give active energy for retreat
    const energy = createGameCard(MOCK_ENERGY);
    state.players[0].active.attachedEnergy.push(energy);

    // 1. Retreat -> Success
    const res1 = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: bench.instanceId,
      energyToDiscard: [energy.instanceId]
    });
    expect(res1.success).toBe(true);
    state = res1.newState; // Update state
    expect(state.turnStatus.hasRetreated).toBe(true);

    // 2. Retreat Again -> Fail
    const res2 = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: state.players[0].bench.cards[0].instanceId,
      energyToDiscard: []
    });
    expect(res2.success).toBe(false);
    // Updated expected error message
    expect(res2.error).toMatch(/每回合只能撤退一次/);
  });

  it("should transition from ATTACK to END_TURN automatically", async () => {
    const energy = createGameCard(MOCK_ENERGY);
    state.players[0].active.attachedEnergy.push(energy);

    // 1. Attack
    const res = await processAction(state, 0, {
      type: "attack",
      attackName: "Water Shuriken"
    });

    expect(res.success).toBe(true);
    state = res.newState; // Update state
    
    // Should auto-transition to next player's turn
    expect(state.currentPlayer).toBe(1); // Switched to Player 2
    expect(state.phase).toBe(GamePhase.MAIN); // After auto-draw, next player is in MAIN
    expect(state.turn).toBe(1); // Turn count incremented (0 -> 1)
  });

  it("should block actions during wrong phase", async () => {
    state.phase = GamePhase.CHECKUP;
    
    const energy = createGameCard(MOCK_ENERGY);
    state.players[0].hand.cards.push(energy);

    const res = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetId: state.players[0].active.instanceId
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/只能在主阶段/);
  });
});
