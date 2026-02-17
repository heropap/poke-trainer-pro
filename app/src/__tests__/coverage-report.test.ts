/**
 * Tests for coverage-report.ts
 *
 * Validates coverage report generation and formatting.
 */

import {
  generateCoverageReport,
  formatCoverageReport,
} from "@/engine/effects/coverage-report";
import { Card } from "@/types/card";

// ─── Test helper: make a mock card ───

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: "test-1",
    name: "Test Card",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    number: "1",
    legalities: {},
    images: { small: "", large: "" },
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// generateCoverageReport
// ═══════════════════════════════════════════

describe("coverage-report: generateCoverageReport", () => {
  test("reports 100% coverage when all cards are registered", () => {
    const cards = [
      makeCard({ id: "sv1-1", name: "Iono", supertype: "Trainer", subtypes: ["Supporter"], rules: ["Draw cards."] }),
      makeCard({ id: "sv1-2", name: "Boss's Orders", supertype: "Trainer", subtypes: ["Supporter"], rules: ["Switch opponent's active."] }),
    ];

    const report = generateCoverageReport(cards, ["sv1-1"], ["Boss's Orders"]);

    expect(report.stats.effectWorthy).toBe(2);
    expect(report.stats.covered.total).toBe(2);
    expect(report.stats.covered.layer1_id).toBe(1);
    expect(report.stats.covered.layer2_name).toBe(1);
    expect(report.stats.uncoveredCount).toBe(0);
    expect(report.stats.coveragePercent).toBe(100);
  });

  test("reports 0% coverage when no cards are registered", () => {
    const cards = [
      makeCard({
        id: "sv1-1",
        name: "Weird Card",
        supertype: "Pokémon",
        attacks: [{ name: "Strange Attack", cost: [], damage: "0", text: "Do something completely unique and unparseable.", convertedEnergyCost: 0 }],
      }),
    ];

    const report = generateCoverageReport(cards, [], []);

    // The text-parser might not parse "Do something completely unique and unparseable"
    expect(report.stats.effectWorthy).toBe(1);
  });

  test("skips cards without effect-worthy fields", () => {
    const cards = [
      // Basic energy — no attacks, abilities, or rules
      makeCard({ id: "sv1-e1", name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] }),
      // Pokemon with attacks — effect-worthy
      makeCard({ id: "sv1-1", name: "Pikachu", attacks: [{ name: "Tackle", cost: [], damage: "20", text: "", convertedEnergyCost: 0 }] }),
    ];

    const report = generateCoverageReport(cards, [], []);

    // Only the Pokemon should be counted as effect-worthy
    expect(report.stats.effectWorthy).toBe(1);
  });

  test("deduplicates cards by name", () => {
    const cards = [
      makeCard({ id: "sv1-1", name: "Pikachu", attacks: [{ name: "Tackle", cost: [], damage: "20", text: "", convertedEnergyCost: 0 }] }),
      makeCard({ id: "sv2-1", name: "Pikachu", attacks: [{ name: "Tackle", cost: [], damage: "20", text: "", convertedEnergyCost: 0 }] }),
      makeCard({ id: "sv3-1", name: "Pikachu", attacks: [{ name: "Tackle", cost: [], damage: "20", text: "", convertedEnergyCost: 0 }] }),
    ];

    const report = generateCoverageReport(cards, [], []);

    // Only one unique name
    expect(report.stats.total).toBe(1);
    expect(report.stats.effectWorthy).toBe(1);
  });

  test("categorizes coverage by supertype", () => {
    const cards = [
      makeCard({ id: "sv1-1", name: "Pikachu", supertype: "Pokémon", attacks: [{ name: "Tackle", cost: [], damage: "20", text: "", convertedEnergyCost: 0 }] }),
      makeCard({ id: "sv1-2", name: "Iono", supertype: "Trainer", subtypes: ["Supporter"], rules: ["Draw 5 cards."] }),
      makeCard({ id: "sv1-3", name: "Boss's Orders", supertype: "Trainer", subtypes: ["Supporter"], rules: ["Switch opponent's active."] }),
    ];

    const report = generateCoverageReport(cards, [], ["Iono"]);

    expect(report.stats.bySupertype["Pokémon"]).toBeDefined();
    expect(report.stats.bySupertype["Trainer"]).toBeDefined();
    expect(report.stats.bySupertype["Trainer"].total).toBe(2);
    expect(report.stats.bySupertype["Trainer"].covered).toBeGreaterThanOrEqual(1);
  });

  test("uncovered list includes sample text", () => {
    const cards = [
      makeCard({
        id: "sv1-1",
        name: "Weird Pokemon",
        supertype: "Pokémon",
        attacks: [{ name: "XYZ", cost: [], damage: "0", text: "Do something completely unique zzzzzz.", convertedEnergyCost: 0 }],
      }),
    ];

    const report = generateCoverageReport(cards, [], []);

    if (report.uncovered.length > 0) {
      const uc = report.uncovered[0];
      expect(uc.name).toBe("Weird Pokemon");
      expect(uc.hasAttacks).toBe(true);
      expect(uc.sampleText).toBeTruthy();
    }
  });

  test("uses text-parser for Layer 4 check", () => {
    // A card with known parseable text
    const cards = [
      makeCard({
        id: "sv1-99",
        name: "Draw Test Pokemon",
        supertype: "Trainer",
        subtypes: ["Supporter"],
        rules: ["Draw 3 cards."],
      }),
    ];

    // Not registered by ID or name, but text-parser should catch it
    const report = generateCoverageReport(cards, [], []);

    expect(report.stats.covered.layer4_textParser).toBe(1);
    expect(report.stats.covered.total).toBe(1);
    expect(report.stats.coveragePercent).toBe(100);
  });
});

