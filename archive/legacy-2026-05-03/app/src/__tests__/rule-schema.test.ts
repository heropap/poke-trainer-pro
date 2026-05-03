
import { CardRuleDef } from "@/engine/rules/card-rule-def";

describe("Rule Engine Schema Validation (v1.1)", () => {
  
  it("should validate a standard Attack Rule (Pineco - Tackle)", () => {
    const tackleRule: CardRuleDef = {
      identifier: "sv1-001-pineco-tackle",
      version: 1,
      type: "attack",
      triggers: ["on_attack_declare"],
      costs: [
        { type: "energy", amount: 2 } // CC
      ],
      steps: [
        {
          actionType: "deal_damage",
          params: { amount: 30 },
          target: {
            targetType: "pokemon",
            owner: "opponent",
            zone: "active",
            count: 1
          }
        }
      ]
    };

    expect(tackleRule.identifier).toBe("sv1-001-pineco-tackle");
    expect(tackleRule.steps[0].actionType).toBe("deal_damage");
    expect(tackleRule.steps[0].params?.amount).toBe(30);
  });

  it("should validate a complex Ability Rule (Chien-Pao ex - Shivery Chill)", () => {
    const shiveryChill: CardRuleDef = {
      identifier: "sv2P-027-chien-pao-ex-ability",
      version: 1,
      type: "ability",
      triggers: ["on_activate"],
      conditions: [
        { type: "zone_check", value: "active" },
        { type: "usage_limit", scope: "turn", count: 1 }
      ],
      steps: [
        {
          actionType: "search_deck",
          target: {
            targetType: "card",
            owner: "self",
            zone: "deck",
            count: 2,
            filters: { cardType: ["Energy"], pokemonType: ["Water"] }
          },
          params: { destination: "hand", reveal: true }
        },
        {
          actionType: "shuffle_deck",
          target: { targetType: "player", owner: "self", zone: "deck", count: 1 }
        }
      ]
    };

    expect(shiveryChill.type).toBe("ability");
    expect(shiveryChill.conditions).toHaveLength(2);
    expect(shiveryChill.steps[0].actionType).toBe("search_deck");
  });

  it("should validate a Trainer Rule (Professor's Research)", () => {
    const researchRule: CardRuleDef = {
      identifier: "sv1-200-research",
      version: 1,
      type: "trainer_effect",
      triggers: ["on_play"],
      steps: [
        {
          actionType: "discard_cards",
          target: {
            targetType: "card",
            owner: "self",
            zone: "hand",
            count: "all"
          }
        },
        {
          actionType: "draw_cards",
          params: { amount: 7 },
          target: {
            targetType: "player",
            owner: "self",
            zone: "hand",
            count: 1
          }
        }
      ]
    };

    expect(researchRule.type).toBe("trainer_effect");
    expect(researchRule.steps[0].actionType).toBe("discard_cards");
  });

  it("should validate branching logic (Coin Flip)", () => {
    const coinFlipAttack: CardRuleDef = {
      identifier: "test-coin-flip",
      version: 1,
      type: "attack",
      steps: [
        {
          actionType: "flip_coin",
          branching: {
            condition: { type: "coin_flip" }, // Implicitly checks result
            trueSteps: [
              { actionType: "deal_damage", params: { amount: 60 } }
            ],
            falseSteps: [
              { actionType: "deal_damage", params: { amount: 0 } }
            ]
          }
        }
      ]
    };

    expect(coinFlipAttack.steps[0].branching?.trueSteps).toHaveLength(1);
  });
});
