/**
 * LLM Prompt Builder — Generates prompts for card rule generation
 *
 * Builds structured prompts that guide the LLM to produce valid CardRuleDef JSON.
 * Uses TypeScript interface definitions as reference (not JSON Schema) per user's
 * engineering requirement.
 *
 * Strategy:
 * 1. System prompt: CTA schema TypeScript interfaces + action catalog
 * 2. Few-shot examples: 3 representative cards
 * 3. Card data: the specific card to generate rules for
 */

import { CardRuleDef } from "../rules/card-rule-def";

// ═══════════════════════════════════════════════════════
// Card Data Input
// ═══════════════════════════════════════════════════════

export interface CardInput {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  attacks?: Array<{
    name: string;
    cost: string[];
    damage: string;
    text?: string;
  }>;
  abilities?: Array<{
    name: string;
    text: string;
    type: string;
  }>;
  retreatCost?: string[];
  rules?: string[];
}

// ═══════════════════════════════════════════════════════
// Prompt Building
// ═══════════════════════════════════════════════════════

/**
 * Build the system prompt with CTA schema reference and action catalog.
 */
export function buildSystemPrompt(): string {
  return `You are a PTCG (Pokemon Trading Card Game) rule engine expert.
Your job is to convert card data into structured CardRuleDef JSON that can be executed by our CTA (Condition-Target-Action) rule engine.

## Output Format
Return ONLY a valid JSON object matching the CardRuleDef interface. No markdown, no explanation.

## CardRuleDef Interface
\`\`\`typescript
interface CardRuleDef {
  cardId: string;           // Card ID from database (e.g., "sv1-25")
  cardName: string;         // Card name
  version: 1;               // Always 1
  attacks?: AttackRuleDef[];
  abilities?: AbilityRuleDef[];
  trainer?: TrainerRuleDef;
  markers?: MarkerDeclaration[];
  meta?: { originalText?: string; confidence?: number };
}

interface AttackRuleDef {
  name: string;              // MUST match card attack name exactly
  baseDamage?: number;       // Base damage number
  conditions?: Condition[];  // Pre-conditions beyond energy cost
  steps: ActionStep[];       // Actions executed in order
}

interface AbilityRuleDef {
  name: string;              // MUST match card ability name exactly
  type: "activated" | "passive" | "triggered";
  canActivate?: Condition[];  // For activated
  oncePerTurn?: boolean;      // Default true for activated
  modifiers?: ModifierDef[];  // For passive
  trigger?: TriggerEvent;     // For triggered
  condition?: Condition;      // When active
  steps?: ActionStep[];       // For activated/triggered
}

interface TrainerRuleDef {
  subtype: "Supporter" | "Item" | "Stadium" | "Tool";
  canPlay?: Condition[];
  steps?: ActionStep[];
  stadiumEffect?: { trigger: TriggerEvent; condition?: Condition; steps: ActionStep[] };
  toolModifiers?: ModifierDef[];
}
\`\`\`

## Action Catalog (53 atomic actions)
### Damage
- \`{ action: "deal_damage", value: number|DynamicValue, target?: TargetSelector }\`
- \`{ action: "put_damage_counters", value: number|DynamicValue, target: TargetSelector }\`
- \`{ action: "self_damage", value: number }\`
- \`{ action: "bench_damage", value: number, side: "player"|"opponent"|"both", count?: number }\`
- \`{ action: "ignore_wr", weakness?: boolean, resistance?: boolean }\`

### Coin
- \`{ action: "flip_coin", on_heads: ActionStep[], on_tails?: ActionStep[] }\`
- \`{ action: "flip_coins", count: number, per_heads: ActionStep[] }\`

### Status
- \`{ action: "apply_status", status: "poisoned"|"burned"|"asleep"|"confused"|"paralyzed", target?: TargetSelector }\`
- \`{ action: "remove_status", status?: StatusCondition, target?: TargetSelector }\`

### Card Movement
- \`{ action: "draw_cards", count: number|DynamicValue, who?: "player"|"opponent" }\`
- \`{ action: "discard_from_hand", count: number, who?: "player"|"opponent", choice?: "player"|"random" }\`
- \`{ action: "discard_hand", who?: "player"|"opponent" }\`
- \`{ action: "search_deck", filter: CardFilter, count: number, destination: "hand"|"bench"|"attach_to_self"|"attach_to_target"|"top_of_deck", who?: "player"|"opponent" }\`
- \`{ action: "recover_from_discard", filter: CardFilter, count: number, destination: "hand"|"deck"|"attach_to_self"|"bench", who?: "player"|"opponent" }\`
- \`{ action: "shuffle_hand_into_deck", who?: "player"|"opponent" }\`
- \`{ action: "shuffle_deck", who?: "player"|"opponent" }\`
- \`{ action: "reveal_top_cards", count: number, who?: "player"|"opponent", then: ActionStep[] }\`
- \`{ action: "discard_from_deck_top", count: number, who?: "player"|"opponent" }\`

### Energy
- \`{ action: "discard_energy", count: number|"all", target?: TargetSelector, energy_type?: EnergyType }\`
- \`{ action: "attach_energy", source: "deck"|"discard"|"hand", filter?: CardFilter, count: number, target: TargetSelector }\`
- \`{ action: "move_energy", from: TargetSelector, to: TargetSelector, energy_type?: EnergyType, count?: number }\`

### Field
- \`{ action: "switch_pokemon", who: "player"|"opponent"|"both", choice?: "player"|"opponent"|"random" }\`
- \`{ action: "heal", value: number|DynamicValue, target: TargetSelector }\`
- \`{ action: "discard_stadium" }\`
- \`{ action: "discard_tool", target?: TargetSelector }\`

### Markers
- \`{ action: "set_marker", target: TargetSelector, marker: string, lifecycle: MarkerLifecycle, value?: number }\`
- \`{ action: "cant_attack_next_turn" }\`
- \`{ action: "cant_retreat", target?: TargetSelector }\`
- \`{ action: "reduce_damage_next_turn", amount: number }\`
- \`{ action: "prevent_damage_next_turn" }\`
- \`{ action: "disable_attack", target?: TargetSelector, choice: "player"|"random" }\`

### Flow Control
- \`{ action: "if", condition: Condition, then: ActionStep[], else?: ActionStep[] }\`
- \`{ action: "for_each", targets: TargetSelector, body: ActionStep[] }\`
- \`{ action: "choose", from: TargetSelector, min: number, max: number, then: ActionStep[] }\`
- \`{ action: "choose_one", options: [{ label: string, steps: ActionStep[] }] }\`

## TargetSelector zones
self_active, opp_active, own_bench, opp_bench, all_own, all_opp, all_own_bench, all_opp_bench, all_in_play, own_deck, opp_deck, own_hand, opp_hand, own_discard, opp_discard

## DynamicValue
Static: just a number (e.g., 30)
Dynamic: \`{ per: CountableRef, multiply: number }\` where CountableRef is:
energy_on_self, energy_on_defender, damage_counters_on_self, damage_counters_on_defender, own_bench_count, opp_bench_count, own_hand_size, opp_hand_size, own_prizes_remaining, opp_prizes_remaining, own_prizes_taken, opp_prizes_taken, coin_heads

## CardFilter
\`{ supertype?: "Pokémon"|"Trainer"|"Energy", subtypes?: string[], types?: EnergyType[], name?: string, isBasicEnergy?: boolean, evolvesFrom?: string }\`

## Condition checks
coin_flip, coin_flip_multi, has_energy, has_damage, has_status, has_pokemon_on_bench, has_cards_in_deck, has_cards_in_hand, is_in_active_spot, has_tag, is_type, marker_exists, hp_remaining_lte, not, and, or

## ModifierType (for passive abilities)
\`{ modify: "incoming_damage", amount: number }\` (negative = reduce)
\`{ modify: "outgoing_damage", amount: number }\`
\`{ modify: "retreat_cost", amount: number }\`
\`{ modify: "prevent_bench_damage" }\`
\`{ modify: "prevent_status", statuses: StatusCondition[]|"all" }\`
\`{ modify: "provide_energy_type", provides: EnergyType, count: number }\`

## TriggerEvent
on_play_from_hand, on_knocked_out, on_evolve, between_turns, on_turn_start, on_turn_end, before_attack, after_attack, on_retreat, on_switch_in, on_switch_out

## MarkerLifecycle
until_end_of_turn, until_end_of_opponent_next_turn, until_end_of_own_next_turn, permanent, on_leaving_active, on_evolve

## Key Rules
1. Attack names MUST match card data exactly
2. Ability names MUST match card data exactly
3. Use deal_damage for the base attack damage
4. For "X+" damage (coin flip bonus), use deal_damage with base + flip_coin
5. For "X×" damage (multiply), use deal_damage with DynamicValue
6. "This Pokémon also does X damage to itself" → self_damage
7. "Discard N Energy" → discard_energy
8. "Flip a coin. If heads..." → flip_coin with on_heads
9. Passive abilities ("As long as...") → type: "passive" with modifiers
10. Activated abilities ("Once during your turn...") → type: "activated" with steps
11. Trainer Supporters → discard hand/search/draw steps
12. Trainer Items → specific action steps
`;
}

