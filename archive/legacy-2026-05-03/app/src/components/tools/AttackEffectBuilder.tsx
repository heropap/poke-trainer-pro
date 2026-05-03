"use client";

/**
 * AttackEffectBuilder — visual builder for attack effects.
 *
 * For each attack on a card, allows:
 * - Selecting effect patterns from the catalog
 * - Configuring pattern parameters
 * - Adding multiple effect steps (multi-step attacks)
 * - Real-time preview of generated JSON
 */

import { useState, useCallback } from "react";
import { CardAttack } from "@/types/card";
import {
  attackPatterns,
  getPatternsBySubCategory,
  getSubCategoryLabels,
  getPatternById,
  PatternEntry,
  ParamDef,
} from "@/engine/effects/pattern-catalog";
import type { AttackSchema, AttackEffectStep } from "@/engine/effects/effect-schema";

interface AttackEffectBuilderProps {
  attacks: CardAttack[];
  initialSchemas?: AttackSchema[];
  onChange: (schemas: AttackSchema[]) => void;
}

interface AttackStepState {
  patternId: string;
  params: Record<string, number | string | boolean>;
}

function PatternParamInput({ param, value, onChange }: {
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
        {param.hint && <span className="text-xs text-zinc-400">({param.hint})</span>}
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

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-zinc-700 dark:text-zinc-300 min-w-[80px]">{param.label}</label>
      <input
        type="text"
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        className="w-48 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </div>
  );
}

function StepEditor({
  step,
  index,
  onUpdate,
  onRemove,
}: {
  step: AttackStepState;
  index: number;
  onUpdate: (step: AttackStepState) => void;
  onRemove: () => void;
}) {
  const groups = getPatternsBySubCategory("attack");
  const labels = getSubCategoryLabels("attack");
  const pattern = attackPatterns.find((p) => p.id === step.patternId);

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
          <option value="">-- 选择效果模式 --</option>
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
          title="删除此步骤"
        >
          ✕
        </button>
      </div>

      {pattern && (
        <div className="space-y-2 ml-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{pattern.description}</p>
          {pattern.usesCoinFlip && (
            <span className="inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              🪙 需要翻硬币
            </span>
          )}
          {pattern.usesPrompt && (
            <span className="inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
              💬 需要选择
            </span>
          )}
          {pattern.params.map((paramDef) => (
            <PatternParamInput
              key={paramDef.name}
              param={paramDef}
              value={step.params[paramDef.name] ?? paramDef.defaultValue}
              onChange={(val) => {
                onUpdate({
                  ...step,
                  params: { ...step.params, [paramDef.name]: val },
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SingleAttackBuilder({
  attack,
  schema,
  onChange,
}: {
  attack: CardAttack;
  schema?: AttackSchema;
  onChange: (schema: AttackSchema) => void;
}) {
  const [steps, setSteps] = useState<AttackStepState[]>(() => {
    if (schema?.effects) {
      return schema.effects.map((e) => ({
        patternId: e.type,
        params: e.params as Record<string, number | string | boolean>,
      }));
    }
    return [];
  });

  const updateSteps = useCallback(
    (newSteps: AttackStepState[]) => {
      setSteps(newSteps);
      const effects: AttackEffectStep[] = newSteps
        .filter((s) => s.patternId)
        .map((s) => ({
          type: s.patternId,
          params: s.params,
        })) as AttackEffectStep[];
      onChange({ name: attack.name, effects });
    },
    [attack.name, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{attack.name}</span>
        {attack.damage && (
          <span className="text-sm text-red-600 dark:text-red-400 font-bold">{attack.damage}</span>
        )}
        <span className="text-xs text-zinc-400">
          ({attack.cost?.join(", ") || "无费用"})
        </span>
      </div>
      {attack.text && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded p-2">
          {attack.text}
        </p>
      )}

      {/* Effect Steps */}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <StepEditor
            key={i}
            step={step}
            index={i}
            onUpdate={(updated) => {
              const newSteps = [...steps];
              newSteps[i] = updated;
              updateSteps(newSteps);
            }}
            onRemove={() => {
              const newSteps = steps.filter((_, idx) => idx !== i);
              updateSteps(newSteps);
            }}
          />
        ))}
      </div>

      <button
        onClick={() => updateSteps([...steps, { patternId: "", params: {} }])}
        className="rounded border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:border-blue-400 hover:text-blue-500 dark:border-zinc-600 dark:hover:border-blue-500"
      >
        + 添加效果步骤
      </button>
    </div>
  );
}

export default function AttackEffectBuilder({
  attacks,
  initialSchemas,
  onChange,
}: AttackEffectBuilderProps) {
  const [schemas, setSchemas] = useState<AttackSchema[]>(
    () => initialSchemas || attacks.map((a) => ({ name: a.name, effects: [] }))
  );

  const handleAttackChange = useCallback(
    (index: number, schema: AttackSchema) => {
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
        攻击效果配置
      </h4>
      {attacks.map((atk, i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
        >
          <SingleAttackBuilder
            attack={atk}
            schema={schemas[i]}
            onChange={(s) => handleAttackChange(i, s)}
          />
        </div>
      ))}
    </div>
  );
}
