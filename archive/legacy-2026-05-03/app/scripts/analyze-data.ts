
import fs from 'fs';
import path from 'path';

interface Card {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  types?: string[];
  set: string;
  hp?: string;
  rules?: string[];
  attacks?: any[];
  abilities?: any[];
  weaknesses?: any[];
  resistances?: any[];
  retreatCost?: string[];
}

const CARDS_DIR = path.join(process.cwd(), 'src/data/cards');

function analyze() {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json') && f !== '_index.json');
  
  const stats = {
    totalCards: 0,
    supertypes: new Map<string, number>(),
    subtypes: new Map<string, number>(),
    types: new Map<string, number>(),
    sets: new Map<string, number>(),
    hpValues: new Map<string, number>(),
    anomalies: [] as string[],
  };

  const allCards: Card[] = [];

  files.forEach(file => {
    const content = fs.readFileSync(path.join(CARDS_DIR, file), 'utf-8');
    const cards: Card[] = JSON.parse(content);
    allCards.push(...cards);

    cards.forEach(card => {
      stats.totalCards++;

      // Supertype
      const st = card.supertype;
      stats.supertypes.set(st, (stats.supertypes.get(st) || 0) + 1);

      // Subtypes
      card.subtypes?.forEach(sub => {
        stats.subtypes.set(sub, (stats.subtypes.get(sub) || 0) + 1);
      });

      // Types
      card.types?.forEach(t => {
        stats.types.set(t, (stats.types.get(t) || 0) + 1);
      });

      // Set
      stats.sets.set(card.set, (stats.sets.get(card.set) || 0) + 1);

      // HP
      if (card.hp) {
        stats.hpValues.set(card.hp, (stats.hpValues.get(card.hp) || 0) + 1);
        if (isNaN(parseInt(card.hp)) && card.supertype === 'Pokémon') {
          stats.anomalies.push(`Card ${card.id} (${card.name}) has invalid HP: ${card.hp}`);
        }
      }

      // Anomalies Checks
      if (card.supertype === 'Trainer' && (!card.subtypes || card.subtypes.length === 0)) {
        stats.anomalies.push(`Trainer ${card.id} (${card.name}) has no subtypes`);
      }
      
      // Inconsistent "Tool" naming
      if (card.subtypes?.includes("Pokémon Tool") && card.subtypes?.includes("Tool")) {
         stats.anomalies.push(`Card ${card.id} has both "Pokémon Tool" and "Tool"`);
      }
    });
  });

  console.log("=== Data Analysis Report ===");
  console.log(`Total Cards: ${stats.totalCards}`);
  
  console.log("\n--- Supertypes ---");
  console.log(Object.fromEntries(stats.supertypes));

  console.log("\n--- Subtypes ---");
  console.log(Object.fromEntries(stats.subtypes));

  console.log("\n--- Types ---");
  console.log(Object.fromEntries(stats.types));

  console.log("\n--- Anomalies ---");
  if (stats.anomalies.length > 0) {
    stats.anomalies.slice(0, 20).forEach(a => console.log(a));
    if (stats.anomalies.length > 20) console.log(`...and ${stats.anomalies.length - 20} more`);
  } else {
    console.log("None detected.");
  }
}

analyze();
