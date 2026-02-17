"use client";

import { useState, useEffect } from "react";
import { Card } from "@/types/card";
import { initializeEffects, getRegisteredCardIds, getRegisteredCardNames } from "@/engine/effects";
import { generateCoverageReport, CoverageReport } from "@/engine/effects/coverage-report";
import Link from "next/link";

export default function StatsPageClient() {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const cardsData: Card[] = (await import("@/data/cards/_index.json")).default as Card[];

      // Initialize effects (idempotent — registerAll overwrites)
      initializeEffects(cardsData);

      const ids = getRegisteredCardIds();
      const names = getRegisteredCardNames();
      const rpt = generateCoverageReport(cardsData, ids, names);

      setReport(rpt);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-pulse text-zinc-400">加载统计数据中...</div>
      </div>
    );
  }

  if (!report) return null;
  const { stats } = report;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">效果覆盖统计</h1>
        <Link href="/battle" className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200">
          返回对战
        </Link>
      </div>

      {/* Section 1: Overall coverage hero */}
      <div className="mb-8 rounded-xl border border-zinc-700 bg-zinc-800 p-6">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="text-4xl font-black text-white">{stats.coveragePercent}%</span>
          <span className="text-sm text-zinc-400">效果覆盖率</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700"
            style={{ width: `${stats.coveragePercent}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
          <span>总卡牌名: <strong className="text-zinc-200">{stats.total}</strong></span>
          <span>需要效果: <strong className="text-zinc-200">{stats.effectWorthy}</strong></span>
          <span>已覆盖: <strong className="text-green-400">{stats.covered.total}</strong></span>
          <span>未覆盖: <strong className="text-red-400">{stats.uncoveredCount}</strong></span>
        </div>
      </div>

      {/* Section 2: By-supertype cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {Object.entries(stats.bySupertype)
          .sort()
          .map(([st, stStats]) => (
            <div key={st} className="rounded-xl border border-zinc-700 bg-zinc-800 p-4">
              <div className="mb-2 text-sm font-bold text-zinc-300">{st}</div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-700">
                <div
                  className={`h-full rounded-full ${
                    stStats.percent > 75
                      ? "bg-green-500"
                      : stStats.percent > 50
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${stStats.percent}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {stStats.covered}/{stStats.total} ({stStats.percent}%)
              </div>
            </div>
          ))}
      </div>

      {/* Section 3: By-layer breakdown */}
      <div className="mb-8 rounded-xl border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-4 text-lg font-bold text-zinc-200">按层级分布</h2>
        {[
          { label: "L1 (ID 手写)", count: stats.covered.layer1_id, color: "bg-green-500" },
          { label: "L2 (名称手写)", count: stats.covered.layer2_name, color: "bg-green-400" },
          { label: "L3 (Ryuu 解析)", count: stats.covered.layer3_ryuu, color: "bg-yellow-500" },
          { label: "L4 (文本解析)", count: stats.covered.layer4_textParser, color: "bg-yellow-400" },
          { label: "未覆盖", count: stats.uncoveredCount, color: "bg-red-500" },
        ].map((layer) => (
          <div key={layer.label} className="mb-2 flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-zinc-400">{layer.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-700">
              <div
                className={`h-full rounded-full ${layer.color}`}
                style={{
                  width: `${stats.effectWorthy > 0 ? (layer.count / stats.effectWorthy) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs text-zinc-400">{layer.count}</span>
          </div>
        ))}
      </div>

      {/* Section 4: Uncovered cards list */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-4 text-lg font-bold text-zinc-200">
          未覆盖卡牌 ({report.uncovered.length})
        </h2>
        {report.uncovered.length === 0 ? (
          <p className="text-sm text-zinc-500">所有效果卡牌均已覆盖!</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-800">
                <tr className="text-left text-zinc-500">
                  <th className="pb-2 pr-2">名称</th>
                  <th className="pb-2 pr-2">类型</th>
                  <th className="pb-2 pr-2">字段</th>
                  <th className="pb-2">示例文本</th>
                </tr>
              </thead>
              <tbody>
                {report.uncovered.slice(0, 100).map((uc, i) => (
                  <tr key={i} className="border-t border-zinc-700/50">
                    <td className="py-1.5 pr-2 font-medium text-zinc-300">{uc.name}</td>
                    <td className="py-1.5 pr-2 text-zinc-500">{uc.supertype}</td>
                    <td className="py-1.5 pr-2 text-zinc-500">
                      {[uc.hasAttacks && "ATK", uc.hasAbilities && "ABL", uc.hasRules && "RUL"]
                        .filter(Boolean)
                        .join("+")}
                    </td>
                    <td className="max-w-xs truncate py-1.5 text-zinc-600">{uc.sampleText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.uncovered.length > 100 && (
              <div className="mt-2 text-xs text-zinc-600">
                ...及其他 {report.uncovered.length - 100} 张卡牌
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          手写效果 (L1/L2)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />
          自动解析 (L3/L4)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          未实现
        </div>
      </div>
    </div>
  );
}
