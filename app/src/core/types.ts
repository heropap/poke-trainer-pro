// Core card-related types for v0. Game-state types live in this file too but
// are first introduced in F3; for F1 we only need the card schema.

export type EnergyType =
  | "Fire"
  | "Water"
  | "Grass"
  | "Lightning"
  | "Psychic"
  | "Fighting"
  | "Darkness"
  | "Metal"
  | "Colorless";

export type CardKind = "Pokemon" | "Trainer" | "Energy";

export type PokemonStage = "Basic" | "Stage1" | "Stage2";

export type PokemonRarity = "normal" | "ex" | "V" | "VMAX" | "VSTAR";

export type TrainerKind = "Item" | "Supporter" | "Stadium" | "Tool";

export type EnergyKind = "Basic" | "Special";

export type RegulationMark = "F" | "G" | "H" | "I";

export interface CardImages {
  small: string;
  large?: string;
}

export interface PokemonAttack {
  name: string;
  cost: EnergyType[];
  damage: number;
  text?: string;
}

export interface PokemonAbility {
  name: string;
  text: string;
  kind?: "Ability" | "Poké-Power" | "Poké-Body";
}

export interface WeaknessResistance {
  type: EnergyType;
  modifier?: "×2" | "-30";
}

interface CardDefBase {
  id: string;
  setCode: string;
  setNumber: number;
  name: string;
  nameZh?: string;
  images: CardImages;
  regulationMark?: RegulationMark;
}

export interface PokemonCardDef extends CardDefBase {
  kind: "Pokemon";
  stage: PokemonStage;
  evolvesFrom?: string;
  rarity: PokemonRarity;
  hp: number;
  types: EnergyType[];
  attacks: PokemonAttack[];
  abilities?: PokemonAbility[];
  weakness?: WeaknessResistance;
  resistance?: WeaknessResistance;
  retreatCost: number;
  rule?: string;
}

export interface TrainerCardDef extends CardDefBase {
  kind: "Trainer";
  trainerKind: TrainerKind;
  text: string;
  aceSpec?: boolean;
}

export interface EnergyCardDef extends CardDefBase {
  kind: "Energy";
  energyKind: EnergyKind;
  energyType: EnergyType;
  text?: string;
}

export type CardDef = PokemonCardDef | TrainerCardDef | EnergyCardDef;

export interface DeckEntry {
  cardId: string;
  count: number;
}

export interface DeckDef {
  slug: string;
  name: string;
  nameZh: string;
  description: string;
  archetype: string;
  cards: DeckEntry[];
}
