import { getAllCards, getCard } from "../cards";
import { getOnEvolve, registerEffectStep, registerTrainerEffect } from "../effects";
import {
  discardHand,
  drawN,
  logEvent,
  setPlayer,
  shuffleDeck,
  shuffleHandIntoDeck,
} from "./helpers";
import type { GameState, GameCard, PlayerIndex } from "../state";
import type { PromptResponse } from "../actions";

// Professor's Research (svi-190) — discard your hand, draw 7.
registerTrainerEffect("svi-190", (state, player) => {
  let next = discardHand(state, player);
  next = drawN(next, player, 7);
  return logEvent(next, "ProfessorsResearch", { player });
});

// Iono (pal-185) — both players shuffle hand into deck, draw cards equal to
// remaining prizes.
registerTrainerEffect("pal-185", (state, player) => {
  let next = state;
  for (let i: PlayerIndex = 0; i < 2; i = (i + 1) as PlayerIndex) {
    next = shuffleHandIntoDeck(next, i);
    const prizes = next.players[i].prizes.length;
    next = drawN(next, i, prizes);
    if (i === 1) break;
  }
  void player;
  return logEvent(next, "Iono", { player });
});

// Boss's Orders (pal-172) — switch one of opponent's bench Pokemon with their
// active. Multi-step: emits a selectTarget prompt, the response slot index is
// applied.
const BOSS_EFFECT = "pal-172:boss";
registerTrainerEffect("pal-172", (state, player) => {
  const opp = (1 - player) as PlayerIndex;
  const eligible: number[] = [];
  state.players[opp].bench.forEach((b, i) => {
    if (b !== null) eligible.push(i);
  });
  if (eligible.length === 0) return state; // no bench to swap
  if (!state.players[opp].active) return state;

  return {
    ...state,
    pendingPrompt: {
      kind: "selectTarget",
      player,
      message: "Boss's Orders — choose an opponent's benched Pokémon",
      eligibleUids: eligible.map((i) => `bench:${i}`),
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: BOSS_EFFECT, player, data: { opponent: opp } },
  };
});
registerEffectStep(BOSS_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectTarget") {
    throw new Error("Boss's Orders expects selectTarget");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const opp = (1 - player) as PlayerIndex;
  const target = payload.uids[0];
  if (!target?.startsWith("bench:")) throw new Error("Bad bench target");
  const slot = Number(target.split(":")[1]);

  const oppPs = state.players[opp];
  const benched = oppPs.bench[slot];
  const active = oppPs.active;
  if (!benched || !active) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const newBench = [...oppPs.bench];
  newBench[slot] = active;
  const players = [...state.players] as typeof state.players;
  players[opp] = { ...oppPs, active: benched, bench: newBench };

  let next: GameState = {
    ...state,
    players,
    pendingPrompt: null,
    pendingEffect: null,
  };
  next = logEvent(next, "BossOrders", { player, targetUid: benched.uid });
  return next;
});

// Level Ball (bst-129) — Item.
// "Search your deck for a Pokémon with 90 HP or less, reveal it, and put it
// into your hand. Then, shuffle your deck."
const LEVEL_BALL_EFFECT = "bst-129:level-ball";

registerTrainerEffect("bst-129", (state, player) => {
  const ps = state.players[player];
  const eligible = Array.from(
    new Set(
      ps.deck
        .filter((c) => {
          const d = getCard(c.cardId);
          return d.kind === "Pokemon" && d.hp <= 90;
        })
        .map((c) => c.cardId),
    ),
  );
  if (eligible.length === 0) {
    return logEvent(state, "LevelBallEmpty", { player });
  }
  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Level Ball — 选 1 张 90HP 或以下的 Pokémon",
      cardIds: eligible,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: LEVEL_BALL_EFFECT, player },
  };
});