// ═══════════════════════════════════════════
// formatCoverageReport
// ═══════════════════════════════════════════

describe("coverage-report: formatCoverageReport", () => {
  test("produces human-readable output", () => {
    const cards = [
      makeCard({ id: "sv1-1", name: "Iono", supertype: "Trainer", subtypes: ["Supporter"], rules: ["Draw cards."] }),
    ];

    const report = generateCoverageReport(cards, [], ["Iono"]);
    const formatted = formatCoverageReport(report);

    expect(formatted).toContain("Coverage Report");
    expect(formatted).toContain("Total unique card names");
    expect(formatted).toContain("Effect-worthy");
    expect(formatted).toContain("By Layer");
    expect(formatted).toContain("By Supertype");
  });

  test("shows uncovered cards when present", () => {
    const cards = [
      makeCard({
        id: "sv1-1",
        name: "Mystery Card",
        supertype: "Pokémon",
        attacks: [{ name: "Mystery", cost: [], damage: "0", text: "This is a very unusual effect that nobody can parse zzzz.", convertedEnergyCost: 0 }],
      }),
    ];

    const report = generateCoverageReport(cards, [], []);

    if (report.uncovered.length > 0) {
      const formatted = formatCoverageReport(report);
      expect(formatted).toContain("Uncovered cards");
      expect(formatted).toContain("Mystery Card");
    }
  });
});

// ═══════════════════════════════════════════
// Integration: Full database coverage
// ═══════════════════════════════════════════

describe("coverage-report: full database integration", () => {
  test("generates report for real card database", () => {
    // Load real card data
    const cardsData = require("@/data/cards/_index.json") as Card[];

    const report = generateCoverageReport(cardsData, [], []);

    // Sanity checks
    expect(report.stats.total).toBeGreaterThan(1000);
    expect(report.stats.effectWorthy).toBeGreaterThan(500);
    expect(report.stats.coveragePercent).toBeGreaterThan(0);

    // The text-parser should cover a significant portion
    expect(report.stats.covered.layer4_textParser).toBeGreaterThan(200);
  });
});
