/**
 * Engine Adapter - Bridge between ryuu-play (@ptcg/common) and our UI types
 *
 * ryuu-play uses class instances (State, Player, PokemonSlot, CardList)
 * Our UI uses plain interfaces (GameState, Player, GameCard, Zone)
 *
 * This adapter converts between the two without modifying either side.
 */

import {
  State as RyuuState,
  GamePhase as RyuuPhase,
  GameWinner,
} from '@/lib/ptcg-engine/store/state/state';
import { Player as RyuuPlayer } from '@/lib/ptcg-engine/store/state/player';
import { PokemonSlot } from '@/lib/ptcg-engine/store/state/pokemon-slot';
import { CardList } from '@/lib/ptcg-engine/store/state/card-list';
import { Card as RyuuCard } from '@/lib/ptcg-engine/store/card/card';
import { PokemonCard } from '@/lib/ptcg-engine/store/card/pokemon-card';
import { EnergyCard } from '@/lib/ptcg-engine/store/card/energy-card';
import { TrainerCard } from '@/lib/ptcg-engine/store/card/trainer-card';
import {
  CardType,
  SpecialCondition,
  Stage,
  SuperType,
  TrainerType,
} from '@/lib/ptcg-engine/store/card/card-types';

import {
  GameState,
  GameCard,
  Player as UIPlayer,
  Zone,
  GamePhase,
  StatusCondition,
  GameEvent,
} from '@/engine/game-state';
import { Card as UICard, EnergyType, CardAttack, CardAbility, CardWeakness, CardResistance } from '@/types/card';

// ─── CardType enum → string mapping ────────────────────────────

const CARD_TYPE_TO_STRING: Record<CardType, string> = {
  [CardType.ANY]: 'Colorless',
  [CardType.COLORLESS]: 'Colorless',
  [CardType.GRASS]: 'Grass',
  [CardType.FIGHTING]: 'Fighting',
  [CardType.PSYCHIC]: 'Psychic',
  [CardType.WATER]: 'Water',
  [CardType.LIGHTNING]: 'Lightning',
  [CardType.METAL]: 'Metal',
  [CardType.DARK]: 'Darkness',
  [CardType.FIRE]: 'Fire',
  [CardType.DRAGON]: 'Dragon',
  [CardType.FAIRY]: 'Fairy',
};

const STAGE_TO_SUBTYPE: Record<Stage, string> = {
  [Stage.NONE]: 'Basic',
  [Stage.RESTORED]: 'Restored',
  [Stage.BASIC]: 'Basic',
  [Stage.STAGE_1]: 'Stage 1',
  [Stage.STAGE_2]: 'Stage 2',
};

const SPECIAL_CONDITION_MAP: Record<SpecialCondition, StatusCondition> = {
  [SpecialCondition.PARALYZED]: 'paralyzed',
  [SpecialCondition.CONFUSED]: 'confused',
  [SpecialCondition.ASLEEP]: 'asleep',
  [SpecialCondition.POISONED]: 'poisoned',
  [SpecialCondition.BURNED]: 'burned',
};

const PHASE_MAP: Record<RyuuPhase, GamePhase> = {
  [RyuuPhase.WAITING_FOR_PLAYERS]: GamePhase.SETUP,
  [RyuuPhase.SETUP]: GamePhase.SETUP,
  [RyuuPhase.PLAYER_TURN]: GamePhase.MAIN,
  [RyuuPhase.ATTACK]: GamePhase.ATTACK,
  [RyuuPhase.BETWEEN_TURNS]: GamePhase.BETWEEN_TURNS,
  [RyuuPhase.FINISHED]: GamePhase.GAME_OVER,
};

// ─── Core Converters ────────────────────────────────────────────

let adapterInstanceCounter = 0;

function cardTypeToEnergyCostString(types: CardType[]): string[] {
  return types.map(t => CARD_TYPE_TO_STRING[t] || 'Colorless');
}

/**
 * Convert a ryuu-play Card class to our UI Card interface
 */
