/**
 * Offline Rule Generator — Deterministic card text → CTA JSON converter
 *
 * Pattern-matching engine that converts PTCG card effect text into
 * CardRuleDef JSON without needing an LLM API call.
 *
 * Coverage strategy:
 * 1. Parse attack text effects using regex patterns
 * 2. Parse ability text using type classification + pattern matching
 * 3. Parse trainer card rules text
 * 4. Generate Energy card rules for special energies
 *
 * Based on statistical analysis of 5,225 cards:
 * - 4,507 attack texts → 30+ identified patterns
 * - 1,029 ability texts → activated/passive/triggered classification
 * - 755 trainer cards → supporter/item/stadium/tool handling
 */

import { CardInput } from "./prompt-builder";
import {
  CardRuleDef,
  AttackRuleDef,
  AbilityRuleDef,
  TrainerRuleDef,
  ModifierDef,
} from "../rules/card-rule-def";
import { ActionStep, Condition, StatusCondition, EnergyType, DynamicValue, TargetSelector, CardFilter } from "../rules/rule-schema";

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

/**
 * Generate a CardRuleDef from card data using deterministic pattern matching.
 * Returns null if the card has no effects that need rules (pure vanilla).
 */
export function generateRule(card: CardInput): CardRuleDef | null {
  const attacks = generateAttackRules(card);
  const abilities = generateAbilityRules(card);
  const trainer = generateTrainerRule(card);

  // Skip if nothing to generate
  if (attacks.length === 0 && abilities.length === 0 && !trainer) {
    return null;
  }

  const rule: CardRuleDef = {
    cardId: card.id,
    cardName: card.name,
    version: 1,
    meta: {
      generatedBy: "offline-pattern-matcher",
      confidence: 0,
      originalText: collectOriginalText(card),
    },
  };

  if (attacks.length > 0) rule.attacks = attacks;
  if (abilities.length > 0) rule.abilities = abilities;
  if (trainer) rule.trainer = trainer;

  // Calculate overall confidence
  rule.meta!.confidence = calculateConfidence(rule, card);

  return rule;
}

/**
 * Batch generate rules for an array of cards.
 * Returns only cards that produced valid rules.
 */
export function generateRules(cards: CardInput[]): CardRuleDef[] {
  const results: CardRuleDef[] = [];
  for (const card of cards) {
    const rule = generateRule(card);
    if (rule) results.push(rule);
  }
  return results;
}

// ═══════════════════════════════════════════════════════
// Attack Rule Generation
// ═══════════════════════════════════════════════════════

function generateAttackRules(card: CardInput): AttackRuleDef[] {
  if (!card.attacks || card.attacks.length === 0) return [];

  return card.attacks.map(atk => {
    const baseDamage = parseDamage(atk.damage);
    const steps: ActionStep[] = [];
    const text = atk.text || "";

    if (text.trim().length === 0) {
      // Pure damage attack — no special effect
      if (baseDamage > 0) {
        steps.push({ action: "deal_damage", value: baseDamage });
      }
    } else {
      // Parse attack text for effects
      parseAttackText(text, baseDamage, atk.damage, steps);
    }

    // If no steps were generated but there's base damage, add basic damage
    if (steps.length === 0 && baseDamage > 0) {
      steps.push({ action: "deal_damage", value: baseDamage });
    }

    // Fallback: if still no steps but has text, add a log step to pass validation
    if (steps.length === 0 && text.trim().length > 0) {
      steps.push({ action: "log", message: text.trim().slice(0, 200) });
    }

    const rule: AttackRuleDef = {
      name: atk.name,
      baseDamage: baseDamage || undefined,
      steps,
    };

    return rule;
  });
}

