"use client";

/**
 * AbilityEffectBuilder — visual builder for ability effects.
 *
 * Abilities differ from attacks/trainers:
 * - Each ability has a SINGLE pattern (not multi-step)
 * - Abilities have a sub-type: passive, on_evolve, or activated
 */

import { useState, useCallback } from "react";
import { CardAbility } from "@/types/card";
import {
  abilityPatterns,
  getPatternsBySubCategory,
  getSubCategoryLabels,
  getPatternById,
  ParamDef,
} from "@/engine/effects/pattern-catalog";
import type { AbilitySchema, AbilityEffectStep } from "@/engine/effects/effect-schema";

interface AbilityEffectBuilderProps {
  abilities: CardAbility[];
  initialSchemas?: AbilitySchema[];
  onChange: (schemas: AbilitySchema[]) => void;
}

function ParamInput({ param, value, onChange }: {
  param: ParamDef;
  value: number | string | boolean;
  onChange: (val: number | string | boolean) => void;
}) {
  if (param.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-zinc-300 dark:border-zinc-600"
        />
        <span className="text-zinc-700 dark:text-zinc-300">{param.label}</span>
      </label>
    );
  }
  if (param.type === "number") {
    return (
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-700 dark:text-zinc-300 min-w-[80px]">{param.label}</label>
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          min={param.min}
          max={param.max}
          className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
        {param.hint && <span className="text-xs text-zinc-400">{param.hint}</span>}
      </div>
    );
  }
  if (param.options) {
    return (
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-700 dark:text-zinc-300 min-w-[80px]">{param.label}</label>
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {param.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }
  return null;
}

function SingleAbilityBuilder({
  ability,
  schema,
  onChange,
}: {
  ability: CardAbility;
  schema?: AbilitySchema;
  onChange: (schema: AbilitySchema) => void;
}) {
  const [patternId, setPatternId] = useState<string>(schema?.effect?.type || "");
  const [params, setParams] = useState<Record<string, number | string | boolean>>(
    () => (schema?.effect?.params as Record<string, number | string | boolean>) || {}
  );

  const groups = getPatternsBySubCategory("ability");
  const labels = getSubCategoryLabels("ability");
  const pattern = abilityPatterns.find((p) => p.id === patternId);

  const handlePatternChange = useCallback(
    (newId: string) => {
      setPatternId(newId);
      const newPattern = getPatternById(newId);
      if (newPattern) {
        const defaults: Record<string, number | string | boolean> = {};
        newPattern.params.forEach((p) => { defaults[p.name] = p.defaultValue; });
        setParams(defaults);
        onChange({
          name: ability.name,
          effect: { type: newId, params: defaults } as AbilityEffectStep,
        });
      }
    },
    [ability.name, onChange]
  );

  const handleParamChange = useCallback(
    (name: string, value: number | string | boolean) => {
      const newParams = { ...params, [name]: value };
      setParams(newParams);
      if (patternId) {
        onChange({
          name: ability.name,
          effect: { type: patternId, params: newParams } as AbilityEffectStep,
        });
      }
    },
    [ability.name, patternId, params, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          {ability.type}
        </span>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{ability.name}</span>
      </div>
      {ability.text && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded p-2">
          {ability.text}
        </p>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <select
          value={patternId}
          onChange={(e) => handlePatternChange(e.target.value)}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">-- 选择特性模式 --</option>
          {Array.from(groups).map(([sub, patterns]) => (
            <optgroup key={sub} label={labels[sub] || sub}>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>{p.label} ({p.labelEn})</option>
              ))}
            </optgroup>
          ))}
        </select>

        {pattern && (
          <div className="space-y-2 mt-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{pattern.description}</p>
            {pattern.usesPrompt && (
              <span className="inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                💬 需要选择
              </span>
            )}
            {pattern.params.map((paramDef) => (
              <ParamInput
                key={paramDef.name}
                param={paramDef}
                value={params[paramDef.name] ?? paramDef.defaultValue}
                onChange={(val) => handleParamChange(paramDef.name, val)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AbilityEffectBuilder({
  abilities,
  initialSchemas,
  onChange,
}: AbilityEffectBuilderProps) {
  const [schemas, setSchemas] = useState<AbilitySchema[]>(
    () => initialSchemas || abilities.map((a) => ({ name: a.name, effect: {} as AbilityEffectStep }))
  );

  const handleAbilityChange = useCallback(
    (index: number, schema: AbilitySchema) => {
      const newSchemas = [...schemas];
      newSchemas[index] = schema;
      setSchemas(newSchemas);
      onChange(newSchemas);
    },
    [schemas, onChange]
  );

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        特性效果配置
      </h4>
      {abilities.map((ab, i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
        >
          <SingleAbilityBuilder
            ability={ab}
            schema={schemas[i]}
            onChange={(s) => handleAbilityChange(i, s)}
          />
        </div>
      ))}
    </div>
  );
}
