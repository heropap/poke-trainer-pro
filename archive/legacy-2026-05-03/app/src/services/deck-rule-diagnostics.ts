import { getEffectSource, getEffectMeta } from "@/engine/effects/effect-registry";
import type { EffectSourceLayer, EffectMeta } from "@/engine/effects/effect-registry";
import type { DeckValidation } from "@/lib/deck-parser";
import type { Card } from "@/types/card";
import type { StoredDeck } from "@/services/deck-storage";

type DiagnosticCardEntry = {
  cardId: string | null;
  name: string;
  quantity: number;
  setCode: string;
  number: string;
  category: "pokemon" | "trainer" | "energy" | "unknown";
  found: boolean;
};

export type DeckRuleIssueSeverity = "high" | "medium" | "low";
export type DeckRuleIssueType =
  | "unresolved_card"
  | "missing_effect"
  | "fragile_effect_source"
  | "unsupported_actions";

export interface DeckRuleIssue {
  type: DeckRuleIssueType;
  severity: DeckRuleIssueSeverity;
  cardId: string | null;
  cardName: string;
  quantity: number;
  sourceLayer?: EffectSourceLayer | null;
  /** How the effect was resolved: by exact cardId or by name fallback */
  resolvedBy?: "id" | "name";
  /** Number of overwrite attempts blocked by the priority guard */
  blockedOverwrites?: number;
  message: string;
  suggestedFix?: string;
  unsupportedActions?: string[];
}

export interface DeckRuleDiagnostics {
  generatedAt: string;
  deckScore: number;
  summary: {
    totalEntries: number;
    unresolvedCards: number;
    missingEffects: number;
    fragileEffects: number;
    unsupportedActionCards: number;
    highPriorityCards: number;
  };
  issues: DeckRuleIssue[];
}

const EXECUTOR_SUPPORTED_ACTIONS = new Set([
  "deal_damage",
  "put_damage_counters",
  "self_damage",
  "bench_damage",
  "ignore_wr",
  "ignore_weakness",
  "ignore_resistance",
  "flip_coin",
  "flip_coins",
  "apply_status",
  "remove_status",
  "draw_cards",
  "discard_from_hand",
  "discard_hand",
  "search_deck",
  "recover_from_discard",
  "shuffle_hand_into_deck",
  "shuffle_deck",
  "reveal_top_cards",
  "put_on_deck",
  "discard_from_deck_top",
  "discard_energy",
  "attach_energy",
  "move_energy",
  "switch_pokemon",
  "heal",
  "discard_stadium",
  "discard_tool",
  "evolve",
  "set_marker",
  "clear_marker",
  "cant_attack_next_turn",
  "cant_retreat",
  "reduce_damage_next_turn",
  "prevent_damage_next_turn",
  "disable_attack",
  "if",
  "for_each",
  "choose",
  "choose_one",
  "copy_attack",
  "extra_turn",
  "log",
]);

type V2RuleCard = {
  cardId: string;
  cardName: string;
  rules?: Array<{ steps?: unknown[] }>;
};

let v2RuleIndexById: Map<string, V2RuleCard> | null = null;

function getV2RuleIndex(): Map<string, V2RuleCard> {
  if (v2RuleIndexById) return v2RuleIndexById;

  v2RuleIndexById = new Map<string, V2RuleCard>();

  try {
    const cards = require("@/data/card-rules-v2.json") as V2RuleCard[];
    for (const card of cards) {
      v2RuleIndexById.set(card.cardId, card);
    }
  } catch {
    // Ignore in environments where the bundle omits the file.
  }

  return v2RuleIndexById;
}

function toDiagnosticEntriesFromValidation(
  validation: DeckValidation,
): DiagnosticCardEntry[] {
  return validation.cardDetails.map((detail) => ({
    cardId: detail.cardId ?? null,
    name: detail.entry.name,
    quantity: detail.entry.quantity,
    setCode: detail.entry.setCode,
    number: detail.entry.number,
    category: detail.entry.category,
    found: detail.found,
  }));
}

