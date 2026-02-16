import BattlePageClient from "./BattlePageClient";

export default function BattlePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        对战
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        选择卡组，开始 Pokemon TCG 对战。
      </p>
      <div className="mt-8">
        <BattlePageClient />
      </div>
    </div>
  );
}
