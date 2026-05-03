"use client";

/**
 * EffectEditorClient — Main visual effect editor page.
 *
 * Combines:
 * - Card search and selection
 * - CardEffectStatus display
 * - AttackEffectBuilder, TrainerEffectBuilder, AbilityEffectBuilder
 * - JSON preview and export
 * - Save to custom-effects / Copy JSON
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Card } from "@/types/card";
import CardEffectStatus from "@/components/tools/CardEffectStatus";
import AttackEffectBuilder from "@/components/tools/AttackEffectBuilder";
import TrainerEffectBuilder from "@/components/tools/TrainerEffectBuilder";
import AbilityEffectBuilder from "@/components/tools/AbilityEffectBuilder";
import { compileSchema } from "@/engine/effects/schema-compiler";
import { validateSchema } from "@/engine/effects/schema-loader";
import { getPatternCounts } from "@/engine/effects/pattern-catalog";
import type {
  EffectSchemaDefinition,
  AttackSchema,
  AbilitySchema,
  TrainerSchema,
} from "@/engine/effects/effect-schema";

// ─── Card Data Loading ───

function useCards() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import("@/data/cards/_index.json")
      .then((mod) => {
        setCards(mod.default as unknown as Card[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { cards, loading };
}

// ─── Card Search (simplified inline version) ───

function CardSearchBar({
  cards,
  onSelect,
}: {
  cards: Card[];
  onSelect: (card: Card) => void;
}) {
  const [query, setQuery] = useState("");
  const [supertype, setSupertype] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!query && supertype === "all") return [];
    let result = cards;
    if (query) {
      const q = query.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (supertype !== "all") {
      result = result.filter((c) => c.supertype === supertype);
    }
    return result.slice(0, 50); // Show max 50 results
  }, [cards, query, supertype]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="输入卡牌名称..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={supertype}
          onChange={(e) => setSupertype(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="all">全部</option>
          <option value="Pokémon">宝可梦</option>
          <option value="Trainer">训练师</option>
          <option value="Energy">能量</option>
        </select>
      </div>

      {filtered.length > 0 && (
        <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          {filtered.map((card) => (
            <button
              key={card.id}
              onClick={() => {
                onSelect(card);
                setQuery("");
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
            >
              {card.images?.small && (
                <img src={card.images.small} alt="" className="h-10 w-auto rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {card.name}
                </div>
                <div className="text-xs text-zinc-400 truncate">
                  {card.supertype} {card.subtypes?.join(" / ")} — {card.id}
                </div>
              </div>
              {card.hp && (
                <span className="text-xs text-zinc-400">HP {card.hp}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {query && filtered.length === 0 && (
        <p className="text-xs text-zinc-400 text-center py-2">没有找到匹配的卡牌</p>
      )}
    </div>
  );
}

// ─── JSON Preview Panel ───

function JsonPreview({
  schema,
  validation,
}: {
  schema: EffectSchemaDefinition | null;
  validation: { valid: boolean; error?: string } | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!schema) return null;

  const json = JSON.stringify(schema, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const handleDownload = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schema.cardName.replace(/\s+/g, "-").toLowerCase()}-effect.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">JSON 预览</h4>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="rounded bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {copied ? "已复制!" : "复制 JSON"}
          </button>
          <button
            onClick={handleDownload}
            className="rounded bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            下载
          </button>
        </div>
      </div>

      {validation && (
        <div className={`rounded px-3 py-1.5 text-xs ${
          validation.valid
            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
        }`}>
          {validation.valid ? "✓ Schema 有效 — 可以编译为 CardEffectDef" : `✕ ${validation.error}`}
        </div>
      )}

      <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-900 p-4 text-xs text-green-400 font-mono">
        {json}
      </pre>
    </div>
  );
}

// ─── Main Editor Component ───

export default function EffectEditorClient() {
  const { cards, loading } = useCards();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Schema state
  const [attackSchemas, setAttackSchemas] = useState<AttackSchema[]>([]);
  const [trainerSchema, setTrainerSchema] = useState<TrainerSchema | undefined>();
  const [abilitySchemas, setAbilitySchemas] = useState<AbilitySchema[]>([]);

  const patternCounts = getPatternCounts();

  // Build the full schema definition
  const currentSchema = useMemo<EffectSchemaDefinition | null>(() => {
    if (!selectedCard) return null;

    const schema: EffectSchemaDefinition = {
      cardName: selectedCard.name,
    };

    // Only include non-empty attack schemas
    const validAttacks = attackSchemas.filter((a) => a.effects && a.effects.length > 0);
    if (validAttacks.length > 0) schema.attacks = validAttacks;

    // Only include trainer if has effects
    if (trainerSchema && trainerSchema.effects && trainerSchema.effects.length > 0) {
      schema.trainer = trainerSchema;
    }

    // Only include non-empty ability schemas
    const validAbilities = abilitySchemas.filter((a) => a.effect && a.effect.type);
    if (validAbilities.length > 0) schema.abilities = validAbilities;

    // Return null if nothing configured
    if (!schema.attacks && !schema.trainer && !schema.abilities) return null;

    return schema;
  }, [selectedCard, attackSchemas, trainerSchema, abilitySchemas]);

  // Validate the current schema
  const validation = useMemo(() => {
    if (!currentSchema) return null;
    return validateSchema(currentSchema);
  }, [currentSchema]);

  // Handle card selection
  const handleSelectCard = useCallback((card: Card) => {
    setSelectedCard(card);
    // Reset builders
    setAttackSchemas(card.attacks?.map((a) => ({ name: a.name, effects: [] })) || []);
    setTrainerSchema(undefined);
    setAbilitySchemas([]);
  }, []);

  const isPokemon = selectedCard?.supertype === "Pokémon";
  const isTrainer = selectedCard?.supertype === "Trainer";
  const hasAttacks = selectedCard?.attacks && selectedCard.attacks.length > 0;
  const hasAbilities = selectedCard?.abilities && selectedCard.abilities.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          效果编辑器
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          可视化配置卡牌效果规则 — 支持 {patternCounts.attack} 种攻击 + {patternCounts.trainer} 种训练师 + {patternCounts.ability} 种特性模式
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: Card Selection + Status */}
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              选择卡牌
            </h2>
            {loading ? (
              <p className="text-sm text-zinc-400">加载卡牌数据...</p>
            ) : (
              <CardSearchBar cards={cards} onSelect={handleSelectCard} />
            )}
          </div>

          {selectedCard && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                卡牌状态
              </h2>
              <CardEffectStatus card={selectedCard} />
            </div>
          )}
        </div>

        {/* Right Column: Effect Builders + Preview */}
        <div className="space-y-6 lg:col-span-2">
          {!selectedCard && (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
              <div className="text-center">
                <p className="text-lg text-zinc-400">选择一张卡牌开始编辑</p>
                <p className="mt-1 text-sm text-zinc-300 dark:text-zinc-500">
                  搜索并点击左侧的卡牌来配置效果
                </p>
              </div>
            </div>
          )}

          {/* Attack Effects (for Pokemon) */}
          {selectedCard && hasAttacks && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <AttackEffectBuilder
                attacks={selectedCard.attacks!}
                initialSchemas={attackSchemas}
                onChange={setAttackSchemas}
              />
            </div>
          )}

          {/* Trainer Effects */}
          {selectedCard && isTrainer && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <TrainerEffectBuilder
                cardRules={selectedCard.rules}
                cardSubtypes={selectedCard.subtypes}
                initialSchema={trainerSchema}
                onChange={setTrainerSchema}
              />
            </div>
          )}

          {/* Ability Effects (for Pokemon with abilities) */}
          {selectedCard && hasAbilities && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <AbilityEffectBuilder
                abilities={selectedCard.abilities!}
                initialSchemas={abilitySchemas}
                onChange={setAbilitySchemas}
              />
            </div>
          )}

          {/* JSON Preview + Export */}
          {currentSchema && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <JsonPreview schema={currentSchema} validation={validation} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