export function ryuuCardToUICard(card: RyuuCard): UICard {
  const base: UICard = {
    id: `ryuu-${card.fullName.replace(/\s+/g, '-').toLowerCase()}`,
    name: card.name,
    supertype: card.superType === SuperType.POKEMON ? 'Pokémon'
      : card.superType === SuperType.TRAINER ? 'Trainer'
      : card.superType === SuperType.ENERGY ? 'Energy'
      : 'Pokémon',
    subtypes: [],
    number: '0',
    legalities: { unlimited: 'Legal' },
    images: { small: '', large: '' },
  };

  if (card instanceof PokemonCard) {
    base.subtypes = [STAGE_TO_SUBTYPE[card.stage] || 'Basic'];
    base.hp = String(card.hp);
    base.types = cardTypeToEnergyCostString(card.cardTypes);
    base.evolvesFrom = card.evolvesFrom || undefined;
    base.retreatCost = cardTypeToEnergyCostString(card.retreat);
    base.convertedRetreatCost = card.retreat.length;

    base.attacks = card.attacks.map(atk => ({
      cost: cardTypeToEnergyCostString(atk.cost),
      name: atk.name,
      damage: atk.damage || '0',
      text: atk.text || '',
      convertedEnergyCost: atk.cost.length,
    }));

    base.weaknesses = card.weakness.map(w => ({
      type: CARD_TYPE_TO_STRING[w.type] || 'Colorless',
      value: w.value !== undefined ? String(w.value) : '×2',
    }));

    base.resistances = card.resistance.map(r => ({
      type: CARD_TYPE_TO_STRING[r.type] || 'Colorless',
      value: String(r.value),
    }));

    if (card.powers.length > 0) {
      base.abilities = card.powers.map(p => ({
        name: p.name,
        text: p.text,
        type: p.powerType.toString(),
      }));
    }

    // Add card tags as subtypes
    card.tags.forEach(tag => {
      if (!base.subtypes.includes(tag)) {
        base.subtypes.push(tag);
      }
    });
  }

  if (card instanceof TrainerCard) {
    const trainerSubtype =
      card.trainerType === TrainerType.SUPPORTER ? 'Supporter'
      : card.trainerType === TrainerType.STADIUM ? 'Stadium'
      : card.trainerType === TrainerType.TOOL ? 'Pokémon Tool'
      : 'Item';
    base.subtypes = [trainerSubtype];
  }

  if (card instanceof EnergyCard) {
    base.subtypes = [card.energyType === 0 ? 'Basic' : 'Special'];
    base.types = cardTypeToEnergyCostString(card.provides);
  }

  return base;
}

/**
 * Convert a ryuu-play Card to a GameCard (card instance in play)
 */
