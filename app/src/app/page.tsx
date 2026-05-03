export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl text-center space-y-6">
        <p className="text-xs uppercase tracking-[0.4em] text-violet-300/70">
          v0 · tabula rasa
        </p>
        <h1 className="text-5xl font-semibold tracking-tight">
          Pokemon <span className="text-orange-400">TCG</span>
        </h1>
        <p className="text-base text-zinc-300/80 leading-relaxed">
          这是一次完全重置后的脚手架。三套官方大师卡组（喷火龙
          ex、密勒顿 ex、沙奈朵 ex）将逐 feature 接入。当前尚未实现卡牌、引擎或战场 UI。
        </p>
        <div className="text-sm text-zinc-400">
          下一步：F1 卡牌数据骨架 + 喷火龙 ex 卡组
        </div>
      </div>
    </main>
  );
}
