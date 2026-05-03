"use client";

import { useState, useEffect } from "react";
import { Card } from "@/types/card";

interface CardSearchProps {
  cards: Card[];
  onResults: (filtered: Card[]) => void;
  availableTypes: string[];
  availableSets: string[];
}

type Supertype = "all" | "Pokémon" | "Trainer" | "Energy";

export default function CardSearch({
  cards,
  onResults,
  availableTypes,
  availableSets,
}: CardSearchProps) {
  const [query, setQuery] = useState("");
  const [supertype, setSupertype] = useState<Supertype>("all");
  const [selectedType, setSelectedType] = useState("");
  const [selectedSet, setSelectedSet] = useState("");
  const [standardOnly, setStandardOnly] = useState(false);

  useEffect(() => {
    let filtered = cards;

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (supertype !== "all") {
      filtered = filtered.filter((c) => c.supertype === supertype);
    }

    if (selectedType) {
      filtered = filtered.filter(
        (c) => c.types && c.types.includes(selectedType)
      );
    }

    if (selectedSet) {
      filtered = filtered.filter((c) => c.set === selectedSet);
    }

    if (standardOnly) {
      filtered = filtered.filter((c) => c.legalities.standard === "Legal");
    }

    onResults(filtered);
  }, [cards, query, supertype, selectedType, selectedSet, standardOnly, onResults]);

  return (
    <div className="space-y-3" data-testid="card-search">
      {/* Search input */}
      <input
        type="text"
        placeholder="搜索卡牌名称..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        data-testid="search-input"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Supertype filter */}
        <select
          value={supertype}
          onChange={(e) => setSupertype(e.target.value as Supertype)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="filter-supertype"
        >
          <option value="all">全部类型</option>
          <option value="Pokémon">宝可梦</option>
          <option value="Trainer">训练家</option>
          <option value="Energy">能量</option>
        </select>

        {/* Pokemon type filter */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="filter-type"
        >
          <option value="">全部属性</option>
          {availableTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        {/* Set filter */}
        <select
          value={selectedSet}
          onChange={(e) => setSelectedSet(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          data-testid="filter-set"
        >
          <option value="">全部系列</option>
          {availableSets.map((set) => (
            <option key={set} value={set}>
              {set}
            </option>
          ))}
        </select>

        {/* Standard only toggle */}
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={standardOnly}
            onChange={(e) => setStandardOnly(e.target.checked)}
            className="rounded"
            data-testid="filter-standard"
          />
          仅 Standard
        </label>
      </div>
    </div>
  );
}
