import {
  ExternalState,
  ExternalPlayer,
  PokemonCardList,
  ExternalCard,
  CardList
} from "./external-types";
import {
  GameState,
  Player,
  GameCard,
  Zone,
  createGameState,
  createPlayer,
  createZone
} from "../../engine/game-state";
import { Card } from "@/types/card";

// ─── Adapter Logic ───
// Converts ExternalState (RyuuPlay) -> GameState (Frontend)

export function adaptGameState(external: ExternalState): GameState {
  const p1 = adaptPlayer(external.players[0], "p1");
  const p2 = adaptPlayer(external.players[1], "p2");

  // Map phase
  let phase: any = "main";
  if (external.phase === "SETUP") phase = "setup";
  if (external.phase === "ATTACK") phase = "attack";
  if (external.phase === "BETWEEN_TURNS") phase = "between_turns";
  if (external.phase === "END_GAME") phase = "game_over";

  // Map turn status
  // Note: RyuuPlay might track this differently, we infer from player state
  const currentPlayer = external.players[external.activePlayer];
  const energyAttached = currentPlayer ? currentPlayer.energyPlayedTurn === external.turn : false;
  const supporterUsed = currentPlayer ? currentPlayer.supporterPlayedTurn === external.turn : false;

  return {
    gameId: `ext-${Date.now()}`,
    players: [p1, p2],
    currentPlayer: external.activePlayer as 0 | 1,
    phase: phase,
    turnStatus: {
      phase: external.phase === "ATTACK" ? "ATTACK" : "MAIN", // Simplified
      energyAttached,
      supporterUsed,
      stadiumPlayed: false,
      retreated: false,
      hasAttackedThisTurn: false,
    },
    turn: external.turn,
    isFirstTurn: external.turn === 1,
    winner: external.winner !== undefined ? {
      playerIndex: external.winner as 0 | 1,
      condition: "concede" // Simplified, actual reason might be in log
    } : null,
    log: external.log.map(l => ({
      timestamp: new Date(l.timestamp).toISOString(),
      playerIndex: external.activePlayer as 0 | 1,
      type: "manual_override", // Generic type for external logs
      message: l.message
    })),
    prompt: null, // Prompts handled separately
    stadium: null,
    activeOverrides: {},
    rules: { prizeCardsPerPlayer: 6 },
    turnTimer: null,
  };
}

function adaptPlayer(extPlayer: ExternalPlayer, id: string): Player {
  return {
    id: extPlayer.id || id,
    name: extPlayer.name,
    active: extPlayer.active ? adaptPokemon(extPlayer.active) : null,
    bench: createZone(extPlayer.bench.map(p => adaptPokemon(p)).filter((p): p is GameCard => p !== null)),
    hand: adaptCardList(extPlayer.hand),
    deck: adaptCardList(extPlayer.deck),
    discard: adaptCardList(extPlayer.discard),
    prizes: createZone(extPlayer.prizes.flatMap(p => p.cards.map(c => adaptCard(c)))),
    energyAttachedThisTurn: extPlayer.energyPlayedTurn > 0, // Needs context of current turn
    supporterUsedThisTurn: extPlayer.supporterPlayedTurn > 0
  };
}

function adaptPokemon(list: PokemonCardList): GameCard | null {
  if (!list || list.cards.length === 0) return null;

  // Index 0 is the Pokemon
  const mainCard = list.cards[0];
  const gameCard = adaptCard(mainCard);
  
  gameCard.damageCounters = list.damage / 10;
  
  // Index 1+ are attached cards
  for (let i = 1; i < list.cards.length; i++) {
    const attached = list.cards[i];
    const attachedGameCard = adaptCard(attached);
    
    if (attached.superType === "Energy") {
      gameCard.attachedEnergy.push(attachedGameCard);
    } else if (attached.subType?.includes("Tool") || attached.superType === "Trainer") {
      gameCard.attachedTools.push(attachedGameCard);
    }
  }

  // Map status conditions
  // list.specialConditions (strings) -> gameCard.statusConditions (enum)
  list.specialConditions.forEach(sc => {
    const condition = sc.toLowerCase();
    if (["poisoned", "burned", "asleep", "confused", "paralyzed"].includes(condition)) {
      gameCard.statusConditions.push(condition as any);
    }
  });

  return gameCard;
}

function adaptCardList(list: CardList): Zone {
  return createZone(list.cards.map(c => adaptCard(c)));
}

function adaptCard(extCard: ExternalCard): GameCard {
  // Convert ExternalCard to internal Card interface
  const internalCard: Card = {
    id: extCard.id,
    name: extCard.name,
    supertype: extCard.superType,
    subtypes: extCard.subType ? [extCard.subType] : [],
    hp: extCard.hp?.toString() || "0",
    types: extCard.types || [],
    rules: [], // Simplified
    attacks: extCard.attacks,
    weaknesses: extCard.weakness?.map(w => ({
      type: String(w.type),
      value: w.value !== undefined ? String(w.value) : '×2',
    })),
    resistances: extCard.resistance?.map(r => ({
      type: String(r.type),
      value: r.value !== undefined ? String(r.value) : '-30',
    })),
    retreatCost: extCard.retreatCost?.map(String),
    set: "Base", // Default
    number: "1",
    rarity: "Common",
    legalities: { unlimited: "Legal" },
    images: { small: "", large: "" }
  };

  return {
    instanceId: `ext-${extCard.id}-${Math.random().toString(36).slice(2)}`,
    cardId: extCard.id,
    card: internalCard,
    damageCounters: 0,
    attachedEnergy: [],
    attachedTools: [],
    statusConditions: [],
    playedThisTurn: false,
    evolvedThisTurn: false,
    abilityUsedThisTurn: false,
    markers: {},
    evolutionStack: [],
  };
}
