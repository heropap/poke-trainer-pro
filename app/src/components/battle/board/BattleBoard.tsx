
import React from "react";
import { GameState, Player, GameCard } from "@/engine/game-state";
import { ActiveSpot } from "./ActiveSpot";
import { BenchSpot } from "./BenchSpot";
import { Hand } from "./Hand";
import { ActionMenu } from "./ActionMenu";
import { zoneSize } from "@/engine/zones";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core";
import { VisualCard } from "./VisualCard";
import {
  canPlaySupporter,
  canPlayItem,
  canPlayBasicToBench,
  canAttachEnergy,
  canEvolve,
  canPlayStadium,
} from "@/engine/turn-actions";
import { hasEffect } from "@/engine/effects/effect-registry";
import { ManualToolkit } from "./ManualToolkit";
import { ActionLog } from "./ActionLog";
import { CardDetailModal } from "./CardDetailModal";
import { CardSelectionModal } from "./CardSelectionModal";
import { useIsMobile } from "@/hooks/useIsMobile";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

interface ActionFeedback {
  success: boolean;
  error?: string;
}

interface BattleBoardProps {
  gameState: GameState;
  currentPlayerId: string; // "p1" or "p2"
  onAction?: (action: any) => ActionFeedback | void | Promise<ActionFeedback | void>;
  battleMode?: "ai" | "local" | "online" | "mock_engine";
  aiSpeed?: "slow" | "normal" | "fast" | "instant";
  onAiSpeedChange?: (speed: string) => void;
}

interface ToastMessage {
  id: number;
  text: string;
  type: "info" | "error" | "warning";
}

/**
 * Target selection mode: the user selected a card that needs a target
 * (energy → attach to Pokemon, evolution → target pre-evolution, tool → equip)
 */
interface TargetingState {
  card: GameCard;
  action: string; // "attach_energy" | "evolve" | "equip_tool"
  validTargetIds: string[]; // instanceIds of valid target Pokemon
}

// ────────────────────────────────────────────────
// Helper: compute which cards in hand are playable
// ────────────────────────────────────────────────

function computePlayableCardIds(
  state: GameState,
  playerIndex: number,
  player: Player
): Set<string> {
  const playable = new Set<string>();

  if (state.phase !== "main" || state.currentPlayer !== playerIndex) {
    return playable;
  }

  for (const card of player.hand.cards) {
    const { supertype, subtypes } = card.card;

    if (supertype === "Pokémon" && subtypes.includes("Basic")) {
      // Can play if bench not full or active is empty
      if (!player.active || player.bench.cards.length < 5) {
        playable.add(card.instanceId);
      }
    } else if (
      supertype === "Pokémon" &&
      (subtypes.includes("Stage 1") || subtypes.includes("Stage 2"))
    ) {
      // Can play if there's a valid evolution target on field
      const targets = getEvolutionTargets(state, player, card);
      if (targets.length > 0) {
        playable.add(card.instanceId);
      }
    } else if (supertype === "Energy") {
      // Can attach if not already attached this turn, and there's a Pokemon on field
      if (!player.energyAttachedThisTurn && (player.active || player.bench.cards.length > 0)) {
        playable.add(card.instanceId);
      }
    } else if (supertype === "Trainer") {
      if (subtypes.includes("Supporter")) {
        const res = canPlaySupporter(state, card.instanceId);
        if (res.success) playable.add(card.instanceId);
      } else if (subtypes.includes("Item")) {
        const res = canPlayItem(state, card.instanceId);
        if (res.success) {
          // For Pokemon Tools, also need a target without a tool
          if (subtypes.includes("Pokémon Tool")) {
            const hasTarget = getToolTargets(player).length > 0;
            if (hasTarget) playable.add(card.instanceId);
          } else {
            playable.add(card.instanceId);
          }
        }
      } else if (subtypes.includes("Stadium")) {
        const res = canPlayStadium(state, card.instanceId);
        if (res.success) playable.add(card.instanceId);
      }
    }
  }

  return playable;
}

