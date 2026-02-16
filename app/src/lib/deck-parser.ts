/**
 * PTCG Live 卡组文本解析器
 *
 * 格式示例:
 *   Pokémon: 15
 *   4 Comfey LOR 79
 *   2 Charizard ex OBF 125
 *
 *   Trainer: 30
 *   4 Battle VIP Pass FST 225
 *
 *   Energy: 15
 *   4 Basic Fire Energy SVE 2
 *
 * 每行格式: <数量> <卡牌名> <系列代码> <编号>
 */

export interface DeckEntry {
  quantity: number;
  name: string;
  setCode: string;
  number: string;
  category: "pokemon" | "trainer" | "energy" | "unknown";
}

export interface ParsedDeck {
  entries: DeckEntry[];
  pokemon: DeckEntry[];
  trainers: DeckEntry[];
  energy: DeckEntry[];
  totalCards: number;
  errors: string[];
}

// PTCG Live 系列代码 → pokemon-tcg-data set ID 映射
const SET_CODE_MAP: Record<string, string> = {
  // Scarlet & Violet era
  SVI: "sv1",
  PAL: "sv2",
  OBF: "sv3",
  MEW: "sv3pt5",
  PAR: "sv4",
  PAF: "sv4pt5",
  TEF: "sv5",
  TWM: "sv6",
  SFA: "sv6pt5",
  SCR: "sv7",
  SSP: "sv8",
  PRE: "sv8pt5",
  JTG: "sv9",
  DST: "sv10",
  SVE: "sve",
  SVP: "svp",
  PR: "svp",

  // Mega Evolution era
  MEG: "me1", // Mega Evolution
  PFL: "me2", // Phantasmal Flames
  ASC: "me2pt5", // Ascended Heroes
  MEE: "sve", // Mega Evolution Energy (basic energies, same as SVE)

  // Sword & Shield era (for expanded/older decks)
  SSH: "swsh1",
  RCL: "swsh2",
  DAA: "swsh3",
  VIV: "swsh4",
  BST: "swsh5",
  CRE: "swsh6",
  EVS: "swsh7",
  FST: "swsh8",
  BRS: "swsh9",
  ASR: "swsh10",
  LOR: "swsh11",
  SIT: "swsh12",
  CRZ: "swsh12pt5",
  PGO: "pgo",
};

/**
 * 将 PTCG Live 系列代码转换为 pokemon-tcg-data 的 set ID
 */
export function resolveSetCode(code: string): string | null {
  return SET_CODE_MAP[code.toUpperCase()] ?? null;
}

/**
 * 根据 set ID 和卡牌编号构造 card_id
 */
export function buildCardId(setCode: string, number: string): string | null {
  const setId = resolveSetCode(setCode);
  if (!setId) return null;
  return `${setId}-${number}`;
}

/**
 * 解析 PTCG Live 格式的卡组文本
 */
export function parseDeckList(text: string): ParsedDeck {
  const lines = text.split("\n").map((l) => l.trim());
  const entries: DeckEntry[] = [];
  const errors: string[] = [];

  let currentCategory: "pokemon" | "trainer" | "energy" | "unknown" =
    "unknown";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (!line) continue;

    // Category headers: "Pokémon: 15", "Trainer: 30", "Energy: 15"
    const headerMatch = line.match(
      /^(Pok[eé]mon|Trainer|Energy)\s*:\s*\d*$/i
    );
    if (headerMatch) {
      const cat = headerMatch[1].toLowerCase();
      if (cat.startsWith("pok")) currentCategory = "pokemon";
      else if (cat === "trainer") currentCategory = "trainer";
      else if (cat === "energy") currentCategory = "energy";
      continue;
    }

    // Card line: "4 Comfey LOR 79" or "2 Basic Fire Energy SVE 2"
    // Format: <quantity> <name...> <setCode> <number>
    const cardMatch = line.match(/^(\d+)\s+(.+?)\s+([A-Z]{2,4})\s+(\d+)$/i);
    if (cardMatch) {
      entries.push({
        quantity: parseInt(cardMatch[1], 10),
        name: cardMatch[2].trim(),
        setCode: cardMatch[3].toUpperCase(),
        number: cardMatch[4],
        category: currentCategory,
      });
      continue;
    }

    // Total Energy line without set code: "4 Basic Fire Energy" - skip or warn
    // Also skip "Total Cards: 60" lines
    const totalMatch = line.match(/^Total\s+Cards?\s*:\s*\d+$/i);
    if (totalMatch) continue;

    // If line has content but didn't match, record error
    if (line.length > 0) {
      errors.push(`第 ${i + 1} 行无法解析: "${line}"`);
    }
  }

  const pokemon = entries.filter((e) => e.category === "pokemon");
  const trainers = entries.filter((e) => e.category === "trainer");
  const energy = entries.filter((e) => e.category === "energy");
  const totalCards = entries.reduce((sum, e) => sum + e.quantity, 0);

  return { entries, pokemon, trainers, energy, totalCards, errors };
}

/**
 * 卡组验证结果
 */
export interface DeckValidation {
  isValid: boolean;
  totalCards: number;
  errors: string[];
  warnings: string[];
  cardDetails: DeckCardDetail[];
}

export interface DeckCardDetail {
  entry: DeckEntry;
  cardId: string | null;
  found: boolean;
  standardLegal: boolean;
}

/**
 * 验证卡组合规性
 */
export function validateDeck(
  parsed: ParsedDeck,
  cardLookup: (id: string) => { legalities: { standard?: string } } | undefined
): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cardDetails: DeckCardDetail[] = [];

  // Check total card count
  if (parsed.totalCards !== 60) {
    errors.push(
      `卡组应包含 60 张卡牌，当前 ${parsed.totalCards} 张`
    );
  }

  // Check each entry
  for (const entry of parsed.entries) {
    const cardId = buildCardId(entry.setCode, entry.number);
    const card = cardId ? cardLookup(cardId) : undefined;
    const found = !!card;
    const standardLegal = card?.legalities?.standard === "Legal";

    cardDetails.push({
      entry,
      cardId,
      found,
      standardLegal,
    });

    if (!cardId) {
      warnings.push(
        `未知系列代码: ${entry.setCode}（${entry.name}）`
      );
    } else if (!found) {
      warnings.push(
        `卡牌未找到: ${entry.name} (${cardId})`
      );
    } else if (!standardLegal) {
      warnings.push(
        `非 Standard 合法: ${entry.name} (${cardId})`
      );
    }

    // Check quantity limits (max 4 for non-basic-energy)
    if (
      entry.quantity > 4 &&
      !entry.name.toLowerCase().includes("basic") &&
      entry.category !== "energy"
    ) {
      errors.push(
        `${entry.name} 超过 4 张限制（${entry.quantity} 张）`
      );
    }
  }

  // Check parse errors
  errors.push(...parsed.errors);

  const isValid = errors.length === 0;

  return { isValid, totalCards: parsed.totalCards, errors, warnings, cardDetails };
}
