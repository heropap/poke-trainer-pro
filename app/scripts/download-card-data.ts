/**
 * Downloads Pokemon TCG card data from the pokemon-tcg-data GitHub repository.
 * Focuses on Scarlet & Violet era sets for Standard environment coverage.
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const BASE_URL =
  "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en";

// Standard-legal sets
const STANDARD_SETS = [
  // Scarlet & Violet era
  "sv1",
  "sv2",
  "sv3",
  "sv3pt5",
  "sv4",
  "sv4pt5",
  "sv5",
  "sv6",
  "sv6pt5",
  "sv7",
  "sv8",
  "sv8pt5",
  "sv9",
  "sv10",
  "sve",
  "svp",
  // Mega Evolution era
  "me1",
  "me2",
  "me2pt5",
];

const OUTPUT_DIR = path.join(__dirname, "..", "src", "data", "cards");

function fetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function downloadSet(setId: string): Promise<void> {
  const url = `${BASE_URL}/${setId}.json`;
  try {
    const data = await fetch(url);
    const cards = JSON.parse(data);

    // Add set id to each card
    const enriched = cards.map((card: Record<string, unknown>) => ({
      ...card,
      set: setId,
    }));

    const outFile = path.join(OUTPUT_DIR, `${setId}.json`);
    fs.writeFileSync(outFile, JSON.stringify(enriched, null, 2));
    console.log(`  ${setId}: ${enriched.length} cards`);
  } catch (err) {
    console.warn(`  ${setId}: SKIPPED (${(err as Error).message})`);
  }
}

async function main() {
  console.log("Downloading Pokemon TCG card data...\n");

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Download all sets
  for (const setId of STANDARD_SETS) {
    await downloadSet(setId);
  }

  // Build combined index
  console.log("\nBuilding combined index...");
  const allCards: Record<string, unknown>[] = [];
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json") && f !== "_index.json");

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8")
    );
    allCards.push(...data);
  }

  const indexFile = path.join(OUTPUT_DIR, "_index.json");
  fs.writeFileSync(indexFile, JSON.stringify(allCards));
  console.log(`Combined index: ${allCards.length} total cards`);
  console.log("\nDone!");
}

main().catch(console.error);
