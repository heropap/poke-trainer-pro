/**
 * Ryuu-play Metadata Extractor
 *
 * Extracts text metadata from ryuu-play card instances (PokemonCard, TrainerCard,
 * EnergyCard) WITHOUT calling reduceEffect(). Converts them into our UI Card interface
 * so the text-parser can generate effect definitions from ryuu-play's more standardized text.
 *
 * This creates "Layer 3" of the 5-layer priority chain:
 *   Layer 1: ID-based hand-written effects (highest priority)
 *   Layer 2: Name-based hand-written effects
 *   Layer 3: Text-parser from ryuu metadata (NEW — this file)
 *   Layer 4: Text-parser from UI Card data (_index.json)
 *   Layer 5: No effect (silent skip)
 */

import { Card as RyuuCard } from "@/lib/ptcg-engine/store/card/card";
import { PokemonCard } from "@/lib/ptcg-engine/store/card/pokemon-card";
import { TrainerCard } from "@/lib/ptcg-engine/store/card/trainer-card";
import { EnergyCard } from "@/lib/ptcg-engine/store/card/energy-card";
import {
  CardType,
  SuperType,
  TrainerType,
  Stage,
  EnergyType,
} from "@/lib/ptcg-engine/store/card/card-types";
import { PowerType } from "@/lib/ptcg-engine/store/card/pokemon-types";
import { Card as UICard } from "@/types/card";

// ─── CardType enum → string mapping ───

const CARD_TYPE_TO_STRING: Record<CardType, string> = {
  [CardType.ANY]: "Colorless",
  [CardType.COLORLESS]: "Colorless",
  [CardType.GRASS]: "Grass",
  [CardType.FIGHTING]: "Fighting",
  [CardType.PSYCHIC]: "Psychic",
  [CardType.WATER]: "Water",
  [CardType.LIGHTNING]: "Lightning",
  [CardType.METAL]: "Metal",
  [CardType.DARK]: "Darkness",
  [CardType.FIRE]: "Fire",
  [CardType.DRAGON]: "Dragon",
  [CardType.FAIRY]: "Fairy",
};

const STAGE_TO_SUBTYPE: Record<Stage, string> = {
  [Stage.NONE]: "Basic",
  [Stage.RESTORED]: "Restored",
  [Stage.BASIC]: "Basic",
  [Stage.STAGE_1]: "Stage 1",
  [Stage.STAGE_2]: "Stage 2",
};

const TRAINER_TYPE_TO_SUBTYPE: Record<TrainerType, string> = {
  [TrainerType.ITEM]: "Item",
  [TrainerType.SUPPORTER]: "Supporter",
  [TrainerType.STADIUM]: "Stadium",
  [TrainerType.TOOL]: "Pokémon Tool",
};

const POWER_TYPE_TO_STRING: Record<PowerType, string> = {
  [PowerType.POKEBODY]: "Poké-Body",
  [PowerType.POKEPOWER]: "Poké-Power",
  [PowerType.ABILITY]: "Ability",
  [PowerType.ANCIENT_TRAIT]: "Ancient Trait",
};

// ─── Exported metadata type ───

export interface RyuuCardMeta {
  /** Unique identifier (e.g., "Charizard BS") */
  fullName: string;
  /** Card name */
  name: string;
  /** Set abbreviation */
  set: string;
  /** Supertype string */
  supertype: string;
  /** Subtypes array */
  subtypes: string[];
  /** HP (Pokemon only) */
  hp?: string;
  /** Types (Pokemon only) */
  types?: string[];
  /** Attack metadata */
  attacks?: Array<{
    name: string;
    cost: string[];
    damage: string;
    text: string;
    convertedEnergyCost: number;
  }>;
  /** Ability/Power metadata */
  abilities?: Array<{
    name: string;
    text: string;
    type: string;
  }>;
  /** Rules text (trainers, special energy) */
  rules?: string[];
  /** Has a reduceEffect implementation */
  hasReduceEffect: boolean;
}

// ─── Core extraction functions ───

/**
 * Convert a single ryuu-play Card instance to our RyuuCardMeta.
 * Reads only static properties — never calls reduceEffect().
 */