/**
 * Build few-shot examples for the prompt.
 */
export function buildFewShotExamples(): string {
  return `## Examples

### Example 1: Ponyta (coin flip bonus)
Card: Stomp — 20+ damage, "Flip a coin. If heads, this attack does 30 more damage."
\`\`\`json
{
  "cardId": "me1-26",
  "cardName": "Ponyta",
  "version": 1,
  "attacks": [
    {
      "name": "Stomp",
      "baseDamage": 20,
      "steps": [
        { "action": "deal_damage", "value": 20 },
        { "action": "flip_coin", "on_heads": [{ "action": "deal_damage", "value": 50 }] }
      ]
    }
  ]
}
\`\`\`

### Example 2: Pyroar (passive ability)
Ability: "As long as this Pokémon is in the Active Spot, attacks do 30 less damage."
\`\`\`json
{
  "cardId": "me1-24",
  "cardName": "Pyroar",
  "version": 1,
  "abilities": [{
    "name": "Intimidating Fang",
    "type": "passive",
    "condition": { "check": "is_in_active_spot" },
    "modifiers": [{ "type": { "modify": "incoming_damage", "amount": -30 }, "condition": { "check": "is_in_active_spot" } }]
  }],
  "attacks": [{ "name": "Scorching Breath", "baseDamage": 120, "steps": [{ "action": "deal_damage", "value": 120 }] }]
}
\`\`\`

### Example 3: Professor's Research (Supporter)
Rules: "Discard your hand and draw 7 cards."
\`\`\`json
{
  "cardId": "sv1-189",
  "cardName": "Professor's Research (Professor Sada)",
  "version": 1,
  "trainer": {
    "subtype": "Supporter",
    "steps": [{ "action": "discard_hand" }, { "action": "draw_cards", "count": 7 }]
  }
}
\`\`\`
`;
}

