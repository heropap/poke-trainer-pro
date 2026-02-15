export interface CardAbility {
  name: string;
  text: string;
  type: string;
}

export interface CardAttack {
  cost: string[];
  name: string;
  damage: string;
  text: string;
  convertedEnergyCost: number;
}

export interface CardWeakness {
  type: string;
  value: string;
}

export interface CardResistance {
  type: string;
  value: string;
}

export interface CardImages {
  small: string;
  large: string;
}

export interface CardLegalities {
  unlimited?: string;
  standard?: string;
  expanded?: string;
}

export interface Card {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  evolvesTo?: string[];
  abilities?: CardAbility[];
  attacks?: CardAttack[];
  weaknesses?: CardWeakness[];
  resistances?: CardResistance[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  number: string;
  artist?: string;
  rarity?: string;
  nationalPokedexNumbers?: number[];
  legalities: CardLegalities;
  regulationMark?: string;
  images: CardImages;
  flavorText?: string;
  rules?: string[];
  set?: string; // set id, added during indexing
}

export interface CardSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  legalities: CardLegalities;
  releaseDate: string;
  images: {
    symbol: string;
    logo: string;
  };
}

export type EnergyType =
  | "Grass"
  | "Fire"
  | "Water"
  | "Lightning"
  | "Psychic"
  | "Fighting"
  | "Darkness"
  | "Metal"
  | "Dragon"
  | "Fairy"
  | "Colorless";

export type Supertype = "Pokémon" | "Trainer" | "Energy";

export type PokemonSubtype =
  | "Basic"
  | "Stage 1"
  | "Stage 2"
  | "V"
  | "VMAX"
  | "VSTAR"
  | "ex"
  | "GX"
  | "EX"
  | "BREAK"
  | "Mega"
  | "Restored"
  | "Tera";

export type TrainerSubtype =
  | "Item"
  | "Supporter"
  | "Stadium"
  | "Pokémon Tool"
  | "Technical Machine"
  | "Rocket's Secret Machine";

export type EnergySubtype = "Basic" | "Special";