function ryuuCardToGameCard(card: RyuuCard): GameCard {
  adapterInstanceCounter++;
  return {
    instanceId: `ra-${adapterInstanceCounter}-${card.id}`,
    cardId: `ryuu-${card.fullName.replace(/\s+/g, '-').toLowerCase()}`,
    card: ryuuCardToUICard(card),
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

/**
 * Convert a PokemonSlot (active or bench position) to a GameCard with attachments
 */
function pokemonSlotToGameCard(slot: PokemonSlot): GameCard | null {
  const pokemonCard = slot.getPokemonCard();
  if (!pokemonCard) return null;

  adapterInstanceCounter++;
  const gc: GameCard = {
    instanceId: `ra-${adapterInstanceCounter}-${pokemonCard.id}`,
    cardId: `ryuu-${pokemonCard.fullName.replace(/\s+/g, '-').toLowerCase()}`,
    card: ryuuCardToUICard(pokemonCard),
    damageCounters: Math.floor(slot.damage / 10),
    attachedEnergy: slot.energies.cards.map(e => ryuuCardToGameCard(e)),
    attachedTools: slot.trainers.cards
      .filter(t => t.trainerType === TrainerType.TOOL)
      .map(t => ryuuCardToGameCard(t)),
    statusConditions: slot.specialConditions.map(sc => SPECIAL_CONDITION_MAP[sc]),
    playedThisTurn: slot.pokemonPlayedTurn > 0, // approximation
    evolvedThisTurn: false,
    abilityUsedThisTurn: false,
    markers: {},
    evolutionStack: [],
  };
  return gc;
}

/**
 * Convert a CardList to a Zone
 */
function cardListToZone(cardList: CardList): Zone {
  return {
    cards: cardList.cards.map(c => ryuuCardToGameCard(c)),
  };
}

/**
 * Convert bench PokemonSlot[] to a Zone of GameCards
 */
function benchToZone(bench: PokemonSlot[]): Zone {
  const cards: GameCard[] = [];
  for (const slot of bench) {
    const gc = pokemonSlotToGameCard(slot);
    if (gc) cards.push(gc);
  }
  return { cards };
}

/**
 * Convert prize CardList[] to a single Zone
 */
function prizesToZone(prizes: CardList[]): Zone {
  const cards: GameCard[] = [];
  for (const prizeList of prizes) {
    for (const card of prizeList.cards) {
      cards.push(ryuuCardToGameCard(card));
    }
  }
  return { cards };
}

// ─── Main State Adapter ─────────────────────────────────────────

/**
 * Convert ryuu-play State to our UI GameState
 *
 * This is the main adapter function. Call it after every store.dispatch()
 * to get a UI-friendly representation of the game.
 */
export function mapRyuuStateToUI(ryuuState: RyuuState, gameId?: string): GameState {
  adapterInstanceCounter = 0; // Reset for consistent IDs per conversion

  const players: [UIPlayer, UIPlayer] = [
    mapRyuuPlayerToUI(ryuuState.players[0], 'p1'),
    mapRyuuPlayerToUI(ryuuState.players[1], 'p2'),
  ];

  const phase = PHASE_MAP[ryuuState.phase] || GamePhase.MAIN;
  const activePlayerIndex = (ryuuState.activePlayer as 0 | 1);

  let winner: GameState['winner'] = null;
  if (ryuuState.winner !== GameWinner.NONE) {
    winner = {
      playerIndex: ryuuState.winner === GameWinner.PLAYER_1 ? 0
        : ryuuState.winner === GameWinner.PLAYER_2 ? 1
        : 0,
      condition: 'prizes_taken', // ryuu-play doesn't expose win condition details
    };
  }

  const events: GameEvent[] = ryuuState.logs.map(log => ({
    timestamp: new Date().toISOString(),
    playerIndex: (log.client ?? 0) as 0 | 1,
    type: 'game_start' as const,
    message: String(log.message),
    data: log.params as Record<string, unknown> | undefined,
  }));

  return {
    gameId: gameId || `ryuu-game-${Date.now()}`,
    players,
    currentPlayer: activePlayerIndex,
    phase,
    turnStatus: {
      currentPlayerId: activePlayerIndex === 0 ? 'p1' : 'p2',
      turnCount: ryuuState.turn,
      currentPhase: phase,
      hasAttachedEnergy: ryuuState.players[activePlayerIndex]?.energyPlayedTurn >= ryuuState.turn,
      hasPlayedSupporter: (ryuuState.players[activePlayerIndex]?.supporter?.cards?.length ?? 0) > 0,
      hasPlayedStadium: ryuuState.players[activePlayerIndex]?.stadiumPlayedTurn >= ryuuState.turn,
      hasRetreated: ryuuState.players[activePlayerIndex]?.retreatedTurn >= ryuuState.turn,
      hasAttacked: phase === GamePhase.ATTACK || phase === GamePhase.BETWEEN_TURNS,
      hasUsedStadium: false,
      p1VstarUsed: false,
      p2VstarUsed: false,
    },
    turn: ryuuState.turn,
    isFirstTurn: ryuuState.turn <= 1,
    winner,
    log: events,
    prompt: null, // Prompts handled separately through the adapter
    stadium: null,
    activeOverrides: {},
    rules: {
      prizeCardsPerPlayer: 6, // ryuu-play uses standard 6 prizes
    },
    turnTimer: null,
  };
}

/**
 * Convert a ryuu-play Player to our UI Player
 */
function mapRyuuPlayerToUI(player: RyuuPlayer, id: string): UIPlayer {
  return {
    id,
    name: player.name || id,
    deck: cardListToZone(player.deck),
    hand: cardListToZone(player.hand),
    active: pokemonSlotToGameCard(player.active),
    bench: benchToZone(player.bench),
    prizes: prizesToZone(player.prizes),
    discard: cardListToZone(player.discard),
    energyAttachedThisTurn: false,
    supporterUsedThisTurn: false,
    lostZone: { cards: [] },
    mulliganCount: 0,
  };
}

// ─── Reverse Adapter (UI → ryuu-play) ──────────────────────────
// For sending actions from UI to the ryuu-play engine

export { RyuuState, RyuuPhase, RyuuPlayer, PokemonSlot, CardList, RyuuCard, PokemonCard, EnergyCard, TrainerCard };
export { CardType, SpecialCondition, Stage, SuperType, TrainerType };
