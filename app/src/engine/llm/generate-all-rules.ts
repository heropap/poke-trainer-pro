/**
 * Batch Rule Generation Script
 *
 * Generates CTA rule JSON for all cards in the database.
 * Run with: npx ts-node -r tsconfig-paths/register src/engine/llm/generate-all-rules.ts
 *
 * Output:
 * - src/data/card-rules/generated-rules.json   (all rules, one big array)
 * - src/data/card-rules/stats.json              (generation statistics)
 * - Console output with coverage report
 */

import * as fs from "fs";
import * as path from "path";
import { generateRule, generateRules, getGenerationStats, GenerationStats } from "./offline-rule-generator";
import { CardInput } from "./prompt-builder";
import { CardRuleDef } from "../rules/card-rule-def";
import { validateRule } from "../rules/rule-validator";

// ═══════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════

function main() {
  console.log("═══ CTA Rule Batch Generator ═══\n");

  // Load all cards
  const cardsPath = path.resolve(__dirname, "../../data/cards/_index.json");
  const rawCards = JSON.parse(fs.readFileSync(cardsPath, "utf-8"));
  console.log(`Loaded ${rawCards.length} cards from database\n`);

  // Convert to CardInput format
  const cards: CardInput[] = rawCards.map((c: any) => ({
    id: c.id,
    name: c.name,
    supertype: c.supertype,
    subtypes: c.subtypes,
    hp: c.hp,
    types: c.types,
    attacks: c.attacks,
    abilities: c.abilities,
    retreatCost: c.retreatCost,
    rules: c.rules,
  }));

  // Generate rules
  console.log("Generating rules...");
  const startTime = Date.now();
  const allRules: CardRuleDef[] = [];
  let skipped = 0;

  for (const card of cards) {
    const rule = generateRule(card);
    if (rule) {
      allRules.push(rule);
    } else {
      skipped++;
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`Generated ${allRules.length} rules in ${elapsed}ms (${skipped} skipped)\n`);

  // Validate all rules
  console.log("Validating rules...");
  let validCount = 0;
  let invalidCount = 0;
  const validRules: CardRuleDef[] = [];
  const invalidRules: Array<{ cardId: string; errors: string[] }> = [];

  for (const rule of allRules) {
    const result = validateRule(rule);
    if (result.valid) {
      validCount++;
      validRules.push(rule);
    } else {
      invalidCount++;
      invalidRules.push({
        cardId: rule.cardId,
        errors: [...result.structuralErrors, ...result.semanticErrors],
      });
    }
  }

  console.log(`Valid: ${validCount}, Invalid: ${invalidCount}\n`);

  // Get statistics
  const stats = getGenerationStats(cards, validRules);

  // Print report
  console.log("═══ Generation Report ═══");
  console.log(`Total cards:      ${stats.total}`);
  console.log(`Rules generated:  ${stats.generated}`);
  console.log(`Skipped (vanilla): ${stats.skipped}`);
  console.log(`Coverage:         ${((stats.generated / stats.total) * 100).toFixed(1)}%`);
  console.log();
  console.log("By confidence:");
  console.log(`  High (≥0.8):    ${stats.byConfidence.high}`);
  console.log(`  Medium (≥0.5):  ${stats.byConfidence.medium}`);
  console.log(`  Low (<0.5):     ${stats.byConfidence.low}`);
  console.log();
  console.log("By supertype:");
  for (const [st, data] of Object.entries(stats.bySupertype)) {
    console.log(`  ${st}: ${data.generated}/${data.total} (${((data.generated / data.total) * 100).toFixed(1)}%)`);
  }
  console.log();

  // Show some invalid examples
  if (invalidRules.length > 0) {
    console.log(`First ${Math.min(5, invalidRules.length)} validation failures:`);
    invalidRules.slice(0, 5).forEach(ir => {
      console.log(`  ${ir.cardId}: ${ir.errors[0]}`);
    });
    console.log();
  }

  // Write output files
  const outDir = path.resolve(__dirname, "../../data/card-rules");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write valid rules
  const rulesPath = path.join(outDir, "generated-rules.json");
  fs.writeFileSync(rulesPath, JSON.stringify(validRules, null, 2), "utf-8");
  console.log(`Wrote ${validRules.length} valid rules to ${rulesPath}`);

  // Write stats
  const statsPath = path.join(outDir, "stats.json");
  const statsData = {
    ...stats,
    generatedAt: new Date().toISOString(),
    elapsedMs: elapsed,
    validCount,
    invalidCount,
    invalidExamples: invalidRules.slice(0, 20),
  };
  fs.writeFileSync(statsPath, JSON.stringify(statsData, null, 2), "utf-8");
  console.log(`Wrote stats to ${statsPath}`);

  // NOTE: index.json keeps the 10 hand-written exemplar rules.
  // generated-rules.json is loaded separately by rule-loader.
  // The rule-loader merges them at L1.5 registration time,
  // with hand-written (index.json) taking priority.

  console.log("\n═══ Done ═══");
}

main();
