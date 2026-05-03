const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, 'cards');
const outDir = path.join(__dirname, 'analysis');

// Load all card JSON files (skip _index.json)
const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json') && f !== '_index.json');
let allCards = [];
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(cardsDir, f), 'utf8'));
  if (Array.isArray(data)) allCards = allCards.concat(data);
}

// Normalize numbers in text to create pattern families
function normalizeNumbers(text) {
  return text.replace(/\d+/g, '{N}');
}

// Tracking structures
const attackTexts = new Map();   // text -> { count, cardIds, pattern }
const abilityTexts = new Map();
const trainerTexts = new Map();

let totalCards = allCards.length;
let totalAttacks = 0;
let attacksWithText = 0;
let attacksDamageOnly = 0;
let totalAbilities = 0;
let totalTrainerTexts = 0;

const supertypeCounts = {};
const subtypeCounts = {};

for (const card of allCards) {
  // Supertype / subtype counts
  const st = card.supertype || 'Unknown';
  supertypeCounts[st] = (supertypeCounts[st] || 0) + 1;
  if (card.subtypes) {
    for (const sub of card.subtypes) {
      subtypeCounts[sub] = (subtypeCounts[sub] || 0) + 1;
    }
  }

  // Attacks
  if (card.attacks) {
    for (const atk of card.attacks) {
      totalAttacks++;
      const text = (atk.text || '').trim();
      if (text && text.length > 0) {
        attacksWithText++;
        const pattern = normalizeNumbers(text);
        if (!attackTexts.has(text)) {
          attackTexts.set(text, { count: 0, cardIds: [], pattern });
        }
        const entry = attackTexts.get(text);
        entry.count++;
        entry.cardIds.push(card.id);
      } else {
        attacksDamageOnly++;
      }
    }
  }

  // Abilities
  if (card.abilities) {
    for (const ab of card.abilities) {
      totalAbilities++;
      const text = (ab.text || '').trim();
      if (text && text.length > 0) {
        const pattern = normalizeNumbers(text);
        if (!abilityTexts.has(text)) {
          abilityTexts.set(text, { count: 0, cardIds: [], pattern });
        }
        const entry = abilityTexts.get(text);
        entry.count++;
        entry.cardIds.push(card.id);
      }
    }
  }

  // Trainer texts (from rules[])
  if (st === 'Trainer' && card.rules) {
    for (const rule of card.rules) {
      const text = (rule || '').trim();
      if (!text) continue;
      // Skip generic rules like "You may play only 1 Supporter card during your turn."
      const isGenericRule = /^You may play only \d+ .+ card during your turn\.?$/i.test(text)
        || /^Attach .+ to \d+ of your .+ Pokémon\.?$/i.test(text)
        || /^You may play as many Item cards as you like during your turn.*$/i.test(text);

      totalTrainerTexts++;
      const pattern = normalizeNumbers(text);
      if (!trainerTexts.has(text)) {
        trainerTexts.set(text, { count: 0, cardIds: [], pattern, isGenericRule });
      }
      const entry = trainerTexts.get(text);
      entry.count++;
      entry.cardIds.push(card.id);
    }
  }
}

// Pattern families: group by normalized pattern
function countPatternFamilies(textsMap) {
  const patterns = new Map();
  for (const [text, info] of textsMap) {
    const p = info.pattern;
    if (!patterns.has(p)) patterns.set(p, []);
    patterns.get(p).push(text);
  }
  let familiesWithMultiple = 0;
  let totalFamilies = patterns.size;
  for (const [, members] of patterns) {
    if (members.length > 1) familiesWithMultiple++;
  }
  return { totalFamilies, familiesWithMultiple };
}

const attackPatterns = countPatternFamilies(attackTexts);
const abilityPatterns = countPatternFamilies(abilityTexts);
const trainerPatterns = countPatternFamilies(trainerTexts);

// Build summary
const summary = {
  totalCards,
  supertypeCounts,
  subtypeCounts,
  attacks: {
    total: totalAttacks,
    withText: attacksWithText,
    damageOnly: attacksDamageOnly,
    uniqueTexts: attackTexts.size,
    patternFamilies: attackPatterns.totalFamilies,
    patternFamiliesWithVariants: attackPatterns.familiesWithMultiple,
  },
  abilities: {
    total: totalAbilities,
    uniqueTexts: abilityTexts.size,
    patternFamilies: abilityPatterns.totalFamilies,
    patternFamiliesWithVariants: abilityPatterns.familiesWithMultiple,
  },
  trainers: {
    totalTexts: totalTrainerTexts,
    uniqueTexts: trainerTexts.size,
    patternFamilies: trainerPatterns.totalFamilies,
    patternFamiliesWithVariants: trainerPatterns.familiesWithMultiple,
  },
};

// Sort helpers - most frequent first
function sortedEntries(map) {
  return Array.from(map.entries())
    .map(([text, info]) => ({ text, count: info.count, cardIds: info.cardIds, pattern: info.pattern }))
    .sort((a, b) => b.count - a.count);
}

const uniqueTexts = {
  attacks: sortedEntries(attackTexts),
  abilities: sortedEntries(abilityTexts),
  trainers: sortedEntries(trainerTexts),
};

// Write outputs
fs.writeFileSync(path.join(outDir, 'text-analysis-summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, 'unique-texts.json'), JSON.stringify(uniqueTexts, null, 2));

// Print summary
console.log(JSON.stringify(summary, null, 2));
console.log('\n--- Top 10 most common attack texts ---');
uniqueTexts.attacks.slice(0, 10).forEach((e, i) => {
  console.log(`${i + 1}. [${e.count}x] ${e.text.slice(0, 100)}`);
});
console.log('\n--- Top 10 most common ability texts ---');
uniqueTexts.abilities.slice(0, 10).forEach((e, i) => {
  console.log(`${i + 1}. [${e.count}x] ${e.text.slice(0, 100)}`);
});
console.log('\n--- Top 10 most common trainer texts ---');
uniqueTexts.trainers.slice(0, 10).forEach((e, i) => {
  console.log(`${i + 1}. [${e.count}x] ${e.text.slice(0, 100)}`);
});

console.log('\nOutput written to:');
console.log('  ' + path.join(outDir, 'text-analysis-summary.json'));
console.log('  ' + path.join(outDir, 'unique-texts.json'));
