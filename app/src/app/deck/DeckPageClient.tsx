"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/types/card";
import DeckImport from "@/components/deck/DeckImport";
import { useDeckContext } from "@/components/deck/DeckContext";
import { DeckValidation } from "@/lib/deck-parser";
import { StoredDeck } from "@/services/deck-storage";
import { parseDeckList, validateDeck } from "@/lib/deck-parser";
import { PREBUILT_DECKS, PrebuiltDeck } from "@/data/prebuilt-decks";
import Link from "next/link";

export default function DeckPageClient() {
  const [cardIndex, setCardIndex] = useState<Map<string, Card>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<StoredDeck | null>(null);
  const { decks, importDeck, removeDeck } = useDeckContext();

  const [nameIndex, setNameIndex] = useState<Map<string, Card[]>>(new Map());

  useEffect(() => {
    async function loadData() {
      const data = await import("@/data/cards/_index.json");
      const cards = data.default as Card[];
      const idMap = new Map<string, Card>();
      const nMap = new Map<string, Card[]>();
      cards.forEach((c) => {
        idMap.set(c.id, c);
        const key = c.name.toLowerCase();
        const arr = nMap.get(key);
        if (arr) arr.push(c);
        else nMap.set(key, [c]);
      });
      setCardIndex(idMap);
      setNameIndex(nMap);
      setLoading(false);
    }
    loadData();
  }, []);

  const cardLookup = useCallback(
    (id: string) => cardIndex.get(id),
    [cardIndex]
  );

  const nameLookup = useCallback(
    (name: string) => nameIndex.get(name.toLowerCase()) ?? [],
    [nameIndex]
  );

  const handleDeckImported = useCallback(
    (validation: DeckValidation, deckText: string) => {
      const saved = importDeck(validation, deckText);
      setLastSaved(saved);
    },
    [importDeck]
  );

  const handleImportPrebuilt = useCallback(
    (prebuilt: PrebuiltDeck) => {
      const parsed = parseDeckList(prebuilt.deckText);
      const result = validateDeck(parsed, cardLookup, nameLookup);
      const saved = importDeck(result, prebuilt.deckText);
      setLastSaved(saved);
    },
    [cardLookup, nameLookup, importDeck]
  );

  if (loading) {
    return (
      <div className="py-16 text-center text-zinc-500">
        加载卡牌数据中...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Prebuilt Decks — Quick Import */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          示例卡组
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          一键导入预置卡组，无需手动粘贴代码即可开始对战。
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PREBUILT_DECKS.map((prebuilt) => {
            const alreadyImported = decks.some(
              (d) => d.name === `${prebuilt.name} 卡组` || d.deckText.trim() === prebuilt.deckText.trim()
            );
            return (
              <div
                key={prebuilt.name}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {prebuilt.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {prebuilt.archetype}
                    </p>
                  </div>
                  <button
                    onClick={() => handleImportPrebuilt(prebuilt)}
                    disabled={alreadyImported}
                    className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      alreadyImported
                        ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    }`}
                  >
                    {alreadyImported ? "已导入" : "导入"}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-zinc-400">
                  {prebuilt.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <DeckImport cardLookup={cardLookup} nameLookup={nameLookup} onDeckImported={handleDeckImported} />

      {/* Save confirmation */}
      {lastSaved && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-300">
                卡组已保存: {lastSaved.name}
              </p>
              <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
                {lastSaved.totalCards} 张卡牌 · {lastSaved.isValid ? "合法" : "不合法"}
              </p>
            </div>
            <Link
              href="/battle"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              前往对战 →
            </Link>
          </div>
        </div>
      )}

      {/* Saved decks list */}
      {decks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            已保存的卡组 ({decks.length})
          </h3>
          <div className="mt-3 space-y-2">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {deck.name}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {deck.totalCards} 张 ·{" "}
                    {deck.isValid ? (
                      <span className="text-green-500">合法</span>
                    ) : (
                      <span className="text-red-500">不合法</span>
                    )}
                    {" · "}
                    {new Date(deck.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <button
                  onClick={() => removeDeck(deck.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
