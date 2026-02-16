/**
 * Tests for Priority 7: Damage & Knockout System
 *
 * Tests:
 * 1. Weakness calculation (×2)
 * 2. Resistance calculation (-30)
 * 3. Full damage calculation with weakness + resistance
 * 4. Multi-prize rules (normal=1, ex/V=2, VMAX=3)
 * 5. Knockout processing (discard Pokemon + attached cards)
 * 6. Bench promotion after KO
 * 7. Win conditions (prizes, no bench, deck out, concede)
 * 8. performAttack with weakness/resistance
 * 9. Concede
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  logEvent,
  resetInstanceCounter,
} from "@/engine/game-state";
import {
  calculateWeakness,
  calculateResistance,
  calculateDamage,
  getPrizeCount,
  checkKnockout,
  takePrizes,
  checkWinCondition,
  performAttack,
  canAttack,
  promoteBenchPokemon,
  autoPromoteBench,
  concede,
} from "@/engine/game-actions";
import { Card, CardWeakness, CardResistance } from "@/types/card";

// ─── Test Fixtures ───

function makeCard(overrides: Partial<Card> & { name: string }): Card {
  return {
    id: `test-${overrides.name.toLowerCase().replace(/\s/g, "-")}`,
    supertype: "Pokémon",
    subtypes: ["Basic"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    ...overrides,
  };
}

function makeGameCard(overrides: Partial<Card> & { name: string }): GameCard {
  return createGameCard(makeCard(overrides));
}

function setupMainPhase(): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = "main";
  state.turn = 2;
  state.isFirstTurn = false;
  return state;
}

// ─── Weakness Calculation ───

describe("Weakness Calculation", () => {
  it("返回 ×2 当攻击方属性匹配防守方弱点", () => {
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
    });

    const result = calculateWeakness(["Fighting"], defender);
    expect(result).toBe(2);
  });

  it("返回 1 当攻击方属性不匹配防守方弱点", () => {
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
    });

    const result = calculateWeakness(["Fire"], defender);
    expect(result).toBe(1);
  });

  it("返回 1 当防守方没有弱点", () => {
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
    });

    const result = calculateWeakness(["Fighting"], defender);
    expect(result).toBe(1);
  });

  it("处理空弱点数组", () => {
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      weaknesses: [],
    });

    const result = calculateWeakness(["Fighting"], defender);
    expect(result).toBe(1);
  });
});

// ─── Resistance Calculation ───

describe("Resistance Calculation", () => {
  it("返回 30 当攻击方属性匹配防守方抵抗力 (-30)", () => {
    const defender = makeGameCard({
      name: "Pidgey",
      hp: "40",
      types: ["Colorless"],
      resistances: [{ type: "Fighting", value: "-30" }],
    });

    const result = calculateResistance(["Fighting"], defender);
    expect(result).toBe(30);
  });

  it("返回 0 当攻击方属性不匹配防守方抵抗力", () => {
    const defender = makeGameCard({
      name: "Pidgey",
      hp: "40",
      types: ["Colorless"],
      resistances: [{ type: "Fighting", value: "-30" }],
    });

    const result = calculateResistance(["Fire"], defender);
    expect(result).toBe(0);
  });

  it("返回 0 当防守方没有抵抗力", () => {
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
    });

    const result = calculateResistance(["Fighting"], defender);
    expect(result).toBe(0);
  });
});

// ─── Full Damage Calculation ───

describe("Damage Calculation", () => {
  it("正确计算基础伤害（无弱点无抵抗）", () => {
    const attacker = makeGameCard({
      name: "Charmander",
      hp: "70",
      types: ["Fire"],
    });
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
    });

    const result = calculateDamage(30, attacker, defender);
    expect(result.finalDamage).toBe(30);
    expect(result.wasWeakness).toBe(false);
    expect(result.wasResistance).toBe(false);
  });

  it("弱点 ×2 正确计算", () => {
    const attacker = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
    });
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
    });

    const result = calculateDamage(30, attacker, defender);
    expect(result.finalDamage).toBe(60);
    expect(result.wasWeakness).toBe(true);
    expect(result.wasResistance).toBe(false);
  });

  it("抵抗力 -30 正确计算", () => {
    const attacker = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
    });
    const defender = makeGameCard({
      name: "Pidgey",
      hp: "40",
      types: ["Colorless"],
      resistances: [{ type: "Fighting", value: "-30" }],
    });

    const result = calculateDamage(50, attacker, defender);
    expect(result.finalDamage).toBe(20);
    expect(result.wasWeakness).toBe(false);
    expect(result.wasResistance).toBe(true);
  });

  it("弱点 + 抵抗力同时计算（弱点先乘，再减抵抗）", () => {
    const attacker = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
    });
    const defender = makeGameCard({
      name: "TestPokemon",
      hp: "100",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
      resistances: [{ type: "Fighting", value: "-30" }],
    });

    // 30 × 2 - 30 = 30
    const result = calculateDamage(30, attacker, defender);
    expect(result.finalDamage).toBe(30);
    expect(result.wasWeakness).toBe(true);
    expect(result.wasResistance).toBe(true);
  });

  it("伤害不会低于 0（抵抗力超过伤害时）", () => {
    const attacker = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
    });
    const defender = makeGameCard({
      name: "Pidgey",
      hp: "40",
      types: ["Colorless"],
      resistances: [{ type: "Fighting", value: "-30" }],
    });

    const result = calculateDamage(10, attacker, defender);
    expect(result.finalDamage).toBe(0);
    expect(result.wasResistance).toBe(true);
  });

  it("攻击方没有属性时不触发弱点/抵抗", () => {
    const attacker = makeGameCard({
      name: "NoType",
      hp: "50",
    });
    const defender = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
    });

    const result = calculateDamage(30, attacker, defender);
    expect(result.finalDamage).toBe(30);
    expect(result.wasWeakness).toBe(false);
  });
});

// ─── Multi-Prize Rules ───

describe("Multi-Prize Rules", () => {
  it("普通宝可梦给 1 张奖励卡", () => {
    const card = makeGameCard({
      name: "Pikachu",
      hp: "60",
      subtypes: ["Basic"],
    });
    expect(getPrizeCount(card)).toBe(1);
  });

  it("Pokemon ex 给 2 张奖励卡", () => {
    const card = makeGameCard({
      name: "Charizard ex",
      hp: "330",
      subtypes: ["Stage 2", "ex"],
    });
    expect(getPrizeCount(card)).toBe(2);
  });

  it("Pokemon V 给 2 张奖励卡", () => {
    const card = makeGameCard({
      name: "Arceus V",
      hp: "220",
      subtypes: ["Basic", "V"],
    });
    expect(getPrizeCount(card)).toBe(2);
  });

  it("Pokemon VMAX 给 3 张奖励卡", () => {
    const card = makeGameCard({
      name: "Arceus VMAX",
      hp: "320",
      subtypes: ["VMAX"],
    });
    expect(getPrizeCount(card)).toBe(3);
  });

  it("Pokemon VSTAR 给 2 张奖励卡", () => {
    const card = makeGameCard({
      name: "Arceus VSTAR",
      hp: "280",
      subtypes: ["Basic", "VSTAR"],
    });
    expect(getPrizeCount(card)).toBe(2);
  });

  it("Pokemon GX 给 2 张奖励卡", () => {
    const card = makeGameCard({
      name: "Charizard GX",
      hp: "250",
      subtypes: ["Stage 2", "GX"],
    });
    expect(getPrizeCount(card)).toBe(2);
  });

  it("Stage 1 普通宝可梦给 1 张奖励卡", () => {
    const card = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
    });
    expect(getPrizeCount(card)).toBe(1);
  });

  it("Mega 进化给 2 张奖励卡", () => {
    const card = makeGameCard({
      name: "M Charizard EX",
      hp: "220",
      subtypes: ["Mega"],
    });
    expect(getPrizeCount(card)).toBe(2);
  });
});

// ─── Knockout Processing ───

describe("Knockout Processing", () => {
  it("战斗区宝可梦被击倒后移入弃牌堆", () => {
    const state = setupMainPhase();
    const player = state.players[1]; // Defender

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    pikachu.damageCounters = 6; // 60 damage = KO for 60 HP
    player.active = pikachu;

    const koHappened = checkKnockout(state, 1, "active");
    expect(koHappened).toBe(true);
    expect(player.active).toBeNull();
    expect(player.discard.cards).toHaveLength(1);
    expect(player.discard.cards[0].card.name).toBe("Pikachu");
  });

  it("击倒时附加的能量也移入弃牌堆", () => {
    const state = setupMainPhase();
    const player = state.players[1];

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    const energy1 = makeGameCard({ name: "Energy 1", supertype: "Energy", subtypes: ["Basic"] });
    const energy2 = makeGameCard({ name: "Energy 2", supertype: "Energy", subtypes: ["Basic"] });
    pikachu.attachedEnergy.push(energy1, energy2);
    pikachu.damageCounters = 6;
    player.active = pikachu;

    checkKnockout(state, 1, "active");
    expect(player.discard.cards).toHaveLength(3); // Pikachu + 2 energy
    expect(pikachu.attachedEnergy).toHaveLength(0);
  });

  it("击倒时附加的道具也移入弃牌堆", () => {
    const state = setupMainPhase();
    const player = state.players[1];

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    const tool = makeGameCard({ name: "Choice Band", supertype: "Trainer", subtypes: ["Pokémon Tool"] });
    pikachu.attachedTools.push(tool);
    pikachu.damageCounters = 6;
    player.active = pikachu;

    checkKnockout(state, 1, "active");
    expect(player.discard.cards).toHaveLength(2); // Pikachu + tool
    expect(pikachu.attachedTools).toHaveLength(0);
  });

  it("伤害不足时不触发击倒", () => {
    const state = setupMainPhase();
    const player = state.players[1];

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    pikachu.damageCounters = 5; // 50 damage < 60 HP
    player.active = pikachu;

    const koHappened = checkKnockout(state, 1, "active");
    expect(koHappened).toBe(false);
    expect(player.active).not.toBeNull();
  });

  it("备战区宝可梦也可以被击倒", () => {
    const state = setupMainPhase();
    const player = state.players[1];

    const benchPokemon = makeGameCard({ name: "Eevee", hp: "50" });
    benchPokemon.damageCounters = 5; // 50 damage = KO
    player.bench.cards.push(benchPokemon);

    const koHappened = checkKnockout(state, 1, "bench", 0);
    expect(koHappened).toBe(true);
    expect(player.bench.cards).toHaveLength(0);
    expect(player.discard.cards).toHaveLength(1);
  });
});

// ─── Bench Promotion ───

describe("Bench Promotion", () => {
  it("成功从备战区提升宝可梦到战斗区", () => {
    const state = setupMainPhase();
    const player = state.players[1];
    player.active = null;

    const eevee = makeGameCard({ name: "Eevee", hp: "50" });
    player.bench.cards.push(eevee);

    const result = promoteBenchPokemon(state, 1, eevee.instanceId);
    expect(result.success).toBe(true);
    expect(player.active).not.toBeNull();
    expect(player.active!.card.name).toBe("Eevee");
    expect(player.bench.cards).toHaveLength(0);
  });

  it("战斗区已有宝可梦时无法提升", () => {
    const state = setupMainPhase();
    const player = state.players[0];

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = pikachu;
    const eevee = makeGameCard({ name: "Eevee", hp: "50" });
    player.bench.cards.push(eevee);

    const result = promoteBenchPokemon(state, 0, eevee.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("已有");
  });

  it("备战区为空时无法提升", () => {
    const state = setupMainPhase();
    const player = state.players[0];
    player.active = null;

    const result = promoteBenchPokemon(state, 0, "nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("没有");
  });

  it("autoPromoteBench 自动选择第一只备战区宝可梦", () => {
    const state = setupMainPhase();
    const player = state.players[1];
    player.active = null;

    const eevee = makeGameCard({ name: "Eevee", hp: "50" });
    const charmander = makeGameCard({ name: "Charmander", hp: "70" });
    player.bench.cards.push(eevee, charmander);

    const result = autoPromoteBench(state, 1);
    expect(result.success).toBe(true);
    expect(player.active!.card.name).toBe("Eevee");
    expect(player.bench.cards).toHaveLength(1);
    expect(player.bench.cards[0].card.name).toBe("Charmander");
  });
});

// ─── Win Conditions ───

describe("Win Conditions", () => {
  it("取完所有奖励卡获胜", () => {
    const state = setupMainPhase();
    const player = state.players[0];

    // Only 1 prize left
    const prize = makeGameCard({ name: "Prize", hp: "50" });
    player.prizes.cards.push(prize);

    takePrizes(state, 0, 1);
    expect(state.phase).toBe("game_over");
    expect(state.winner).not.toBeNull();
    expect(state.winner!.playerIndex).toBe(0);
    expect(state.winner!.condition).toBe("prizes_taken");
  });

  it("拿取奖励卡数不超过剩余数", () => {
    const state = setupMainPhase();
    const player = state.players[0];

    // Only 1 prize left, try to take 3
    const prize = makeGameCard({ name: "Prize", hp: "50" });
    player.prizes.cards.push(prize);

    takePrizes(state, 0, 3);
    // Should only take 1
    expect(player.hand.cards).toHaveLength(1);
  });

  it("对方场上无宝可梦时获胜", () => {
    const state = setupMainPhase();
    // Alice has Pokemon on field
    state.players[0].active = makeGameCard({ name: "Pikachu", hp: "60" });
    // Bob has nothing
    state.players[1].active = null;
    // bench is empty by default

    const won = checkWinCondition(state);
    expect(won).toBe(true);
    expect(state.winner!.playerIndex).toBe(0); // Alice wins
    expect(state.winner!.condition).toBe("no_bench_pokemon");
  });

  it("有备战区宝可梦时不触发无场上宝可梦判负", () => {
    const state = setupMainPhase();
    // Alice has Pokemon on field
    state.players[0].active = makeGameCard({ name: "Pikachu", hp: "60" });
    // Bob has no active but has bench
    state.players[1].active = null;
    state.players[1].bench.cards.push(makeGameCard({ name: "Eevee", hp: "50" }));

    const won = checkWinCondition(state);
    expect(won).toBe(false);
  });
});

// ─── Concede ───

describe("Concede", () => {
  it("认输后对手获胜", () => {
    const state = setupMainPhase();

    const result = concede(state, 0);
    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(state.phase).toBe("game_over");
    expect(state.winner!.playerIndex).toBe(1);
    expect(state.winner!.condition).toBe("concede");
  });

  it("游戏已结束时不能认输", () => {
    const state = setupMainPhase();
    state.phase = "game_over";

    const result = concede(state, 0);
    expect(result.success).toBe(false);
  });
});

// ─── performAttack with Weakness/Resistance ───

describe("performAttack Integration", () => {
  it("攻击时正确应用弱点伤害", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    // Attacker: Fighting type with attack that does 30
    const machop = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
      attacks: [{ name: "Low Kick", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = machop;

    // Defender: Lightning type weak to Fighting
    const pikachu = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
    });
    defender.active = pikachu;
    defender.bench.cards.push(makeGameCard({ name: "Eevee", hp: "50" }));

    // Give attacker some prizes
    for (let i = 0; i < 6; i++) {
      attacker.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }
    for (let i = 0; i < 6; i++) {
      defender.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }

    const result = performAttack(state, 0, "Low Kick");
    expect(result.success).toBe(true);

    // 30 × 2 = 60 damage → KO on 60 HP Pikachu
    // Pikachu should be KO'd, Eevee auto-promoted (only 1 bench)
    expect(defender.active!.card.name).toBe("Eevee");
    expect(defender.bench.cards).toHaveLength(0);
    // Prize should be taken (1 for normal Pokemon)
    expect(attacker.prizes.cards).toHaveLength(5);
  });

  it("攻击时正确应用抵抗力减伤", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    const machop = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
      attacks: [{ name: "Low Kick", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = machop;

    const pidgey = makeGameCard({
      name: "Pidgey",
      hp: "40",
      types: ["Colorless"],
      resistances: [{ type: "Fighting", value: "-30" }],
    });
    defender.active = pidgey;

    const result = performAttack(state, 0, "Low Kick");
    expect(result.success).toBe(true);
    // 30 - 30 = 0 damage
    expect(defender.active!.damageCounters).toBe(0);
  });

  it("击倒 ex 宝可梦给 2 张奖励卡", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    const attackPokemon = makeGameCard({
      name: "Charizard",
      hp: "200",
      types: ["Fire"],
      attacks: [{ name: "Fire Blast", damage: "350", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = attackPokemon;

    const exPokemon = makeGameCard({
      name: "Charizard ex",
      hp: "330",
      types: ["Fire"],
      subtypes: ["Stage 2", "ex"],
    });
    defender.active = exPokemon;
    defender.bench.cards.push(makeGameCard({ name: "Eevee", hp: "50" }));

    for (let i = 0; i < 6; i++) {
      attacker.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }
    for (let i = 0; i < 6; i++) {
      defender.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }

    const result = performAttack(state, 0, "Fire Blast");
    expect(result.success).toBe(true);
    // 350 damage → KO on 330 HP ex
    // Eevee should be auto-promoted (only 1 bench)
    expect(defender.active!.card.name).toBe("Eevee");
    // Should take 2 prizes for ex
    expect(attacker.prizes.cards).toHaveLength(4);
  });

  it("击倒 VMAX 宝可梦给 3 张奖励卡", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    const attackPokemon = makeGameCard({
      name: "Attacker",
      hp: "200",
      types: ["Fire"],
      attacks: [{ name: "Mega Hit", damage: "400", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = attackPokemon;

    const vmaxPokemon = makeGameCard({
      name: "Arceus VMAX",
      hp: "320",
      subtypes: ["VMAX"],
    });
    defender.active = vmaxPokemon;
    defender.bench.cards.push(makeGameCard({ name: "Eevee", hp: "50" }));

    for (let i = 0; i < 6; i++) {
      attacker.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }
    for (let i = 0; i < 6; i++) {
      defender.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }

    const result = performAttack(state, 0, "Mega Hit");
    expect(result.success).toBe(true);
    expect(attacker.prizes.cards).toHaveLength(3); // 6 - 3 = 3
  });

  it("击倒后只有 1 只备战区宝可梦时自动提升", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    const attackPokemon = makeGameCard({
      name: "Attacker",
      hp: "200",
      types: ["Fire"],
      attacks: [{ name: "Hit", damage: "200", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = attackPokemon;

    const defenderActive = makeGameCard({ name: "Target", hp: "60" });
    defender.active = defenderActive;

    const benchPokemon = makeGameCard({ name: "Eevee", hp: "50" });
    defender.bench.cards.push(benchPokemon);

    for (let i = 0; i < 6; i++) {
      attacker.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }
    for (let i = 0; i < 6; i++) {
      defender.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }

    performAttack(state, 0, "Hit");

    // Bench Pokemon should be auto-promoted since only 1 on bench
    expect(defender.active).not.toBeNull();
    expect(defender.active!.card.name).toBe("Eevee");
    expect(defender.bench.cards).toHaveLength(0);
  });

  it("击倒后无备战区宝可梦时对手获胜", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    const attackPokemon = makeGameCard({
      name: "Attacker",
      hp: "200",
      types: ["Fire"],
      attacks: [{ name: "Hit", damage: "200", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = attackPokemon;

    const defenderActive = makeGameCard({ name: "Target", hp: "60" });
    defender.active = defenderActive;
    // No bench Pokemon

    for (let i = 0; i < 6; i++) {
      attacker.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }
    for (let i = 0; i < 6; i++) {
      defender.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }

    const result = performAttack(state, 0, "Hit");
    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(state.phase).toBe("game_over");
    expect(state.winner!.playerIndex).toBe(0);
    expect(state.winner!.condition).toBe("no_bench_pokemon");
  });

  it("0 伤害攻击不造成伤害但攻击成功", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    const pokemon = makeGameCard({
      name: "StatusPokemon",
      hp: "60",
      types: ["Psychic"],
      attacks: [{ name: "Leer", damage: "", cost: [], text: "降低对手攻击力", convertedEnergyCost: 0 }],
    });
    attacker.active = pokemon;

    const target = makeGameCard({ name: "Pikachu", hp: "60" });
    defender.active = target;

    const result = performAttack(state, 0, "Leer");
    expect(result.success).toBe(true);
    expect(defender.active!.damageCounters).toBe(0);
  });

  it("主阶段以外不能攻击", () => {
    const state = setupMainPhase();
    state.phase = "draw";
    const attacker = state.players[0];

    const pokemon = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      attacks: [{ name: "Thunder Shock", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = pokemon;
    state.players[1].active = makeGameCard({ name: "Target", hp: "60" });

    const result = canAttack(state, 0, "Thunder Shock");
    expect(result).toBe(false);
  });

  it("能量不足时不能攻击", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];

    const pokemon = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      attacks: [{ name: "Electro Ball", damage: "60", cost: ["Lightning", "Colorless"], text: "", convertedEnergyCost: 2 }],
    });
    attacker.active = pokemon;
    state.players[1].active = makeGameCard({ name: "Target", hp: "60" });

    // No energy attached
    const result = canAttack(state, 0, "Electro Ball");
    expect(result).toBe(false);
  });

  it("击倒取完最后奖励卡时获胜", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    const attackPokemon = makeGameCard({
      name: "Attacker",
      hp: "200",
      types: ["Fire"],
      attacks: [{ name: "Hit", damage: "100", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    attacker.active = attackPokemon;

    const defenderActive = makeGameCard({ name: "Target", hp: "60" });
    defender.active = defenderActive;
    defender.bench.cards.push(makeGameCard({ name: "Eevee", hp: "50" }));

    // Attacker has only 1 prize left
    attacker.prizes.cards.push(makeGameCard({ name: "Last Prize" }));
    for (let i = 0; i < 6; i++) {
      defender.prizes.cards.push(makeGameCard({ name: `Prize ${i}` }));
    }

    const result = performAttack(state, 0, "Hit");
    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(state.winner!.condition).toBe("prizes_taken");
  });
});

// ─── Event Logging for Damage ───

describe("Damage Event Logging", () => {
  it("记录弱点伤害事件", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    attacker.active = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
      attacks: [{ name: "Low Kick", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    defender.active = makeGameCard({
      name: "Pikachu",
      hp: "120",
      types: ["Lightning"],
      weaknesses: [{ type: "Fighting", value: "×2" }],
    });

    performAttack(state, 0, "Low Kick");

    const damageEvent = state.log.find(e => e.type === "damage");
    expect(damageEvent).toBeDefined();
    expect(damageEvent!.message).toContain("60");
    expect(damageEvent!.message).toContain("弱点");
    expect(damageEvent!.data?.weaknessApplied).toBe(true);
  });

  it("记录抵抗力伤害事件", () => {
    const state = setupMainPhase();
    const attacker = state.players[0];
    const defender = state.players[1];

    attacker.active = makeGameCard({
      name: "Machop",
      hp: "70",
      types: ["Fighting"],
      attacks: [{ name: "Low Kick", damage: "50", cost: [], text: "", convertedEnergyCost: 0 }],
    });
    defender.active = makeGameCard({
      name: "Pidgey",
      hp: "80",
      types: ["Colorless"],
      resistances: [{ type: "Fighting", value: "-30" }],
    });

    performAttack(state, 0, "Low Kick");

    const damageEvent = state.log.find(e => e.type === "damage");
    expect(damageEvent).toBeDefined();
    expect(damageEvent!.message).toContain("20");
    expect(damageEvent!.message).toContain("抵抗力");
    expect(damageEvent!.data?.resistanceApplied).toBe(true);
  });
});
