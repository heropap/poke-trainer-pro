"use client";

import { getCard } from "@/core/cards";
import type { GameCard, GameState, PlayerState } from "@/core/state";

interface TableauProps {
  state: GameState;
}

export function Tableau({ state }: TableauProps) {
  const opp = state.players[1];
  const self = state.players[0];

  return (
    <div className="flex flex-col gap-3 p-4 w-full max-w-[1400px] mx-auto h-[88vh]">
      <PlayerSide player={opp} mirrored />
      <Stadium card={state.stadium} />
      <PlayerSide player={self} mirrored={false} />
      <HandStrip player={self} />
    </div>
  );
}

function PlayerSide({ player, mirrored }: { player: PlayerState; mirrored: boolean }) {
  return (
    <div className={mirrored ? "flex flex-col-reverse gap-3" : "flex flex-col gap-3"}>
      <BenchRow player={player} />
      <ActiveRow player={player} />
    </div>
  );
}

function BenchRow({ player }: { player: PlayerState }) {
  return (
    <div className="flex items-center gap-3 h-28">
      <PrizeStack count={player.prizes.length} />
      <div className="flex-1 grid grid-cols-5 gap-2">
        {player.bench.map((slot, i) => (
          <BenchSlot key={i} card={slot} index={i} />
        ))}
      </div>
      <DeckPile count={player.deck.length} />
      <DiscardPile cards={player.discard} />
    </div>
  );
}

function ActiveRow({ player }: { player: PlayerState }) {
  return (
    <div className="flex justify-center h-32">
      <ActiveSlot card={player.active} />
    </div>
  );
}

function ActiveSlot({ card }: { card: GameCard | null }) {
  if (!card) {
    return (
      <div className="w-28 h-32 rounded-lg border-2 border-dashed border-violet-500/40 flex items-center justify-center text-violet-300/50 text-xs">
        active
      </div>
    );
  }
  const def = getCard(card.cardId);
  return (
    <div className="w-28 h-32 rounded-lg bg-zinc-900/80 border border-violet-500/60 shadow-[0_0_20px_rgba(168,85,247,0.4)] flex flex-col items-center justify-center px-1 py-2 text-center">
      <div className="text-[10px] text-zinc-300 leading-tight">{def.name}</div>
      {def.kind === "Pokemon" && (
        <div className="text-xs text-orange-400 mt-1">
          {def.hp - card.damage}/{def.hp}
        </div>
      )}
      {card.attachedEnergy.length > 0 && (
        <div className="text-[9px] text-violet-300 mt-0.5">
          ⚡ × {card.attachedEnergy.length}
        </div>
      )}
    </div>
  );
}

function BenchSlot({ card, index }: { card: GameCard | null; index: number }) {
  if (!card) {
    return (
      <div className="rounded-md border border-dashed border-zinc-700/40 flex items-center justify-center text-zinc-600 text-[10px] py-2">
        bench {index + 1}
      </div>
    );
  }
  const def = getCard(card.cardId);
  return (
    <div className="rounded-md bg-zinc-800/70 border border-zinc-700 px-1 py-2 flex flex-col items-center justify-center text-center">
      <div className="text-[9px] text-zinc-300 leading-tight">{def.name}</div>
      {def.kind === "Pokemon" && (
        <div className="text-[10px] text-orange-400/80 mt-0.5">
          {def.hp - card.damage}
        </div>
      )}
    </div>
  );
}

function PrizeStack({ count }: { count: number }) {
  return (
    <div className="w-16 flex flex-col items-center">
      <div className="text-[9px] uppercase tracking-widest text-violet-300/70 mb-1">
        奖励
      </div>
      <div className="grid grid-cols-2 gap-0.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={
              i < count
                ? "w-6 h-9 rounded-sm bg-gradient-to-br from-violet-700 to-indigo-900 border border-violet-400/40"
                : "w-6 h-9 rounded-sm border border-violet-900/30"
            }
          />
        ))}
      </div>
    </div>
  );
}

function DeckPile({ count }: { count: number }) {
  return (
    <div className="w-16 flex flex-col items-center">
      <div className="w-12 h-16 rounded-md bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-600 flex items-center justify-center text-xs text-zinc-300">
        {count}
      </div>
      <div className="text-[9px] uppercase tracking-widest text-zinc-400 mt-1">
        牌组
      </div>
    </div>
  );
}

function DiscardPile({ cards }: { cards: GameCard[] }) {
  return (
    <div className="w-16 flex flex-col items-center">
      <div className="w-12 h-16 rounded-md bg-zinc-900/70 border border-dashed border-zinc-600 flex items-center justify-center text-xs text-zinc-400">
        {cards.length}
      </div>
      <div className="text-[9px] uppercase tracking-widest text-zinc-400 mt-1">
        弃牌
      </div>
    </div>
  );
}

function Stadium({ card }: { card: GameCard | null }) {
  return (
    <div className="flex justify-center items-center h-10 border-y border-violet-500/20">
      {card ? (
        <div className="px-3 py-1 rounded-full bg-amber-900/30 border border-amber-500/40 text-amber-200 text-xs">
          🏟 {getCard(card.cardId).name}
        </div>
      ) : (
        <div className="text-zinc-600 text-[10px] uppercase tracking-widest">
          stadium
        </div>
      )}
    </div>
  );
}

function HandStrip({ player }: { player: PlayerState }) {
  return (
    <div className="h-28 rounded-lg bg-gradient-to-t from-zinc-950/80 to-transparent border-t border-violet-500/20 flex items-center justify-center px-4 gap-2 overflow-x-auto">
      {player.hand.length === 0 ? (
        <div className="text-zinc-600 text-xs">手牌为空</div>
      ) : (
        player.hand.map((c) => (
          <div
            key={c.uid}
            className="w-16 h-24 flex-shrink-0 rounded-md bg-zinc-800/80 border border-zinc-700 flex flex-col items-center justify-center text-center px-1"
          >
            <div className="text-[8px] text-zinc-300 leading-tight">
              {getCard(c.cardId).name}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
