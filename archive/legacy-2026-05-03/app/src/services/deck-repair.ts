import { parseDeckList, validateDeck } from "@/lib/deck-parser";
import type { DeckValidation } from "@/lib/deck-parser";
import type { Card } from "@/types/card";
import { createStoredDeck, type StoredDeck } from "@/services/deck-storage";
import {
  analyzeDeckRuleCoverage,
  type DeckRuleDiagnostics,
  type DeckRuleIssue,
} from "@/services/deck-rule-diagnostics";

export interface DeckRepairResult {
  deck: StoredDeck;
  diagnostics: DeckRuleDiagnostics;
  validation: DeckValidation;
  changed: boolean;
  changes: string[];
}

export interface DeckRepairQueueItem {
  key: string;
  cardId: string | null;
  cardName: string;
  type: DeckRuleIssue["type"];
  severity: DeckRuleIssue["severity"];
  sourceLayer?: DeckRuleIssue["sourceLayer"];
  deckCount: number;
  totalCopies: number;
  affectedDecks: string[];
  messages: string[];
  suggestedFixes: string[];
  unsupportedActions: string[];
}

function compareDecks(before: StoredDeck, after: StoredDeck): string[] {
  const changes: string[] = [];
  const beforeResolved = before.cards.filter((card) => card.found && card.cardId).length;
  const afterResolved = after.cards.filter((card) => card.found && card.cardId).length;

  if (afterResolved > beforeResolved) {
    changes.push(`修复了 ${afterResolved - beforeResolved} 个原先未解析的卡牌条目`);
  }

  if (before.isValid !== after.isValid) {
    changes.push(`卡组合法性已从 ${before.isValid ? "合法" : "不合法"} 更新为 ${after.isValid ? "合法" : "不合法"}`);
  }

  if ((before.ruleDiagnostics?.deckScore ?? -1) !== after.ruleDiagnostics?.deckScore) {
    changes.push(
      `规则健康度更新为 ${after.ruleDiagnostics?.deckScore ?? 0}/100`
    );
  }

  if (before.warnings.length !== after.warnings.length) {
    changes.push(`警告数量从 ${before.warnings.length} 变为 ${after.warnings.length}`);
  }

  if (before.errors.length !== after.errors.length) {
    changes.push(`错误数量从 ${before.errors.length} 变为 ${after.errors.length}`);
  }

  return changes;
}

export function repairStoredDeck(
  deck: StoredDeck,
  cardLookup: (id: string) => Card | undefined,
  nameLookup: (name: string) => Card[],
): DeckRepairResult {
  const parsed = parseDeckList(deck.deckText);
  const validation = validateDeck(parsed, cardLookup, nameLookup);
  const diagnostics = analyzeDeckRuleCoverage(validation, cardLookup);

  const rebuilt = createStoredDeck(validation, deck.deckText, diagnostics);
  const repairedDeck: StoredDeck = {
    ...rebuilt,
    id: deck.id,
    name: deck.name,
    createdAt: deck.createdAt,
  };

  const changes = compareDecks(deck, repairedDeck);

  return {
    deck: repairedDeck,
    diagnostics,
    validation,
    changed: changes.length > 0,
    changes,
  };
}

export function buildDeckRepairQueue(decks: StoredDeck[]): DeckRepairQueueItem[] {
  const issueMap = new Map<string, DeckRepairQueueItem>();

  for (const deck of decks) {
    const issues = deck.ruleDiagnostics?.issues ?? [];
    for (const issue of issues) {
      const key = `${issue.type}:${issue.cardId ?? issue.cardName}`;
      const existing = issueMap.get(key);

      if (!existing) {
        issueMap.set(key, {
          key,
          cardId: issue.cardId,
          cardName: issue.cardName,
          type: issue.type,
          severity: issue.severity,
          sourceLayer: issue.sourceLayer,
          deckCount: 1,
          totalCopies: issue.quantity,
          affectedDecks: [deck.name],
          messages: [issue.message],
          suggestedFixes: issue.suggestedFix ? [issue.suggestedFix] : [],
          unsupportedActions: [...(issue.unsupportedActions ?? [])],
        });
        continue;
      }

      existing.deckCount += 1;
      existing.totalCopies += issue.quantity;
      if (!existing.affectedDecks.includes(deck.name)) {
        existing.affectedDecks.push(deck.name);
      }
      if (!existing.messages.includes(issue.message)) {
        existing.messages.push(issue.message);
      }
      if (issue.suggestedFix && !existing.suggestedFixes.includes(issue.suggestedFix)) {
        existing.suggestedFixes.push(issue.suggestedFix);
      }
      for (const action of issue.unsupportedActions ?? []) {
        if (!existing.unsupportedActions.includes(action)) {
          existing.unsupportedActions.push(action);
        }
      }
    }
  }

  const severityRank: Record<DeckRepairQueueItem["severity"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return Array.from(issueMap.values()).sort((a, b) => {
    return (
      severityRank[a.severity] - severityRank[b.severity] ||
      b.deckCount - a.deckCount ||
      b.totalCopies - a.totalCopies ||
      a.cardName.localeCompare(b.cardName)
    );
  });
}
