/**
 * Tests for Feature 11: ActionLog sidebar
 *
 * Tests the pure functions (formatGameEvent, groupEventsByTurn) exported
 * from the ActionLog component, plus retreat-once-per-turn validation.
 */

import { GameEvent, GameEventType } from "@/engine/game-state";
import { formatGameEvent, groupEventsByTurn } from "@/components/battle/board/ActionLog";

// ─── Helper factories ───

function makeEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    timestamp: new Date().toISOString(),
    playerIndex: 0,
    type: "game_start",
    message: "Test event",
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// Event Formatting
// ═══════════════════════════════════════════

describe("formatGameEvent", () => {
  test("returns correct icon for attack event", () => {
    const result = formatGameEvent(makeEvent({ type: "attack", message: "Pikachu attacked" }));
    expect(result.icon).toBe("⚔️");
    expect(result.color).toBe("text-red-400");
  });

  test("returns correct icon for damage event", () => {
    const result = formatGameEvent(makeEvent({ type: "damage" }));
    expect(result.icon).toBe("💥");
    expect(result.color).toBe("text-red-300");
  });

  test("returns correct icon for knockout event", () => {
    const result = formatGameEvent(makeEvent({ type: "knockout" }));
    expect(result.icon).toBe("💀");
    expect(result.color).toBe("text-orange-400");
  });

  test("returns correct icon for draw_card event", () => {
    const result = formatGameEvent(makeEvent({ type: "draw_card" }));
    expect(result.icon).toBe("📤");
    expect(result.color).toBe("text-blue-300");
  });

  test("returns correct icon for heal event", () => {
    const result = formatGameEvent(makeEvent({ type: "heal" }));
    expect(result.icon).toBe("💚");
    expect(result.color).toBe("text-green-300");
  });

  test("returns correct icon for coin_flip event", () => {
    const result = formatGameEvent(makeEvent({ type: "coin_flip" }));
    expect(result.icon).toBe("🪙");
  });

  test("preserves original message unchanged", () => {
    const msg = "玩家 将 Pikachu 放到备战区";
    const result = formatGameEvent(makeEvent({ type: "play_pokemon", message: msg }));
    expect(result.message).toBe(msg);
  });

  test("all 21 known event types have defined formatting", () => {
    const allTypes: GameEventType[] = [
      "game_start", "draw_card", "play_pokemon", "evolve_pokemon",
      "attach_energy", "use_trainer", "use_supporter", "use_ability",
      "attack", "damage", "knockout", "prize_taken", "retreat",
      "status_effect", "mulligan", "game_over", "coin_flip",
      "status_damage", "search_deck", "heal", "manual_override",
    ];

    for (const type of allTypes) {
      const result = formatGameEvent(makeEvent({ type }));
      expect(result.icon).toBeTruthy();
      expect(result.color).toMatch(/^text-/);
    }
  });

  test("returns fallback for unknown event type", () => {
    const result = formatGameEvent(makeEvent({ type: "unknown_type" as any }));
    expect(result.icon).toBe("📝");
    expect(result.color).toBe("text-zinc-400");
  });
});

// ═══════════════════════════════════════════
// Turn Grouping
// ═══════════════════════════════════════════

