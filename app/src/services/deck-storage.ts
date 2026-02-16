/**
 * Deck Storage Service
 *
 * Persists validated decks to localStorage so they survive page navigation
 * and can be loaded by the battle system. Each deck includes:
 * - The original deck text (for re-import)
 * - The resolved card IDs (for game engine)
 * - Validation metadata (errors, warnings, legality)
 *
 * Storage key: "poke-trainer-decks"
 */

import { DeckValidation, DeckCardDetail } from "@/lib/deck-parser";

export interface StoredDeck {
  id: string;
  name: string;
  createdAt: string;
  deckText: string;
  totalCards: number;
  isValid: boolean;
  cards: StoredDeckCard[];
  warnings: string[];
  errors: string[];
}

export interface StoredDeckCard {
  cardId: string;
  name: string;
  quantity: number;
  setCode: string;
  number: string;
  category: "pokemon" | "trainer" | "energy" | "unknown";
  found: boolean;
  standardLegal: boolean;
}

const STORAGE_KEY = "poke-trainer-decks";

/**
 * Generate a unique deck ID
 */
function generateDeckId(): string {
  return `deck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Infer a deck name from the card list (use the most prominent ex/V Pokemon)
 */
function inferDeckName(cards: StoredDeckCard[]): string {
  // Find the main Pokemon (highest quantity ex/V, or first Pokemon)
  const pokemonCards = cards
    .filter((c) => c.category === "pokemon" && c.found)
    .sort((a, b) => b.quantity - a.quantity);

  const mainCard = pokemonCards.find(
    (c) => c.name.includes("ex") || c.name.includes("V")
  ) || pokemonCards[0];

  if (mainCard) {
    return `${mainCard.name} 卡组`;
  }
  return `卡组 ${new Date().toLocaleDateString("zh-CN")}`;
}

/**
 * Convert a DeckValidation result into a StoredDeck
 */
export function createStoredDeck(
  validation: DeckValidation,
  deckText: string
): StoredDeck {
  const cards: StoredDeckCard[] = validation.cardDetails.map(
    (detail: DeckCardDetail) => ({
      cardId: detail.cardId ?? "",
      name: detail.entry.name,
      quantity: detail.entry.quantity,
      setCode: detail.entry.setCode,
      number: detail.entry.number,
      category: detail.entry.category,
      found: detail.found,
      standardLegal: detail.standardLegal,
    })
  );

  const deck: StoredDeck = {
    id: generateDeckId(),
    name: inferDeckName(cards),
    createdAt: new Date().toISOString(),
    deckText,
    totalCards: validation.totalCards,
    isValid: validation.isValid,
    cards,
    warnings: [...validation.warnings],
    errors: [...validation.errors],
  };

  return deck;
}

/**
 * Save a deck to localStorage
 */
export function saveDeck(deck: StoredDeck): void {
  const decks = getAllDecks();

  // Replace if same ID exists, otherwise append
  const existingIdx = decks.findIndex((d) => d.id === deck.id);
  if (existingIdx >= 0) {
    decks[existingIdx] = deck;
  } else {
    decks.push(deck);
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  }

  console.log(
    `[DeckStorage] Saved deck "${deck.name}" (${deck.id}), ${deck.totalCards} cards, valid=${deck.isValid}`
  );
}

/**
 * Get all stored decks
 */
export function getAllDecks(): StoredDeck[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error("[DeckStorage] Failed to load decks:", err);
    return [];
  }
}

/**
 * Get a single deck by ID
 */
export function getDeckById(id: string): StoredDeck | undefined {
  return getAllDecks().find((d) => d.id === id);
}

/**
 * Delete a deck by ID
 */
export function deleteDeck(id: string): boolean {
  const decks = getAllDecks();
  const filtered = decks.filter((d) => d.id !== id);

  if (filtered.length === decks.length) {
    console.warn(`[DeckStorage] Deck not found for deletion: ${id}`);
    return false;
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  console.log(`[DeckStorage] Deleted deck ${id}`);
  return true;
}

/**
 * Get only valid decks (60 cards, no errors)
 */
export function getValidDecks(): StoredDeck[] {
  return getAllDecks().filter((d) => d.isValid);
}

/**
 * Get the card IDs from a deck (expanded by quantity)
 * e.g., 4x "sv1-1" → ["sv1-1", "sv1-1", "sv1-1", "sv1-1"]
 *
 * This is the primary interface for the battle system.
 */
export function getDeckCardIds(deck: StoredDeck): string[] {
  const ids: string[] = [];
  for (const card of deck.cards) {
    if (card.found && card.cardId) {
      for (let i = 0; i < card.quantity; i++) {
        ids.push(card.cardId);
      }
    }
  }
  return ids;
}

/**
 * Get ALL deck card entries (including unfound ones), expanded by quantity.
 * Each entry contains the original metadata needed to create proxy cards.
 *
 * Unlike getDeckCardIds() which filters out unfound cards, this returns
 * every card entry regardless of `found` status.
 */
export function getAllDeckCardEntries(deck: StoredDeck): Array<{
  cardId: string | null;
  name: string;
  quantity: number;
  setCode: string;
  number: string;
  category: "pokemon" | "trainer" | "energy" | "unknown";
  found: boolean;
}> {
  return deck.cards.map((card) => ({
    cardId: card.found && card.cardId ? card.cardId : null,
    name: card.name,
    quantity: card.quantity,
    setCode: card.setCode,
    number: card.number,
    category: card.category,
    found: card.found,
  }));
}

/**
 * Validate deck integrity — checks that all cards have resolved IDs
 * Returns list of unresolved card names (should be empty for a healthy deck)
 */
export function checkDeckIntegrity(deck: StoredDeck): string[] {
  const missing: string[] = [];
  for (const card of deck.cards) {
    if (!card.found || !card.cardId) {
      missing.push(`${card.name} (${card.setCode} ${card.number})`);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[DeckStorage] Deck "${deck.name}" has ${missing.length} unresolved card(s):`,
      missing
    );
  }

  return missing;
}
