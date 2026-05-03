/**
 * Tests for deck import compatibility with Chinese PTCG Live format.
 *
 * Verifies:
 * - SWSH promo set code support
 * - Name-based fallback when exact set+number doesn't match
 * - Full Chinese Live deck list import
 */

import {
  parseDeckList,
  validateDeck,
  resolveSetCode,
  buildCardId,
  FALLBACK_SET_CODES,
} from "@/lib/deck-parser";

describe("Chinese PTCG Live Deck Import Compatibility", () => {
  // ─── Set Code Tests ───

  describe("SWSH promo set code", () => {
    it("resolves SWSH to swshp", () => {
      expect(resolveSetCode("SWSH")).toBe("swshp");
    });

    it("resolves SWP to swshp", () => {
      expect(resolveSetCode("SWP")).toBe("swshp");
    });

    it("builds card ID for SWSH promos", () => {
      expect(buildCardId("SWSH", "250")).toBe("swshp-250");
      expect(buildCardId("SWSH", "253")).toBe("swshp-253");
    });

    it("SWSH is in FALLBACK_SET_CODES", () => {
      expect(FALLBACK_SET_CODES.has("SWSH")).toBe(true);
      expect(FALLBACK_SET_CODES.has("SWP")).toBe(true);
    });
  });

  // ─── Parser Tests ───

  describe("parsing Chinese Live deck list", () => {
    const CHINESE_LIVE_DECK = `Pokémon:16
1 Radiant Greninja ASR 46
3 Chien-Pao ex PAF 242
1 Lumineon V SWSH 250
1 Origin Forme Palkia V SWSH 253
3 Frigibax PAL 208
2 Baxcalibur PAF 130
1 Origin Forme Palkia VSTAR SWSH 254
2 Bidoof CRZ 111
2 Bibarel SWSH 188
Trainer:35
1 Ciphermaniac's Codebreaking PRE 104
2 Iono PAF 237
4 Irida ASR 204
2 Boss's Orders ASC 256
1 Switch PFL 123
1 Lost Vacuum CRZ 135
4 Nest Ball PAF 84
2 Earthen Vessel PRE 106
1 Prime Catcher PRE 119
3 Buddy-Buddy Poffin ASC 184
4 Ultra Ball ASC 264
1 Hisuian Heavy Ball ASR 146
1 Super Rod PAL 276
3 Rare Candy PAF 89
4 Superior Energy Retrieval PAL 277
1 Canceling Cologne ASR 136
Energy:9
9 Basic Water Energy SVE 11
Total Cards:60`;

    it("parses all 60 cards correctly", () => {
      const parsed = parseDeckList(CHINESE_LIVE_DECK);
      expect(parsed.totalCards).toBe(60);
      expect(parsed.errors).toHaveLength(0);
    });

    it("categorizes cards correctly", () => {
      const parsed = parseDeckList(CHINESE_LIVE_DECK);
      expect(parsed.pokemon.length).toBe(9); // 9 pokemon lines
      expect(parsed.trainers.length).toBe(16); // 16 trainer lines
      expect(parsed.energy.length).toBe(1); // 1 energy line
    });

    it("parses SWSH set code entries", () => {
      const parsed = parseDeckList(CHINESE_LIVE_DECK);
      const swshEntries = parsed.entries.filter((e) => e.setCode === "SWSH");
      expect(swshEntries).toHaveLength(4);
      expect(swshEntries.map((e) => e.name)).toEqual([
        "Lumineon V",
        "Origin Forme Palkia V",
        "Origin Forme Palkia VSTAR",
        "Bibarel",
      ]);
    });

    it("parses header without space before colon", () => {
      // Chinese Live format: "Pokémon:16" (no space)
      const parsed = parseDeckList("Pokémon:16\n1 Pikachu SVI 50");
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.pokemon).toHaveLength(1);
    });
  });

  // ─── Name Fallback Tests ───

  describe("name-based fallback in validateDeck", () => {
    const mockCardDb: Record<string, { id: string; name: string; legalities: { standard?: string } }> = {
      "swsh9-40": { id: "swsh9-40", name: "Lumineon V", legalities: { standard: "Legal" } },
      "swsh10-39": { id: "swsh10-39", name: "Origin Forme Palkia V", legalities: { standard: "Legal" } },
      "swsh10-40": { id: "swsh10-40", name: "Origin Forme Palkia VSTAR", legalities: { standard: "Legal" } },
      "swsh9-121": { id: "swsh9-121", name: "Bibarel", legalities: { standard: "Legal" } },
      "sv2-208": { id: "sv2-208", name: "Frigibax", legalities: { standard: "Legal" } },
    };

    const mockCardLookup = (id: string) => mockCardDb[id];

    const mockNameLookup = (name: string) => {
      const lcName = name.toLowerCase();
      return Object.values(mockCardDb).filter(
        (c) => c.name.toLowerCase() === lcName
      );
    };

    it("falls back to name lookup for SWSH promo cards", () => {
      const parsed = parseDeckList(
        "Pokémon:4\n1 Lumineon V SWSH 250\n1 Origin Forme Palkia V SWSH 253\n1 Origin Forme Palkia VSTAR SWSH 254\n1 Bibarel SWSH 188"
      );

      // Without nameLookup: cards not found (swshp-250 etc don't exist)
      const resultNoFallback = validateDeck(parsed, mockCardLookup);
      const foundCountNoFallback = resultNoFallback.cardDetails.filter((d) => d.found).length;
      expect(foundCountNoFallback).toBe(0);

      // With nameLookup: cards resolved by name
      const resultWithFallback = validateDeck(parsed, mockCardLookup, mockNameLookup);
      const foundCountWithFallback = resultWithFallback.cardDetails.filter((d) => d.found).length;
      expect(foundCountWithFallback).toBe(4);

      // All should be marked as fallback
      for (const detail of resultWithFallback.cardDetails) {
        expect(detail.fallback).toBe(true);
        expect(detail.found).toBe(true);
      }
    });

    it("prefers Standard-legal cards in name fallback", () => {
      const expandedDb: Record<string, any> = {
        "swsh9-40": { id: "swsh9-40", name: "Lumineon V", legalities: { standard: "Banned" } },
        "sv1-40": { id: "sv1-40", name: "Lumineon V", legalities: { standard: "Legal" } },
      };
      const lookup = (id: string) => expandedDb[id];
      const nameLookup = (name: string) => {
        const lc = name.toLowerCase();
        return Object.values(expandedDb).filter((c: any) => c.name.toLowerCase() === lc);
      };

      const parsed = parseDeckList("Pokémon:1\n1 Lumineon V SWSH 250");
      const result = validateDeck(parsed, lookup, nameLookup);

      expect(result.cardDetails[0].found).toBe(true);
      // Should pick sv1-40 (Standard Legal) over swsh9-40 (Banned)
      expect(result.cardDetails[0].cardId).toBe("sv1-40");
    });

    it("does not use fallback when exact ID matches", () => {
      const parsed = parseDeckList("Pokémon:1\n1 Frigibax PAL 208");
      const result = validateDeck(parsed, mockCardLookup, mockNameLookup);

      expect(result.cardDetails[0].found).toBe(true);
      expect(result.cardDetails[0].cardId).toBe("sv2-208");
      expect(result.cardDetails[0].fallback).toBeFalsy();
    });

    it("without nameLookup, validateDeck still works (backward compatible)", () => {
      const parsed = parseDeckList("Pokémon:1\n1 Lumineon V SWSH 250");
      const result = validateDeck(parsed, mockCardLookup);

      // No fallback — card not found
      expect(result.cardDetails[0].found).toBe(false);
    });
  });
});