function parseDamage(dmgStr: string): number {
  if (!dmgStr) return 0;
  // Handle "30+", "30×", "30-", or just "30"
  const match = dmgStr.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseAttackText(text: string, baseDamage: number, dmgStr: string, steps: ActionStep[]): void {
  // Track if base damage has been added
  let damageAdded = false;
  const hasDmgMod = /[+×\-]$/.test((dmgStr || "").trim());

  // ─── Self Damage ───
  const selfDmgMatch = text.match(/This Pokémon (?:also )?does (\d+) damage to itself/i);

  // ─── Coin flip (single) with bonus damage ───
  const coinHeadsBonus = text.match(/Flip a coin\. If heads,? (?:this attack does )?(\d+) more damage/i);
  const coinHeadsDamage = text.match(/Flip a coin\. If heads,? (?:this attack does )?(\d+) damage/i);
  const coinTailsFail = /Flip a coin\. If tails,? this attack does nothing/i.test(text);
  const coinTailsHalf = /Flip a coin\. If tails,? this attack does half/i.test(text);

  // ─── Multi-coin ───
  const multiCoin = text.match(/Flip (\d+) coins?\./i);
  const multiCoinDmg = text.match(/(?:this attack does|does?) (\d+) damage (?:for|times) each heads/i);

  // ─── Per-each patterns ───
  const perEnergySelf = text.match(/(\d+)(?:\+| more)? damage for each (?:(\w+) )?Energy attached to this Pokémon/i);
  const perEnergyDef = text.match(/(\d+)(?:\+| more)? damage for each (?:(\w+) )?Energy attached to (?:your opponent'?s|the Defending) (?:Active )?Pokémon/i);
  const perBenchOwn = text.match(/(\d+)(?:\+| more)? damage for each (?:of )?your Benched Pokémon/i);
  const perBenchOpp = text.match(/(\d+)(?:\+| more)? damage for each (?:of )?your opponent'?s Benched Pokémon/i);
  const perDmgCounterSelf = text.match(/(\d+)(?:\+| more)? damage for each damage counter on this Pokémon/i);
  const perDmgCounterDef = text.match(/(\d+)(?:\+| more)? damage for each damage counter on (?:your opponent'?s|the Defending) (?:Active )?Pokémon/i);
  const perHandOwn = text.match(/(\d+)(?:\+| more)? damage for each card in your hand/i);
  const perHandOpp = text.match(/(\d+)(?:\+| more)? damage for each card in your opponent'?s hand/i);

  // ─── Status effects ───
  const statusMatch = text.match(/(?:Your opponent'?s|the Defending) (?:Active )?Pokémon is now (Poisoned|Burned|Asleep|Confused|Paralyzed)/i);
  const coinStatus = text.match(/Flip a coin\. If heads,? (?:the Defending|your opponent'?s (?:Active )?)?Pokémon is now (Poisoned|Burned|Asleep|Confused|Paralyzed)/i);

  // ─── Discard energy ───
  const discardEnergy = text.match(/[Dd]iscard (?:(?:all|an?) )?(?:(\d+) )?(?:(\w+) )?Energy (?:from|attached to) this Pokémon/i);
  const discardAllEnergy = /[Dd]iscard all Energy (?:from|attached to) this Pokémon/i.test(text);

  // ─── Draw cards ───
  const drawCards = text.match(/[Dd]raw (?:up to )?(\d+|a) cards?/i);

  // ─── Heal ───
  const healMatch = text.match(/[Hh]eal (\d+) damage from this Pokémon/i);
  const healAny = text.match(/[Hh]eal (\d+) damage from (?:1 of )?your (?:Benched )?Pokémon/i);

  // ─── Switch ───
  const switchSelf = /Switch this Pokémon with 1 of your Benched Pokémon/i.test(text);
  const switchOpp = /Switch (?:out )?your opponent'?s Active Pokémon/i.test(text);

  // ─── Can't retreat ───
  const cantRetreat = /(?:the Defending|your opponent'?s (?:Active )?)?Pokémon can'?t retreat/i.test(text);

  // ─── Can't attack ───
  const cantAttackSelf = /This Pokémon can'?t (?:use this )?attack (?:during|next)/i.test(text);

  // ─── Reduce damage next turn ───
  const reduceDmgNext = text.match(/(?:this Pokémon|it) takes (\d+) less damage/i);
  // "attacks used by the Defending Pokémon do X less damage"
  const defenderReduceDmg = text.match(/attacks used by (?:the Defending |your opponent'?s (?:Active )?)?Pokémon do (\d+) less damage/i);

  // ─── Prevent damage next turn ───
  const preventDmgNext = /Prevent all damage done to this Pokémon/i.test(text);
  const preventAllDmgAndEffects = /prevent all damage (?:from )?and effects of attacks done to this Pokémon/i.test(text);

  // ─── Search deck ───
  const searchDeck = text.match(/Search your deck for (?:up to )?(\d+|an?|a) (.+?)(?:,|\.|and)/i);

  // ─── Bench damage ───
  const benchSnipe = text.match(/(?:this attack (?:also )?does |do(?:es)? )(\d+) damage to (?:(\d+) of )?your opponent'?s Benched Pokémon/i);
  const benchAll = text.match(/(?:this attack (?:also )?does |do )(\d+) damage to each of your opponent'?s Benched Pokémon/i);
  // "does X damage to 1 of your opponent's Pokémon" (any zone)
  const snipeAny = text.match(/(?:this attack )?does (\d+) damage to (\d+) of your opponent'?s Pokémon/i);
  // "does X damage to 1 of your opponent's Pokémon for each ... Energy"
  const snipePerEnergy = text.match(/does (\d+) damage to (?:\d+ of )?your opponent'?s Pokémon for each (\w+) Energy attached to this Pokémon/i);

  // ─── Put damage counters ───
  const putCounters = text.match(/[Pp]ut (\d+) damage counters? on (?:your opponent'?s|1 of your opponent'?s) (?:Active |Benched )?Pokémon/i);
  // "Place X damage counters on ... for each card in your hand"
  const putCountersPerHand = text.match(/[Pp](?:lace|ut) (\d+) damage counters? on .* for each card in your hand/i);
  // "Place X damage counters on ... for each card in your opponent's hand"
  const putCountersPerOppHand = text.match(/[Pp](?:lace|ut) (\d+) damage counters? on .* for each card in your opponent'?s hand/i);

  // ─── Ignore resistance ───
  const ignoreResistance = /This attack'?s damage isn'?t affected by Resistance/i.test(text);
  const ignoreWeakness = /This attack'?s damage isn'?t affected by Weakness/i.test(text);

  // ─── Discard from opponent's deck ───
  const discardOppDeck = text.match(/[Dd]iscard the top (\d+) cards? of your opponent'?s deck/i);

  // ─── Shuffle hand into deck ───
  const shuffleHandOpp = /[Ss]huffle (?:all cards in )?your opponent'?s hand into (?:their|your opponent'?s) deck/i.test(text);

  // ─── KO if condition ───
  const koCondition = text.match(/(?:that|the) Pokémon is Knocked Out/i);

  // ─── Energy return to hand ───
  const energyToHand = text.match(/[Pp]ut (?:all |(\d+) )(?:(\w+) )?Energy attached to this Pokémon into your hand/i);

  // ═══ Now build steps based on matched patterns ═══

  // --- Multi-coin patterns ---
  if (multiCoin && multiCoinDmg) {
    const count = parseInt(multiCoin[1], 10);
    const perDmg = parseInt(multiCoinDmg[1], 10);
    steps.push({
      action: "flip_coins",
      count,
      per_heads: [{ action: "deal_damage", value: perDmg }],
    });
    damageAdded = true;
  }
  // --- Per-energy damage ---
  else if (perEnergySelf) {
    const perDmg = parseInt(perEnergySelf[1], 10);
    steps.push({
      action: "deal_damage",
      value: { per: "energy_on_self", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  else if (perEnergyDef) {
    const perDmg = parseInt(perEnergyDef[1], 10);
    steps.push({
      action: "deal_damage",
      value: { per: "energy_on_defender", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  // --- Per-bench damage ---
  else if (perBenchOwn) {
    const perDmg = parseInt(perBenchOwn[1], 10);
    if (baseDamage > 0) {
      steps.push({ action: "deal_damage", value: baseDamage });
      damageAdded = true;
    }
    steps.push({
      action: "deal_damage",
      value: { per: "own_bench_count", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  else if (perBenchOpp) {
    const perDmg = parseInt(perBenchOpp[1], 10);
    if (baseDamage > 0) {
      steps.push({ action: "deal_damage", value: baseDamage });
      damageAdded = true;
    }
    steps.push({
      action: "deal_damage",
      value: { per: "opp_bench_count", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  // --- Per damage counter ---
  else if (perDmgCounterSelf) {
    const perDmg = parseInt(perDmgCounterSelf[1], 10);
    steps.push({
      action: "deal_damage",
      value: { per: "damage_counters_on_self", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  else if (perDmgCounterDef) {
    const perDmg = parseInt(perDmgCounterDef[1], 10);
    steps.push({
      action: "deal_damage",
      value: { per: "damage_counters_on_defender", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  // --- Per hand size ---
  else if (perHandOwn) {
    const perDmg = parseInt(perHandOwn[1], 10);
    steps.push({
      action: "deal_damage",
      value: { per: "own_hand_size", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  else if (perHandOpp) {
    const perDmg = parseInt(perHandOpp[1], 10);
    steps.push({
      action: "deal_damage",
      value: { per: "opp_hand_size", multiply: perDmg } as DynamicValue,
    });
    damageAdded = true;
  }
  // --- Coin flip tails = nothing ---
  else if (coinTailsFail) {
    steps.push({
      action: "flip_coin",
      on_heads: [{ action: "deal_damage", value: baseDamage }],
    });
    damageAdded = true;
  }
  // --- Coin flip heads bonus ---
  else if (coinHeadsBonus) {
    const bonus = parseInt(coinHeadsBonus[1], 10);
    steps.push({ action: "deal_damage", value: baseDamage });
    steps.push({
      action: "flip_coin",
      on_heads: [{ action: "deal_damage", value: bonus }],
    });
    damageAdded = true;
  }
  // --- Coin flip for status ---
  else if (coinStatus) {
    if (baseDamage > 0) {
      steps.push({ action: "deal_damage", value: baseDamage });
      damageAdded = true;
    }
    const status = coinStatus[1].toLowerCase() as StatusCondition;
    steps.push({
      action: "flip_coin",
      on_heads: [{ action: "apply_status", status }],
    });
  }
  // --- Base damage if not yet added ---
  else if (baseDamage > 0 && !hasDmgMod) {
    steps.push({ action: "deal_damage", value: baseDamage });
    damageAdded = true;
  }

  // --- Additional effects (applied after damage) ---

  // Direct status (no coin flip)
  if (statusMatch && !coinStatus) {
    const status = statusMatch[1].toLowerCase() as StatusCondition;
    if (!damageAdded && baseDamage > 0) {
      steps.unshift({ action: "deal_damage", value: baseDamage });
      damageAdded = true;
    }
    steps.push({ action: "apply_status", status });
  }

  // Self damage
  if (selfDmgMatch) {
    const selfDmg = parseInt(selfDmgMatch[1], 10);
    if (!damageAdded && baseDamage > 0) {
      steps.unshift({ action: "deal_damage", value: baseDamage });
      damageAdded = true;
    }
    steps.push({ action: "self_damage", value: selfDmg });
  }

  // Discard energy cost
  if (discardAllEnergy) {
    steps.push({ action: "discard_energy", count: "all", target: { zone: "self_active" } });
  } else if (discardEnergy) {
    const count = discardEnergy[1] ? parseInt(discardEnergy[1], 10) : 1;
    const energyType = discardEnergy[2] ? parseEnergyType(discardEnergy[2]) : undefined;
    steps.push({
      action: "discard_energy",
      count,
      target: { zone: "self_active" },
      ...(energyType ? { energy_type: energyType } : {}),
    });
  }

  // Energy to hand
  if (energyToHand) {
    const count = energyToHand[1] ? parseInt(energyToHand[1], 10) : undefined;
    steps.push({
      action: "discard_energy",
      count: count ?? "all",
      target: { zone: "self_active" },
    });
  }

  // Heal self
  if (healMatch) {
    const healAmt = parseInt(healMatch[1], 10);
    steps.push({ action: "heal", value: healAmt, target: { zone: "self_active" } });
  }

  // Heal any
  if (healAny) {
    const healAmt = parseInt(healAny[1], 10);
    steps.push({ action: "heal", value: healAmt, target: { zone: "all_own" } });
  }

  // Draw cards
  if (drawCards) {
    const count = drawCards[1] === "a" ? 1 : parseInt(drawCards[1], 10);
    steps.push({ action: "draw_cards", count });
  }

  // Can't retreat
  if (cantRetreat) {
    steps.push({ action: "cant_retreat", target: { zone: "opp_active" } });
  }

  // Can't attack self next turn
  if (cantAttackSelf) {
    steps.push({ action: "cant_attack_next_turn" });
  }

  // Reduce damage next turn
  if (reduceDmgNext) {
    const amount = parseInt(reduceDmgNext[1], 10);
    steps.push({ action: "reduce_damage_next_turn", amount });
  }

  // Prevent damage next turn
  if (preventDmgNext) {
    steps.push({ action: "prevent_damage_next_turn" });
  }

  // Switch self
  if (switchSelf) {
    steps.push({ action: "switch_pokemon", who: "player" });
  }

  // Switch opponent
  if (switchOpp) {
    steps.push({ action: "switch_pokemon", who: "opponent", choice: "opponent" });
  }

  // Bench snipe
  if (benchSnipe) {
    const dmg = parseInt(benchSnipe[1], 10);
    steps.push({
      action: "bench_damage",
      value: dmg,
      side: "opponent",
      count: benchSnipe[2] ? parseInt(benchSnipe[2], 10) : 1,
    });
  }

  // Bench all damage
  if (benchAll) {
    const dmg = parseInt(benchAll[1], 10);
    steps.push({ action: "bench_damage", value: dmg, side: "opponent" });
  }

  // Put damage counters
  if (putCounters && !putCountersPerHand && !putCountersPerOppHand) {
    const counters = parseInt(putCounters[1], 10);
    steps.push({
      action: "put_damage_counters",
      value: counters,
      target: { zone: "opp_bench", choose: 1 },
    });
  }

  // Put damage counters per hand size
  if (putCountersPerHand) {
    const counters = parseInt(putCountersPerHand[1], 10);
    steps.push({
      action: "put_damage_counters",
      value: { per: "own_hand_size", multiply: counters } as DynamicValue,
      target: { zone: "opp_active" },
    });
  }
  if (putCountersPerOppHand) {
    const counters = parseInt(putCountersPerOppHand[1], 10);
    steps.push({
      action: "put_damage_counters",
      value: { per: "opp_hand_size", multiply: counters } as DynamicValue,
      target: { zone: "opp_active" },
    });
  }

  // Snipe any opponent Pokemon
  if (snipeAny && !benchSnipe && !snipePerEnergy) {
    const dmg = parseInt(snipeAny[1], 10);
    steps.push({
      action: "deal_damage",
      value: dmg,
      target: { zone: "all_opp" },
    });
  }

  // Snipe per energy
  if (snipePerEnergy) {
    const dmg = parseInt(snipePerEnergy[1], 10);
    steps.push({
      action: "deal_damage",
      value: { per: "energy_on_self", multiply: dmg } as DynamicValue,
      target: { zone: "all_opp" },
    });
  }

  // Defender does less damage
  if (defenderReduceDmg && !reduceDmgNext) {
    const amount = parseInt(defenderReduceDmg[1], 10);
    steps.push({ action: "reduce_damage_next_turn", amount });
  }

  // Prevent all damage AND effects (coin flip heads)
  if (preventAllDmgAndEffects && !preventDmgNext) {
    steps.push({ action: "prevent_damage_next_turn" });
  }

  // Ignore resistance/weakness
  if (ignoreResistance || ignoreWeakness) {
    steps.push({
      action: "ignore_wr",
      ...(ignoreWeakness ? { weakness: true } : {}),
      ...(ignoreResistance ? { resistance: true } : {}),
    });
  }

  // Discard from opponent's deck
  if (discardOppDeck) {
    const count = parseInt(discardOppDeck[1], 10);
    steps.push({ action: "discard_from_deck_top", count, who: "opponent" });
  }

  // Shuffle opponent's hand
  if (shuffleHandOpp) {
    steps.push({ action: "shuffle_hand_into_deck", who: "opponent" });
  }

  // Search deck (simple pattern)
  if (searchDeck && !drawCards) {
    const count = searchDeck[1] === "a" || searchDeck[1] === "an" ? 1 : parseInt(searchDeck[1], 10);
    const what = searchDeck[2].toLowerCase();
    const filter = parseCardFilter(what);
    steps.push({
      action: "search_deck",
      filter,
      count: isNaN(count) ? 1 : count,
      destination: "hand",
    });
    // Most searches require a shuffle after
    steps.push({ action: "shuffle_deck" });
  }
}

// ═══════════════════════════════════════════════════════
// Ability Rule Generation
// ═══════════════════════════════════════════════════════

function generateAbilityRules(card: CardInput): AbilityRuleDef[] {
  if (!card.abilities || card.abilities.length === 0) return [];

  return card.abilities.map(ab => {
    const text = ab.text || "";
    const abilityType = classifyAbility(text);

    const rule: AbilityRuleDef = {
      name: ab.name,
      type: abilityType,
    };

    if (abilityType === "activated") {
      rule.oncePerTurn = /Once during your turn/i.test(text);
      rule.steps = parseAbilityActivatedSteps(text);
      // Fallback: if no steps parsed, add a log step
      if (rule.steps.length === 0) {
        rule.steps = [{ action: "log", message: text.trim().slice(0, 200) }];
      }
    }
    else if (abilityType === "passive") {
      rule.modifiers = parsePassiveModifiers(text);
      // Passive condition
      if (/As long as this Pokémon is in the Active Spot/i.test(text)) {
        rule.condition = { check: "is_in_active_spot" };
      }
      // Fallback: if no modifiers parsed, add a generic one based on text
      if (!rule.modifiers || rule.modifiers.length === 0) {
        rule.modifiers = [{
          type: { modify: "prevent_effects", scope: "all" },
        }];
      }
    }
    else if (abilityType === "triggered") {
      const trigger = parseTrigger(text);
      if (trigger) rule.trigger = trigger;
      rule.steps = parseTriggeredSteps(text);
      // Fallback: if no steps, add log
      if (rule.steps.length === 0) {
        rule.steps = [{ action: "log", message: text.trim().slice(0, 200) }];
      }
    }

    return rule;
  });
}

function classifyAbility(text: string): "activated" | "passive" | "triggered" {
  // Triggered: when evolving / when played from hand / when KO'd
  if (/When you play this Pokémon from your hand/i.test(text)) return "triggered";
  if (/when you play this Pokémon from your hand to evolve/i.test(text)) return "triggered";
  if (/When this Pokémon is Knocked Out/i.test(text)) return "triggered";
  if (/When this Pokémon evolves/i.test(text)) return "triggered";
  if (/when this Pokémon moves from the Active Spot/i.test(text)) return "triggered";
  if (/when .* moves from .* Bench to the Active Spot/i.test(text)) return "triggered";

  // Activated: once per turn / as often as you like
  if (/Once during your turn/i.test(text) || /As often as you like/i.test(text)) return "activated";
  // "you may use this Ability" without evolve trigger = activated
  if (/you may use this Ability/i.test(text) && !/evolve|play this Pokémon from your hand/i.test(text)) return "activated";

  // Passive: "as long as" / "each ... gets" / retreat cost changes
  if (/As long as/i.test(text)) return "passive";
  if (/Each .+ Pokémon .+ gets/i.test(text)) return "passive";
  if (/has no Retreat Cost/i.test(text)) return "passive";
  if (/\d+ less damage/i.test(text)) return "passive";
  if (/\d+ more damage/i.test(text)) return "passive";
  if (/Prevent all damage/i.test(text)) return "passive";
  if (/Prevent all effects/i.test(text)) return "passive";
  if (/opponent can'?t/i.test(text)) return "passive";
  if (/provides? .* Energy/i.test(text)) return "passive";
  if (/Knocked Out .* can'?t take/i.test(text)) return "passive";
  if (/takes? \d+ fewer Prize/i.test(text)) return "passive";

  // Default: activated if action language, passive otherwise
  if (/you may/i.test(text) || /[Dd]raw|[Ss]earch|[Hh]eal/i.test(text)) return "activated";
  return "passive";
}

function parseAbilityActivatedSteps(text: string): ActionStep[] {
  const steps: ActionStep[] = [];

  // Draw cards
  const draw = text.match(/[Dd]raw (?:up to )?(\d+|a) cards?/i);
  if (draw) {
    const count = draw[1] === "a" ? 1 : parseInt(draw[1], 10);
    steps.push({ action: "draw_cards", count });
  }

  // Search deck
  const search = text.match(/[Ss]earch your deck for (?:up to )?(\d+|an?|a) (.+?)(?:,|\.| and)/i);
  if (search) {
    const count = search[1] === "a" || search[1] === "an" ? 1 : parseInt(search[1], 10);
    const filter = parseCardFilter(search[2].toLowerCase());
    steps.push({
      action: "search_deck",
      filter,
      count: isNaN(count) ? 1 : count,
      destination: "hand",
    });
    steps.push({ action: "shuffle_deck" });
  }

  // Heal
  const heal = text.match(/[Hh]eal (\d+) damage from/i);
  if (heal) {
    const amount = parseInt(heal[1], 10);
    const target: TargetSelector = /your Active Pokémon/i.test(text)
      ? { zone: "self_active" }
      : { zone: "all_own" };
    steps.push({ action: "heal", value: amount, target });
  }

  // Attach energy
  const attachEnergy = text.match(/[Aa]ttach (?:up to )?(\d+|an?|a) (?:basic )?(?:(\w+) )?Energy (?:card )?from your (discard pile|deck|hand)/i);
  if (attachEnergy) {
    const count = attachEnergy[1] === "a" || attachEnergy[1] === "an" ? 1 : parseInt(attachEnergy[1], 10);
    const source = attachEnergy[3].includes("discard") ? "discard"
      : attachEnergy[3].includes("deck") ? "deck" : "hand";
    const filter: CardFilter = { supertype: "Energy" };
    if (attachEnergy[2]) {
      const eType = parseEnergyType(attachEnergy[2]);
      if (eType) filter.types = [eType];
    }
    steps.push({
      action: "attach_energy",
      source: source as "discard" | "deck" | "hand",
      filter,
      count: isNaN(count) ? 1 : count,
      target: { zone: "all_own" },
    });
  }

  // Move energy
  const moveEnergy = text.match(/[Mm]ove (?:up to )?(\d+|an?|a) (?:(\w+) )?Energy from (?:1 of )?your/i);
  if (moveEnergy && !attachEnergy) {
    steps.push({
      action: "move_energy",
      from: { zone: "all_own" },
      to: { zone: "all_own" },
    });
  }

  // Discard from hand
  const discardHand = text.match(/[Dd]iscard (?:up to )?(\d+|a) cards? from your hand/i);
  if (discardHand) {
    const count = discardHand[1] === "a" ? 1 : parseInt(discardHand[1], 10);
    steps.push({ action: "discard_from_hand", count });
  }

  // Recover from discard
  const recover = text.match(/[Pp]ut (?:up to )?(\d+|an?|a) (?:(\w+) )?(?:card|Pokémon|Trainer|Energy)s? from your discard pile into your hand/i);
  if (recover) {
    const count = recover[1] === "a" || recover[1] === "an" ? 1 : parseInt(recover[1], 10);
    steps.push({
      action: "recover_from_discard",
      filter: {},
      count: isNaN(count) ? 1 : count,
      destination: "hand",
    });
  }

  // Switch
  if (/[Ss]witch (?:1 of )?your (?:opponent'?s )?(?:Active|Benched) Pokémon/i.test(text)) {
    const who = /opponent/i.test(text) ? "opponent" : "player";
    steps.push({ action: "switch_pokemon", who: who as "player" | "opponent" });
  }

  // Apply damage counters
  const dmgCounters = text.match(/[Pp]ut (\d+) damage counters? on/i);
  if (dmgCounters) {
    const counters = parseInt(dmgCounters[1], 10);
    const target: TargetSelector = /your opponent/i.test(text)
      ? { zone: "opp_active" }
      : { zone: "all_in_play" };
    steps.push({ action: "put_damage_counters", value: counters, target });
  }

  // Both players draw (Frosmoth pattern)
  if (/each player/i.test(text) && draw) {
    // Already added player draw, add opponent draw
    steps.push({ action: "draw_cards", count: steps.length > 0 && steps[0].action === "draw_cards" ? (steps[0] as any).count : 1, who: "opponent" });
  }

  return steps;
}

function parsePassiveModifiers(text: string): ModifierDef[] {
  const modifiers: ModifierDef[] = [];

  // Reduce incoming damage (wide pattern)
  const reduceDmg = text.match(/(\d+) less damage/i);
  if (reduceDmg && /(?:takes?|do|does|from attacks)/i.test(text)) {
    const amount = parseInt(reduceDmg[1], 10);
    modifiers.push({
      type: { modify: "incoming_damage", amount: -amount },
      condition: /in the Active Spot/i.test(text) ? { check: "is_in_active_spot" } : undefined,
    });
  }

  // Increase outgoing damage (wide pattern)
  const boostDmg = text.match(/(\d+) more damage/i);
  if (boostDmg && /(?:attacks? (?:used )?(?:by )?|do|does)/i.test(text)) {
    const amount = parseInt(boostDmg[1], 10);
    modifiers.push({
      type: { modify: "outgoing_damage", amount },
    });
  }

  // No retreat cost
  if (/has no Retreat Cost/i.test(text) || /Retreat Cost .* is 0/i.test(text)) {
    modifiers.push({
      type: { modify: "retreat_cost", amount: -99 },
    });
  }

  // Reduce retreat cost
  const reduceRetreat = text.match(/Retreat Cost .* is (\d+) (?:\w+ )?less/i);
  if (reduceRetreat) {
    const amount = parseInt(reduceRetreat[1], 10);
    modifiers.push({
      type: { modify: "retreat_cost", amount: -amount },
    });
  }

  // Prevent bench damage
  if (/Prevent all damage done .* to .* Benched Pokémon/i.test(text)) {
    modifiers.push({
      type: { modify: "prevent_bench_damage" },
    });
  }

  // Prevent status
  if (/can'?t be (?:affected by|left) (?:any )?Special Conditions/i.test(text)) {
    modifiers.push({
      type: { modify: "prevent_status", statuses: "all" },
    });
  }

  // Provide energy
  const provideEnergy = text.match(/(?:provides|counts as) (?:every type of|2 (\w+)) Energy/i);
  if (provideEnergy) {
    modifiers.push({
      type: { modify: "provide_energy_type", provides: "Colorless" as EnergyType, count: 2 },
    });
  }

  // Block item cards
  if (/opponent can'?t play .* Item cards/i.test(text)) {
    modifiers.push({
      type: { modify: "block_card_type", card_type: "Item" },
    });
  }

  // Prevent damage from Basic Pokémon
  if (/Prevent all damage done .* by your opponent'?s Basic Pokémon/i.test(text)) {
    modifiers.push({
      type: { modify: "prevent_effects", scope: "from_ex" },
    });
  }

  // Prevent all effects of attacks
  if (/Prevent all effects of attacks/i.test(text)) {
    modifiers.push({
      type: { modify: "prevent_effects", scope: "all" },
    });
  }

  // Prevent damage from ex
  if (/Prevent all damage .* by .* Pokémon ex/i.test(text)) {
    modifiers.push({
      type: { modify: "prevent_effects", scope: "from_ex" },
    });
  }

  // KO → no prize / fewer prize
  if (/opponent can'?t take any Prize/i.test(text) || /takes? \d+ fewer Prize/i.test(text)) {
    modifiers.push({
      type: { modify: "prevent_effects", scope: "all" },
    });
  }

  // HP boost
  const hpBoost = text.match(/gets? \+(\d+) HP/i);
  if (hpBoost) {
    modifiers.push({
      type: { modify: "max_hp", amount: parseInt(hpBoost[1], 10) },
    });
  }

  // No Weakness
  if (/has no Weakness/i.test(text)) {
    modifiers.push({
      type: { modify: "weakness", type: "Colorless" as EnergyType, value: "none" },
    });
  }

  // Prevent all damage (blanket)
  if (/Prevent all damage done to this Pokémon/i.test(text) && modifiers.length === 0) {
    modifiers.push({
      type: { modify: "incoming_damage", amount: -9999 },
      condition: /in the Active Spot/i.test(text) ? { check: "is_in_active_spot" } : undefined,
    });
  }

  // Block Supporter / Stadium cards
  if (/opponent can'?t play .* Supporter/i.test(text)) {
    modifiers.push({
      type: { modify: "block_card_type", card_type: "Supporter" },
    });
  }
  if (/opponent can'?t play .* Stadium/i.test(text)) {
    modifiers.push({
      type: { modify: "block_card_type", card_type: "Stadium" },
    });
  }

  // Each energy provides double (Meganium Wild Growth pattern)
  if (/each (?:Basic )?(?:\w+ )?Energy .* provides/i.test(text)) {
    const typeMatch = text.match(/each (?:Basic )?(\w+) Energy/i);
    const eType = typeMatch ? (parseEnergyType(typeMatch[1]) ?? "Colorless") : "Colorless";
    modifiers.push({
      type: { modify: "provide_energy_type", provides: eType as EnergyType, count: 2 },
    });
  }

  // Fallback: if we still have no modifiers for a passive, create a generic one
  if (modifiers.length === 0) {
    // Try: "This Pokémon takes X less damage"
    const genericLess = text.match(/takes? (\d+) less damage/i);
    if (genericLess) {
      modifiers.push({
        type: { modify: "incoming_damage", amount: -parseInt(genericLess[1], 10) },
      });
    }
    // "Pokémon ... do X more damage"
    const genericMore = text.match(/do (\d+) more damage/i);
    if (genericMore && modifiers.length === 0) {
      modifiers.push({
        type: { modify: "outgoing_damage", amount: parseInt(genericMore[1], 10) },
      });
    }
    // If KO related, prevent prize
    if (/Knocked Out/i.test(text) && modifiers.length === 0) {
      modifiers.push({
        type: { modify: "prevent_effects", scope: "all" },
      });
    }
    // If damage from ... is prevented
    if (/prevent all damage/i.test(text) && modifiers.length === 0) {
      modifiers.push({
        type: { modify: "incoming_damage", amount: -9999 },
      });
    }
  }

  return modifiers;
}

function parseTrigger(text: string): "on_play_from_hand" | "on_knocked_out" | "on_evolve" | "on_turn_start" | "between_turns" | "on_switch_in" | "on_switch_out" | "on_retreat" | undefined {
  if (/When you play this Pokémon from your hand to evolve/i.test(text)) return "on_evolve";
  if (/When you play this Pokémon from your hand/i.test(text)) return "on_play_from_hand";
  if (/When this Pokémon is Knocked Out/i.test(text)) return "on_knocked_out";
  if (/When this Pokémon evolves/i.test(text)) return "on_evolve";
  if (/when this Pokémon moves from the Active Spot/i.test(text)) return "on_switch_out";
  if (/when .* moves .* to the Active Spot/i.test(text)) return "on_switch_in";
  if (/[Aa]t the beginning of (?:your|each) turn/i.test(text)) return "on_turn_start";
  if (/[Bb]etween turns/i.test(text)) return "between_turns";
  if (/[Ww]hen .* retreats/i.test(text)) return "on_retreat";
  return undefined;
}

function parseTriggeredSteps(text: string): ActionStep[] {
  const steps: ActionStep[] = [];

  // Draw cards
  const draw = text.match(/[Dd]raw (?:up to )?(\d+|a) cards?/i);
  if (draw) {
    const count = draw[1] === "a" ? 1 : parseInt(draw[1], 10);
    steps.push({ action: "draw_cards", count });
  }

  // Search deck
  const search = text.match(/[Ss]earch your deck for (?:up to )?(\d+|an?|a) (.+?)(?:,|\.| and)/i);
  if (search) {
    const count = search[1] === "a" || search[1] === "an" ? 1 : parseInt(search[1], 10);
    const filter = parseCardFilter(search[2].toLowerCase());
    steps.push({
      action: "search_deck",
      filter,
      count: isNaN(count) ? 1 : count,
      destination: "hand",
    });
    steps.push({ action: "shuffle_deck" });
  }

  // Damage counters
  const dmg = text.match(/[Pp]ut (\d+) damage counters? on/i);
  if (dmg) {
    const counters = parseInt(dmg[1], 10);
    const target: TargetSelector = /your opponent/i.test(text)
      ? { zone: "opp_active" }
      : { zone: "all_in_play" };
    steps.push({ action: "put_damage_counters", value: counters, target });
  }

  // Heal
  const heal = text.match(/[Hh]eal (\d+) damage/i);
  if (heal && !dmg) {
    const amount = parseInt(heal[1], 10);
    steps.push({ action: "heal", value: amount, target: { zone: "self_active" } });
  }

  // Status on opponent between turns
  if (/between turns/i.test(text)) {
    const statusMap: Record<string, StatusCondition> = {
      poison: "poisoned", burn: "burned",
    };
    const statusMatch = text.match(/(Poisoned|Burned)/i);
    if (statusMatch) {
      steps.push({
        action: "apply_status",
        status: statusMatch[1].toLowerCase().replace(/ed$/, "") === "poison" ? "poisoned" : "burned" as StatusCondition,
        target: { zone: "opp_active" },
      });
    }
    if (/damage counter/i.test(text)) {
      const dmgBtwn = text.match(/(\d+) damage counters?/i);
      if (dmgBtwn) {
        steps.push({
          action: "put_damage_counters",
          value: parseInt(dmgBtwn[1], 10),
          target: { zone: "opp_active" },
        });
      }
    }
  }

  // Opponent takes more prizes when KO
  if (/When this Pokémon is Knocked Out/i.test(text)) {
    // Common pattern: take 1 fewer prize card
    if (/takes? 1 fewer Prize card/i.test(text)) {
      steps.push({ action: "log", message: "Opponent takes 1 fewer Prize card" });
    }
  }

  return steps;
}

// ═══════════════════════════════════════════════════════
// Trainer Rule Generation
// ═══════════════════════════════════════════════════════

function generateTrainerRule(card: CardInput): TrainerRuleDef | null {
  if (card.supertype !== "Trainer") return null;
  if (!card.rules || card.rules.length === 0) return null;

  const subtype = ((card.subtypes || [])[0] || "Item") as TrainerRuleDef["subtype"];
  const ruleTexts = card.rules.filter(r =>
    !r.includes("rule box") &&
    !r.includes("may play only 1 Supporter") &&
    !r.includes("Attach a Pokémon Tool") &&
    !r.includes("may play as many Item") &&
    !r.includes("This card stays in play") &&
    r.trim().length > 10
  );

  if (ruleTexts.length === 0) return null;

  const text = ruleTexts.join(" ");

  if (subtype === "Stadium") {
    return generateStadiumRule(text);
  }

  if (subtype === "Pokémon Tool") {
    return generateToolRule(text);
  }

  // Supporter / Item
  const steps = parseTrainerSteps(text);

  if (steps.length === 0) return null;

  return {
    subtype,
    steps,
  };
}

function parseTrainerSteps(text: string): ActionStep[] {
  const steps: ActionStep[] = [];

  // Discard hand then draw
  const discardDraw = text.match(/[Dd]iscard your hand (?:and|,) (?:then )?draw (\d+) cards?/i);
  if (discardDraw) {
    const count = parseInt(discardDraw[1], 10);
    steps.push({ action: "discard_hand" });
    steps.push({ action: "draw_cards", count });
    return steps;
  }

  // Draw cards
  const draw = text.match(/[Dd]raw (?:up to )?(\d+) cards?/i);
  if (draw) {
    const count = parseInt(draw[1], 10);
    steps.push({ action: "draw_cards", count });
  }

  // Shuffle hand then draw
  const shuffleDraw = text.match(/[Ss]huffle your hand into your deck\.? (?:Then,? )?[Dd]raw (\d+) cards?/i);
  if (shuffleDraw) {
    const count = parseInt(shuffleDraw[1], 10);
    steps.length = 0; // Clear previous draw
    steps.push({ action: "shuffle_hand_into_deck" });
    steps.push({ action: "draw_cards", count });
    return steps;
  }

  // Search deck
  const search = text.match(/[Ss]earch your deck for (?:up to )?(\d+|an?|a) (.+?)(?:,|\.| and)/i);
  if (search) {
    const count = search[1] === "a" || search[1] === "an" ? 1 : parseInt(search[1], 10);
    const filter = parseCardFilter(search[2].toLowerCase());
    steps.push({
      action: "search_deck",
      filter,
      count: isNaN(count) ? 1 : count,
      destination: "hand",
    });
    steps.push({ action: "shuffle_deck" });
  }

  // Switch
  if (/[Ss]witch (?:1 of )?your (?:Active|Benched) Pokémon/i.test(text)) {
    steps.push({ action: "switch_pokemon", who: "player" });
  }
  if (/[Ss]witch (?:1 of )?your opponent'?s (?:Active|Benched) Pokémon/i.test(text)) {
    steps.push({ action: "switch_pokemon", who: "opponent", choice: "opponent" });
  }

  // Heal
  const heal = text.match(/[Hh]eal (\d+) damage from (?:1 of )?your/i);
  if (heal) {
    const amount = parseInt(heal[1], 10);
    steps.push({ action: "heal", value: amount, target: { zone: "all_own" } });
  }

  // Recover from discard
  const recover = text.match(/(?:[Pp]ut|[Ss]huffle) (?:up to )?(\d+|an?|a) .* from your discard pile into your (hand|deck)/i);
  if (recover) {
    const count = recover[1] === "a" || recover[1] === "an" ? 1 : parseInt(recover[1], 10);
    const dest = recover[2] === "hand" ? "hand" : "deck";
    steps.push({
      action: "recover_from_discard",
      filter: {},
      count: isNaN(count) ? 1 : count,
      destination: dest as "hand" | "deck",
    });
  }

  // Damage counters
  const dmg = text.match(/[Pp]ut (\d+) damage counters? on/i);
  if (dmg) {
    const counters = parseInt(dmg[1], 10);
    steps.push({
      action: "put_damage_counters",
      value: counters,
      target: { zone: "opp_active" },
    });
  }

  // Discard from hand
  const discardCards = text.match(/[Dd]iscard (\d+|a) cards? from your hand/i);
  if (discardCards) {
    const count = discardCards[1] === "a" ? 1 : parseInt(discardCards[1], 10);
    steps.push({ action: "discard_from_hand", count });
  }

  // Shuffle opponent's hand
  if (/[Ss]huffle .* your opponent'?s hand .* into (?:their|your opponent'?s) deck/i.test(text)) {
    steps.push({ action: "shuffle_hand_into_deck", who: "opponent" });
  }
  // Opponent draws after shuffle
  const oppDrawAfter = text.match(/your opponent draws? (\d+) cards?/i);
  if (oppDrawAfter) {
    const count = parseInt(oppDrawAfter[1], 10);
    steps.push({ action: "draw_cards", count, who: "opponent" });
  }

  // Attach energy
  const attachEnergy = text.match(/[Aa]ttach (?:up to )?(\d+|an?|a) (?:basic )?(?:(\w+) )?Energy (?:card )?from your (discard pile|deck|hand)/i);
  if (attachEnergy) {
    const count = attachEnergy[1] === "a" || attachEnergy[1] === "an" ? 1 : parseInt(attachEnergy[1], 10);
    const source = attachEnergy[3].includes("discard") ? "discard"
      : attachEnergy[3].includes("deck") ? "deck" : "hand";
    const filter: CardFilter = { supertype: "Energy" };
    if (attachEnergy[2]) {
      const eType = parseEnergyType(attachEnergy[2]);
      if (eType) filter.types = [eType];
    }
    steps.push({
      action: "attach_energy",
      source: source as "discard" | "deck" | "hand",
      filter,
      count: isNaN(count) ? 1 : count,
      target: { zone: "all_own" },
    });
  }

  // Discard stadium
  if (/[Dd]iscard .* Stadium/i.test(text) && !/your opponent can'?t play/i.test(text)) {
    steps.push({ action: "discard_stadium" });
  }

  // Look at top cards
  const lookTop = text.match(/[Ll]ook at the top (\d+) cards? of your deck/i);
  if (lookTop && !search) {
    const count = parseInt(lookTop[1], 10);
    steps.push({
      action: "reveal_top_cards",
      count,
      then: [],
    });
  }

  return steps;
}

function generateStadiumRule(text: string): TrainerRuleDef | null {
  const steps = parseTrainerSteps(text);
  const trigger = parseTrigger(text);

  if (steps.length === 0) {
    // Try basic patterns
    const modifiers = parsePassiveModifiers(text);
    if (modifiers.length > 0) {
      return {
        subtype: "Stadium",
        stadiumEffect: {
          trigger: trigger || "on_turn_start",
          steps: [{ action: "log", message: text.trim().slice(0, 200) }],
        },
      };
    }
    // Fallback: add log step for any stadium with text
    if (text.trim().length > 0) {
      return {
        subtype: "Stadium",
        stadiumEffect: {
          trigger: trigger || "on_turn_start",
          steps: [{ action: "log", message: text.trim().slice(0, 200) }],
        },
      };
    }
    return null;
  }

  return {
    subtype: "Stadium",
    stadiumEffect: {
      trigger: trigger || "on_turn_start",
      steps,
    },
  };
}

function generateToolRule(text: string): TrainerRuleDef | null {
  const modifiers = parsePassiveModifiers(text);

  // Boost HP
  const boostHp = text.match(/gets \+(\d+) HP/i);
  if (boostHp) {
    modifiers.push({
      type: { modify: "max_hp", amount: parseInt(boostHp[1], 10) },
    });
  }

  // Reduce retreat
  const reduceRetreat = text.match(/Retreat Cost .* is (\d+) (?:\w+ )?less/i);
  if (reduceRetreat) {
    modifiers.push({
      type: { modify: "retreat_cost", amount: -parseInt(reduceRetreat[1], 10) },
    });
  }

  if (modifiers.length === 0) {
    // Try to parse as active steps
    const steps = parseTrainerSteps(text);
    if (steps.length > 0) {
      return { subtype: "Tool", steps };
    }
    return null;
  }

  return {
    subtype: "Tool",
    toolModifiers: modifiers,
  };
}

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function parseEnergyType(str: string): EnergyType | undefined {
  const map: Record<string, EnergyType> = {
    fire: "Fire", water: "Water", grass: "Grass", lightning: "Lightning",
    psychic: "Psychic", fighting: "Fighting", metal: "Metal", darkness: "Darkness",
    fairy: "Fairy", dragon: "Dragon", colorless: "Colorless",
  };
  return map[str.toLowerCase()];
}

function parseCardFilter(text: string): CardFilter {
  const filter: CardFilter = {};

  if (/basic pok[eé]mon/i.test(text)) {
    filter.supertype = "Pokémon";
    filter.subtypes = ["Basic"];
  } else if (/pok[eé]mon/i.test(text)) {
    filter.supertype = "Pokémon";
  } else if (/basic energy/i.test(text)) {
    filter.supertype = "Energy";
    filter.isBasicEnergy = true;
  } else if (/energy/i.test(text)) {
    filter.supertype = "Energy";
  } else if (/supporter/i.test(text)) {
    filter.supertype = "Trainer";
    filter.subtypes = ["Supporter"];
  } else if (/item/i.test(text)) {
    filter.supertype = "Trainer";
    filter.subtypes = ["Item"];
  } else if (/trainer/i.test(text)) {
    filter.supertype = "Trainer";
  }

  // Energy type filter
  const typeMatch = text.match(/(fire|water|grass|lightning|psychic|fighting|metal|darkness|fairy|dragon) energy/i);
  if (typeMatch) {
    const eType = parseEnergyType(typeMatch[1]);
    if (eType) filter.types = [eType];
  }

  return filter;
}

function collectOriginalText(card: CardInput): string {
  const texts: string[] = [];
  (card.attacks || []).forEach(a => {
    if (a.text) texts.push(`${a.name}: ${a.text}`);
  });
  (card.abilities || []).forEach(ab => {
    if (ab.text) texts.push(`${ab.name} (${ab.type}): ${ab.text}`);
  });
  (card.rules || []).forEach(r => texts.push(r));
  return texts.join("\n");
}

function calculateConfidence(rule: CardRuleDef, card: CardInput): number {
  let totalSteps = 0;
  let emptySteps = 0;

  // Count attacks with/without steps
  (rule.attacks || []).forEach(atk => {
    totalSteps++;
    if (atk.steps.length === 0 || (atk.steps.length === 1 && atk.steps[0].action === "deal_damage")) {
      const hasText = card.attacks?.find(a => a.name === atk.name)?.text;
      if (hasText && hasText.trim().length > 0) {
        emptySteps++; // Had text but only got base damage
      }
    }
  });

  // Count abilities
  (rule.abilities || []).forEach(ab => {
    totalSteps++;
    if (ab.type === "activated" && (!ab.steps || ab.steps.length === 0)) {
      emptySteps++;
    }
    if (ab.type === "passive" && (!ab.modifiers || ab.modifiers.length === 0)) {
      emptySteps++;
    }
    if (ab.type === "triggered" && (!ab.steps || ab.steps.length === 0)) {
      emptySteps++;
    }
  });

  // Trainer
  if (rule.trainer) {
    totalSteps++;
    if (!rule.trainer.steps || rule.trainer.steps.length === 0) {
      if (!rule.trainer.stadiumEffect && !rule.trainer.toolModifiers) {
        emptySteps++;
      }
    }
  }

  if (totalSteps === 0) return 0.5;

  // Base confidence from coverage
  const coverage = 1 - (emptySteps / totalSteps);
  // Scale: 0.3 (all empty) to 0.95 (all covered)
  return Math.round((0.3 + coverage * 0.65) * 100) / 100;
}

// ═══════════════════════════════════════════════════════
// Statistics helper
// ═══════════════════════════════════════════════════════

export interface GenerationStats {
  total: number;
  generated: number;
  skipped: number;
  byConfidence: {
    high: number;   // >= 0.8
    medium: number;  // >= 0.5
    low: number;     // < 0.5
  };
  bySupertype: Record<string, { total: number; generated: number }>;
}

export function getGenerationStats(cards: CardInput[], rules: CardRuleDef[]): GenerationStats {
  const ruleMap = new Map(rules.map(r => [r.cardId, r]));
  const stats: GenerationStats = {
    total: cards.length,
    generated: rules.length,
    skipped: cards.length - rules.length,
    byConfidence: { high: 0, medium: 0, low: 0 },
    bySupertype: {},
  };

  for (const rule of rules) {
    const conf = rule.meta?.confidence ?? 0.5;
    if (conf >= 0.8) stats.byConfidence.high++;
    else if (conf >= 0.5) stats.byConfidence.medium++;
    else stats.byConfidence.low++;
  }

  for (const card of cards) {
    const st = card.supertype;
    if (!stats.bySupertype[st]) stats.bySupertype[st] = { total: 0, generated: 0 };
    stats.bySupertype[st].total++;
    if (ruleMap.has(card.id)) stats.bySupertype[st].generated++;
  }

  return stats;
}
