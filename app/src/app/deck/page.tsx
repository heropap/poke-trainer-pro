import DeckPageClient from "./DeckPageClient";

export default function DeckPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        卡组管理
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        导入 PTCG Live 卡组代码，自动验证 Standard 合规性。
      </p>
      <div className="mt-6">
        <DeckPageClient />
      </div>
    </div>
  );
}