registerEffectStep(LEVEL_BALL_EFFECT, (state, payload) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Level Ball expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error();
  const player = eff.player;
  const cardId = payload.cardIds[0];
  const def = getCard(cardId);
  if (def.kind !== "Pokemon" || def.hp > 90) {
    throw new Error(`Level Ball: ${cardId} is not a Pokémon ≤90HP`);
  }
  const ps = state.players[player];
  const card = ps.deck.find((c) => c.cardId === cardId);
  if (!card) throw new Error(`Card ${cardId} not in deck`);

  let next = setPlayer(state, player, {
    ...ps,
    hand: [...ps.hand, card],
    deck: ps.deck.filter((c) => c.uid !== card.uid),
  });
  next = shuffleDeck(next, player);
  next = { ...next, pendingPrompt: null, pendingEffect: null };
  return logEvent(next, "LevelBall", { player, cardId });
});

// Fog Crystal (cre-140) — Item.
// "Search your deck for a Basic Psychic Pokémon or a Basic Psychic Energy
// card, reveal it, and put it into your hand. Then, shuffle your deck."
const FOG_CRYSTAL_EFFECT = "cre-140:fog";

function isBasicPsychicMatch(cardId: string): boolean {
  const d = getCard(cardId);
  if (d.kind === "Pokemon") {
    return d.stage === "Basic" && d.types.includes("Psychic");
  }
  if (d.kind === "Energy") {
    return d.energyKind === "Basic" && d.energyType === "Psychic";
  }
  return false;
}

registerTrainerEffect("cre-140", (state, player) => {
  const ps = state.players[player];
  const eligible = Array.from(
    new Set(ps.deck.filter((c) => isBasicPsychicMatch(c.cardId)).map((c) => c.cardId)),
  );
  if (eligible.length === 0) {
    return logEvent(state, "FogCrystalEmpty", { player });
  }
  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Fog Crystal — 选基础超能 Pokémon 或基础超能量",
      cardIds: eligible,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: FOG_CRYSTAL_EFFECT, player },
  };
});

registerEffectStep(FOG_CRYSTAL_EFFECT, (state, payload) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Fog Crystal expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error();
  const player = eff.player;
  const cardId = payload.cardIds[0];
  if (!isBasicPsychicMatch(cardId)) {
    throw new Error(`Fog Crystal: ${cardId} is not eligible`);
  }
  const ps = state.players[player];
  const card = ps.deck.find((c) => c.cardId === cardId);
  if (!card) throw new Error(`Card ${cardId} not in deck`);
  let next = setPlayer(state, player, {
    ...ps,
    hand: [...ps.hand, card],
    deck: ps.deck.filter((c) => c.uid !== card.uid),
  });
  next = shuffleDeck(next, player);
  next = { ...next, pendingPrompt: null, pendingEffect: null };
  return logEvent(next, "FogCrystal", { player, cardId });
});

// Energy Retrieval (svi-171) — Item.
// "Put 2 Basic Energy cards from your discard pile into your hand."
// v0: auto-take first 2 Basic Energy cards from discard. No prompt.
registerTrainerEffect("svi-171", (state, player) => {
  const ps = state.players[player];
  const basicEnergies: GameCard[] = ps.discard.filter((c) => {
    const def = getCard(c.cardId);
    return def.kind === "Energy" && def.energyKind === "Basic";
  });
  if (basicEnergies.length === 0) {
    return logEvent(state, "EnergyRetrievalEmpty", { player });
  }
  const take = basicEnergies.slice(0, 2);
  const takeUids = new Set(take.map((c) => c.uid));
  const next = setPlayer(state, player, {
    ...ps,
    discard: ps.discard.filter((c) => !takeUids.has(c.uid)),
    hand: [...ps.hand, ...take],
  });
  return logEvent(next, "EnergyRetrieval", { player, count: take.length });
});

