/**
 * Downloads Pokemon TCG card data from the pokemon-tcg-data GitHub repository.
 *
 * Covers all regulationMark F and later sets (Sword & Shield late era + Scarlet & Violet).
 * Builds a deduplicated local card database filtered to F/G/H/I/J+ regulation marks.
 *
 * Data source: https://github.com/PokemonTCG/pokemon-tcg-data
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL =
  "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en";

// ─── Regulation Mark F sets (Sword & Shield late era) ───
const F_MARK_SETS = [
  "swsh9",       // Brilliant Stars
  "swsh10",      // Astral Radiance
  "swsh11",      // Lost Origin
  "swsh12",      // Silver Tempest
  "swsh12pt5",   // Crown Zenith
  // Trainer Gallery / Galarian Gallery subsets
  "swsh9tg",
  "swsh10tg",
  "swsh11tg",
  "swsh12tg",
  "swsh12pt5gg",
];

// ─── Regulation Mark G/H/I/J sets (Scarlet & Violet era) ───
const SV_SETS = [
  "sv1", "sv2", "sv3", "sv3pt5",
  "sv4", "sv4pt5", "sv5", "sv6", "sv6pt5",
  "sv7", "sv8", "sv8pt5", "sv9", "sv10",
  "sve", "svp",
];

// ─── Mega Evolution era (custom sets used in this project) ───
const ME_SETS = [
  "me1", "me2", "me2pt5",
];

// ─── Future-proofing: try these sets, skip if 404 ───
const SPECULATIVE_SETS = [
  "sv10pt5", "sv11", "sv11pt5", "sv12",
  "rsv10pt5", "zsv10pt5",
];

// Combine all sets to download
const ALL_SETS = [
  ...F_MARK_SETS,
  ...SV_SETS,
  ...ME_SETS,
  ...SPECULATIVE_SETS,
];

// Allowed regulation marks (F and later; empty string / undefined also kept for ME sets)
const ALLOWED_REG_MARKS = new Set(["F", "G", "H", "I", "J", "K", "L"]);

const OUTPUT_DIR = path.join(__dirname, "..", "src", "data", "cards");

// ─── HTTP fetch with redirect support ───

function fetch(url: string, maxRedirects = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        // Handle redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          maxRedirects > 0
        ) {
          return resolve(fetch(res.headers.location, maxRedirects - 1));
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// ─── Download a single set ───

interface DownloadResult {
  setId: string;
  count: number;
  skipped: boolean;
}

async function downloadSet(setId: string, silent = false): Promise<DownloadResult> {
  const url = `${BASE_URL}/${setId}.json`;
  try {
    const data = await fetch(url);
    const cards = JSON.parse(data);

    // Add set id to each card for indexing
    const enriched = cards.map((card: Record<string, unknown>) => ({
      ...card,
      set: setId,
    }));

    const outFile = path.join(OUTPUT_DIR, `${setId}.json`);
    fs.writeFileSync(outFile, JSON.stringify(enriched, null, 2));
    if (!silent) {
      console.log(`  ✓ ${setId}: ${enriched.length} cards`);
    }
    return { setId, count: enriched.length, skipped: false };
  } catch (err) {
    if (!silent) {
      console.log(`  ✗ ${setId}: SKIPPED (${(err as Error).message})`);
    }
    return { setId, count: 0, skipped: true };
  }
}

// ─── Build combined index with deduplication & filtering ───

function buildIndex(): { total: number; byMark: Record<string, number> } {
  console.log("\nBuilding combined index...");

  const seen = new Set<string>();
  const allCards: Record<string, unknown>[] = [];
  const byMark: Record<string, number> = {};

  const files = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .sort();

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8")
    ) as Record<string, unknown>[];

    for (const card of data) {
      const id = card.id as string;
      if (!id || seen.has(id)) continue; // Deduplicate

      // Validate required fields
      if (!card.name || !card.supertype) continue;

      const regMark = (card.regulationMark as string) || "";

      // Filter: keep cards with allowed reg marks, OR cards from ME/custom sets
      // (ME sets don't have standard regulation marks)
      const setId = (card.set as string) || "";
      const isCustomSet = setId.startsWith("me");
      if (!isCustomSet && regMark && !ALLOWED_REG_MARKS.has(regMark)) {
        continue;
      }

      seen.add(id);
      allCards.push(card);

      const markKey = regMark || "(none)";
      byMark[markKey] = (byMark[markKey] || 0) + 1;
    }
  }

  const indexFile = path.join(OUTPUT_DIR, "_index.json");
  fs.writeFileSync(indexFile, JSON.stringify(allCards));

  return { total: allCards.length, byMark };
}

// ─── Main ───

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Pokemon TCG Card Data Downloader            ║");
  console.log("║  Source: PokemonTCG/pokemon-tcg-data         ║");
  console.log("║  Filter: regulationMark >= F                 ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Download F-mark sets
  console.log("── F-mark sets (Sword & Shield late era) ──");
  for (const setId of F_MARK_SETS) {
    await downloadSet(setId);
  }

  // Download SV sets
  console.log("\n── Scarlet & Violet sets ──");
  for (const setId of SV_SETS) {
    await downloadSet(setId);
  }

  // Download ME sets
  console.log("\n── Mega Evolution era (custom) ──");
  for (const setId of ME_SETS) {
    await downloadSet(setId);
  }

  // Try speculative future sets
  console.log("\n── Speculative future sets (404 = normal) ──");
  for (const setId of SPECULATIVE_SETS) {
    await downloadSet(setId, true);
  }

  // Build combined index
  const { total, byMark } = buildIndex();

  // Summary
  console.log("\n╔══════════════════════════════════════╗");
  console.log(`║  Total cards: ${String(total).padStart(5)} (deduplicated)    ║`);
  console.log("╠──────────────────────────────────────╣");
  const sortedMarks = Object.entries(byMark).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [mark, count] of sortedMarks) {
    console.log(`║  regulationMark ${mark.padEnd(6)}: ${String(count).padStart(5)} cards   ║`);
  }
  console.log("╚══════════════════════════════════════╝");
  console.log("\nDone! Index saved to src/data/cards/_index.json");
}

main().catch(console.error);