export function extractCardMeta(card: RyuuCard): RyuuCardMeta {
  const meta: RyuuCardMeta = {
    fullName: card.fullName || card.name,
    name: card.name,
    set: card.set || "",
    supertype: "Unknown",
    subtypes: [],
    hasReduceEffect: typeof card.reduceEffect === "function",
  };

  if (card instanceof PokemonCard) {
    meta.supertype = "Pokémon";
    meta.subtypes = [STAGE_TO_SUBTYPE[card.stage] || "Basic"];
    meta.hp = String(card.hp);
    meta.types = card.cardTypes.map((t) => CARD_TYPE_TO_STRING[t] || "Colorless");

    // Extract attack text
    if (card.attacks && card.attacks.length > 0) {
      meta.attacks = card.attacks.map((atk) => ({
        name: atk.name,
        cost: atk.cost.map((c) => CARD_TYPE_TO_STRING[c] || "Colorless"),
        damage: atk.damage || "0",
        text: atk.text || "",
        convertedEnergyCost: atk.cost.length,
      }));
    }

    // Extract power/ability text
    if (card.powers && card.powers.length > 0) {
      meta.abilities = card.powers.map((p) => ({
        name: p.name,
        text: p.text || "",
        type: POWER_TYPE_TO_STRING[p.powerType] || "Ability",
      }));
    }
  } else if (card instanceof TrainerCard) {
    meta.supertype = "Trainer";
    meta.subtypes = [TRAINER_TYPE_TO_SUBTYPE[card.trainerType] || "Item"];
    if (card.text) {
      meta.rules = [card.text];
    }
  } else if (card instanceof EnergyCard) {
    meta.supertype = "Energy";
    const energyType = (card as EnergyCard & { energyType?: EnergyType }).energyType;
    meta.subtypes = [energyType === EnergyType.SPECIAL ? "Special" : "Basic"];
    const text = (card as EnergyCard & { text?: string }).text;
    if (text) {
      meta.rules = [text];
    }
  }

  return meta;
}

/**
 * Convert RyuuCardMeta to a UI Card interface compatible with text-parser.
 * This allows the text-parser to parse ryuu-play card text using the same
 * regex patterns it uses for UI cards from _index.json.
 */
export function metaToUICard(meta: RyuuCardMeta): UICard {
  return {
    id: `ryuu:${meta.fullName}`,
    name: meta.name,
    supertype: meta.supertype,
    subtypes: meta.subtypes,
    hp: meta.hp,
    types: meta.types,
    attacks: meta.attacks?.map((a) => ({
      cost: a.cost,
      name: a.name,
      damage: a.damage,
      text: a.text,
      convertedEnergyCost: a.convertedEnergyCost,
    })),
    abilities: meta.abilities?.map((a) => ({
      name: a.name,
      text: a.text,
      type: a.type,
    })),
    rules: meta.rules,
    number: "0",
    legalities: {},
    images: { small: "", large: "" },
  };
}

// ─── Batch extraction ───

/**
 * Extract all metadata from ryuu-play card set arrays.
 * Imports all registered sets and extracts metadata from each card.
 *
 * @returns Array of RyuuCardMeta for all ryuu-play cards
 */
export function extractAllRyuuMetadata(): RyuuCardMeta[] {
  // Dynamic import of all sets to avoid circular dependencies
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { baseSets, exSets, standardSets } = require("@/lib/ptcg-sets");

  const allCards: RyuuCard[] = [];

  // Collect all cards from all sets
  const collectCards = (setModule: Record<string, unknown>) => {
    for (const key of Object.keys(setModule)) {
      const val = setModule[key];
      if (Array.isArray(val)) {
        allCards.push(...(val as RyuuCard[]));
      } else if (val && typeof val === "object") {
        // Nested module (e.g., baseSets.setBase)
        collectCards(val as Record<string, unknown>);
      }
    }
  };

  collectCards(baseSets);
  collectCards(exSets);
  collectCards(standardSets);

  return allCards.map(extractCardMeta);
}

/**
 * Extract metadata and convert to UI Card format for text-parser consumption.
 * Deduplicates by card name to avoid redundant parsing.
 *
 * @returns Array of UI Cards converted from ryuu-play metadata
 */
export function extractRyuuAsUICards(): UICard[] {
  const metas = extractAllRyuuMetadata();
  const seen = new Set<string>();
  const cards: UICard[] = [];

  for (const meta of metas) {
    // Skip basic energies — they have no text effects
    if (meta.supertype === "Energy" && !meta.rules?.length) continue;

    // Deduplicate by name
    if (seen.has(meta.name)) continue;
    seen.add(meta.name);

    cards.push(metaToUICard(meta));
  }

  return cards;
}

/**
 * Auto-register effects from ryuu-play card metadata using text-parser.
 * This is the main entry point for Layer 3 of the priority chain.
 *
 * @returns Registration statistics
 */
export function autoRegisterFromRyuuMeta(): {
  registered: number;
  skipped: number;
  total: number;
} {
  const { autoRegisterTextEffects } = require("./text-parser") as {
    autoRegisterTextEffects: (cards: UICard[], source?: string) => { registered: number; skipped: number };
  };

  const ryuuCards = extractRyuuAsUICards();
  const result = autoRegisterTextEffects(ryuuCards, "L3");

  if (result.registered > 0) {
    console.log(
      `[RyuuMeta] Extracted ${ryuuCards.length} unique cards from ryuu-play, ` +
      `registered ${result.registered} new effects`
    );
  }

  return {
    registered: result.registered,
    skipped: result.skipped,
    total: ryuuCards.length,
  };
}