// Super Rod (pal-188) — Item.
// "Shuffle up to 3 in any combination of Pokémon and Basic Energy cards from
// your discard pile into your deck."
// v0: auto-shuffle first 3 matching cards back into deck.
registerTrainerEffect("pal-188", (state, player) => {
  const ps = state.players[player];
  const eligible: GameCard[] = ps.discard.filter((c) => {
    const def = getCard(c.cardId);
    return (
      def.kind === "Pokemon" ||
      (def.kind === "Energy" && def.energyKind === "Basic")
    );
  });
  if (eligible.length === 0) {
    return logEvent(state, "SuperRodEmpty", { player });
  }
  const take = eligible.slice(0, 3);
  const takeUids = new Set(take.map((c) => c.uid));
  let next = setPlayer(state, player, {
    ...ps,
    discard: ps.discard.filter((c) => !takeUids.has(c.uid)),
    deck: [...ps.deck, ...take],
  });
  next = shuffleDeck(next, player);
  return logEvent(next, "SuperRod", { player, count: take.length });
});

// Arven (svi-186) — Supporter.
// "Search your deck for a Pokémon Tool card and an Item card, reveal them, and
// put them into your hand. Then, shuffle your deck."
// 2-step prompt: pick Tool first, then Item. If deck has 0 Tools, skip directly
// to Item step.
const ARVEN_TOOL = "svi-186:arven:tool";
const ARVEN_ITEM = "svi-186:arven:item";

function findToolCardIdsInDeck(state: GameState, player: PlayerIndex): string[] {
  return Array.from(
    new Set(
      state.players[player].deck
        .filter((c) => {
          const d = getCard(c.cardId);
          return d.kind === "Trainer" && d.trainerKind === "Tool";
        })
        .map((c) => c.cardId),
    ),
  );
}

function findItemCardIdsInDeck(state: GameState, player: PlayerIndex): string[] {
  return Array.from(
    new Set(
      state.players[player].deck
        .filter((c) => {
          const d = getCard(c.cardId);
          return d.kind === "Trainer" && d.trainerKind === "Item";
        })
        .map((c) => c.cardId),
    ),
  );
}

function moveDeckCardToHand(
  state: GameState,
  player: PlayerIndex,
  cardId: string,
): GameState {
  const ps = state.players[player];
  const card = ps.deck.find((c) => c.cardId === cardId);
  if (!card) return state;
  return setPlayer(state, player, {
    ...ps,
    deck: ps.deck.filter((c) => c.uid !== card.uid),
    hand: [...ps.hand, card],
  });
}

registerTrainerEffect("svi-186", (state, player) => {
  const tools = findToolCardIdsInDeck(state, player);
  const items = findItemCardIdsInDeck(state, player);
  if (tools.length === 0 && items.length === 0) {
    return logEvent(state, "ArvenEmpty", { player });
  }
  if (tools.length === 0) {
    // Skip to Item step
    return {
      ...state,
      pendingPrompt: {
        kind: "selectFromList",
        player,
        message: "Arven — 选择 1 张物品（Item）",
        cardIds: items,
        minCount: 1,
        maxCount: 1,
      },
      pendingEffect: { effectId: ARVEN_ITEM, player },
    };
  }
  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Arven — 选择 1 张道具（Tool）",
      cardIds: tools,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: ARVEN_TOOL, player },
  };
});

registerEffectStep(ARVEN_TOOL, (state, payload) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Arven tool expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const toolId = payload.cardIds[0];
  let next = moveDeckCardToHand(state, player, toolId);

  const items = findItemCardIdsInDeck(next, player);
  if (items.length === 0) {
    next = shuffleDeck(next, player);
    next = { ...next, pendingPrompt: null, pendingEffect: null };
    return logEvent(next, "Arven", { player, toolId, itemId: null });
  }
  return {
    ...next,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Arven — 选择 1 张物品（Item）",
      cardIds: items,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: ARVEN_ITEM, player, data: { toolId } },
  };
});

registerEffectStep(ARVEN_ITEM, (state, payload) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Arven item expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const itemId = payload.cardIds[0];
  let next = moveDeckCardToHand(state, player, itemId);
  next = shuffleDeck(next, player);
  next = { ...next, pendingPrompt: null, pendingEffect: null };
  return logEvent(next, "Arven", {
    player,
    toolId: (eff.data?.toolId as string) ?? null,
    itemId,
  });
});

