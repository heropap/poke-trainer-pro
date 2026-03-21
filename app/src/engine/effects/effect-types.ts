/**
 * Card Effect Type Definitions
 *
 * Defines the interfaces for all card effect types:
 * - Attack effects (damage modifiers, status, bench damage, etc.)
 * - Ability effects (activated, passive, on-enter)
 * - Trainer effects (Supporter, Item)
 * - Tool effects (while-attached modifiers)
 *
 * Inspired by tcgone-engine-contrib's Groovy DSL patterns,
 * translated into TypeScript with a context-based approach.
 */

import { GameState, GameCard, Player, StatusCondition } from "../game-state";

// ───────────────────────────────────────────────
// Effect Context: passed to every effect function
// ───────────────────────────────────────────────

export interface EffectContext {
  /** Full game state (mutable) */
  state: GameState;
  /** The player using the effect */
  player: Player;
  /** The opponent */
  opponent: Player;
  /** Player index (0 or 1) */
  playerIndex: 0 | 1;
  /** Opponent index */
  opponentIndex: 0 | 1;
  /** The card that is the source of the effect */
  source: GameCard;

  // ─── Helper Methods ───

  /** Deal damage to a target Pokemon (in damage counters, amount/10) */
  damage(amount: number, target?: GameCard): void;

  /** Deal damage to multiple Pokemon (e.g. bench spread) */
  damageAll(amount: number, targets: GameCard[]): void;

  /** Heal damage from a Pokemon */
  heal(amount: number, target: GameCard): void;

  /** Draw cards for player or opponent */
  drawCards(count: number, who?: "player" | "opponent"): GameCard[];

  /** Discard cards from player's hand (auto-select from end, no user choice) */
  discardFromHand(count: number, who?: "player" | "opponent"): GameCard[];

  /**
   * Prompt the user to choose which cards to discard from hand.
   * Shows a selection modal. Use this instead of discardFromHand when
   * the user should have a choice.
   */
  promptDiscardFromHand(count: number, who?: "player" | "opponent"): Promise<GameCard[]>;

  /** Discard entire hand */
  discardHand(who?: "player" | "opponent"): GameCard[];

  /**
   * Search deck for cards matching a filter, return up to count.
   * Auto-selects first N matches (no user choice). Use promptSearchDeck for interactive selection.
   */
  searchDeck(
    filter: (card: GameCard) => boolean,
    count: number,
    who?: "player" | "opponent"
  ): GameCard[];

  /**
   * Interactive deck search: shows matching cards to the user and lets them choose.
   * Falls back to auto-select (like searchDeck) when no UI is available or matches ≤ count.
   * Optional in interface for test mock compatibility — always present on real EffectContext.
   */
  promptSearchDeck?(
    filter: (card: GameCard) => boolean,
    count: number,
    message: string,
    who?: "player" | "opponent"
  ): Promise<GameCard[]>;

  /**
   * Interactive discard pile search: shows matching cards and lets the user choose.
   * Falls back to auto-select (like searchDiscard) when no UI is available.
   */
  promptSearchDiscard?(
    filter: (card: GameCard) => boolean,
    count: number,
    message: string,
    who?: "player" | "opponent"
  ): Promise<GameCard[]>;

  /**
   * Interactive bench selection for switching own active Pokemon.
   * Falls back to auto-select bench[0] when only 1 bench Pokemon or no UI.
   */
  promptSwitchOwnActive?(message?: string): Promise<boolean>;

  /**
   * Interactive bench selection for switching opponent's active Pokemon.
   * Falls back to auto-select bench[0] when only 1 bench Pokemon or no UI.
   */
  promptSwitchOpponentActive?(message?: string): Promise<boolean>;

  /** Put a card from search results into hand */
  addToHand(card: GameCard, who?: "player" | "opponent"): void;

  /** Shuffle a player's deck */
  shuffleDeck(who?: "player" | "opponent"): void;

  /**
   * Search deck for energy matching filter, attach to target.
   * Returns true if found and attached.
   */
  attachEnergyFromDeck(
    filter: (c: GameCard) => boolean,
    target: GameCard
  ): boolean;

  /** Move energy between Pokemon */
  moveEnergy(
    from: GameCard,
    to: GameCard,
    energyInstanceId: string
  ): boolean;

  /** Flip a coin: true = heads, false = tails */
  flipCoin(): boolean;

  /** Flip multiple coins */
  flipCoins(count: number): { heads: number; tails: number };

  /** Apply a status condition to a Pokemon */
  applyStatus(target: GameCard, status: StatusCondition): void;

  /** Remove a status condition from a Pokemon */
  removeStatus(target: GameCard, status: StatusCondition): void;