describe("groupEventsByTurn", () => {
  test("empty log returns empty array", () => {
    expect(groupEventsByTurn([])).toEqual([]);
  });

  test("setup events go into group 0 (对战开始)", () => {
    const events: GameEvent[] = [
      makeEvent({ type: "game_start", message: "对战开始: 玩家 vs AI" }),
      makeEvent({ type: "draw_card", message: "玩家 抽了 7 张初始手牌" }),
    ];

    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(1);
    expect(groups[0].turnNumber).toBe(0);
    expect(groups[0].label).toBe("对战开始");
    expect(groups[0].events).toHaveLength(2);
  });

  test("draw_card with turn pattern creates new group", () => {
    const events: GameEvent[] = [
      makeEvent({ type: "game_start", message: "对战开始: 玩家 vs AI" }),
      makeEvent({ type: "draw_card", message: "回合 1: 玩家 的回合", data: { turn: 1 } }),
      makeEvent({ type: "attach_energy", message: "玩家 附加能量" }),
      makeEvent({ type: "draw_card", message: "回合 2: AI 的回合", data: { turn: 2 } }),
      makeEvent({ type: "attack", message: "AI 攻击" }),
    ];

    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(3);

    // Group 0: setup
    expect(groups[0].turnNumber).toBe(0);
    expect(groups[0].events).toHaveLength(1);

    // Group 1: turn 1
    expect(groups[1].turnNumber).toBe(1);
    expect(groups[1].events).toHaveLength(2); // draw_card + attach_energy

    // Group 2: turn 2
    expect(groups[2].turnNumber).toBe(2);
    expect(groups[2].events).toHaveLength(2); // draw_card + attack
  });

  test("game_start with 回合 pattern also creates new group", () => {
    const events: GameEvent[] = [
      makeEvent({ type: "game_start", message: "对战开始" }),
      makeEvent({ type: "game_start", message: "第 1 回合开始，玩家 先手" }),
      makeEvent({ type: "play_pokemon", message: "放置 Pikachu" }),
    ];

    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].turnNumber).toBe(0);
    expect(groups[0].events).toHaveLength(1);
    expect(groups[1].turnNumber).toBe(1);
    expect(groups[1].events).toHaveLength(2);
  });

  test("multiple events within same turn stay in the same group", () => {
    const events: GameEvent[] = [
      makeEvent({ type: "draw_card", message: "回合 3: 玩家 的回合" }),
      makeEvent({ type: "attach_energy", message: "附加能量" }),
      makeEvent({ type: "play_pokemon", message: "放置宝可梦" }),
      makeEvent({ type: "use_trainer", message: "使用道具" }),
      makeEvent({ type: "attack", message: "攻击" }),
    ];

    const groups = groupEventsByTurn(events);
    // First is empty setup group (turnNumber 0), second is turn 3
    expect(groups).toHaveLength(2);
    expect(groups[1].turnNumber).toBe(3);
    expect(groups[1].events).toHaveLength(5);
  });

  test("playerIndex differentiation is preserved in events", () => {
    const events: GameEvent[] = [
      makeEvent({ type: "draw_card", message: "回合 1: 玩家 的回合", playerIndex: 0 }),
      makeEvent({ type: "attack", message: "玩家攻击", playerIndex: 0 }),
      makeEvent({ type: "draw_card", message: "回合 2: AI 的回合", playerIndex: 1 }),
      makeEvent({ type: "attack", message: "AI攻击", playerIndex: 1 }),
    ];

    const groups = groupEventsByTurn(events);
    expect(groups[1].events[0].playerIndex).toBe(0);
    expect(groups[2].events[0].playerIndex).toBe(1);
  });
});

// ═══════════════════════════════════════════
// Retreat once-per-turn validation
// ═══════════════════════════════════════════

describe("retreat once-per-turn (TurnState.retreated)", () => {
  // These tests verify the existing validation in base-rules.ts
  // by directly testing the game state fields

  test("TurnState has retreated field defaulting to false", () => {
    const { createGameState } = require("@/engine/game-state");
    const state = createGameState("p1", "p2");
    expect(state.turnStatus.retreated).toBe(false);
  });

  test("retreat() sets turnStatus.retreated to true", () => {
    const { createGameState, createGameCard } = require("@/engine/game-state");
    const { retreat } = require("@/engine/turn-actions");
    const { addCards, addToBottom } = require("@/engine/zones");

    const state = createGameState("p1", "p2");
    state.phase = "main";
    state.currentPlayer = 0;

    // Setup: active with 1 energy, and a bench Pokemon
    const activeCard = createGameCard({
      id: "test-1",
      name: "Active Mon",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hp: "70",
      types: ["Fire"],
      retreatCost: ["Colorless"],
      convertedRetreatCost: 1,
      number: "1",
      legalities: { standard: "Legal" },
      images: { small: "", large: "" },
    });
    const benchCard = createGameCard({
      id: "test-2",
      name: "Bench Mon",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hp: "60",
      types: ["Water"],
      retreatCost: [],
      convertedRetreatCost: 0,
      number: "2",
      legalities: { standard: "Legal" },
      images: { small: "", large: "" },
    });
    const energy = createGameCard({
      id: "test-e",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      number: "3",
      legalities: { standard: "Legal" },
      images: { small: "", large: "" },
    });

    state.players[0].active = activeCard;
    addCards(state.players[0].bench, [benchCard]);
    activeCard.attachedEnergy = [energy];

    const result = retreat(state, [energy.instanceId], benchCard.instanceId);
    expect(result.success).toBe(true);
    expect(state.turnStatus.retreated).toBe(true);
  });

  test("checkHardRules rejects second retreat in same turn", () => {
    const { createGameState } = require("@/engine/game-state");
    const { checkHardRules } = require("@/engine/rules/base-rules");

    const state = createGameState("p1", "p2");
    state.phase = "main";
    state.currentPlayer = 0;
    state.turnStatus.retreated = true; // Already retreated

    const result = checkHardRules(state, { type: "retreat" }, 0);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("撤退");
  });
});