/** Get all Pokemon on field that can be evolution targets for a given evolution card */
function getEvolutionTargets(state: GameState, player: Player, evolutionCard: GameCard): string[] {
  const targets: string[] = [];
  const evolvesFrom = evolutionCard.card.evolvesFrom;
  if (!evolvesFrom) return targets;

  const checkTarget = (pokemon: GameCard) => {
    if (pokemon.card.name === evolvesFrom && !pokemon.playedThisTurn && !state.isFirstTurn) {
      targets.push(pokemon.instanceId);
    }
  };

  if (player.active) checkTarget(player.active);
  for (const card of player.bench.cards) checkTarget(card);

  return targets;
}

/** Get all Pokemon on field that can receive a Tool (don't already have one) */
function getToolTargets(player: Player): string[] {
  const targets: string[] = [];
  if (player.active && player.active.attachedTools.length === 0) {
    targets.push(player.active.instanceId);
  }
  for (const card of player.bench.cards) {
    if (card.attachedTools.length === 0) {
      targets.push(card.instanceId);
    }
  }
  return targets;
}

/** Get all Pokemon on field that can receive energy */
function getEnergyTargets(player: Player): string[] {
  const targets: string[] = [];
  if (player.active) targets.push(player.active.instanceId);
  for (const card of player.bench.cards) targets.push(card.instanceId);
  return targets;
}

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────

let toastIdCounter = 0;