  /** Remove all status conditions from a Pokemon */
  removeAllStatus(target: GameCard): void;

  /** Switch opponent's active with a bench Pokemon */
  switchOpponentActive(benchInstanceId: string): boolean;

  /** Switch own active with a bench Pokemon (no retreat cost) */
  switchOwnActive(benchInstanceId: string): boolean;

  /**
   * Search discard pile for cards matching a filter, return up to count.
   * Found cards are removed from discard.
   */
  searchDiscard(
    filter: (card: GameCard) => boolean,
    count: number,
    who?: "player" | "opponent"
  ): GameCard[];

  /** Shuffle entire hand into deck */
  shuffleHandIntoDeck(who?: "player" | "opponent"): number;

  /**
   * Reveal (peek) the top N cards from deck and remove them.
   * Caller decides what to do with them (add to hand, put back, etc.)
   */
  revealTopCards(count: number, who?: "player" | "opponent"): GameCard[];

  /** Put cards on top of a player's deck (first card = top of deck) */
  putOnTopOfDeck(cards: GameCard[], who?: "player" | "opponent"): void;

  /** Shuffle specific cards into a player's deck */
  shuffleIntoDeck(cards: GameCard[], who?: "player" | "opponent"): void;

  /**
   * Search discard for energy matching filter, attach to target.
   * Returns the energy cards that were attached.
   */
  attachEnergyFromDiscard(
    filter: (c: GameCard) => boolean,
    count: number,
    target: GameCard
  ): GameCard[];

  /**
   * Pick up a Pokemon and all its attachments (energy, tools) from the field.
   * Returns all cards (Pokemon + energy + tools) — caller decides where they go.
   */
  pickUpPokemon(instanceId: string, who?: "player" | "opponent"): GameCard[];

  /** Find a Pokemon on the field (active or bench) for either player */
  findPokemon(instanceId: string): GameCard | null;

  /** Get all Pokemon in play for a player */
  getAllPokemon(who?: "player" | "opponent"): GameCard[];

  /** Get the current stadium card in play (null if none) */
  getStadium(): GameCard | null;

  /** Remove the current stadium card (discard it to its owner's discard pile) */
  removeStadium(): boolean;

  /** Add a marker to a card (increments by count, default 1) */
  addMarker(target: GameCard, name: string, count?: number): void;

  /** Remove a marker from a card (decrements by count, default removes entirely) */
  removeMarker(target: GameCard, name: string, count?: number): void;

  /** Get the current value of a marker on a card (0 if not set) */
  getMarker(target: GameCard, name: string): number;

  /** Check if a card has a specific marker (value > 0) */
  hasMarker(target: GameCard, name: string): boolean;

  /** Log a message to the game event log */
  log(message: string): void;

  /**
   * Directly evolve a Pokemon on the field, bypassing middleware validation.
   * Used by Rare Candy and similar effects that skip evolution stages.
   * Caller is responsible for chain validation.
   */
  evolvePokemonDirect?(targetInstanceId: string, evolutionCard: GameCard): boolean;

  // ─── V2 Action Support Methods ───

  // ─── V2 Action Support Methods (optional for backward compat with existing mocks) ───

  /**
   * Place damage counters directly (bypasses weakness/resistance).
   * Used by effects like "place 3 damage counters" — NOT attack damage.
   */
  placeDamageCounters?(amount: number, target: GameCard): void;

  /**
   * Move damage counters between Pokemon.
   * @param count - Number of damage counters to move
   */
  moveDamageCounters?(count: number, from: GameCard, to: GameCard): void;

  /**
   * Move a card to the Lost Zone (removed from play permanently).
   * Removes from whatever zone the card is currently in.
   */
  moveToLostZone?(card: GameCard, who?: "player" | "opponent"): void;

  /**
   * Move multiple cards to the Lost Zone.
   */
  moveToLostZoneMultiple?(cards: GameCard[], who?: "player" | "opponent"): void;

  /**
   * Devolve a Pokemon: remove the top evolution card, reveal the previous stage.
   * The removed evolution card goes to the specified destination.
   */
  devolve?(target: GameCard, destination?: "hand" | "discard"): GameCard | null;

  /**
   * Spread damage across multiple targets (player chooses distribution).
   * For non-interactive, distributes evenly starting from first target.
   */
  spreadDamage?(totalCounters: number, targets: GameCard[]): void;

  /**
   * Discard energy from a target Pokemon.
   * @param count - Number of energy to discard
   * @param target - The Pokemon to discard energy from
   * @param filter - Optional filter for which energy to discard
   */
  discardEnergyFromPokemon?(
    count: number,
    target: GameCard,
    filter?: (card: GameCard) => boolean
  ): GameCard[];

