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
  canAttachEnergy,
  attachEnergy,
  canEvolve,
  evolvePokemon,
  canRetreat,
  retreat,
  canPlaySupporter,
  playSupporter,
  canPlayItem,
  playItem,
  canPlayBasicToBench,
  playBasicToBench,
  endTurn,
  drawCard,
  getCurrentPlayer,
} from "@/engine/turn-actions";
import { Card } from "@/types/card";

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
  state.turn = 1;
  state.isFirstTurn = false;
  return state;
}

// ─── Attach Energy ───

describe("Attach Energy", () => {
  it("成功附加能量到战斗宝可梦", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60", types: ["Lightning"] });
    player.active = pikachu;

    const energy = makeGameCard({
      name: "Basic Lightning Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    player.hand.cards.push(energy);

    const result = attachEnergy(state, energy.instanceId, pikachu.instanceId);
    expect(result.success).toBe(true);
    expect(pikachu.attachedEnergy).toHaveLength(1);
    expect(pikachu.attachedEnergy[0].card.name).toBe("Basic Lightning Energy");
    expect(player.energyAttachedThisTurn).toBe(true);
    expect(player.hand.cards).toHaveLength(0);
  });

  it("成功附加能量到备战区宝可梦", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const active = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = active;

    const benched = makeGameCard({ name: "Eevee", hp: "50" });
    player.bench.cards.push(benched);

    const energy = makeGameCard({
      name: "Basic Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    player.hand.cards.push(energy);

    const result = attachEnergy(state, energy.instanceId, benched.instanceId);
    expect(result.success).toBe(true);
    expect(benched.attachedEnergy).toHaveLength(1);
  });

  it("每回合只能附加一次能量", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = pikachu;

    const energy1 = makeGameCard({
      name: "Energy 1",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    const energy2 = makeGameCard({
      name: "Energy 2",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    player.hand.cards.push(energy1, energy2);

    attachEnergy(state, energy1.instanceId, pikachu.instanceId);
    const result = canAttachEnergy(state, energy2.instanceId, pikachu.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("一次");
  });

  it("不能附加非能量卡", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = pikachu;

    const trainer = makeGameCard({
      name: "Potion",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    player.hand.cards.push(trainer);

    const result = canAttachEnergy(state, trainer.instanceId, pikachu.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("能量卡");
  });

  it("不能在非主阶段附加能量", () => {
    const state = setupMainPhase();
    state.phase = "draw";
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = pikachu;

    const energy = makeGameCard({
      name: "Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    player.hand.cards.push(energy);

    const result = canAttachEnergy(state, energy.instanceId, pikachu.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("主阶段");
  });

  it("目标不在场上时失败", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const energy = makeGameCard({
      name: "Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    player.hand.cards.push(energy);

    const result = canAttachEnergy(state, energy.instanceId, "nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("目标");
  });
});

// ─── Evolve Pokemon ───

describe("Evolve Pokemon", () => {
  it("成功进化宝可梦", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const charmander = makeGameCard({ name: "Charmander", hp: "70", types: ["Fire"] });
    charmander.playedThisTurn = false;
    player.active = charmander;

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      types: ["Fire"],
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    const result = evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(true);
    expect(player.active!.card.name).toBe("Charmeleon");
    expect(player.active!.card.hp).toBe("90");
    expect(player.hand.cards).toHaveLength(0);
  });

  it("进化保留已附加的能量", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const charmander = makeGameCard({ name: "Charmander", hp: "70" });
    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    charmander.attachedEnergy.push(energy);
    player.active = charmander;

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(player.active!.attachedEnergy).toHaveLength(1);
    expect(player.active!.attachedEnergy[0].card.name).toBe("Fire Energy");
  });

  it("进化保留伤害但清除状态异常", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const charmander = makeGameCard({ name: "Charmander", hp: "70" });
    charmander.damageCounters = 3;
    charmander.statusConditions = ["poisoned", "burned"];
    player.active = charmander;

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(player.active!.damageCounters).toBe(3);
    expect(player.active!.statusConditions).toHaveLength(0);
  });

  it("不能进化本回合刚入场的宝可梦", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const charmander = makeGameCard({ name: "Charmander", hp: "70" });
    charmander.playedThisTurn = true;
    player.active = charmander;

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("本回合");
  });

  it("游戏第一回合不能进化", () => {
    const state = setupMainPhase();
    state.isFirstTurn = true;
    const player = getCurrentPlayer(state);

    const charmander = makeGameCard({ name: "Charmander", hp: "70" });
    player.active = charmander;

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("第一回合");
  });

  it("进化链不匹配时失败", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = pikachu;

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    const result = canEvolve(state, charmeleon.instanceId, pikachu.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Charmander");
  });
});

// ─── Retreat ───

describe("Retreat", () => {
  it("成功撤退（丢弃能量，替换宝可梦）", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({
      name: "Pikachu",
      hp: "60",
      retreatCost: ["Colorless"],
      convertedRetreatCost: 1,
    });
    const energy = makeGameCard({ name: "Energy", supertype: "Energy", subtypes: ["Basic"] });
    pikachu.attachedEnergy.push(energy);
    player.active = pikachu;

    const eevee = makeGameCard({ name: "Eevee", hp: "50" });
    player.bench.cards.push(eevee);

    const result = retreat(state, [energy.instanceId], eevee.instanceId);
    expect(result.success).toBe(true);
    expect(player.active!.card.name).toBe("Eevee");
    expect(player.bench.cards).toHaveLength(1);
    expect(player.bench.cards[0].card.name).toBe("Pikachu");
    expect(player.discard.cards).toHaveLength(1);
    expect(pikachu.attachedEnergy).toHaveLength(0);
  });

  it("撤退费用为 0 时不需要丢弃能量", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pidgey = makeGameCard({
      name: "Pidgey",
      hp: "40",
      retreatCost: [],
      convertedRetreatCost: 0,
    });
    player.active = pidgey;

    const rattata = makeGameCard({ name: "Rattata", hp: "30" });
    player.bench.cards.push(rattata);

    const result = retreat(state, [], rattata.instanceId);
    expect(result.success).toBe(true);
    expect(player.active!.card.name).toBe("Rattata");
  });

  it("能量不足时不能撤退", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const snorlax = makeGameCard({
      name: "Snorlax",
      hp: "150",
      retreatCost: ["Colorless", "Colorless", "Colorless", "Colorless"],
      convertedRetreatCost: 4,
    });
    player.active = snorlax;

    const eevee = makeGameCard({ name: "Eevee", hp: "50" });
    player.bench.cards.push(eevee);

    const result = canRetreat(state, []);
    expect(result.success).toBe(false);
    expect(result.error).toContain("4");
  });

  it("备战区为空时不能撤退", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60", convertedRetreatCost: 0 });
    player.active = pikachu;

    const result = canRetreat(state, []);
    expect(result.success).toBe(false);
    expect(result.error).toContain("备战区");
  });
});

// ─── Play Supporter ───

describe("Play Supporter", () => {
  it("成功使用支持者卡", async () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const supporter = makeGameCard({
      name: "Professor's Research",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    player.hand.cards.push(supporter);

    const result = await playSupporter(state, supporter.instanceId);
    expect(result.success).toBe(true);
    expect(player.supporterUsedThisTurn).toBe(true);
    expect(player.hand.cards).toHaveLength(0);
    expect(player.discard.cards).toHaveLength(1);
  });

  it("每回合只能使用一张支持者", async () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const supporter1 = makeGameCard({
      name: "Professor's Research",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    const supporter2 = makeGameCard({
      name: "Boss's Orders",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    player.hand.cards.push(supporter1, supporter2);

    await playSupporter(state, supporter1.instanceId);
    const result = canPlaySupporter(state, supporter2.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("一张");
  });

  it("不能使用非支持者卡作为支持者", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const item = makeGameCard({
      name: "Potion",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    player.hand.cards.push(item);

    const result = canPlaySupporter(state, item.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("支持者");
  });
});

// ─── Play Item ───

describe("Play Item", () => {
  it("成功使用物品卡", async () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const item = makeGameCard({
      name: "Rare Candy",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    player.hand.cards.push(item);

    const result = await playItem(state, item.instanceId);
    expect(result.success).toBe(true);
    expect(player.hand.cards).toHaveLength(0);
    expect(player.discard.cards).toHaveLength(1);
  });

  it("可以一回合使用多张物品卡", async () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const item1 = makeGameCard({
      name: "Rare Candy",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    const item2 = makeGameCard({
      name: "Ultra Ball",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    player.hand.cards.push(item1, item2);

    await playItem(state, item1.instanceId);
    const result = await playItem(state, item2.instanceId);
    expect(result.success).toBe(true);
    expect(player.discard.cards).toHaveLength(2);
  });

  it("不能使用非物品卡作为物品", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const supporter = makeGameCard({
      name: "Professor's Research",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    player.hand.cards.push(supporter);

    const result = canPlayItem(state, supporter.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("物品卡");
  });
});

// ─── Play Basic to Bench ───

describe("Play Basic to Bench", () => {
  it("成功将基础宝可梦放到备战区", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    player.active = makeGameCard({ name: "Pikachu", hp: "60" });

    const eevee = makeGameCard({ name: "Eevee", hp: "50" });
    player.hand.cards.push(eevee);

    const result = playBasicToBench(state, eevee.instanceId);
    expect(result.success).toBe(true);
    expect(player.bench.cards).toHaveLength(1);
    expect(player.bench.cards[0].card.name).toBe("Eevee");
    expect(player.bench.cards[0].playedThisTurn).toBe(true);
    expect(player.hand.cards).toHaveLength(0);
  });

  it("备战区满时不能放置", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    player.active = makeGameCard({ name: "Pikachu", hp: "60" });
    for (let i = 0; i < 5; i++) {
      player.bench.cards.push(makeGameCard({ name: `Bench ${i}`, hp: "50" }));
    }

    const extra = makeGameCard({ name: "Eevee", hp: "50" });
    player.hand.cards.push(extra);

    const result = canPlayBasicToBench(state, extra.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("5");
  });

  it("不能将进化卡放到备战区", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    player.active = makeGameCard({ name: "Pikachu", hp: "60" });

    const stage1 = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(stage1);

    const result = canPlayBasicToBench(state, stage1.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("基础宝可梦");
  });
});

// ─── End Turn ───

describe("End Turn", () => {
  it("结束回合并切换到对手", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);
    player.energyAttachedThisTurn = true;
    player.supporterUsedThisTurn = true;

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    pikachu.playedThisTurn = true;
    player.active = pikachu;

    expect(state.currentPlayer).toBe(0);
    expect(state.turn).toBe(1);

    const result = endTurn(state);
    expect(result.success).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.turn).toBe(2);
    expect(state.phase).toBe("draw");
    expect(state.isFirstTurn).toBe(false);

    // Check per-turn flags reset
    const prevPlayer = state.players[0];
    expect(prevPlayer.energyAttachedThisTurn).toBe(false);
    expect(prevPlayer.supporterUsedThisTurn).toBe(false);
    expect(prevPlayer.active!.playedThisTurn).toBe(false);
  });

  it("不能在抽牌阶段结束回合", () => {
    const state = setupMainPhase();
    state.phase = "draw";

    const result = endTurn(state);
    expect(result.success).toBe(false);
  });
});

// ─── Draw Card ───

describe("Draw Card", () => {
  it("成功抽牌并进入主阶段", () => {
    const state = setupMainPhase();
    state.phase = "draw";
    const player = getCurrentPlayer(state);

    const topCard = makeGameCard({ name: "Pikachu", hp: "60" });
    player.deck.cards.push(topCard);

    const result = drawCard(state);
    expect(result.success).toBe(true);
    expect(state.phase).toBe("main");
    expect(player.hand.cards).toHaveLength(1);
    expect(player.hand.cards[0].card.name).toBe("Pikachu");
    expect(player.deck.cards).toHaveLength(0);
  });

  it("牌组为空时触发 deck_out 败北", () => {
    const state = setupMainPhase();
    state.phase = "draw";
    const player = getCurrentPlayer(state);
    // deck is empty

    const result = drawCard(state);
    expect(result.success).toBe(true);
    expect(state.phase).toBe("game_over");
    expect(state.winner).toBeDefined();
    expect(state.winner!.condition).toBe("deck_out");
    expect(state.winner!.playerIndex).toBe(1); // opponent wins
  });

  it("不能在非抽牌阶段抽牌", () => {
    const state = setupMainPhase();
    // phase is "main"

    const result = drawCard(state);
    expect(result.success).toBe(false);
    expect(result.error).toContain("抽牌阶段");
  });
});

// ─── Event Logging ───

describe("Event Logging", () => {
  it("每个动作都记录事件日志", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = pikachu;

    const energy = makeGameCard({
      name: "Lightning Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    player.hand.cards.push(energy);

    expect(state.log).toHaveLength(0);
    attachEnergy(state, energy.instanceId, pikachu.instanceId);
    expect(state.log).toHaveLength(1);
    expect(state.log[0].type).toBe("attach_energy");
    expect(state.log[0].message).toContain("Lightning Energy");
    expect(state.log[0].message).toContain("Pikachu");
  });
});
