/**
 * Proxy Card Generation (Layer 1 / P0)
 *
 * Generates minimal Card objects for cards not found in the database.
 * This ensures that a 60-card deck always has 60 cards, even when
 * some cards are missing from the data files.
 *
 * Proxy cards use heuristics (name patterns) to infer:
 * - supertype (Pokémon / Trainer / Energy)
 * - subtypes (Basic, ex, V, Stage 1, Item, Supporter, etc.)
 * - HP defaults (70 for Basic, 230 for ex, 220 for V)
 * - A placeholder attack for Pokémon
 */

import { Card } from "@/types/card";

export interface ProxyCardEntry {
  name: string;
  setCode: string;
  number: string;
  category: "pokemon" | "trainer" | "energy" | "unknown";
}

/**
 * Create a minimal proxy Card for a missing database entry.
 * The card is fully functional in the engine (can be attached energy,
 * can attack, can be KO'd) but displays with a "Proxy" indicator.
 */
export function createProxyCard(entry: ProxyCardEntry): Card {
  const { name, setCode, number, category } = entry;
  const id = `proxy-${setCode}-${number}`;

  const supertype = inferSupertype(category);
  const subtypes = inferSubtypes(name, category);
  const hp = inferHp(name, category, subtypes);

  const card: Card = {
    id,
    name,
    supertype,
    subtypes,
    number,
    legalities: {},
    images: { small: "", large: "" },
    rarity: "Proxy",
  };

  // Pokémon-specific fields
  if (supertype === "Pokémon") {
    card.hp = String(hp);
    card.types = ["Colorless"];
    card.retreatCost = ["Colorless"];
    card.convertedRetreatCost = 1;
    card.attacks = [
      {
        name: "Tackle",
        cost: ["Colorless", "Colorless"],
        damage: "30",
        text: "",
        convertedEnergyCost: 2,
      },
    ];
  }

  // Energy-specific fields
  if (supertype === "Energy") {
    const energyType = inferEnergyType(name);
    if (energyType) {
      card.subtypes = ["Basic"];
      card.types = [energyType];
    } else {
      card.subtypes = ["Special"];
    }
  }

  return card;
}

/**
 * Check if a Card is a proxy card.
 */
export function isProxyCard(card: Card): boolean {
  return card.rarity === "Proxy" || card.id.startsWith("proxy-");
}

// ─── Heuristic helpers ───

function inferSupertype(category: string): string {
  switch (category) {
    case "pokemon":
      return "Pokémon";
    case "trainer":
      return "Trainer";
    case "energy":
      return "Energy";
    default:
      return "Trainer"; // Default unknown to Trainer (safest)
  }
}

function inferSubtypes(name: string, category: string): string[] {
  if (category === "pokemon") {
    const lower = name.toLowerCase();
    // Check for special Pokemon types
    if (lower.includes(" ex")) return ["Stage 2", "ex"];
    if (lower.includes(" vmax")) return ["VMAX"];
    if (lower.includes(" vstar")) return ["VSTAR"];
    if (lower.includes(" v")) return ["Basic", "V"];
    if (lower.includes(" gx")) return ["Basic", "GX"];
    return ["Basic"];
  }

  if (category === "trainer") {
    const lower = name.toLowerCase();
    // Common trainer keywords
    if (
      lower.includes("professor") ||
      lower.includes("boss") ||
      lower.includes("iono") ||
      lower.includes("judge") ||
      lower.includes("penny") ||
      lower.includes("arven")
    ) {
      return ["Supporter"];
    }
    if (lower.includes("stadium") || lower.includes("court") || lower.includes("artazon")) {
      return ["Stadium"];
    }
    if (
      lower.includes("belt") ||
      lower.includes("band") ||
      lower.includes("charm") ||
      lower.includes("balloon") ||
      lower.includes("seal stone") ||
      lower.includes("cape") ||
      lower.includes("tool")
    ) {
      return ["Pokémon Tool"];
    }
    return ["Item"]; // Default trainer to Item
  }

  if (category === "energy") {
    return ["Basic"];
  }

  return [];
}

function inferHp(name: string, category: string, subtypes: string[]): number {
  if (category !== "pokemon") return 0;

  // ex/V/VMAX/VSTAR have higher HP
  if (subtypes.includes("VMAX")) return 330;
  if (subtypes.includes("VSTAR")) return 280;
  if (subtypes.includes("ex")) return 230;
  if (subtypes.includes("V")) return 220;
  if (subtypes.includes("GX")) return 210;
  if (subtypes.includes("Stage 2")) return 160;
  if (subtypes.includes("Stage 1")) return 100;
  return 70; // Basic default
}

function inferEnergyType(name: string): string | null {
  const types = [
    "Grass", "Fire", "Water", "Lightning", "Psychic",
    "Fighting", "Darkness", "Metal", "Dragon", "Fairy",
  ];
  for (const t of types) {
    if (name.includes(t)) return t;
  }
  return null;
}