  /**
   * Search the Lost Zone for cards matching a filter.
   */
  searchLostZone?(
    filter: (card: GameCard) => boolean,
    count: number,
    who?: "player" | "opponent"
  ): GameCard[];

  /**
   * Prompt the user to select cards or targets.
   * Returns a promise that resolves with the selected card IDs.
   */
  promptUser(options: {
    message: string;
    min: number;
    max: number;
    zone?: "deck" | "discard" | "hand" | "bench" | "opponent_bench" | "own_field" | "prizes";
    filter?: {
      supertype?: string;
      subtypes?: string[];
      name?: string;
    };
    targets?: string[];
  }): Promise<string[]>;
}

// ───────────────────────────────────────────────
// Attack Effect
// ───────────────────────────────────────────────

export interface AttackResult {
  /** Final base damage (before weakness/resistance) */
  damage: number;
  /** Skip weakness calculation */
  skipWeakness?: boolean;
  /** Skip resistance calculation */
  skipResistance?: boolean;
  /** Damage to bench Pokemon */
  benchDamage?: Array<{ target: GameCard; damage: number }>;
  /** Damage to the attacker itself */
  selfDamage?: number;
  /** Status effects to apply after the attack */
  statusEffects?: Array<{
    target: "defender" | "self";
    status: StatusCondition;
  }>;
  /** Prevent the defending Pokemon from retreating next turn */
  preventRetreat?: boolean;
  /** Energy cards to discard from the attacker */
  discardEnergy?: number;
}

export interface AttackEffect {
  /** Attack name - must match card.attacks[].name */
  name: string;
  /**
   * Called when this attack is used.
   * @param ctx - Effect context
   * @param baseDamage - The base damage from the card data
   * @returns Modified attack result
   */
  onAttack: (ctx: EffectContext, baseDamage: number) => AttackResult;
}

// ───────────────────────────────────────────────
// Ability Effect
// ───────────────────────────────────────────────

export type AbilityType = "activated" | "passive" | "on_enter";

export interface AbilityEffect {
  /** Ability name */
  name: string;
  /** Type of ability */
  type: AbilityType;
  /** Check if the ability can be activated (for activated abilities) */
  canActivate?: (ctx: EffectContext) => boolean;
  /** Execute the ability (for activated abilities) */
  onActivate?: (ctx: EffectContext) => void | Promise<void>;
  /** Modify outgoing or incoming damage (passive) */
  modifyDamage?: (
    ctx: EffectContext,
    damage: number,
    isAttacker: boolean
  ) => number;
  /** Modify retreat cost (passive) */
  modifyRetreatCost?: (ctx: EffectContext, currentCost: number) => number;
  /** Called when this Pokemon enters play (on_enter). Can be async for interactive prompts. */
  onEnter?: (ctx: EffectContext) => void | Promise<void>;
  /** Modify incoming damage to this Pokemon (passive, defensive) */
  modifyIncomingDamage?: (ctx: EffectContext, damage: number) => number;
  /** Prevent all bench damage to this Pokemon (passive) */
  preventBenchDamage?: boolean;
}

// ───────────────────────────────────────────────
// Trainer Effect (Supporter, Item, Stadium)
// ───────────────────────────────────────────────

export interface TrainerEffect {
  /** Additional play conditions beyond the standard checks */
  canPlay?: (ctx: EffectContext) => boolean;
  /** Execute the trainer card's effect */
  onPlay: (ctx: EffectContext) => void | Promise<void>;
}

// ───────────────────────────────────────────────
// Tool Effect (Pokemon Tool)
// ───────────────────────────────────────────────

export interface ToolEffect {
  /** Effects that apply while the tool is attached */
  whileAttached?: {
    /** Modify outgoing damage */
    modifyDamage?: (ctx: EffectContext, damage: number) => number;
    /** Modify retreat cost */
    modifyRetreatCost?: (ctx: EffectContext, currentCost: number) => number;
    /** Modify incoming damage */
    modifyIncomingDamage?: (ctx: EffectContext, damage: number) => number;
  };
}

// ───────────────────────────────────────────────
// Card Effect Definition (the main registration unit)
// ───────────────────────────────────────────────

export interface CardEffectDef {
  /** Card ID - must match Card.id (e.g., "sv1-25", "me1-114") */
  cardId: string;
  /** Optional card name for debugging */
  cardName?: string;
  /** Attack effects for this card's attacks */
  attacks?: AttackEffect[];
  /** Ability effects for this card */
  abilities?: AbilityEffect[];
  /** Trainer card effect */
  trainer?: TrainerEffect;
  /** Tool card effect */
  tool?: ToolEffect;
}
