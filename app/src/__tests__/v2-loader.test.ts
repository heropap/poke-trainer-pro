/**
 * V2 Loader — Integration Tests
 *
 * Verifies that V2 compiled effects are correctly registered
 * in the effect registry at L2.5 layer.
 */

import {
  clearRegistry,
  getRegisteredCount,
  getNameRegisteredCount,
  getEffect,
  getEffectSource,
  registerEffect,
} from "../engine/effects/effect-registry";
import { loadV2EffectsFromArray, V2LoadResult } from "../engine/effects/v2-loader";
import { compileAllV2, CardRuleV2Entry } from "../engine/rules/rule-compiler-v2";
import * as fs from "fs";
import * as path from "path";

// Load card-rules-v2.json
const RULES_PATH = path.join(__dirname, "..", "data", "card-rules-v2.json");
let allCards: CardRuleV2Entry[] = [];

beforeAll(() => {
  const raw = fs.readFileSync(RULES_PATH, "utf-8");
  allCards = JSON.parse(raw);
});

describe("V2 Loader — Registration", () => {
  beforeEach(() => {
    clearRegistry();
  });

  test("registers V2 effects into empty registry", () => {
    const result = loadV2EffectsFromArray(allCards);

    expect(result.compiled).toBeGreaterThan(4000);
    expect(result.registeredById).toBeGreaterThan(4000);
    expect(result.registeredByName).toBeGreaterThan(0);
    expect(result.skippedHigherPriority).toBe(0);
    expect(result.errors).toBe(0);

    // Registry should have entries
    expect(getRegisteredCount()).toBeGreaterThan(4000);
    expect(getNameRegisteredCount()).toBeGreaterThan(0);

    console.log(
      `\n═══ V2 Loader Results ═══\n` +
      `Compiled: ${result.compiled}\n` +
      `Registered by ID: ${result.registeredById}\n` +
      `Registered by name: ${result.registeredByName}\n` +
      `ID registry size: ${getRegisteredCount()}\n` +
      `Name registry size: ${getNameRegisteredCount()}`
    );
  });

  test("V2 effects have correct source layer", () => {
    loadV2EffectsFromArray(allCards);

    // Pick a card that we know exists
    const sampleCard = allCards.find(c => c.rules.some(r => r.mapped && r.type === "attack"));
    expect(sampleCard).toBeDefined();

    const source = getEffectSource(sampleCard!.cardId);
    expect(source).toBe("L2.5");
  });

  test("V2 effects are accessible via getEffect", () => {
    loadV2EffectsFromArray(allCards);

    // Find a card with attack
    const attackCard = allCards.find(c => c.rules.some(r =>
      r.mapped && r.type === "attack" && r.attackName
    ));
    expect(attackCard).toBeDefined();

    const effect = getEffect(attackCard!.cardId, attackCard!.cardName);
    expect(effect).not.toBeNull();
    expect(effect!.cardId).toBe(attackCard!.cardId);
    expect(effect!.attacks).toBeDefined();
    expect(effect!.attacks!.length).toBeGreaterThan(0);
  });

  test("V2 effects include trainer cards", () => {
    loadV2EffectsFromArray(allCards);

    const trainerCard = allCards.find(c => c.rules.some(r =>
      r.mapped && r.type === "trainer_effect" && r.trainerSubType === "Supporter"
    ));
    expect(trainerCard).toBeDefined();

    const effect = getEffect(trainerCard!.cardId, trainerCard!.cardName);
    expect(effect).not.toBeNull();
    expect(effect!.trainer).toBeDefined();
    expect(effect!.trainer!.onPlay).toBeDefined();
  });
});

describe("V2 Loader — Priority System", () => {
  beforeEach(() => {
    clearRegistry();
  });

  test("skips cards already registered at higher priority", () => {
    // Pre-register a card at L1
    const targetCard = allCards.find(c => c.rules.some(r => r.mapped));
    expect(targetCard).toBeDefined();

    registerEffect(
      { cardId: targetCard!.cardId, cardName: targetCard!.cardName, attacks: [] },
      "L1"
    );

    // Now load V2 — this card should be skipped
    const result = loadV2EffectsFromArray(allCards);

    expect(result.skippedHigherPriority).toBeGreaterThan(0);

    // The L1 effect should still be there (not overwritten)
    const source = getEffectSource(targetCard!.cardId);
    expect(source).toBe("L1");
  });

  test("force option overrides priority check", () => {
    // Pre-register a card at L1
    const targetCard = allCards.find(c => c.rules.some(r => r.mapped && r.type === "attack"));
    expect(targetCard).toBeDefined();

    registerEffect(
      { cardId: targetCard!.cardId, cardName: "test-l1", attacks: [] },
      "L1"
    );

    // Force load V2 — should override
    const result = loadV2EffectsFromArray(allCards, { force: true });

    expect(result.skippedHigherPriority).toBe(0);

    // The V2 effect should now be there
    const source = getEffectSource(targetCard!.cardId);
    expect(source).toBe("L2.5");
  });
});

describe("V2 Loader — Effect Execution Smoke Test", () => {
  beforeEach(() => {
    clearRegistry();
  });

  test("compiled attack effect is callable", () => {
    loadV2EffectsFromArray(allCards);

    // Find a card with a damage-only attack
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "attack" && r.mapped && r.parseSource === "damage_only"
    ));
    expect(card).toBeDefined();

    const effect = getEffect(card!.cardId);
    expect(effect).not.toBeNull();
    expect(effect!.attacks).toBeDefined();

    // Create a minimal mock context
    const mockCtx = {
      state: { turnNumber: 1 },
      player: { hand: { cards: [] }, deck: { cards: [] }, bench: { cards: [] }, active: null },
      opponent: { hand: { cards: [] }, deck: { cards: [] }, bench: { cards: [] }, active: null },
      playerIndex: 0,
      opponentIndex: 1,
      source: { instanceId: "test", card: { name: card!.cardName } },
      flipCoin: () => true,
      flipCoins: (n: number) => ({ heads: n, tails: 0 }),
      damage: () => {},
      heal: () => {},
      log: () => {},
    } as any;

    // Call the attack — should not throw
    const attackResult = effect!.attacks![0].onAttack(mockCtx, 30);
    expect(attackResult).toBeDefined();
    expect(typeof attackResult.damage).toBe("number");
  });
});
