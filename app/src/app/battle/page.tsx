import { Suspense } from "react";
import { BattlePage } from "@/ui/battle/BattlePage";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ deck?: string; opp?: string; seed?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  const selfDeck = sp.deck ?? "charizard-ex";
  const oppDeck = sp.opp ?? "miraidon-ex";
  const seed = sp.seed ? parseInt(sp.seed, 10) : 1234;

  return (
    <Suspense fallback={<div className="p-8 text-zinc-300">Loading…</div>}>
      <BattlePage selfDeck={selfDeck} oppDeck={oppDeck} seed={seed} />
    </Suspense>
  );
}
