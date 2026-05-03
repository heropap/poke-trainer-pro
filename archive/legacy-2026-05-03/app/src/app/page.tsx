export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <div className="flex flex-col items-center gap-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Poke-Trainer Pro
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Pokemon TCG 对战模拟器 — 全环境覆盖的智能训练平台。
          基于现代规则引擎，支持 Standard 环境下所有主流卡组。
        </p>
        <div className="flex gap-4">
          <a
            href="/deck"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            导入卡组
          </a>
          <a
            href="/battle"
            className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            开始对战
          </a>
        </div>
      </div>
    </div>
  );
}
