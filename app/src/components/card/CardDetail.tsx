"use client";

import { Card } from "@/types/card";

interface CardDetailProps {
  card: Card;
  onClose?: () => void;
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    Grass: "bg-green-500",
    Fire: "bg-red-500",
    Water: "bg-blue-500",
    Lightning: "bg-yellow-400",
    Psychic: "bg-purple-500",
    Fighting: "bg-orange-700",
    Darkness: "bg-zinc-700",
    Metal: "bg-gray-400",
    Dragon: "bg-amber-600",
    Fairy: "bg-pink-400",
    Colorless: "bg-zinc-300",
  };

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white ${colors[type] ?? "bg-zinc-500"}`}
      data-testid={`type-badge-${type}`}
    >
      {type}
    </span>
  );
}

export default function CardDetail({ card, onClose }: CardDetailProps) {
  return (
    <div
      className="w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      data-testid={`card-detail-${card.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {card.name}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span>{card.supertype}</span>
            {card.subtypes.length > 0 && (
              <>
                <span>·</span>
                <span>{card.subtypes.join(", ")}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {card.hp && (
            <span className="text-lg font-bold text-red-500">{card.hp} HP</span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="ml-2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="关闭"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Types */}
      {card.types && card.types.length > 0 && (
        <div className="mt-2 flex gap-1">
          {card.types.map((type) => (
            <TypeBadge key={type} type={type} />
          ))}
        </div>
      )}

      {/* Abilities */}
      {card.abilities && card.abilities.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            特性
          </h4>
          {card.abilities.map((ability, i) => (
            <div key={i} className="mt-1">
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {ability.name}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {ability.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Attacks */}
      {card.attacks && card.attacks.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            技能
          </h4>
          {card.attacks.map((attack, i) => (
            <div
              key={i}
              className="mt-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    {attack.cost.map((c, j) => (
                      <TypeBadge key={j} type={c} />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {attack.name}
                  </span>
                </div>
                {attack.damage && (
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {attack.damage}
                  </span>
                )}
              </div>
              {attack.text && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {attack.text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Weakness / Resistance / Retreat */}
      <div className="mt-3 flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        {card.weaknesses && card.weaknesses.length > 0 && (
          <div>
            <span className="font-semibold">弱点: </span>
            {card.weaknesses.map((w) => `${w.type} ${w.value}`).join(", ")}
          </div>
        )}
        {card.resistances && card.resistances.length > 0 && (
          <div>
            <span className="font-semibold">抵抗: </span>
            {card.resistances.map((r) => `${r.type} ${r.value}`).join(", ")}
          </div>
        )}
        {card.retreatCost && (
          <div>
            <span className="font-semibold">撤退: </span>
            {card.convertedRetreatCost}
          </div>
        )}
      </div>

      {/* Legality */}
      <div className="mt-3 flex gap-2 text-xs">
        {card.legalities.standard === "Legal" && (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-300">
            Standard
          </span>
        )}
        {card.legalities.expanded === "Legal" && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            Expanded
          </span>
        )}
      </div>

      {/* Flavor Text */}
      {card.flavorText && (
        <p className="mt-2 text-xs italic text-zinc-400 dark:text-zinc-500">
          {card.flavorText}
        </p>
      )}
    </div>
  );
}
