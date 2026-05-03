"use client";

import type { GameCard, GameState, PlayerState } from "@/core/state";
import { BoardCard, EmptySlot } from "./cards/BoardCard";
import { HandCard } from "./cards/HandCard";

export type CardClickHandler = (card: GameCard, zone: "hand" | "active" | "bench", benchSlot?: number) => void;

interface TableauProps {
  state: GameState;
  humanPlayer: 0 | 1;
  onCardClick?: CardClickHandler;
}

export function Tableau({ state, humanPlayer, onCardClick }: TableauProps) {
  const opp = state.players[(1 - humanPlayer) as 0 | 1];
  const self = state.players[humanPlayer];

  return (
    <div className="flex flex-col gap-3 p-4 w-full max-w-[1400px] mx-auto h-[calc(100vh-1rem)]">
      <PlayerSide player={opp} mirrored interactive={false} />
      <Stadium card={state.stadium} />
      <PlayerSide
        player={self}
        mirrored={false}
        interactive
        onCardClick={onCardClick}
      />
      <HandStrip player={self} onCardClick={onCardClick} />
    </div>
  );
}

interface PlayerSideProps {
  player: PlayerState;
  mirrored: boolean;
  interactive: boolean;
  onCardClick?: CardClickHandler;
}

function PlayerSide({ player, mirrored, interactive, onCardClick }: PlayerSideProps) {
  return (
    <div className={mirrored ? "flex flex-col-reverse gap-3" : "flex flex-col gap-3"}>
      <BenchRow player={player} interactive={interactive} onCardClick={onCardClick} />
      <ActiveRow player={player} interactive={interactive} onCardClick={onCardClick} />
    </div>
  );
}

interface RowProps {
  player: PlayerState;
  interactive: boolean;
  onCardClick?: CardClickHandler;
}

function BenchRow({ player, interactive, onCardClick }: RowProps) {
  return (
    <div className="flex items-center gap-3">
      <PrizeStack count={player.prizes.length} />
      <div className="flex-1 grid grid-cols-5 gap-2">
        {player.bench.map((slot, i) =>
          slot ? (
            <button
              key={i}
              type="button"
              disabled={!interactive}
              onClick={() => onCardClick?.(slot, "bench", i)}
              className="flex justify-center"
            >
              <BoardCard card={slot} size="bench" />
            </button>
          ) : (
            <div key={i} className="flex justify-center">
              <EmptySlot size="bench" label={`bench ${i + 1}`} />
            </div>
          ),
        )}
      </div>
      <DeckPile count={player.deck.length} />
      <DiscardPile cards={player.discard} />
    </div>
  );
}

function ActiveRow({ player, interactive, onCardClick }: RowProps) {
  return (
    <div className="flex justify-center">
      {player.active ? (
        <button
          type="button"
          disabled={!interactive}
          onClick={() => player.active && onCardClick?.(player.active, "active")}
        >
          <BoardCard card={player.active} size="active" isActive />
        </button>
      ) : (
        <EmptySlot size="active" label="active" />
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
                ? "w-6 h-9 rounded-sm bg-gradient-to-br from-violet-700 to-indigo-900 border border-violet-400/40 shadow-[0_0_4px_rgba(168,85,247,0.4)]"
                : "w-6 h-9 rounded-sm border border-violet-900/30"
            }
          />
        ))}
      </div>
      <div className="text-[10px] text-violet-300 mt-0.5">{count}/6</div>
    </div>
  );
}

function DeckPile({ count }: { count: number }) {
  return (
    <div className="w-16 flex flex-col items-center">
      <div className="relative">
        <div className="w-12 h-16 rounded-md bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-600 flex items-center justify-center text-xs text-zinc-300 font-bold">
          {count}
        </div>
        {count > 0 && (
          <>
            <div className="absolute -top-0.5 -left-0.5 w-12 h-16 rounded-md bg-zinc-800 border border-zinc-600 -z-10" />
            <div className="absolute -top-1 -left-1 w-12 h-16 rounded-md bg-zinc-800 border border-zinc-600 -z-20" />
          </>
        )}
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
    <div className="flex justify-center items-center h-10">
      {card ? (
        <div className="px-3 py-1 rounded-full bg-amber-900/30 border border-amber-500/40 text-amber-200 text-xs">
          🏟 stadium
        </div>
      ) : (
        <div className="text-zinc-700 text-[10px] uppercase tracking-widest">
          —— stadium ——
        </div>
      )}
    </div>
  );
}

interface HandStripProps {
  player: PlayerState;
  onCardClick?: CardClickHandler;
}

function HandStrip({ player, onCardClick }: HandStripProps) {
  return (
    <div className="h-28 rounded-lg bg-gradient-to-t from-zinc-950/80 via-zinc-900/40 to-transparent border-t border-violet-500/20 flex items-end justify-center px-4 pb-2 overflow-hidden">
      {player.hand.length === 0 ? (
        <div className="text-zinc-600 text-xs">手牌为空</div>
      ) : (
        <div className="flex">
          {player.hand.map((c, i) => (
            <button
              key={c.uid}
              type="button"
              onClick={() => onCardClick?.(c, "hand")}
              className="bg-transparent border-0 p-0"
            >
              <HandCard card={c} index={i} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