// ═══════════════════════════════════════════
// Integration: real game log structure
// ═══════════════════════════════════════════

describe("integration: real game log", () => {
  test("logEvent produces valid GameEvent structure", () => {
    const { createGameState, logEvent } = require("@/engine/game-state");
    const state = createGameState("p1", "p2");

    logEvent(state, 0, "game_start", "对战开始: p1 vs p2");
    logEvent(state, 0, "draw_card", "p1 抽了 7 张初始手牌");
    logEvent(state, 1, "draw_card", "p2 抽了 7 张初始手牌");

    expect(state.log).toHaveLength(3);

    // All events have required fields
    for (const event of state.log) {
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("playerIndex");
      expect(event).toHaveProperty("type");
      expect(event).toHaveProperty("message");
      expect(typeof event.timestamp).toBe("string");
      expect(typeof event.message).toBe("string");
    }
  });

  test("formatGameEvent works with real logEvent output", () => {
    const { createGameState, logEvent } = require("@/engine/game-state");
    const state = createGameState("p1", "p2");

    logEvent(state, 0, "attack", "皮卡丘 使用了 十万伏特");
    logEvent(state, 1, "damage", "皮卡丘 对 杰尼龟 造成 120 点伤害");
    logEvent(state, 0, "knockout", "杰尼龟 被击倒了!");

    const formatted = state.log.map(formatGameEvent);
    expect(formatted[0].icon).toBe("⚔️");
    expect(formatted[0].color).toBe("text-red-400");
    expect(formatted[1].icon).toBe("💥");
    expect(formatted[2].icon).toBe("💀");
  });

  test("groupEventsByTurn handles full game log with setup + turns", () => {
    const events: GameEvent[] = [
      // Setup
      makeEvent({ type: "game_start", message: "对战开始: p1 vs p2" }),
      makeEvent({ type: "draw_card", message: "p1 抽了 7 张初始手牌" }),
      makeEvent({ type: "draw_card", message: "p2 抽了 7 张初始手牌" }),
      makeEvent({ type: "game_start", message: "第 1 回合开始，p1 先手" }),
      makeEvent({ type: "play_pokemon", message: "p1 played Pikachu" }),
      makeEvent({ type: "attach_energy", message: "附加能量" }),
      makeEvent({ type: "attack", message: "攻击" }),
      // Turn 2
      makeEvent({ type: "draw_card", message: "回合 2: p2 的回合", playerIndex: 1 }),
      makeEvent({ type: "attack", message: "p2 攻击", playerIndex: 1 }),
      // Turn 3
      makeEvent({ type: "draw_card", message: "回合 3: p1 的回合" }),
      makeEvent({ type: "game_over", message: "p1 获胜" }),
    ];

    const groups = groupEventsByTurn(events);

    // Setup (对战开始), Turn 1 (第 1 回合), Turn 2, Turn 3
    expect(groups).toHaveLength(4);
    expect(groups[0].turnNumber).toBe(0);
    expect(groups[0].events).toHaveLength(3); // game_start + 2 draw_card (no "回合" in msgs)
    expect(groups[1].turnNumber).toBe(1);
    expect(groups[1].events).toHaveLength(4); // "第 1 回合开始" + play + attach + attack
    expect(groups[2].turnNumber).toBe(2);
    expect(groups[2].events).toHaveLength(2); // draw_card + attack
    expect(groups[3].turnNumber).toBe(3);
    expect(groups[3].events).toHaveLength(2); // draw_card + game_over
  });

  test("manual_override events are formatted distinctly", () => {
    const result = formatGameEvent(
      makeEvent({ type: "manual_override", message: "[手动] 抽了 3 张牌" })
    );
    expect(result.icon).toBe("🔧");
    expect(result.color).toBe("text-yellow-500");
  });
});
