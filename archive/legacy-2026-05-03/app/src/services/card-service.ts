import { Card } from "@/types/card";

let cardCache: Card[] | null = null;
let indexById: Map<string, Card> | null = null;
let indexByName: Map<string, Card[]> | null = null;

/**
 * Load all card data from the combined index file.
 * Results are cached after first load.
 */
export async function loadAllCards(): Promise<Card[]> {
  if (cardCache) return cardCache;

  const data = await import("@/data/cards/_index.json");
  cardCache = data.default as Card[];
  rebuildIndexes();
  return cardCache;
}

/**
 * Load cards synchronously from a pre-loaded dataset.
 * Used in test environments where async imports aren't available.
 */
export function loadCardsSync(cards: Card[]): void {
  cardCache = cards;
  rebuildIndexes();
}

function rebuildIndexes(): void {
  if (!cardCache) return;

  indexById = new Map();
  indexByName = new Map();

  for (const card of cardCache) {
    indexById.set(card.id, card);

    const nameLower = card.name.toLowerCase();
    if (!indexByName.has(nameLower)) {
      indexByName.set(nameLower, []);
    }
    indexByName.get(nameLower)!.push(card);
  }
}

/**
 * Find a card by its exact ID (e.g., "sv1-1").
 */
export function getCardById(id: string): Card | undefined {
  return indexById?.get(id);
}

/**
 * Find all cards matching a name (case-insensitive exact match).
 */
export function getCardsByName(name: string): Card[] {
  return indexByName?.get(name.toLowerCase()) ?? [];
}

/**
 * Search cards by partial name match (case-insensitive).
 */
export function searchCards(query: string, limit = 50): Card[] {
  if (!cardCache) return [];

  const q = query.toLowerCase();
  const results: Card[] = [];

  for (const card of cardCache) {
    if (card.name.toLowerCase().includes(q)) {
      results.push(card);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Find all cards belonging to a specific set.
 */
export function getCardsBySet(setId: string): Card[] {
  if (!cardCache) return [];
  return cardCache.filter((c) => c.set === setId);
}

/**
 * Filter cards that are legal in Standard format.
 */
export function getStandardLegalCards(): Card[] {
  if (!cardCache) return [];
  return cardCache.filter((c) => c.legalities.standard === "Legal");
}

/**
 * Check if a specific card is legal in Standard format.
 */
export function isStandardLegal(cardId: string): boolean {
  const card = getCardById(cardId);
  if (!card) return false;
  return card.legalities.standard === "Legal";
}

/**
 * Get all unique Pokemon types present in the card pool.
 */
export function getAvailableTypes(): string[] {
  if (!cardCache) return [];

  const types = new Set<string>();
  for (const card of cardCache) {
    if (card.types) {
      card.types.forEach((t) => types.add(t));
    }
  }
  return Array.from(types).sort();
}

/**
 * Get all unique set IDs in the loaded data.
 */
export function getAvailableSets(): string[] {
  if (!cardCache) return [];

  const sets = new Set<string>();
  for (const card of cardCache) {
    if (card.set) sets.add(card.set);
  }
  return Array.from(sets).sort();
}

/**
 * Advanced card query with multiple filters.
 */
export function queryCards(filters: {
  name?: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  set?: string;
  standardOnly?: boolean;
  limit?: number;
}): Card[] {
  if (!cardCache) return [];

  let results = cardCache;

  if (filters.standardOnly) {
    results = results.filter((c) => c.legalities.standard === "Legal");
  }

  if (filters.supertype) {
    results = results.filter((c) => c.supertype === filters.supertype);
  }

  if (filters.subtypes && filters.subtypes.length > 0) {
    results = results.filter((c) =>
      filters.subtypes!.some((st) => c.subtypes.includes(st))
    );
  }

  if (filters.types && filters.types.length > 0) {
    results = results.filter(
      (c) => c.types && filters.types!.some((t) => c.types!.includes(t))
    );
  }

  if (filters.set) {
    results = results.filter((c) => c.set === filters.set);
  }

  if (filters.name) {
    const q = filters.name.toLowerCase();
    results = results.filter((c) => c.name.toLowerCase().includes(q));
  }

  if (filters.limit) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

/**
 * Clear the card cache (useful for testing).
 */
export function clearCache(): void {
  cardCache = null;
  indexById = null;
  indexByName = null;
}
