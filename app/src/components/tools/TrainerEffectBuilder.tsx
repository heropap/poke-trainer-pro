"use client";

/**
 * TrainerEffectBuilder — visual builder for trainer card effects.
 *
 * Allows selecting trainer effect patterns from the catalog and
 * configuring parameters. Supports multi-step trainer effects.
 */

import { useState, useCallback } from "react";
import {
  trainerPatterns,
  getPatternsBySubCategory,
  getSubCategoryLabels,
  getPatternById,
  ParamDef,
} from "@/engine/effects/pattern-catalog";
import type { TrainerSchema, TrainerEffectStep } from "@/engine/effects/effect-schema";

interface TrainerEffectBuilderProps {
  cardRules?: string[];
  cardSubtypes?: string[];
  initialSchema?: TrainerSchema;
  onChange: (schema: TrainerSchema) => void;
}

interface StepState {
  patternId: string;
  params: Record<string, number | string | boolean>;
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

function TrainerStepEditor({
  step,
  index,
  onUpdate,
  onRemove,
}: {
  step: StepState;
  index: number;
  onUpdate: (step: StepState) => void;
  onRemove: () => void;
}) {
  const groups = getPatternsBySubCategory("trainer");
  const labels = getSubCategoryLabels("trainer");
  const pattern = trainerPatterns.find((p) => p.id === step.patternId);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
        <select
          value={step.patternId}
          onChange={(e) => {
            const newPattern = getPatternById(e.target.value);
            if (newPattern) {
              const defaults: Record<string, number | string | boolean> = {};
              newPattern.params.forEach((p) => { defaults[p.name] = p.defaultValue; });
              onUpdate({ patternId: e.target.value, params: defaults });
            }
          }}
          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">-- 选择训练师效果 --</option>
          {Array.from(groups).map(([sub, patterns]) => (
            <optgroup key={sub} label={labels[sub] || sub}>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>{p.label} ({p.labelEn})</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          ✕
        </button>
      </div>

      {pattern && (
        <div className="space-y-2 ml-4">
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
              value={step.params[paramDef.name] ?? paramDef.defaultValue}
              onChange={(val) => {
                onUpdate({ ...step, params: { ...step.params, [paramDef.name]: val } });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrainerEffectBuilder({
  cardRules,
  cardSubtypes,
  initialSchema,
  onChange,
}: TrainerEffectBuilderProps) {
  const [steps, setSteps] = useState<StepState[]>(() => {
    if (initialSchema?.effects) {
      return initialSchema.effects.map((e) => ({
        patternId: e.type,
        params: e.params as Record<string, number | string | boolean>,
      }));
    }
    return [];
  });

  const updateSteps = useCallback(
    (newSteps: StepState[]) => {
      setSteps(newSteps);
      const effects: TrainerEffectStep[] = newSteps
        .filter((s) => s.patternId)
        .map((s) => ({
          type: s.patternId,
          params: s.params,
        })) as TrainerEffectStep[];
      onChange({ effects });
    },
    [onChange]
  );

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        训练师效果配置
      </h4>

      {/* Show card rules for reference */}
      {cardRules && cardRules.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">卡牌规则文本:</p>
          {cardRules.map((rule, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-300">{rule}</p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {steps.map((step, i) => (
          <TrainerStepEditor
            key={i}
            step={step}
            index={i}
            onUpdate={(updated) => {
              const newSteps = [...steps];
              newSteps[i] = updated;
              updateSteps(newSteps);
            }}
            onRemove={() => updateSteps(steps.filter((_, idx) => idx !== i))}
          />
        ))}
      </div>

      <button
        onClick={() => updateSteps([...steps, { patternId: "", params: {} }])}
        className="rounded border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:border-blue-400 hover:text-blue-500 dark:border-zinc-600 dark:hover:border-blue-500"
      >
        + 添加训练师效果
      </button>
    </div>
  );
}
