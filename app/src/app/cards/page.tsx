import CardBrowser from "./CardBrowser";

export default function CardsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        卡牌图鉴
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        浏览 Scarlet &amp; Violet 系列全部卡牌，支持搜索和过滤。
      </p>
      <div className="mt-6">
        <CardBrowser />
      </div>
    </div>
  );
}
