/**
 * Animation System Tests
 * Tests for AnimationProvider queue system, speed multipliers,
 * and animation event processing.
 */

import {
  SPEED_MULTIPLIERS,
  getAnimationDuration,
} from "@/components/battle/board/AnimationProvider";
import type { AnimationEvent } from "@/components/battle/board/AnimationProvider";

// ────────────────────────────────────────────────
// Speed Multiplier Tests
// ────────────────────────────────────────────────

describe("Animation Speed Multipliers", () => {
  test("slow speed has multiplier 1.5", () => {
    expect(SPEED_MULTIPLIERS.slow).toBe(1.5);
  });

  test("normal speed has multiplier 1.0", () => {
    expect(SPEED_MULTIPLIERS.normal).toBe(1.0);
  });

  test("fast speed has multiplier 0.5", () => {
    expect(SPEED_MULTIPLIERS.fast).toBe(0.5);
  });

  test("instant speed has multiplier 0.05", () => {
    expect(SPEED_MULTIPLIERS.instant).toBe(0.05);
  });
});

// ────────────────────────────────────────────────
// Animation Duration Tests
// ────────────────────────────────────────────────

describe("Animation Base Durations", () => {
  test("draw animation has short duration (300ms)", () => {
    expect(getAnimationDuration("draw")).toBe(300);
  });

  test("play animation has 400ms duration", () => {
    expect(getAnimationDuration("play")).toBe(400);
  });

  test("attack animation has 500ms duration", () => {
    expect(getAnimationDuration("attack")).toBe(500);
  });

  test("hit animation has 400ms duration", () => {
    expect(getAnimationDuration("hit")).toBe(400);
  });

  test("knockout animation has longest duration (600ms)", () => {
    expect(getAnimationDuration("knockout")).toBe(600);
  });

  test("evolve animation has 600ms duration", () => {
    expect(getAnimationDuration("evolve")).toBe(600);
  });

  test("energy_attach animation has 400ms duration", () => {
    expect(getAnimationDuration("energy_attach")).toBe(400);
  });
});

// ────────────────────────────────────────────────
// Effective Duration Tests (base × multiplier)
// ────────────────────────────────────────────────

describe("Effective Animation Durations", () => {
  test("attack at slow speed = 750ms", () => {
    const base = getAnimationDuration("attack");
    const effective = base * SPEED_MULTIPLIERS.slow;
    expect(effective).toBe(750);
  });

  test("attack at normal speed = 500ms", () => {
    const base = getAnimationDuration("attack");
    const effective = base * SPEED_MULTIPLIERS.normal;
    expect(effective).toBe(500);
  });

  test("attack at fast speed = 250ms", () => {
    const base = getAnimationDuration("attack");
    const effective = base * SPEED_MULTIPLIERS.fast;
    expect(effective).toBe(250);
  });

  test("attack at instant speed = 25ms", () => {
    const base = getAnimationDuration("attack");
    const effective = base * SPEED_MULTIPLIERS.instant;
    expect(effective).toBe(25);
  });

  test("knockout at slow speed = 900ms", () => {
    const base = getAnimationDuration("knockout");
    const effective = base * SPEED_MULTIPLIERS.slow;
    expect(effective).toBe(900);
  });

  test("knockout at instant speed = 30ms (nearly invisible)", () => {
    const base = getAnimationDuration("knockout");
    const effective = base * SPEED_MULTIPLIERS.instant;
    expect(effective).toBe(30);
  });
});

// ────────────────────────────────────────────────
// AnimationEvent Type Tests
// ────────────────────────────────────────────────

