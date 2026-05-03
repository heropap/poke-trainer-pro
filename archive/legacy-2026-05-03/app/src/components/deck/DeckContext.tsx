"use client";

/**
 * DeckContext — Global state for deck management
 *
 * Provides deck storage access across pages (deck import → battle).
 * Uses localStorage as the persistence backend.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  StoredDeck,
  getAllDecks,
  saveDeck as saveDeckToStorage,
  deleteDeck as deleteDeckFromStorage,
  createStoredDeck,
} from "@/services/deck-storage";
import { DeckValidation } from "@/lib/deck-parser";

interface DeckContextValue {
  /** All stored decks */
  decks: StoredDeck[];
  /** Whether decks are still loading from localStorage */
  loading: boolean;
  /** Save a newly imported/validated deck */
  importDeck: (validation: DeckValidation, deckText: string) => StoredDeck;
  /** Delete a deck by ID */
  removeDeck: (id: string) => void;
  /** Get a specific deck by ID */
  getDeck: (id: string) => StoredDeck | undefined;
  /** Get only valid decks (for battle selection) */
  validDecks: StoredDeck[];
}

const DeckContext = createContext<DeckContextValue | null>(null);

export function DeckProvider({ children }: { children: ReactNode }) {
  const [decks, setDecks] = useState<StoredDeck[]>([]);
  const [loading, setLoading] = useState(true);

  // Load decks from localStorage on mount
  useEffect(() => {
    setDecks(getAllDecks());
    setLoading(false);
  }, []);

  const importDeck = useCallback(
    (validation: DeckValidation, deckText: string): StoredDeck => {
      const deck = createStoredDeck(validation, deckText);
      saveDeckToStorage(deck);
      setDecks(getAllDecks()); // refresh from storage
      console.log(`[DeckContext] Imported deck: "${deck.name}" (${deck.id})`);
      return deck;
    },
    []
  );

  const removeDeck = useCallback((id: string) => {
    deleteDeckFromStorage(id);
    setDecks(getAllDecks()); // refresh from storage
    console.log(`[DeckContext] Removed deck: ${id}`);
  }, []);

  const getDeck = useCallback(
    (id: string) => decks.find((d) => d.id === id),
    [decks]
  );

  const validDecks = decks.filter((d) => d.isValid);

  return (
    <DeckContext.Provider
      value={{ decks, loading, importDeck, removeDeck, getDeck, validDecks }}
    >
      {children}
    </DeckContext.Provider>
  );
}

export function useDeckContext(): DeckContextValue {
  const ctx = useContext(DeckContext);
  if (!ctx) {
    throw new Error("useDeckContext must be used within a DeckProvider");
  }
  return ctx;
}