export function BattleBoard({ gameState, currentPlayerId, onAction, battleMode, aiSpeed, onAiSpeedChange }: BattleBoardProps) {
  const isMobile = useIsMobile();
  const myIndex = currentPlayerId === "p1" ? 0 : 1;
  const opponentIndex = currentPlayerId === "p1" ? 1 : 0;

  const me = gameState.players[myIndex];
  const opponent = gameState.players[opponentIndex];

  const isMyTurn = gameState.currentPlayer === myIndex && gameState.phase === "main";

  // Drag state
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeCard, setActiveCard] = React.useState<GameCard | null>(null);

  // Selection state (PTCG Live style)
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(null);
  const [targeting, setTargeting] = React.useState<TargetingState | null>(null);

  // Manual Toolkit state (Layer 2)
  const [toolkitOpen, setToolkitOpen] = React.useState(false);

  // Action Log sidebar state — default closed on mobile to avoid covering screen
  const [logOpen, setLogOpen] = React.useState(!isMobile);

  // Close log when switching to mobile viewport
  const prevMobileRef = React.useRef(isMobile);
  React.useEffect(() => {
    if (isMobile && !prevMobileRef.current) setLogOpen(false);
    prevMobileRef.current = isMobile;
  }, [isMobile]);

  // Card Detail Modal state
  const [viewingCard, setViewingCard] = React.useState<GameCard | null>(null);

  // Toast notifications
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  // PointerSensor: require 5px movement to start drag (allows click events to fire)
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  // TouchSensor: 200ms delay + 5px tolerance to distinguish tap from drag on mobile
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Compute playable cards
  const playableCardIds = React.useMemo(
    () => computePlayableCardIds(gameState, myIndex, me),
    [gameState, myIndex, me]
  );

  // ─── Toast helper ─────────────────────────────
  function showToast(text: string, type: "info" | "error" | "warning" = "info") {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  // ─── Dispatch action with error feedback ──────
  async function dispatchAction(action: any) {
    if (!onAction) return;
    const result = await onAction(action);
    if (result && !result.success && result.error) {
      showToast(result.error, "error");
    }
  }

  // ─── Cancel selection / targeting ─────────────
  function cancelSelection() {
    setSelectedCardId(null);
    setTargeting(null);
  }

  // ─── Keyboard: Escape cancels ─────────────────
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cancelSelection();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset selection when turn changes
  React.useEffect(() => {
    cancelSelection();
  }, [gameState.currentPlayer, gameState.turn]);

  // ─── Card Context Menu Handler ────────────────
  function handleCardContextMenu(card: GameCard) {
    setViewingCard(card);
  }

  // ─── Drag handlers ────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const cardId = active.id as string;
    const card = me.hand.cards.find((c) => c.instanceId === cardId);
    if (card) {
      setActiveId(cardId);
      setActiveCard(card);
      // Clear selection when dragging starts
      cancelSelection();
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && activeId) {
      const targetZone = over.id;

      if (targetZone === "active-spot") {
        dispatchAction({ type: "play_card", cardId: activeId, targetZone: "active" });
      } else if (String(targetZone).startsWith("bench-spot-")) {
        dispatchAction({ type: "play_card", cardId: activeId, targetZone: "bench" });
      } else if (
        targetZone === "active-pokemon" ||
        String(targetZone).startsWith("bench-pokemon-") ||
        (targetZone === "player-field" && me.active)
      ) {
        const targetInstanceId =
          (over.data.current as any)?.instanceId ||
          (targetZone === "player-field" ? me.active?.instanceId : undefined);

        if (targetInstanceId) {
          dispatchAction({
            type: "play_card",
            cardId: activeId,
            targetZone: "attach",
            targetId: targetInstanceId,
          });
        }
      }
    }

    setActiveId(null);
    setActiveCard(null);
  }

  // ─── Card click handler (PTCG Live selection model) ─────
  function handleCardClick(card: GameCard) {
    if (!isMyTurn) return;

    // If we're in targeting mode, clicking a hand card cancels targeting
    if (targeting) {
      cancelSelection();
      return;
    }

    // Toggle selection
    if (selectedCardId === card.instanceId) {
      cancelSelection();
    } else {
      setSelectedCardId(card.instanceId);
    }
  }

  // ─── Action menu handler ──────────────────────
  function handleMenuAction(action: string) {
    const card = me.hand.cards.find((c) => c.instanceId === selectedCardId);
    if (!card) {
      cancelSelection();
      return;
    }

    switch (action) {
      case "play_supporter":
      case "play_item": {
        // Direct play (no target needed)
        const effectExists = hasEffect(card.cardId, card.card.name);
        dispatchAction({ type: "play_card", cardId: card.instanceId });
        if (!effectExists) {
          showToast(`${card.card.name} — 效果未实现（卡已丢弃）`, "warning");
        }
        cancelSelection();
        break;
      }

      case "play_basic": {
        // Auto-place: active if empty, else bench
        if (!me.active) {
          dispatchAction({ type: "play_card", cardId: card.instanceId, targetZone: "active" });
        } else {
          dispatchAction({ type: "play_card", cardId: card.instanceId, targetZone: "bench" });
        }
        cancelSelection();
        break;
      }

      case "attach_energy": {
        // Enter target selection mode
        const validTargets = getEnergyTargets(me);
        if (validTargets.length === 0) {
          showToast("场上没有宝可梦可以附加能量", "error");
          cancelSelection();
          return;
        }
        // If only one target, attach directly
        if (validTargets.length === 1) {
          dispatchAction({
            type: "play_card",
            cardId: card.instanceId,
            targetZone: "attach",
            targetId: validTargets[0],
          });
          cancelSelection();
          return;
        }
        setTargeting({ card, action: "attach_energy", validTargetIds: validTargets });
        break;
      }

      case "evolve": {
        const validTargets = getEvolutionTargets(gameState, me, card);
        if (validTargets.length === 0) {
          showToast("场上没有可以进化的宝可梦", "error");
          cancelSelection();
          return;
        }
        if (validTargets.length === 1) {
          dispatchAction({ type: "evolve", cardId: card.instanceId, targetId: validTargets[0] });
          cancelSelection();
          return;
        }
        setTargeting({ card, action: "evolve", validTargetIds: validTargets });
        break;
      }

      case "equip_tool": {
        const validTargets = getToolTargets(me);
        if (validTargets.length === 0) {
          showToast("场上没有可以装备工具的宝可梦", "error");
          cancelSelection();
          return;
        }
        if (validTargets.length === 1) {
          const effectExists = hasEffect(card.cardId, card.card.name);
          dispatchAction({
            type: "play_card",
            cardId: card.instanceId,
            targetZone: "attach",
            targetId: validTargets[0],
          });
          if (!effectExists) {
            showToast(`${card.card.name} — 效果未实现`, "warning");
          }
          cancelSelection();
          return;
        }
        setTargeting({ card, action: "equip_tool", validTargetIds: validTargets });
        break;
      }

      case "play_stadium": {
        dispatchAction({ type: "play_card", cardId: card.instanceId });
        cancelSelection();
        break;
      }

      default:
        cancelSelection();
    }
  }

  // ─── Target click handler (for targeting mode) ──────
  function handleTargetClick(targetInstanceId: string) {
    if (!targeting) return;
    const { card, action } = targeting;

    switch (action) {
      case "attach_energy":
        dispatchAction({
          type: "play_card",
          cardId: card.instanceId,
          targetZone: "attach",
          targetId: targetInstanceId,
        });
        break;
      case "evolve":
        dispatchAction({
          type: "evolve",
          cardId: card.instanceId,
          targetId: targetInstanceId,
        });
        break;
      case "equip_tool": {
        const effectExists = hasEffect(card.cardId, card.card.name);
        dispatchAction({
          type: "play_card",
          cardId: card.instanceId,
          targetZone: "attach",
          targetId: targetInstanceId,
        });
        if (!effectExists) {
          showToast(`${card.card.name} — 效果未实现`, "warning");
        }
        break;
      }
    }

    cancelSelection();
  }

  // ─── Player Field Droppable (Hitbox expansion) ──
  const playerField = useDroppable({
    id: "player-field",
    data: { type: "field" },
  });

  // ─── Determine targeting info for spots ──────
  const activeIsTargetable = targeting
    ? me.active
      ? targeting.validTargetIds.includes(me.active.instanceId)
      : false
    : false;

  const benchTargetableIds = targeting
    ? new Set(
        me.bench.cards
          .filter((c) => targeting.validTargetIds.includes(c.instanceId))
          .map((c) => c.instanceId)
      )
    : new Set<string>();

  // Find the selected card object for ActionMenu
  const selectedCard = selectedCardId
    ? me.hand.cards.find((c) => c.instanceId === selectedCardId) ?? null
    : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
      <div
        className="flex h-screen w-full flex-col overflow-hidden bg-zinc-900 text-zinc-100"
        onClick={(e) => {
          // Click on background cancels selection (but not if clicking a child element that stops propagation)
          if (targeting && e.target === e.currentTarget) {
            cancelSelection();
          }
        }}
      >
        {/* ─── OPPONENT ZONE (Top) ─── */}
        <div className={`flex flex-1 flex-col items-center justify-start border-b border-zinc-800 bg-zinc-900/50 ${isMobile ? "p-2 pt-6" : "p-4 pt-8"}`}>
          {/* Opponent Info Bar */}
          <div className={`absolute left-2 top-2 flex items-center rounded-full bg-zinc-800 shadow-lg ${isMobile ? "gap-2 px-2 py-1" : "gap-4 px-4 py-2"}`}>
            <div className={`rounded-full bg-red-500 ${isMobile ? "h-5 w-5" : "h-8 w-8"}`}></div>
            <div className={`font-bold ${isMobile ? "text-xs" : "text-sm"}`}>{opponent.name}</div>
            {!isMobile && (
              <div className="flex gap-2 text-xs text-zinc-400">
                <span>手牌: {zoneSize(opponent.hand)}</span>
                <span>牌库: {zoneSize(opponent.deck)}</span>
                <span>奖励卡: {zoneSize(opponent.prizes)}</span>
              </div>
            )}
          </div>

          {/* Opponent Hand */}
          <div className={`absolute opacity-75 transition-all hover:opacity-100 ${isMobile ? "top-[-40px] hover:top-[-10px]" : "top-[-60px] hover:top-[-20px]"}`}>
            <Hand cards={opponent.hand.cards} isOpponent compact={isMobile} />
          </div>

          {/* Opponent Bench */}
            <div className={`flex ${isMobile ? "mb-2 mt-5 gap-1" : "mb-4 mt-8 gap-4"}`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <BenchSpot
                  key={i}
                  index={i}
                  card={opponent.bench.cards[i] || null}
                  onCardContextMenu={handleCardContextMenu}
                  compact={isMobile}
                />
              ))}
            </div>

          {/* Opponent Active */}
          <ActiveSpot
            card={opponent.active}
            isOpponent
            isFirstTurn={false}
            onCardContextMenu={handleCardContextMenu}
            compact={isMobile}
          />
        </div>

        {/* ─── MIDDLE ZONE (Arena / Status) ─── */}
        <div className={`relative flex w-full items-center justify-center bg-zinc-950 shadow-inner ${isMobile ? "h-10" : "h-12"}`}>
          {/* Targeting mode overlay banner */}
          {targeting && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-600/20 backdrop-blur-[1px]">
              <div className={`flex items-center gap-2 rounded-full bg-blue-600 shadow-lg font-bold text-white ${isMobile ? "px-3 py-1 text-xs" : "px-6 py-1.5 text-sm"}`}>
                <span className={isMobile ? "truncate max-w-[180px]" : ""}>
                  选择目标宝可梦 —{" "}
                  {targeting.action === "attach_energy"
                    ? `附加 ${targeting.card.card.name}`
                    : targeting.action === "evolve"
                    ? `进化为 ${targeting.card.card.name}`
                    : `装备 ${targeting.card.card.name}`}
                </span>
                <button
                  onClick={cancelSelection}
                  className="rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {isMobile ? (
            /* Mobile: compact center info */
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-blue-600 px-3 py-0.5 text-[10px] font-bold text-white shadow">
                T{gameState.turn} · {gameState.players[gameState.currentPlayer].name}
              </div>
              {gameState.stadium && (
                <div className="rounded bg-emerald-700/80 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 truncate max-w-[80px]">
                  {gameState.stadium.card.card.name}
                </div>
              )}
            </div>
          ) : (
            /* Desktop: full info bar */
            <div className="flex items-center gap-8">
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                Turn {gameState.turn}
              </div>
              {gameState.stadium && (
                <div className="rounded bg-emerald-700/80 px-2 py-0.5 text-[10px] font-bold text-emerald-200" title={gameState.stadium.card.card.rules?.[0] || ""}>
                  {gameState.stadium.card.card.name}
                </div>
              )}
              <div className="rounded-full bg-blue-600 px-6 py-1 text-sm font-bold text-white shadow-lg shadow-blue-900/20">
                {gameState.players[gameState.currentPlayer].name} 的回合
              </div>
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                {gameState.phase} Phase
              </div>
            </div>
          )}

          {/* Log Toggle (left side) */}
          <div className={`absolute ${isMobile ? "left-1" : "left-8"}`}>
            <button
              className={`rounded px-2 py-1 text-xs font-bold transition-colors ${
                logOpen
                  ? "bg-blue-500 text-white hover:bg-blue-400"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
              onClick={() => setLogOpen(!logOpen)}
              title="对战日志"
            >
              {isMobile ? "📋" : "📋 日志"}
            </button>
          </div>

          {/* Action Buttons */}
          <div className={`absolute ${isMobile ? "right-1" : "right-8"} flex gap-1`}>
            {!isMobile && (
              <button
                className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
                  toolkitOpen
                    ? "bg-yellow-500 text-black hover:bg-yellow-400"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
                onClick={() => setToolkitOpen(!toolkitOpen)}
                title="Manual Override Toolkit"
              >
                🔧 工具
              </button>
            )}
            <button
              className={`rounded bg-red-600 font-bold hover:bg-red-500 ${isMobile ? "px-2 py-1 text-[10px]" : "px-3 py-1 text-xs"}`}
              onClick={() => dispatchAction({ type: "end_turn" })}
            >
              结束回合
            </button>
          </div>
        </div>

        {/* ─── PLAYER ZONE (Bottom) ─── */}
        <div
          ref={playerField.setNodeRef}
          className={`flex flex-1 flex-col items-center justify-end bg-zinc-800/30 pb-0 ${isMobile ? "p-2" : "p-4"} ${playerField.isOver ? "bg-zinc-800/50 ring-2 ring-blue-500/30" : ""}`}
        >
          {/* Player Active */}
          <div className={isMobile ? "mb-2" : "mb-4"}>
            <ActiveSpot
              card={me.active}
              canAttack={isMyTurn && !targeting}
              isFirstTurn={gameState.turn === 1 && gameState.isFirstTurn}
              onAttack={(attackName) => dispatchAction({ type: "attack", attackName })}
              isTargetable={activeIsTargetable}
              onTargetClick={() => {
                if (me.active) handleTargetClick(me.active.instanceId);
              }}
              onCardContextMenu={handleCardContextMenu}
              compact={isMobile}
            />
          </div>

          {/* Player Bench */}
          <div className={`flex ${isMobile ? "mb-2 gap-1" : "mb-6 gap-4"}`}>
            {Array.from({ length: 5 }).map((_, i) => {
              const benchCard = me.bench.cards[i] || null;
              const isTargetable = benchCard
                ? benchTargetableIds.has(benchCard.instanceId)
                : false;

              return (
                <BenchSpot
                  key={i}
                  index={i}
                  card={benchCard}
                  isTargetable={isTargetable}
                  onTargetClick={() => {
                    if (benchCard) handleTargetClick(benchCard.instanceId);
                  }}
                  onCardContextMenu={handleCardContextMenu}
                  compact={isMobile}
                />
              );
            })}
          </div>

          {/* Player Hand & Controls */}
          <div className="relative w-full">
            <Hand
              cards={me.hand.cards}
              isMyTurn={isMyTurn}
              onCardClick={handleCardClick}
              selectedCardId={selectedCardId}
              selectedCard={selectedCard}
              playableCardIds={playableCardIds}
              isTargeting={!!targeting}
              onMenuAction={handleMenuAction}
              onMenuCancel={cancelSelection}
              onCardContextMenu={handleCardContextMenu}
              compact={isMobile}
            />

            {/* Player Info (Bottom Right) */}
            <div className={`absolute bottom-2 right-2 flex flex-col items-end gap-1 rounded-lg bg-zinc-900/80 text-right shadow-xl backdrop-blur-md ${isMobile ? "p-1.5" : "p-3"}`}>
              <div className={`font-bold text-blue-400 ${isMobile ? "text-xs" : "text-lg"}`}>{me.name}</div>
              <div className={`text-zinc-400 ${isMobile ? "text-[9px]" : "text-xs"}`}>
                {isMobile
                  ? `${zoneSize(me.deck)}D ${zoneSize(me.discard)}G ${zoneSize(me.prizes)}P`
                  : `Deck: ${zoneSize(me.deck)} | Discard: ${zoneSize(me.discard)} | Prizes: ${zoneSize(me.prizes)}`
                }
              </div>
            </div>
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeCard ? <VisualCard card={activeCard} scale={0.8} /> : null}
        </DragOverlay>

        {/* Toast Notifications */}
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-xl backdrop-blur-md ${
                toast.type === "error"
                  ? "bg-red-600/90"
                  : toast.type === "warning"
                  ? "bg-orange-500/90"
                  : "bg-zinc-800/90"
              }`}
            >
              {toast.text}
            </div>
          ))}
        </div>

        {/* Action Log Sidebar */}
        <ActionLog
          gameState={gameState}
          isOpen={logOpen}
          onToggle={() => setLogOpen(!logOpen)}
          battleMode={battleMode}
          aiSpeed={aiSpeed}
          onAiSpeedChange={onAiSpeedChange as any}
          compact={isMobile}
        />

        {/* Manual Override Toolkit (Layer 2) */}
        <ManualToolkit
          gameState={gameState}
          playerIndex={myIndex as 0 | 1}
          onAction={dispatchAction}
          isOpen={toolkitOpen}
          onToggle={() => setToolkitOpen(!toolkitOpen)}
        />

        {/* Card Detail Modal */}
        {viewingCard && (
          <CardDetailModal 
            card={viewingCard} 
            onClose={() => setViewingCard(null)} 
          />
        )}

        {/* Card Selection Modal (Prompt) */}
        {gameState.prompt && gameState.prompt.playerIndex === myIndex && (
          <CardSelectionModal 
            prompt={gameState.prompt}
            gameState={gameState}
            onConfirm={(selectedIds) => onAction?.({ type: "select_cards_response", selectedIds })}
          />
        )}
      </div>
    </DndContext>
  );
}