// Switch (svi-194) — switch your active with one bench Pokemon.
const SWITCH_EFFECT = "svi-194:switch";
registerTrainerEffect("svi-194", (state, player) => {
  const ps = state.players[player];
  const eligible: number[] = [];
  ps.bench.forEach((b, i) => {
    if (b !== null) eligible.push(i);
  });
  if (eligible.length === 0 || !ps.active) return state;

  return {
    ...state,
    pendingPrompt: {
      kind: "selectTarget",
      player,
      message: "Switch — choose a benched Pokémon to switch in",
      eligibleUids: eligible.map((i) => `bench:${i}`),
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: SWITCH_EFFECT, player },
  };
});
registerEffectStep(SWITCH_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectTarget") {
    throw new Error("Switch expects selectTarget");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const ps = state.players[player];

  const slot = Number(payload.uids[0].split(":")[1]);
  const benched = ps.bench[slot];
  if (!benched || !ps.active) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const newBench = [...ps.bench];
  newBench[slot] = ps.active;
  const players = [...state.players] as typeof state.players;
  players[player] = { ...ps, active: benched, bench: newBench };

  let next: GameState = {
    ...state,
    players,
    pendingPrompt: null,
    pendingEffect: null,
  };
  next = logEvent(next, "Switch", { player });
  return next;
});

// Ultra Ball (svi-196) — discard 2 cards from your hand. Search your deck
// for a Pokémon, put it into your hand, and shuffle your deck.
const ULTRA_DISCARD = "svi-196:ultra:discard";
const ULTRA_SEARCH = "svi-196:ultra:search";

registerTrainerEffect("svi-196", (state, player) => {
  const ps = state.players[player];
  if (ps.hand.length < 2) {
    return logEvent(state, "UltraBallSkip", { player, reason: "hand<2" });
  }
  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Ultra Ball — 弃 2 张手牌",
      cardIds: ps.hand.map((c) => c.cardId),
      minCount: 2,
      maxCount: 2,
    },
    pendingEffect: { effectId: ULTRA_DISCARD, player },
  };
});

registerEffectStep(ULTRA_DISCARD, (state, payload) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Ultra Ball discard expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const ps = state.players[player];
  const hand = [...ps.hand];
  const toDiscard: GameCard[] = [];
  for (const cid of payload.cardIds.slice(0, 2)) {
    const idx = hand.findIndex((c) => c.cardId === cid);
    if (idx < 0) throw new Error(`Ultra Ball: card ${cid} not in hand`);
    toDiscard.push(hand[idx]);
    hand.splice(idx, 1);
  }

  const pokemonInDeck = Array.from(
    new Set(ps.deck.filter((c) => getCard(c.cardId).kind === "Pokemon").map((c) => c.cardId)),
  );
  let next = setPlayer(state, player, {
    ...ps,
    hand,
    discard: [...ps.discard, ...toDiscard],
  });
  if (pokemonInDeck.length === 0) {
    next = shuffleDeck(next, player);
    next = { ...next, pendingPrompt: null, pendingEffect: null };
    return logEvent(next, "UltraBallNoTarget", { player });
  }
  return {
    ...next,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Ultra Ball — 选择一只宝可梦",
      cardIds: pokemonInDeck,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: ULTRA_SEARCH, player },
  };
});

registerEffectStep(ULTRA_SEARCH, (state, payload) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Ultra Ball search expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error();
  const player = eff.player;
  const cardId = payload.cardIds[0];
  const ps = state.players[player];
  const card = ps.deck.find((c) => c.cardId === cardId);
  if (!card) throw new Error(`Ultra Ball: card ${cardId} not in deck`);

  let next = setPlayer(state, player, {
    ...ps,
    hand: [...ps.hand, card],
    deck: ps.deck.filter((c) => c.uid !== card.uid),
  });
  next = shuffleDeck(next, player);
  next = { ...next, pendingPrompt: null, pendingEffect: null };
  return logEvent(next, "UltraBall", { player, cardId });
});

