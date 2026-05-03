import Link from "next/link";

const DECKS = [
  {
    slug: "charizard-ex",
    name: "喷火龙 ex 大师卡组",
    description: "火系 Stage 2 进化，Pidgeot ex 检索引擎",
    accent: "from-orange-600/40 to-red-700/30",
  },
  {
    slug: "miraidon-ex",
    name: "密勒顿 ex 大师卡组",
    description: "雷系基础 ex swarm，Tandem Unit 一回合铺场",
    accent: "from-yellow-500/40 to-violet-600/30",
  },
  {
    slug: "gardevoir-ex",
    name: "沙奈朵 ex 大师卡组",
    description: "超能系 Stage 2，Psychic Embrace 弃牌区回挂",
    accent: "from-violet-600/40 to-pink-600/30",
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16 gap-12">
      <div className="text-center space-y-3 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.4em] text-violet-300/70">
          v0 · 选择卡组
        </p>
        <h1 className="text-5xl font-semibold tracking-tight">
          Pokemon <span className="text-orange-400">TCG</span>
        </h1>
        <p className="text-sm text-zinc-300/80">
          单人 PvE · 桌面浏览器 · PTCG Live 风格 UI
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl w-full">
        {DECKS.map((deck) => (
          <DeckChoice key={deck.slug} {...deck} />
        ))}
      </div>

      <div className="text-xs text-zinc-500 text-center">
        点选你方卡组开始对战，对手将随机使用另一套
      </div>
    </main>
  );
}

function DeckChoice({
  slug,
  name,
  description,
  accent,
}: {
  slug: string;
  name: string;
  description: string;
  accent: string;
}) {
  // Pick a different opponent deck
  const decks = ["charizard-ex", "miraidon-ex", "gardevoir-ex"];
  const oppDeck = decks.find((d) => d !== slug) ?? "miraidon-ex";

  return (
    <Link
      href={`/battle?deck=${slug}&opp=${oppDeck}&seed=${Date.now() & 0xfffff}`}
      className={`block rounded-xl border border-zinc-800 bg-gradient-to-br ${accent} p-6 transition-all hover:scale-[1.02] hover:border-violet-500/60 hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]`}
    >
      <div className="text-lg font-semibold text-zinc-100 mb-2">{name}</div>
      <div className="text-xs text-zinc-300/80">{description}</div>
      <div className="mt-4 text-[10px] uppercase tracking-widest text-violet-300/70">
        开始对战 →
      </div>
    </Link>
  );
}
