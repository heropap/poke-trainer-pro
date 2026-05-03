# Business Rule Engine Specification (Architecture)
Version: 1.1 (Updated for PTCG Standard Ruleset)

## 1. Overview
The Rule Engine (Card Logic Processor) interprets and executes the game mechanics defined by the card data. It utilizes an extended **Trigger-Condition-Action (TCA)** architecture, supplemented by a **Continuous Effect (Modifier)** system to handle static abilities.

## 2. Rule Architecture
Game rules are deconstructed into instantaneous "Triggered Effects" and permanent "Continuous Effects".

### 2.1 Triggers (Event)
Event hooks that initiate action execution.
*   `on_play`: When played from hand (e.g., Supporter cards, Pokémon with "When played" abilities).
*   `on_attack_declare`: When an attack is declared.
*   `on_damage_calc`: Damage calculation phase (for inserting damage modification logic).
*   `between_turns`: Pokémon Checkup phase.
*   `on_knockout`: When a Pokémon is Knocked Out.

### 2.2 Conditions (Predicate)
Validation assertions that must pass before Action execution.
*   `coin_flip`: Coin flip result (Heads/Tails).
*   `zone_check`: Check card location (e.g., must be in Active Spot).
*   `cost_check`: Check if Energy/Discard costs are met.
*   `limit_check`: Per turn/Per game limits (e.g., VSTAR Power).

### 2.3 Selectors (Targeting System) 🌟
PTCG-specific dynamic target selection.
*   **owner**: `self` (Player), `opponent` (Opponent), `both`.
*   **zone**: `active`, `bench`, `discard`, `deck`, `hand`.
*   **filters**: Attribute filters (e.g., "Basic Pokémon only", "Water Energy only").

### 2.4 Actions (Effect)
Atomic operations that mutate game state.
*   `deal_damage`: Deal damage (triggers full damage pipeline).
*   `place_damage_counters`: Place counters (direct, ignores Weakness/Resistance).
*   `search_deck`: Search deck and move cards.
*   `apply_status`: Apply Special Conditions (Poison/Burn/Sleep/Paralysis/Confusion).
*   `switch_pokemon`: Switch Active with Bench.

### 2.5 Modifiers (Continuous Effects) 🌟
Aura effects that apply globally or locally without triggers.
*   `prevent_item_usage`: Block Item cards.
*   `modify_retreat_cost`: Increase/Decrease retreat cost.
*   `modify_damage_taken`: Reduce/Increase received damage.

## 3. Configuration Format (TypeScript Schema) 🌟
To ensure rigorous logic definition for AI generation or manual entry, the following core interfaces are defined.

```typescript
// --- 1. Root Card Logic Definition ---
export interface CardRuleDef {
  identifier: string;          // e.g., "sv2P-027-chien-pao-ex-ability"
  version: number;
  type: "attack" | "ability" | "trainer_effect";
  triggers?: TriggerType[];    // Empty for continuous abilities
  conditions?: Condition[];
  costs?: Cost[];
  steps: ActionStep[];         // Executed sequentially (FIFO)
  modifiers?: Modifier[];      // For continuous aura effects
}

// --- 2. Step & Branching Logic ---
export interface ActionStep {
  actionType: ActionType;
  target?: TargetSelector;     // Who/What is affected?
  params?: Record<string, any>;
  branching?: {                // e.g., Coin flip branching
    condition: Condition;
    trueSteps: ActionStep[];
    falseSteps?: ActionStep[];
  };
}

// --- 3. Dynamic Targeting ---
export interface TargetSelector {
  targetType: "pokemon" | "card" | "player";
  owner: "self" | "opponent" | "any";
  zone: "active" | "bench" | "deck" | "discard" | "hand";
  count: number | "all";
  filters?: {
    pokemonType?: string[];    // e.g., ["Water"]
    stage?: string[];          // e.g., ["Basic"]
    cardType?: string[];       // e.g., ["Energy", "Basic"]
  };
}
```

### JSON Example: Chien-Pao ex "Shivery Chill"
```json
{
  "identifier": "sv2P-027-chien-pao-ex-ability",
  "type": "ability",
  "triggers": ["on_activate"],
  "conditions": [
    { "type": "zone_check", "value": "active" },
    { "type": "usage_limit", "scope": "turn", "count": 1 }
  ],
  "steps": [
    {
      "actionType": "search_deck",
      "target": {
        "targetType": "card",
        "owner": "self",
        "zone": "deck",
        "count": 2,
        "filters": { "cardType": ["Energy"], "pokemonType": ["Water"] }
      },
      "params": { "destination": "hand", "reveal": true }
    },
    { "actionType": "shuffle_deck", "target": { "owner": "self" } }
  ]
}
```

## 4. Priority Strategy & Resolution (Resolution Queue)
When multiple rules or effects trigger, the following principles apply:

1.  **Resolution Queue (FIFO)**: PTCG does not have a "Stack". Once an attack or ability is declared, its `steps` must be fully resolved in order. Effects triggered during this process (e.g., "When damaged") are added to a pending queue and resolved *after* the current sequence completes.
2.  **Turn Player Priority**: If effects trigger simultaneously for both players, the turn player resolves theirs first.
3.  **Mandatory vs Optional**: Mandatory effects take precedence over optional ones.

## 5. Conflict Resolution
*   **"Can't" beats "Can"**: Negative constraints (e.g., "Cannot draw cards") always override positive permissions.
*   **Zone Tracking**: When a card moves from a public zone (Active/Bench) to a hidden zone (Hand/Deck), all effects, markers, and damage on it are cleared. It becomes a new instance.

## 6. Deployment & Testing
### 6.1 Validation Pipeline
*   **Schema Validation**: All JSON rules must pass strict TypeScript/Zod validation.
*   **Damage Pipeline Tests**: Regression tests for the damage calculation order: Base -> Attacker Effects -> Weakness -> Resistance -> Defender Effects.
*   **Checkup Phase Tests**: Strict assertion of order: Poison/Burn -> Sleep/Paralysis Flip -> Knockout.

## 7. Deployment Guide
### 7.1 Pre-Deployment Checklist
1.  **Schema Validation**: `npm run validate-rules`
2.  **Unit Testing**: `npm test src/__tests__/rule-engine/`

### 7.2 Integration Steps
1.  **Generate Rules**: Use LLM to map card text to the JSON schema.
2.  **Review**: Manual review of complex rules in `src/data/rules/`.
3.  **Build**: `npm run build`

### 7.3 Rollback Strategy
*   Revert the specific JSON rule file in Git to handle bugs without engine rollback.