/**
 * Build the user prompt for a specific card.
 */
export function buildCardPrompt(card: CardInput): string {
  let prompt = `Convert this PTCG card into a CardRuleDef JSON:\n\n`;
  prompt += `Card ID: ${card.id}\n`;
  prompt += `Name: ${card.name}\n`;
  prompt += `Supertype: ${card.supertype}\n`;
  if (card.subtypes) prompt += `Subtypes: ${card.subtypes.join(", ")}\n`;
  if (card.hp) prompt += `HP: ${card.hp}\n`;
  if (card.types) prompt += `Types: ${card.types.join(", ")}\n`;
  if (card.retreatCost) prompt += `Retreat Cost: ${card.retreatCost.length} (${card.retreatCost.join(", ")})\n`;

  if (card.attacks && card.attacks.length > 0) {
    prompt += `\nAttacks:\n`;
    for (const atk of card.attacks) {
      prompt += `  - ${atk.name} [Cost: ${atk.cost.join(",")}] Damage: ${atk.damage || "0"}`;
      if (atk.text) prompt += `\n    Text: "${atk.text}"`;
      prompt += `\n`;
    }
  }

  if (card.abilities && card.abilities.length > 0) {
    prompt += `\nAbilities:\n`;
    for (const ab of card.abilities) {
      prompt += `  - ${ab.name} (${ab.type}): "${ab.text}"\n`;
    }
  }

  if (card.rules && card.rules.length > 0) {
    prompt += `\nRules:\n`;
    for (const rule of card.rules) {
      prompt += `  - "${rule}"\n`;
    }
  }

  prompt += `\nRespond with ONLY the CardRuleDef JSON. No markdown code blocks, no explanation.`;
  return prompt;
}

/**
 * Build the complete prompt messages for an LLM API call.
 */
export function buildPromptMessages(card: CardInput): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: buildSystemPrompt() + "\n\n" + buildFewShotExamples() },
    { role: "user", content: buildCardPrompt(card) },
  ];
}

/**
 * Build a batch prompt for multiple cards (more efficient for batch processing).
 */
export function buildBatchPrompt(cards: CardInput[]): Array<{ role: string; content: string }> {
  let userContent = `Convert these ${cards.length} PTCG cards into CardRuleDef JSON objects.\n`;
  userContent += `Return a JSON array of CardRuleDef objects. No markdown, no explanation.\n\n`;

  for (let i = 0; i < cards.length; i++) {
    userContent += `--- Card ${i + 1} ---\n`;
    userContent += buildCardPrompt(cards[i]);
    userContent += `\n\n`;
  }

  return [
    { role: "system", content: buildSystemPrompt() + "\n\n" + buildFewShotExamples() },
    { role: "user", content: userContent },
  ];
}
