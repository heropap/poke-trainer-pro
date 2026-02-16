"use client";

import React, { useState } from "react";
import { GameState, GameCard, StatusCondition } from "@/engine/game-state";
import { ManualOverrideType } from "@/engine/manual-override";

// ─── Types ───

interface ActionFeedback {
  success: boolean;
  error?: string;
}

interface ManualToolkitProps {
  gameState: GameState;
  playerIndex: 0 | 1;
  onAction: (action: any) => ActionFeedback | void;
  isOpen: boolean;
  onToggle: () => void;
}

// ─── Override definitions (labels + param types) ───

interface OverrideDef {
  type: ManualOverrideType;
  label: string;
  icon: string;
  group: string;
  needsTarget?: boolean;
  needsCount?: boolean;
  needsFilter?: boolean;
  needsEnergyType?: boolean;
  needsStatus?: boolean;
  needsCardAndTarget?: boolean;
  defaultCount?: number;
}

const OVERRIDES: OverrideDef[] = [
  // Deck operations
  { type: "draw_cards", label: "抽牌", icon: "📤", group: "deck", needsCount: true, defaultCount: 1 },
  { type: "search_deck", label: "搜索牌组", icon: "🔍", group: "deck", needsFilter: true, needsCount: true, defaultCount: 1 },
  { type: "search_discard", label: "搜索弃牌堆", icon: "♻️", group: "deck", needsFilter: true, needsCount: true, defaultCount: 1 },
  { type: "shuffle_hand_draw", label: "洗手抽牌", icon: "🔄", group: "deck", needsCount: true, defaultCount: 5 },
  { type: "discard_hand", label: "弃全部手牌", icon: "🗑️", group: "deck" },

  // Field operations
  { type: "add_damage", label: "加伤害", icon: "💥", group: "field", needsTarget: true, needsCount: true, defaultCount: 30 },
  { type: "heal", label: "治疗", icon: "💚", group: "field", needsTarget: true, needsCount: true, defaultCount: 30 },
  { type: "apply_status", label: "施加状态", icon: "⚡", group: "field", needsTarget: true, needsStatus: true },
  { type: "remove_status", label: "清除状态", icon: "✨", group: "field", needsTarget: true },

  // Movement operations
  { type: "force_switch_self", label: "换自己活跃", icon: "🔀", group: "move", needsTarget: true },
  { type: "force_switch_opponent", label: "换对手活跃", icon: "🎯", group: "move", needsTarget: true },
  { type: "force_evolve", label: "强制进化", icon: "⬆️", group: "move", needsCardAndTarget: true },

  // Resource operations
  { type: "attach_energy_from_nowhere", label: "附加能量", icon: "🔋", group: "resource", needsTarget: true, needsEnergyType: true },
];

const FILTER_OPTIONS = [
  { value: "any", label: "任意" },
  { value: "pokemon", label: "宝可梦" },
  { value: "basic_pokemon", label: "基础宝可梦" },
  { value: "trainer", label: "训练师" },
  { value: "supporter", label: "支持者" },
  { value: "item", label: "物品" },
  { value: "energy", label: "能量" },
];

const STATUS_OPTIONS: StatusCondition[] = ["poisoned", "burned", "asleep", "confused", "paralyzed"];

const ENERGY_TYPE_OPTIONS = [
  "Fire", "Water", "Grass", "Lightning", "Psychic",
  "Fighting", "Darkness", "Metal", "Colorless",
];

const GROUP_LABELS: Record<string, string> = {
  deck: "牌组操作",
  field: "场地操作",
  move: "移动操作",
  resource: "资源操作",
};

// ─── Component ───