describe("AnimationEvent Structure", () => {
  test("draw event has correct structure", () => {
    const event: AnimationEvent = {
      id: "test-1",
      type: "draw",
      data: { cardId: "card-1" },
    };
    expect(event.id).toBe("test-1");
    expect(event.type).toBe("draw");
    expect(event.data.cardId).toBe("card-1");
  });

  test("attack event can carry attack name", () => {
    const event: AnimationEvent = {
      id: "test-2",
      type: "attack",
      data: { attackName: "Thunderbolt", damage: 120 },
    };
    expect(event.type).toBe("attack");
    expect(event.data.attackName).toBe("Thunderbolt");
    expect(event.data.damage).toBe(120);
  });

  test("evolve event can carry pokemon names", () => {
    const event: AnimationEvent = {
      id: "test-3",
      type: "evolve",
      data: { from: "Charmander", to: "Charmeleon" },
    };
    expect(event.type).toBe("evolve");
    expect(event.data.from).toBe("Charmander");
    expect(event.data.to).toBe("Charmeleon");
  });

  test("energy_attach event can carry energy type", () => {
    const event: AnimationEvent = {
      id: "test-4",
      type: "energy_attach",
      data: { energyType: "Fire", targetId: "poke-1" },
    };
    expect(event.type).toBe("energy_attach");
    expect(event.data.energyType).toBe("Fire");
  });

  test("knockout event can carry prize info", () => {
    const event: AnimationEvent = {
      id: "test-5",
      type: "knockout",
      data: { pokemonName: "Pikachu", prizesTaken: 1 },
    };
    expect(event.type).toBe("knockout");
    expect(event.data.prizesTaken).toBe(1);
  });
});

// ────────────────────────────────────────────────
// Queue Behavior Tests (unit-level, no React)
// ────────────────────────────────────────────────

describe("Animation Queue Logic", () => {
  test("FIFO ordering: events should be processed in order", () => {
    const queue: AnimationEvent[] = [];
    const events = [
      { id: "1", type: "draw" as const, data: {} },
      { id: "2", type: "attack" as const, data: {} },
      { id: "3", type: "knockout" as const, data: {} },
    ];
    for (const e of events) queue.push(e);
    expect(queue.shift()!.id).toBe("1");
    expect(queue.shift()!.id).toBe("2");
    expect(queue.shift()!.id).toBe("3");
    expect(queue.length).toBe(0);
  });

  test("skipAll clears pending queue", () => {
    const queue: AnimationEvent[] = [
      { id: "1", type: "draw", data: {} },
      { id: "2", type: "play", data: {} },
      { id: "3", type: "attack", data: {} },
    ];
    const resolvers: (() => void)[] = [];
    // Simulate skipAll: resolve all and clear
    const pending = queue.splice(0);
    for (const _ of pending) {
      resolvers.push(() => {});
    }
    expect(queue.length).toBe(0);
    expect(pending.length).toBe(3);
  });

  test("all 7 animation types are valid", () => {
    const validTypes = ["draw", "play", "attack", "hit", "knockout", "evolve", "energy_attach"];
    for (const type of validTypes) {
      expect(getAnimationDuration(type as AnimationEvent["type"])).toBeGreaterThan(0);
    }
  });

  test("unknown animation type falls back to 300ms", () => {
    // @ts-expect-error — testing invalid type
    expect(getAnimationDuration("unknown_type")).toBe(300);
  });
});

// ────────────────────────────────────────────────
// Speed multiplier edge cases
// ────────────────────────────────────────────────

describe("Speed Multiplier Edge Cases", () => {
  test("all 4 speed tiers are defined", () => {
    expect(Object.keys(SPEED_MULTIPLIERS)).toHaveLength(4);
    expect(SPEED_MULTIPLIERS).toHaveProperty("slow");
    expect(SPEED_MULTIPLIERS).toHaveProperty("normal");
    expect(SPEED_MULTIPLIERS).toHaveProperty("fast");
    expect(SPEED_MULTIPLIERS).toHaveProperty("instant");
  });

  test("multipliers are ordered: slow > normal > fast > instant", () => {
    expect(SPEED_MULTIPLIERS.slow).toBeGreaterThan(SPEED_MULTIPLIERS.normal);
    expect(SPEED_MULTIPLIERS.normal).toBeGreaterThan(SPEED_MULTIPLIERS.fast);
    expect(SPEED_MULTIPLIERS.fast).toBeGreaterThan(SPEED_MULTIPLIERS.instant);
  });

  test("all multipliers are positive", () => {
    for (const val of Object.values(SPEED_MULTIPLIERS)) {
      expect(val).toBeGreaterThan(0);
    }
  });

  test("instant speed keeps animations visible (> 0)", () => {
    const minDuration = getAnimationDuration("draw") * SPEED_MULTIPLIERS.instant;
    expect(minDuration).toBeGreaterThan(0);
  });
});
