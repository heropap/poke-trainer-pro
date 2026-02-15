"use client";

import { useState, useCallback } from "react";
import { parseDeckList, validateDeck, DeckValidation } from "@/lib/deck-parser";
import { Card } from "@/types/card";

interface DeckImportProps {
  cardLookup: (id: string) => Card | undefined;
  onDeckImported?: (validation: DeckValidation) => void;
}

const SAMPLE_DECK = `Pokémon: 15
4 Charmander OBF 26
3 Charmeleon OBF 27
3 Charizard ex OBF 125
2 Pidgey OBF 162
2 Pidgeot ex OBF 164
1 Lumineon V BRS 40

Trainer: 33
4 Rare Candy SVI 191
4 Ultra Ball SVI 196
4 Nest Ball SVI 181
4 Battle VIP Pass FST 225
3 Boss's Orders PAL 172
3 Professor's Research SVI 190
2 Iono PAL 185
2 Super Rod PAL 188
2 Lost Vacuum LOR 162
1 Forest Seal Stone SIT 156
1 Pal Pad SVI 182
1 Artazon PAL 171
1 Beach Court SVI 167
1 Counter Catcher PAR 160

Energy: 12
12 Basic Fire Energy SVE 2

Total Cards: 60`;

export default function DeckImport({
  cardLookup,
  onDeckImported,
}: DeckImportProps) {
  const [deckText, setDeckText] = useState("");
  const [validation, setValidation] = useState<DeckValidation | null>(null);
  const [showSample, setShowSample] = useState(false);

  const handleImport = useCallback(() => {
    const parsed = parseDeckList(deckText);
    const result = validateDeck(parsed, cardLookup);
    setValidation(result);
    onDeckImported?.(result);
  }, [deckText, cardLookup, onDeckImported]);

  const handleLoadSample = useCallback(() => {
    setDeckText(SAMPLE_DECK);
    setValidation(null);
    setShowSample(false);
  }, []);

  const handleClear = useCallback(() => {
    setDeckText("");
    setValidation(null);
  }, []);

  return (
    <div className="space-y-4" data-testid="deck-import">
      {/* Input Area */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            粘贴 PTCG Live 卡组代码
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSample(!showSample)}
              className="text-xs text-blue-500 hover:text-blue-600"
              type="button"
            >
              {showSample ? "隐藏示例" : "查看示例格式"}
            </button>
          </div>
        </div>

        {showSample && (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-800 dark:bg-blue-950">
            <pre className="whitespace-pre-wrap text-blue-800 dark:text-blue-200">
              {`Pokémon: 4\n4 Pikachu SVI 50\n\nTrainer: 4\n4 Professor's Research SVI 190\n\nEnergy: 4\n4 Basic Fire Energy SVE 2`}
            </pre>
            <button
              onClick={handleLoadSample}
              className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              type="button"
            >
              加载完整示例卡组
            </button>
          </div>
        )}

        <textarea
          value={deckText}
          onChange={(e) => {
            setDeckText(e.target.value);
            setValidation(null);
          }}
          placeholder={`粘贴卡组代码，格式如:\nPokémon: 4\n4 Pikachu SVI 50\n\nTrainer: 4\n4 Professor's Research SVI 190\n\nEnergy: 4\n4 Basic Fire Energy SVE 2`}
          rows={12}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="deck-textarea"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleImport}
          disabled={!deckText.trim()}
          className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          data-testid="import-button"
        >
          导入并验证
        </button>
        <button
          onClick={handleClear}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          data-testid="clear-button"
        >
          清空
        </button>
      </div>

      {/* Validation Results */}
      {validation && (
        <div className="space-y-3" data-testid="validation-results">
          {/* Summary */}
          <div
            className={`rounded-lg p-4 ${
              validation.isValid
                ? "border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : "border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {validation.isValid ? "✓" : "✗"}
              </span>
              <span
                className={`font-medium ${
                  validation.isValid
                    ? "text-green-700 dark:text-green-300"
                    : "text-red-700 dark:text-red-300"
                }`}
              >
                {validation.isValid ? "卡组合法" : "卡组不合法"}
              </span>
              <span className="text-sm text-zinc-500">
                — {validation.totalCards} 张卡牌
              </span>
            </div>
          </div>

          {/* Errors */}
          {validation.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-300">
                错误
              </h4>
              <ul className="mt-1 space-y-1">
                {validation.errors.map((err, i) => (
                  <li
                    key={i}
                    className="text-sm text-red-600 dark:text-red-400"
                  >
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
              <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                警告
              </h4>
              <ul className="mt-1 space-y-1">
                {validation.warnings.map((warn, i) => (
                  <li
                    key={i}
                    className="text-sm text-yellow-600 dark:text-yellow-400"
                  >
                    {warn}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Card List */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                  <th className="px-3 py-2 text-left font-medium text-zinc-500">
                    数量
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-500">
                    名称
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-500">
                    系列
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-500">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                {validation.cardDetails.map((detail, i) => (
                  <tr
                    key={i}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {detail.entry.quantity}x
                    </td>
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {detail.entry.name}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {detail.entry.setCode} {detail.entry.number}
                    </td>
                    <td className="px-3 py-2">
                      {!detail.cardId ? (
                        <span className="text-yellow-500">未知系列</span>
                      ) : !detail.found ? (
                        <span className="text-yellow-500">未找到</span>
                      ) : detail.standardLegal ? (
                        <span className="text-green-500">Standard</span>
                      ) : (
                        <span className="text-orange-500">非 Standard</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