// Rare Candy (svi-191) — choose a Basic in play; if you have a Stage 2 in
// hand whose evolution chain roots at that Basic, evolve directly (skip Stage 1).
// Cannot be used on a Pokémon that was put into play this turn or on first turn.
const RARE_TARGET = "svi-191:rare:target";
const RARE_EVO = "svi-191:rare:evo";

function findChainBasicForStage2(stage2Def: ReturnType<typeof getCard>): string | null {
  if (stage2Def.kind !== "Pokemon" || stage2Def.stage !== "Stage2") return null;
  if (!stage2Def.evolvesFrom) return null;
  // Find Stage 1 by name; ok to use registry-wide search.
  const stage1 = getAllCards().find((c) => {
    return c.kind === "Pokemon" && c.name === stage2Def.evolvesFrom && c.stage === "Stage1";
  });
  if (stage1 && stage1.kind === "Pokemon") return stage1.evolvesFrom ?? null;
  // Fallback hardcoded chains for cards whose Stage 1 isn't in the registry.
  const HARDCODED: Record<string, string> = {
    "obf-164": "Pidgey", // Pidgeot ex (Stage 1 Pidgeotto not registered)
  };
  return HARDCODED[stage2Def.id] ?? null;
}

registerTrainerEffect("svi-191", (state, player) => {
  if (state.turnNumber === 1 && state.activePlayer === state.goesFirst) return state;
  const ps = state.players[player];

  const eligibleTargets: string[] = [];
  const checkBasic = (c: GameCard) => {
    const def = getCard(c.cardId);
    if (def.kind !== "Pokemon" || def.stage !== "Basic") return;
    if (c.markers["playedThisTurn"] === true) return;
    eligibleTargets.push(c.uid);
  };
  if (ps.active) checkBasic(ps.active);
  ps.bench.forEach((b) => b && checkBasic(b));

  // Need at least one Stage 2 in hand
  const hasStage2 = ps.hand.some((c) => {
    const d = getCard(c.cardId);
    return d.kind === "Pokemon" && d.stage === "Stage2";
  });
  if (eligibleTargets.length === 0 || !hasStage2) {
    return logEvent(state, "RareCandyNoTarget", { player });
  }

  return {
    ...state,
    pendingPrompt: {
      kind: "selectTarget",
      player,
      message: "Rare Candy — 选择要进化的基础宝可梦",
      eligibleUids: eligibleTargets,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: RARE_TARGET, player },
  };
});

