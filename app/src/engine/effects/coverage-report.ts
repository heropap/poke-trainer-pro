/**
 * Coverage Report Generator
 *
 * Analyzes the effect system's coverage across all cards in the database.
 * Reports which cards have effects registered (by layer) and which are uncovered.
 *
 * 5-Layer Priority Chain:
 *   Layer 1: ID-based hand-written effects
 *   Layer 2: Name-based hand-written effects
 *   Layer 3: Text-parser from ryuu-play metadata
 *   Layer 4: Text-parser from UI Card data
 *   Layer 5: No effect (uncovered)
 */

import { Card } from "@/types/card";
import { parseCardEffects } from "./text-parser";

// ─── Report Types ───

export interface CoverageStats {
  /** Total unique card names analyzed */
  total: number;
  /** Cards with at least one effect-worthy field (attacks, abilities, rules) */
  effectWorthy: number;
  /** Coverage by layer */
  covered: {
    layer1_id: number;
    layer2_name: number;
    layer3_ryuu: number;
    layer4_textParser: number;
    total: number;
  };
  /** Cards with no effects */
  uncoveredCount: number;
  /** Coverage percentage (covered / effectWorthy) */
  coveragePercent: number;
  /** Breakdown by supertype */
  bySupertype: Record<string, { total: number; covered: number; percent: number }>;
}

export interface UncoveredCard {
  id: string;
  name: string;
  supertype: string;
  hasAttacks: boolean;
  hasAbilities: boolean;
  hasRules: boolean;
  /** Sample attack text (first attack, truncated) */
  sampleText?: string;
}

export interface CoverageReport {
  stats: CoverageStats;
  uncovered: UncoveredCard[];
}

// ─── Report Generation ───

/**
 * Generate a comprehensive coverage report for the card database.
 *
 * @param cards All cards from the database
 * @param registeredIds Set of card IDs with registered effects (Layer 1)
 * @param registeredNames Set of card names with registered effects (Layer 1+2+3)
 * @returns Full coverage report with stats and uncovered card list
 */
export function generateCoverageReport(
  cards: Card[],
  registeredIds: string[],
  registeredNames: string[]
): CoverageReport {
  const idSet = new Set(registeredIds);
  const nameSet = new Set(registeredNames);

  // Deduplicate cards by name for analysis
  const uniqueByName = new Map<string, Card>();
  for (const card of cards) {
    if (!uniqueByName.has(card.name)) {
      uniqueByName.set(card.name, card);
    }
  }

  const stats: CoverageStats = {
    total: uniqueByName.size,
    effectWorthy: 0,
    covered: {
      layer1_id: 0,
      layer2_name: 0,
      layer3_ryuu: 0,
      layer4_textParser: 0,
      total: 0,
    },
    uncoveredCount: 0,
    coveragePercent: 0,
    bySupertype: {},
  };

  const uncovered: UncoveredCard[] = [];

  for (const [name, card] of uniqueByName) {
    const hasAttacks = !!(card.attacks && card.attacks.length > 0);
    const hasAbilities = !!(card.abilities && card.abilities.length > 0);
    const hasRules = !!(card.rules && card.rules.length > 0);
    const isEffectWorthy = hasAttacks || hasAbilities || hasRules;

    // Skip non-effect-worthy cards (basic energy, vanilla Pokemon, etc.)
    if (!isEffectWorthy) continue;

    stats.effectWorthy++;

    // Initialize supertype stats
    const st = card.supertype || "Unknown";
    if (!stats.bySupertype[st]) {
      stats.bySupertype[st] = { total: 0, covered: 0, percent: 0 };
    }
    stats.bySupertype[st].total++;

    // Check coverage by layer
    let covered = false;

    // Layer 1: ID-based
    if (idSet.has(card.id)) {
      stats.covered.layer1_id++;
      covered = true;
    }
    // Layer 2: Name-based (hand-written)
    // Note: We can't distinguish L2 from L3/L4 since they all go to nameRegistry.
    // We count name-registered as "Layer 2+" for simplicity.
    else if (nameSet.has(name)) {
      stats.covered.layer2_name++;
      covered = true;
    }
    // Layer 4: Text-parser (try parsing now to check)
    else {
      const parsed = parseCardEffects(card);
      if (parsed) {
        stats.covered.layer4_textParser++;
        covered = true;
      }
    }

    if (covered) {
      stats.covered.total++;
      stats.bySupertype[st].covered++;
    } else {
      stats.uncoveredCount++;
      uncovered.push({
        id: card.id,
        name: card.name,
        supertype: st,
        hasAttacks,
        hasAbilities,
        hasRules,
        sampleText: getSampleText(card),
      });
    }
  }

  // Calculate percentages
  stats.coveragePercent =
    stats.effectWorthy > 0
      ? Math.round((stats.covered.total / stats.effectWorthy) * 1000) / 10
      : 0;

  for (const stStats of Object.values(stats.bySupertype)) {
    stStats.percent =
      stStats.total > 0
        ? Math.round((stStats.covered / stStats.total) * 1000) / 10
        : 0;
  }

  // Sort uncovered by supertype then name
  uncovered.sort((a, b) => {
    const stCmp = a.supertype.localeCompare(b.supertype);
    if (stCmp !== 0) return stCmp;
    return a.name.localeCompare(b.name);
  });

  return { stats, uncovered };
}