function toDiagnosticEntriesFromStoredDeck(deck: StoredDeck): DiagnosticCardEntry[] {
  return deck.cards.map((card) => ({
    cardId: card.found && card.cardId ? card.cardId : null,
    name: card.name,
    quantity: card.quantity,
    setCode: card.setCode,
    number: card.number,
    category: card.category,
    found: card.found,
  }));
}

function cardNeedsEffectCoverage(card: Card): boolean {
  if (card.supertype === "Trainer") {
    return !!card.rules?.some((rule) => rule.trim().length > 0);
  }

  if (card.supertype === "Energy") {
    return card.subtypes?.includes("Special") && !!card.rules?.some((rule) => rule.trim().length > 0);
  }

  if (card.abilities && card.abilities.length > 0) return true;

  return !!card.attacks?.some((attack) => {
    const text = attack.text?.trim() ?? "";
    return text.length > 0;
  });
}

function collectUnsupportedActionsFromSteps(
  steps: unknown[],
  unsupported: Set<string>,
): void {
  for (const rawStep of steps) {
    if (!rawStep || typeof rawStep !== "object") continue;
    const step = rawStep as Record<string, unknown>;
    const action = typeof step.action === "string" ? step.action : null;

    if (action && !EXECUTOR_SUPPORTED_ACTIONS.has(action)) {
      unsupported.add(action);
    }

    const arrayChildren = ["then", "else", "body", "steps", "thenSteps", "elseSteps"];
    for (const key of arrayChildren) {
      const value = step[key];
      if (Array.isArray(value)) {
        collectUnsupportedActionsFromSteps(value, unsupported);
      }
    }

    const branch = step.branch;
    if (branch && typeof branch === "object") {
      const branchObj = branch as Record<string, unknown>;
      if (Array.isArray(branchObj.thenSteps)) {
        collectUnsupportedActionsFromSteps(branchObj.thenSteps, unsupported);
      }
      if (Array.isArray(branchObj.elseSteps)) {
        collectUnsupportedActionsFromSteps(branchObj.elseSteps, unsupported);
      }
    }

    const loop = step.loop;
    if (loop && typeof loop === "object") {
      const loopObj = loop as Record<string, unknown>;
      if (Array.isArray(loopObj.body)) {
        collectUnsupportedActionsFromSteps(loopObj.body, unsupported);
      }
    }
  }
}

function getUnsupportedActionsForCard(cardId: string): string[] {
  const v2Card = getV2RuleIndex().get(cardId);
  if (!v2Card?.rules?.length) return [];

  const unsupported = new Set<string>();

  for (const rule of v2Card.rules) {
    if (Array.isArray(rule.steps)) {
      collectUnsupportedActionsFromSteps(rule.steps, unsupported);
    }
  }

  return Array.from(unsupported).sort();
}

function scoreDiagnostics(issues: DeckRuleIssue[]): number {
  let score = 100;

  for (const issue of issues) {
    if (issue.severity === "high") score -= 20;
    else if (issue.severity === "medium") score -= 10;
    else score -= 4;
  }

  return Math.max(0, score);
}