registerEffectStep(RARE_TARGET, (state, payload) => {
  if (payload.kind !== "selectTarget") {
    throw new Error("Rare Candy target expects selectTarget");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error();
  const player = eff.player;
  const targetUid = payload.uids[0];
  const ps = state.players[player];

  // Locate target
  let target: GameCard | null = null;
  if (ps.active && ps.active.uid === targetUid) target = ps.active;
  if (!target) {
    for (const b of ps.bench) {
      if (b && b.uid === targetUid) {
        target = b;
        break;
      }
    }
  }
  if (!target) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const targetDef = getCard(target.cardId);
  if (targetDef.kind !== "Pokemon") {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const basicName = targetDef.name;

  // Find Stage 2 in hand whose chain matches
  const validStage2: string[] = [];
  for (const c of ps.hand) {
    const d = getCard(c.cardId);
    if (d.kind !== "Pokemon" || d.stage !== "Stage2") continue;
    if (findChainBasicForStage2(d) === basicName) {
      validStage2.push(c.cardId);
    }
  }
  if (validStage2.length === 0) {
    return logEvent(
      { ...state, pendingPrompt: null, pendingEffect: null },
      "RareCandyNoStage2",
      { player, basic: basicName },
    );
  }

  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: `Rare Candy — 选 Stage 2 进化 ${basicName}`,
      cardIds: validStage2,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: {
      effectId: RARE_EVO,
      player,
      data: { targetUid },
    },
  };
});

registerEffectStep(RARE_EVO, (state, payload) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Rare Candy evo expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error();
  const player = eff.player;
  const targetUid = eff.data?.targetUid as string | undefined;
  if (!targetUid) throw new Error("No targetUid in Rare Candy evo");
  const stage2CardId = payload.cardIds[0];
  const ps = state.players[player];

  const evoCard = ps.hand.find((c) => c.cardId === stage2CardId);
  if (!evoCard) throw new Error(`Stage 2 ${stage2CardId} not in hand`);

  // Find target in play
  let target: GameCard | null = null;
  let zone: "active" | "bench" = "active";
  let benchIdx = -1;
  if (ps.active && ps.active.uid === targetUid) {
    target = ps.active;
    zone = "active";
  } else {
    for (let i = 0; i < ps.bench.length; i++) {
      const b = ps.bench[i];
      if (b && b.uid === targetUid) {
        target = b;
        zone = "bench";
        benchIdx = i;
        break;
      }
    }
  }
  if (!target) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }

  const evolved: GameCard = {
    ...target,
    cardId: evoCard.cardId,
    uid: evoCard.uid,
    damage: target.damage,
    attachedEnergy: target.attachedEnergy,
    attachedTool: target.attachedTool,
    evolutionStack: [...target.evolutionStack, target],
    status: [],
    markers: { evolvedThisTurn: true },
  };

  let newPs = { ...ps, hand: ps.hand.filter((c) => c.uid !== evoCard.uid) };
  if (zone === "active") {
    newPs = { ...newPs, active: evolved };
  } else {
    const newBench = [...newPs.bench];
    newBench[benchIdx] = evolved;
    newPs = { ...newPs, bench: newBench };
  }

  let next = setPlayer(state, player, newPs);
  next = { ...next, pendingPrompt: null, pendingEffect: null };
  next = logEvent(next, "RareCandy", { player, fromCardId: target.cardId, toCardId: evoCard.cardId });

  // Rare Candy is also "playing the evolution from hand", so fire onEvolve.
  const onEvolve = getOnEvolve(evoCard.cardId);
  if (onEvolve) next = onEvolve(next, player, evolved.uid);

  return next;
});

// Nest Ball (svi-181) — search your deck for a Basic Pokemon, put it on your
// bench, and shuffle your deck.
const NEST_EFFECT = "svi-181:nest";

function isBasicPokemonId(cardId: string): boolean {
  const def = getCard(cardId);
  return def.kind === "Pokemon" && def.stage === "Basic";
}

registerTrainerEffect("svi-181", (state, player) => {
  const ps = state.players[player];
  const eligibleCardIds = Array.from(
    new Set(ps.deck.filter((c) => isBasicPokemonId(c.cardId)).map((c) => c.cardId)),
  );
  if (eligibleCardIds.length === 0) return state;
  if (!ps.bench.includes(null)) return state;

  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Nest Ball — choose a Basic Pokémon",
      cardIds: eligibleCardIds,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: NEST_EFFECT, player },
  };
});
registerEffectStep(NEST_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Nest Ball expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const cardId = payload.cardIds[0];
  if (!isBasicPokemonId(cardId)) {
    throw new Error(`Nest Ball: ${cardId} is not a Basic Pokemon`);
  }
  const ps = state.players[player];

  const card = ps.deck.find((c) => c.cardId === cardId);
  if (!card) throw new Error(`Card ${cardId} not in deck`);

  const benchIdx = ps.bench.findIndex((b) => b === null);
  if (benchIdx < 0) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const newBench = [...ps.bench];
  newBench[benchIdx] = { ...card, markers: { ...card.markers, playedThisTurn: true } };
  const players = [...state.players] as typeof state.players;
  players[player] = {
    ...ps,
    deck: ps.deck.filter((c) => c.uid !== card.uid),
    bench: newBench,
  };

  let next: GameState = {
    ...state,
    players,
    pendingPrompt: null,
    pendingEffect: null,
  };
  next = shuffleDeck(next, player);
  next = logEvent(next, "NestBall", { player, cardId });
  return next;
});
