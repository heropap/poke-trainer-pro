import type { CardDef, DeckDef, EnergyCardDef } from "./types";

const REGISTRY = new Map<string, CardDef>();

export function registerCard(card: CardDef): void {
  if (REGISTRY.has(card.id)) {
    const existing = REGISTRY.get(card.id);
    if (existing === card) return;
    throw new Error(`Duplicate card registration for id: ${card.id}`);
  }
  REGISTRY.set(card.id, card);
}

export function registerCards(cards: CardDef[]): void {
  for (const c of cards) registerCard(c);
}

export function getCard(id: string): CardDef {
  const c = REGISTRY.get(id);
  if (!c) throw new Error(`Card not found in registry: ${id}`);
  return c;
}

export function tryGetCard(id: string): CardDef | undefined {
  return REGISTRY.get(id);
}

export function getAllCards(): CardDef[] {
  return Array.from(REGISTRY.values());
}

export function clearRegistry(): void {
  REGISTRY.clear();
}

export function isBasicEnergy(card: CardDef): card is EnergyCardDef {
  return card.kind === "Energy" && card.energyKind === "Basic";
}

export interface DeckLegalityIssue {
  cardId: string;
  message: string;
}

export interface DeckLegalityReport {
  valid: boolean;
  totalCards: number;
  issues: DeckLegalityIssue[];
}

export function validateDeck(deck: DeckDef): DeckLegalityReport {
  const issues: DeckLegalityIssue[] = [];
  let total = 0;

  for (const entry of deck.cards) {
    total += entry.count;
    const card = tryGetCard(entry.cardId);
    if (!card) {
      issues.push({
        cardId: entry.cardId,
        message: `Card ${entry.cardId} is not registered`,
      });
      continue;
    }
    if (entry.count <= 0) {
      issues.push({
        cardId: entry.cardId,
        message: `Card ${entry.cardId} has non-positive count`,
      });
    }
    if (entry.count > 4 && !isBasicEnergy(card)) {
      issues.push({
        cardId: entry.cardId,
        message: `Card ${card.name} (${entry.cardId}) exceeds 4-copy limit (count=${entry.count})`,
      });
    }
  }

  if (total !== 60) {
    issues.push({
      cardId: "*",
      message: `Deck has ${total} cards, expected 60`,
    });
  }

  return { valid: issues.length === 0, totalCards: total, issues };
}