// ─── Pretty Print ───

/**
 * Format a coverage report as a human-readable string.
 */
export function formatCoverageReport(report: CoverageReport): string {
  const { stats } = report;
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════╗");
  lines.push("║         Card Effect Coverage Report          ║");
  lines.push("╠══════════════════════════════════════════════╣");
  lines.push(`║  Total unique card names:    ${pad(stats.total, 5)}          ║`);
  lines.push(`║  Effect-worthy cards:        ${pad(stats.effectWorthy, 5)}          ║`);
  lines.push(`║  Overall coverage:           ${pad(stats.coveragePercent + "%", 6)}         ║`);
  lines.push("╠──────────────────────────────────────────────╣");
  lines.push("║  By Layer:                                   ║");
  lines.push(`║    L1 (ID-based):            ${pad(stats.covered.layer1_id, 5)}          ║`);
  lines.push(`║    L2 (Name-based):          ${pad(stats.covered.layer2_name, 5)}          ║`);
  lines.push(`║    L4 (Text-parser):         ${pad(stats.covered.layer4_textParser, 5)}          ║`);
  lines.push(`║    Total covered:            ${pad(stats.covered.total, 5)}          ║`);
  lines.push(`║    Uncovered:                ${pad(stats.uncoveredCount, 5)}          ║`);
  lines.push("╠──────────────────────────────────────────────╣");
  lines.push("║  By Supertype:                               ║");

  for (const [st, stStats] of Object.entries(stats.bySupertype).sort()) {
    lines.push(
      `║    ${padEnd(st, 12)}: ${pad(stStats.covered, 4)}/${pad(stStats.total, 4)} (${pad(stStats.percent + "%", 6)}) ║`
    );
  }

  lines.push("╚══════════════════════════════════════════════╝");

  if (report.uncovered.length > 0) {
    lines.push("");
    lines.push(`Uncovered cards (${report.uncovered.length}):`);
    // Show first 20
    const shown = report.uncovered.slice(0, 20);
    for (const uc of shown) {
      const flags = [
        uc.hasAttacks ? "ATK" : "",
        uc.hasAbilities ? "ABL" : "",
        uc.hasRules ? "RUL" : "",
      ]
        .filter(Boolean)
        .join("+");
      const sample = uc.sampleText ? ` — "${uc.sampleText}"` : "";
      lines.push(`  [${uc.supertype}] ${uc.name} (${flags})${sample}`);
    }
    if (report.uncovered.length > 20) {
      lines.push(`  ... and ${report.uncovered.length - 20} more`);
    }
  }

  return lines.join("\n");
}

// ─── Helpers ───

function getSampleText(card: Card): string | undefined {
  // Try first attack text
  if (card.attacks?.[0]?.text) {
    const t = card.attacks[0].text;
    return t.length > 60 ? t.slice(0, 57) + "..." : t;
  }
  // Try first ability text
  if (card.abilities?.[0]?.text) {
    const t = card.abilities[0].text;
    return t.length > 60 ? t.slice(0, 57) + "..." : t;
  }
  // Try first rule
  if (card.rules?.[0]) {
    const t = card.rules[0];
    return t.length > 60 ? t.slice(0, 57) + "..." : t;
  }
  return undefined;
}

function pad(val: number | string, width: number): string {
  return String(val).padStart(width);
}

function padEnd(val: string, width: number): string {
  return val.padEnd(width);
}
