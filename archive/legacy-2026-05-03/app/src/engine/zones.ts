/**
 * Zone Management Utilities
 *
 * Functions for manipulating card zones (deck, hand, bench, etc.)
 * All operations are immutable-safe: they modify zones in place
 * but return references for chaining.
 */

import { Zone, GameCard } from "./game-state";

/**
 * Fisher-Yates shuffle algorithm (in-place)
 */
export function shuffleZone(zone: Zone): Zone {
  const cards = zone.cards;
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return zone;
}

/**
 * Draw the top card from a zone (removes it)
 * Returns null if zone is empty
 */
export function drawFromTop(zone: Zone): GameCard | null {
  if (zone.cards.length === 0) return null;
  return zone.cards.shift()!;
}

/**
 * Draw multiple cards from the top of a zone
 */
export function drawMultiple(zone: Zone, count: number): GameCard[] {
  const drawn: GameCard[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawFromTop(zone);
    if (!card) break;
    drawn.push(card);
  }
  return drawn;
}

/**
 * Add a card to the bottom of a zone
 */
export function addToBottom(zone: Zone, card: GameCard): void {
  zone.cards.push(card);
}

/**
 * Add a card to the top of a zone
 */
export function addToTop(zone: Zone, card: GameCard): void {
  zone.cards.unshift(card);
}

/**
 * Add multiple cards to a zone
 */
export function addCards(zone: Zone, cards: GameCard[]): void {
  zone.cards.push(...cards);
}

/**
 * Remove a card by instanceId from a zone
 * Returns the removed card or null
 */
export function removeCard(zone: Zone, instanceId: string): GameCard | null {
  const idx = zone.cards.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) return null;
  return zone.cards.splice(idx, 1)[0];
}

/**
 * Find a card in a zone by instanceId
 */
export function findCard(zone: Zone, instanceId: string): GameCard | undefined {
  return zone.cards.find((c) => c.instanceId === instanceId);
}

/**
 * Check if a zone contains any basic Pokemon
 */
export function hasBasicPokemon(zone: Zone): boolean {
  return zone.cards.some(
    (c) =>
      c.card.supertype === "Pokémon" &&
      c.card.subtypes.includes("Basic")
  );
}

/**
 * Get all basic Pokemon from a zone
 */
export function getBasicPokemon(zone: Zone): GameCard[] {
  return zone.cards.filter(
    (c) =>
      c.card.supertype === "Pokémon" &&
      c.card.subtypes.includes("Basic")
  );
}

/**
 * Get the number of cards in a zone
 */
export function zoneSize(zone: Zone): number {
  return zone.cards.length;
}

/**
 * Check if a zone is empty
 */
export function isZoneEmpty(zone: Zone): boolean {
  return zone.cards.length === 0;
}

/**
 * Move a card from one zone to another by instanceId
 */
export function moveCard(
  from: Zone,
  to: Zone,
  instanceId: string
): GameCard | null {
  const card = removeCard(from, instanceId);
  if (card) {
    addToBottom(to, card);
  }
  return card;
}
