"use client";

import { getCard } from "@/core/cards";
import type { GameCard, GameState, PlayerIndex } from "@/core/state";
import type { Dispatch } from "./useGame";

interface CardActionMenuProps {
  card: GameCard;
  zone: "hand" | "active" | "bench";
  benchSlot?: number;
  state: GameState;
  player: PlayerIndex;
  dispatch: Dispatch;
  onClose: () => void;
}

export function CardActionMenu({
  card,
  zone,
  benchSlot,
  state,
  player,
  dispatch,
  onClose,
}: CardActionMenuProps) {
  const def = getCard(card.cardId);
  const ps = state.players[player];
  const isMyTurn = state.activePlayer === player && state.phase === "main";
  const isFirstTurn =
    state.turnNumber === 1 && state.activePlayer === state.goesFirst;

  const actions: { label: string; run: () => void; disabled?: string }[] = [];

  if (zone === "hand" && isMyTurn) {
    if (def.kind === "Pokemon" && def.stage === "Basic") {
      const emptySlot = ps.bench.findIndex((b) => b === null);
      actions.push({
        label: emptySlot >= 0 ? "放到后场" : "后场已满",
        disabled: emptySlot < 0 ? "后场已满" : undefined,
        run: () => {
          if (emptySlot < 0) return;
          dispatch({
            type: "PlayBasicPokemon",
            player,
            uid: card.uid,
            benchSlot: emptySlot,
          });
          onClose();
        },
      });
    }

    if (def.kind === "Pokemon" && (def.stage === "Stage1" || def.stage === "Stage2")) {
      // Find evolution targets
      const candidates: { uid: string; name: string }[] = [];
      const checkCard = (c: GameCard | null) => {
        if (!c) return;
        const cd = getCard(c.cardId);
        if (cd.kind !== "Pokemon") return;
        if (def.evolvesFrom !== cd.name) return;
        if (c.markers["playedThisTurn"] === true) return;
        candidates.push({ uid: c.uid, name: cd.name });
      };
      checkCard(ps.active);
      ps.bench.forEach(checkCard);
      for (const cand of candidates) {
        actions.push({
          label: `进化到 ${cand.name}`,
          disabled: isFirstTurn ? "首回合不可进化" : undefined,
          run: () => {
            dispatch({
              type: "Evolve",
              player,
              uid: card.uid,
              targetUid: cand.uid,
            });
            onClose();
          },
        });
      }
    }

    if (def.kind === "Energy") {
      const targets: { uid: string; name: string }[] = [];
      if (ps.active) targets.push({ uid: ps.active.uid, name: getCard(ps.active.cardId).name });
      ps.bench.forEach((b) => {
        if (b) targets.push({ uid: b.uid, name: getCard(b.cardId).name });
      });
      for (const t of targets) {
        actions.push({
          label: `挂到 ${t.name}`,
          disabled: ps.hasAttachedEnergy ? "本回合已挂能量" : undefined,
          run: () => {
            dispatch({
              type: "AttachEnergy",
              player,
              uid: card.uid,
              targetUid: t.uid,
            });
            onClose();
          },
        });
      }
    }

    if (def.kind === "Trainer") {
      if (def.trainerKind === "Item") {
        actions.push({
          label: "使用 (Item)",
          run: () => {
            dispatch({ type: "PlayItem", player, uid: card.uid });
            onClose();
          },
        });
      }
      if (def.trainerKind === "Supporter") {
        const reasons: string[] = [];
        if (isFirstTurn) reasons.push("首回合");
        if (ps.hasPlayedSupporter) reasons.push("本回合已使用");
        actions.push({
          label: "使用 (Supporter)",
          disabled: reasons.length ? reasons.join(" / ") : undefined,
          run: () => {
            dispatch({ type: "PlaySupporter", player, uid: card.uid });
            onClose();
          },
        });
      }
      if (def.trainerKind === "Stadium") {
        actions.push({
          label: "出场 (Stadium)",
          run: () => {
            dispatch({ type: "PlayStadium", player, uid: card.uid });
            onClose();
          },
        });
      }
    }
  }

  if (zone === "active" && isMyTurn) {
    if (def.kind === "Pokemon") {
      // Attacks
      def.attacks.forEach((atk, i) => {
        const reasons: string[] = [];
        if (isFirstTurn) reasons.push("首回合不可攻击");
        actions.push({
          label: `攻击：${atk.name} (${atk.damage})`,
          disabled: reasons.length ? reasons.join(" / ") : undefined,
          run: () => {
            dispatch({ type: "Attack", player, attackIndex: i });
            onClose();
          },
        });
      });
      // Abilities
      if (def.abilities) {
        for (const ab of def.abilities) {
          actions.push({
            label: `能力：${ab.name}`,
            disabled:
              card.markers["abilityUsedThisTurn"] === true
                ? "本回合已使用"
                : undefined,
            run: () => {
              dispatch({
                type: "UseAbility",
                player,
                sourceUid: card.uid,
                abilityName: ab.name,
              });
              onClose();
            },
          });
        }
      }
      // Retreat
      const retreatableSlots: number[] = [];
      ps.bench.forEach((b, i) => {
        if (b) retreatableSlots.push(i);
      });
      if (retreatableSlots.length > 0) {
        actions.push({
          label: `撤退 (花费 ${def.retreatCost} 能量)`,
          disabled: ps.retreatedThisTurn
            ? "本回合已撤退"
            : card.attachedEnergy.length < def.retreatCost
              ? "能量不足"
              : undefined,
          run: () => {
            const payUids = card.attachedEnergy
              .slice(0, def.retreatCost)
              .map((e) => e.uid);
            dispatch({
              type: "Retreat",
              player,
              benchSlot: retreatableSlots[0],
              payEnergyUids: payUids,
            });
            onClose();
          },
        });
      }
    }
  }

  if (zone === "bench" && isMyTurn && def.kind === "Pokemon" && def.abilities) {
    for (const ab of def.abilities) {
      actions.push({
        label: `能力：${ab.name}`,
        disabled:
          card.markers["abilityUsedThisTurn"] === true
            ? "本回合已使用"
            : undefined,
        run: () => {
          dispatch({
            type: "UseAbility",
            player,
            sourceUid: card.uid,
            abilityName: ab.name,
          });
          onClose();
        },
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-h-[80vh] overflow-y-auto rounded-xl bg-zinc-900 border border-violet-500/40 shadow-[0_0_30px_rgba(168,85,247,0.4)] p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-lg font-semibold text-zinc-100">{def.name}</div>
          {def.kind === "Pokemon" && (
            <div className="text-xs text-zinc-400">
              {def.stage} · HP {def.hp} · {def.types.join("/")} ·{" "}
              {def.rarity !== "normal" && <span className="text-orange-400">{def.rarity}</span>}
            </div>
          )}
          {def.kind === "Trainer" && (
            <div className="text-xs text-zinc-400">{def.trainerKind}</div>
          )}
          {def.kind === "Energy" && (
            <div className="text-xs text-zinc-400">
              {def.energyKind} {def.energyType}
            </div>
          )}
          {def.kind === "Pokemon" && card.damage > 0 && (
            <div className="text-xs text-red-400 mt-1">
              当前伤害: {card.damage} (剩余 HP {def.hp - card.damage})
            </div>
          )}
          {def.kind === "Pokemon" && def.attacks.length > 0 && (
            <div className="mt-2 text-[11px] text-zinc-300 space-y-1">
              {def.attacks.map((a, i) => (
                <div key={i}>
                  <span className="text-orange-300">{a.name}</span>{" "}
                  <span className="text-zinc-500">[{a.cost.join(",")}]</span>{" "}
                  <span className="text-zinc-200">{a.damage}</span>
                  {a.text && <div className="text-zinc-500 text-[10px]">{a.text}</div>}
                </div>
              ))}
            </div>
          )}
          {def.kind === "Trainer" && (
            <div className="mt-2 text-[11px] text-zinc-400">{def.text}</div>
          )}
        </div>

        <div className="border-t border-zinc-800 pt-3 space-y-1.5">
          {actions.length === 0 ? (
            <div className="text-zinc-500 text-xs">无可用操作</div>
          ) : (
            actions.map((a, i) => (
              <button
                key={i}
                disabled={!!a.disabled}
                onClick={a.run}
                className={`block w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  a.disabled
                    ? "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                    : "bg-violet-700/40 hover:bg-violet-600/60 text-white"
                }`}
              >
                {a.label}
                {a.disabled && (
                  <span className="block text-[10px] text-rose-400 mt-0.5">
                    {a.disabled}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="border-t border-zinc-800 pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            关闭 (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