function analyzeEntries(
  entries: DiagnosticCardEntry[],
  cardLookup: (id: string) => Card | undefined,
): DeckRuleDiagnostics {
  const issues: DeckRuleIssue[] = [];

  for (const entry of entries) {
    if (!entry.found || !entry.cardId) {
      issues.push({
        type: "unresolved_card",
        severity: "high",
        cardId: null,
        cardName: entry.name,
        quantity: entry.quantity,
        message: `${entry.name} 仍未解析到本地卡牌数据，后续规则修复和实战执行都会失真。`,
        suggestedFix: "先修正导入映射或补齐卡牌数据库，再处理效果规则。",
      });
      continue;
    }

    const card = cardLookup(entry.cardId);
    if (!card || !cardNeedsEffectCoverage(card)) {
      continue;
    }

    const meta = getEffectMeta(card.id, card.name);
    const sourceLayer = meta?.source ?? null;

    if (!sourceLayer) {
      issues.push({
        type: "missing_effect",
        severity: "high",
        cardId: card.id,
        cardName: card.name,
        quantity: entry.quantity,
        message: `${card.name} 需要规则覆盖，但当前效果注册表里没有可执行定义。`,
        suggestedFix: "优先为这张卡补手写规则，或补充可回归验证的 V2/模板规则。",
      });
      continue;
    }

    // Common metadata for all issues on this card
    // (meta is guaranteed non-null here since sourceLayer came from meta.source)
    const resolvedBy = meta!.resolvedBy;
    const blockedOverwrites = meta!.overwriteLog.length;

    if (sourceLayer === "L3" || sourceLayer === "L4") {
      issues.push({
        type: "fragile_effect_source",
        severity: "medium",
        cardId: card.id,
        cardName: card.name,
        quantity: entry.quantity,
        sourceLayer,
        resolvedBy,
        blockedOverwrites,
        message: `${card.name} 当前依赖 ${sourceLayer} 文本解析层（通过${resolvedBy === "name" ? "名称回退" : "ID精确匹配"}命中），容易和真实玩法或边界时序冲突。`,
        suggestedFix: "把这张卡提升到 L1/L2 手写规则，或补专门测试后再保留自动解析结果。",
      });
    }

    if (sourceLayer === "L2.5") {
      const unsupportedActions = getUnsupportedActionsForCard(card.id);
      if (unsupportedActions.length > 0) {
        issues.push({
          type: "unsupported_actions",
          severity: "high",
          cardId: card.id,
          cardName: card.name,
          quantity: entry.quantity,
          sourceLayer,
          resolvedBy,
          blockedOverwrites,
          unsupportedActions,
          message: `${card.name} 的规则定义里包含当前执行器尚未稳定支持的原子动作: ${unsupportedActions.join(", ")}。`,
          suggestedFix: "先把这张卡加入修复清单，补执行器支持或下沉为手写规则。",
        });
      }
    }

    // Warn if effect was resolved via name fallback (potential reprint mismatch)
    if (resolvedBy === "name" && (sourceLayer === "L2.5" || sourceLayer === "L3" || sourceLayer === "L4")) {
      // Only warn for auto layers — L2 name-based is intentional
      const existingIssue = issues.find(
        (i) => i.cardId === card.id && (i.type === "fragile_effect_source" || i.type === "unsupported_actions")
      );
      if (!existingIssue) {
        issues.push({
          type: "fragile_effect_source",
          severity: "low",
          cardId: card.id,
          cardName: card.name,
          quantity: entry.quantity,
          sourceLayer,
          resolvedBy,
          blockedOverwrites,
          message: `${card.name} 通过名称回退命中 ${sourceLayer} 层规则（非 ID 精确匹配），可能使用了其他印刷版的规则定义。`,
          suggestedFix: "确认该卡与命中的规则定义文本完全一致，或为此 cardId 补充精确规则。",
        });
      }
    }
  }

  const summary = {
    totalEntries: entries.length,
    unresolvedCards: issues.filter((issue) => issue.type === "unresolved_card").length,
    missingEffects: issues.filter((issue) => issue.type === "missing_effect").length,
    fragileEffects: issues.filter((issue) => issue.type === "fragile_effect_source").length,
    unsupportedActionCards: issues.filter((issue) => issue.type === "unsupported_actions").length,
    highPriorityCards: issues.filter((issue) => issue.severity === "high").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    deckScore: scoreDiagnostics(issues),
    summary,
    issues,
  };
}

export function analyzeDeckRuleCoverage(
  validation: DeckValidation,
  cardLookup: (id: string) => Card | undefined,
): DeckRuleDiagnostics {
  return analyzeEntries(toDiagnosticEntriesFromValidation(validation), cardLookup);
}

export function analyzeStoredDeckRuleCoverage(
  deck: StoredDeck,
  cardLookup: (id: string) => Card | undefined,
): DeckRuleDiagnostics {
  return analyzeEntries(toDiagnosticEntriesFromStoredDeck(deck), cardLookup);
}