export function ManualToolkit({
  gameState,
  playerIndex,
  onAction,
  isOpen,
  onToggle,
}: ManualToolkitProps) {
  const [expandedAction, setExpandedAction] = useState<ManualOverrideType | null>(null);

  // Parameter states
  const [count, setCount] = useState(1);
  const [filter, setFilter] = useState("any");
  const [energyType, setEnergyType] = useState("Fire");
  const [status, setStatus] = useState<StatusCondition>("poisoned");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const me = gameState.players[playerIndex];
  const opp = gameState.players[playerIndex === 0 ? 1 : 0];

  // Collect all Pokemon in play (for target selection)
  const allPokemonInPlay: { id: string; name: string; owner: string }[] = [];
  if (me.active) allPokemonInPlay.push({ id: me.active.instanceId, name: `[己] ${me.active.card.name}`, owner: "me" });
  for (const c of me.bench.cards) allPokemonInPlay.push({ id: c.instanceId, name: `[己] ${c.card.name}`, owner: "me" });
  if (opp.active) allPokemonInPlay.push({ id: opp.active.instanceId, name: `[对] ${opp.active.card.name}`, owner: "opp" });
  for (const c of opp.bench.cards) allPokemonInPlay.push({ id: c.instanceId, name: `[对] ${c.card.name}`, owner: "opp" });

  // My bench Pokemon (for switch_self)
  const myBench = me.bench.cards.map(c => ({ id: c.instanceId, name: c.card.name }));
  const oppBench = opp.bench.cards.map(c => ({ id: c.instanceId, name: c.card.name }));

  // Evolution cards in hand
  const evoCardsInHand = me.hand.cards.filter(c =>
    c.card.supertype === "Pokémon" && (c.card.subtypes?.includes("Stage 1") || c.card.subtypes?.includes("Stage 2"))
  );

  function executeOverride(def: OverrideDef) {
    const params: Record<string, any> = {};

    if (def.needsCount) params.count = count;
    if (def.needsFilter) params.filter = filter;
    if (def.needsEnergyType) params.energyType = energyType;
    if (def.needsStatus) params.status = status;

    // Target routing
    if (def.type === "force_switch_self") {
      params.benchInstanceId = selectedTargetId;
    } else if (def.type === "force_switch_opponent") {
      params.benchInstanceId = selectedTargetId;
    } else if (def.type === "force_evolve") {
      params.cardId = selectedCardId;
      params.targetInstanceId = selectedTargetId;
    } else if (def.needsTarget) {
      params.targetInstanceId = selectedTargetId;
    }

    // For add_damage, "count" maps to "amount"
    if (def.type === "add_damage" || def.type === "heal") {
      params.amount = count;
      delete params.count;
    }

    const result = onAction({
      type: "manual_override",
      overrideType: def.type,
      params,
    });

    if (result && "success" in result) {
      setFeedback({
        text: result.success ? `${def.label} 成功` : `失败: ${result.error}`,
        ok: result.success,
      });
    }

    setTimeout(() => setFeedback(null), 2000);
    setExpandedAction(null);
  }

  if (!isOpen) return null;

  const groups = ["deck", "field", "move", "resource"];

  return (
    <div className="absolute right-0 top-0 z-30 flex h-full w-72 flex-col border-l border-yellow-500/30 bg-zinc-900/95 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="text-sm font-bold text-yellow-400">Manual Mode</span>
        </div>
        <button
          onClick={onToggle}
          className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div className={`mx-2 mt-2 rounded px-3 py-1.5 text-xs font-medium ${
          feedback.ok ? "bg-green-600/80 text-white" : "bg-red-600/80 text-white"
        }`}>
          {feedback.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map(group => (
          <div key={group} className="mb-3">
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {GROUP_LABELS[group]}
            </div>
            <div className="flex flex-col gap-1">
              {OVERRIDES.filter(o => o.group === group).map(def => (
                <div key={def.type}>
                  <button
                    onClick={() => {
                      if (expandedAction === def.type) {
                        setExpandedAction(null);
                      } else {
                        setExpandedAction(def.type);
                        setCount(def.defaultCount ?? 1);
                        setSelectedTargetId(allPokemonInPlay[0]?.id ?? "");
                        setSelectedCardId(evoCardsInHand[0]?.instanceId ?? "");
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      expandedAction === def.type
                        ? "bg-yellow-500/20 text-yellow-300"
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    <span>{def.icon}</span>
                    <span>{def.label}</span>
                  </button>

                  {/* Expanded parameter form */}
                  {expandedAction === def.type && (
                    <div className="ml-6 mt-1 flex flex-col gap-1.5 rounded bg-zinc-800/60 p-2">
                      {/* Count input */}
                      {def.needsCount && (
                        <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                          数量:
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={count}
                            onChange={(e) => setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                            className="w-14 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-white"
                          />
                        </label>
                      )}

                      {/* Filter select */}
                      {def.needsFilter && (
                        <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                          类型:
                          <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="flex-1 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-white"
                          >
                            {FILTER_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Target select */}
                      {def.needsTarget && !def.needsCardAndTarget && (
                        <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                          目标:
                          <select
                            value={selectedTargetId}
                            onChange={(e) => setSelectedTargetId(e.target.value)}
                            className="flex-1 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-white"
                          >
                            {(def.type === "force_switch_self"
                              ? myBench
                              : def.type === "force_switch_opponent"
                              ? oppBench
                              : allPokemonInPlay
                            ).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Force evolve: card + target */}
                      {def.needsCardAndTarget && (
                        <>
                          <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                            进化卡:
                            <select
                              value={selectedCardId}
                              onChange={(e) => setSelectedCardId(e.target.value)}
                              className="flex-1 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-white"
                            >
                              {evoCardsInHand.map(c => (
                                <option key={c.instanceId} value={c.instanceId}>{c.card.name}</option>
                              ))}
                              {evoCardsInHand.length === 0 && (
                                <option value="">无进化卡</option>
                              )}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                            目标:
                            <select
                              value={selectedTargetId}
                              onChange={(e) => setSelectedTargetId(e.target.value)}
                              className="flex-1 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-white"
                            >
                              {allPokemonInPlay.filter(p => p.owner === "me").map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}

                      {/* Energy type select */}
                      {def.needsEnergyType && (
                        <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                          类型:
                          <select
                            value={energyType}
                            onChange={(e) => setEnergyType(e.target.value)}
                            className="flex-1 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-white"
                          >
                            {ENERGY_TYPE_OPTIONS.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Status select */}
                      {def.needsStatus && (
                        <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                          状态:
                          <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as StatusCondition)}
                            className="flex-1 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-white"
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Execute button */}
                      <button
                        onClick={() => executeOverride(def)}
                        className="mt-1 rounded bg-yellow-500 px-3 py-1 text-xs font-bold text-black hover:bg-yellow-400"
                      >
                        执行
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-700 px-3 py-2 text-[9px] text-zinc-500">
        手动操作绕过游戏规则。使用后对局不计入正式记录。
      </div>
    </div>
  );
}
