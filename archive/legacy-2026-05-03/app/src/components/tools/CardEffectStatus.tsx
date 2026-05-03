"use client";

/**
 * CardEffectStatus — displays the current effect coverage status of a card.
 *
 * Shows:
 * - Card info (name, supertype, attacks, abilities)
 * - Current effect registration status (which layer)
 * - Attack/ability/trainer details with their current effect definitions
 * - Coverage indicator (hand-written, JSON, text-parsed, none)
 */

import { Card } from "@/types/card";
import {
  getEffect,
  getEffectSource,
  hasEffect,
} from "@/engine/effects/effect-registry";
import type { EffectSourceLayer } from "@/engine/effects/effect-registry";
import type { CardEffectDef } from "@/engine/effects/effect-types";

interface CardEffectStatusProps {
  card: Card;
}

function layerLabel(layer: EffectSourceLayer | null): string {
  switch (layer) {
    case "L1": return "L1 — ID手写效果";
    case "L1.5": return "L1.5 — JSON定义";
    case "L2": return "L2 — 名字手写效果";
    case "L3": return "L3 — Ryuu元数据解析";
    case "L4": return "L4 — 文本自动解析";
    default: return "无覆盖";
  }
}

function layerColor(layer: EffectSourceLayer | null): string {
  switch (layer) {
    case "L1": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "L1.5": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "L2": return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400";
    case "L3": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "L4": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  }
}

function EnergyBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    Fire: "bg-red-500",
    Water: "bg-blue-500",
    Grass: "bg-green-500",
    Lightning: "bg-yellow-500",
    Psychic: "bg-purple-500",
    Fighting: "bg-orange-700",
    Darkness: "bg-zinc-700",
    Metal: "bg-gray-400",
    Dragon: "bg-amber-600",
    Fairy: "bg-pink-400",
    Colorless: "bg-gray-300",
  };
  return (
    <span className={`inline-block h-4 w-4 rounded-full ${colors[type] || "bg-gray-300"}`} title={type} />
  );
}

export default function CardEffectStatus({ card }: CardEffectStatusProps) {
  const source = getEffectSource(card.id, card.name);
  const effect = getEffect(card.id, card.name);
  const covered = hasEffect(card.id, card.name);

  return (
    <div className="space-y-4">
      {/* Card Header */}
      <div className="flex items-start gap-4">
        {card.images?.small && (
          <img
            src={card.images.small}
            alt={card.name}
            className="w-24 rounded-lg shadow-md"
          />
        )}
        <div className="flex-1">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {card.name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{card.supertype}</span>
            {card.subtypes?.map((s) => (
              <span key={s} className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{s}</span>
            ))}
            {card.hp && <span>HP {card.hp}</span>}
          </div>
          {card.types && (
            <div className="mt-1 flex gap-1">
              {card.types.map((t) => <EnergyBadge key={t} type={t} />)}
            </div>
          )}
          <div className="mt-1 text-xs text-zinc-400">ID: {card.id}</div>
        </div>
      </div>

      {/* Coverage Status */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">效果状态:</span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${layerColor(source)}`}>
            {layerLabel(source)}
          </span>
        </div>
      </div>

      {/* Attacks */}
      {card.attacks && card.attacks.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            攻击 ({card.attacks.length})
          </h4>
          <div className="space-y-2">
            {card.attacks.map((atk, i) => {
              const hasAttackEffect = effect?.attacks?.find((a) => a.name === atk.name);
              return (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {atk.cost?.map((c, ci) => <EnergyBadge key={ci} type={c} />)}
                    </div>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {atk.name}
                    </span>
                    {atk.damage && (
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">
                        {atk.damage}
                      </span>
                    )}
                    {hasAttackEffect ? (
                      <span className="ml-auto rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        有效果
                      </span>
                    ) : (
                      <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
                        无效果
                      </span>
                    )}
                  </div>
                  {atk.text && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{atk.text}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Abilities */}
      {card.abilities && card.abilities.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            特性 ({card.abilities.length})
          </h4>
          <div className="space-y-2">
            {card.abilities.map((ab, i) => {
              const hasAbilityEffect = effect?.abilities?.find((a) => a.name === ab.name);
              return (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {ab.type}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{ab.name}</span>
                    {hasAbilityEffect ? (
                      <span className="ml-auto rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        有效果
                      </span>
                    ) : (
                      <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
                        无效果
                      </span>
                    )}
                  </div>
                  {ab.text && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{ab.text}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trainer Rules */}
      {card.supertype === "Trainer" && card.rules && card.rules.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            训练师效果
          </h4>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {card.subtypes?.join(", ") || "Trainer"}
              </span>
              {effect?.trainer ? (
                <span className="ml-auto rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  有效果
                </span>
              ) : (
                <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
                  无效果
                </span>
              )}
            </div>
            {card.rules.map((rule, i) => (
              <p key={i} className="text-xs text-zinc-500 dark:text-zinc-400">{rule}</p>
            ))}
          </div>
        </div>
      )}

      {/* No coverage hint */}
      {!covered && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          此卡牌没有效果定义。你可以使用下方的效果构建器来添加。
        </div>
      )}
    </div>
  );
}
