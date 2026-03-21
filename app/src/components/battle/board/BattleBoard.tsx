
import React from "react";
import { GameState, GamePhase, Player, GameCard } from "@/engine/game-state";
import { ActiveSpot } from "./ActiveSpot";
import { BenchSpot } from "./BenchSpot";
import { Hand } from "./Hand";
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
  canPlayStadium,
  getEffectiveRetreatCost,
} from "@/engine/turn-actions";
import { hasEffect } from "@/engine/effects/effect-registry";
import { queryActiveModifiers, type ActiveModifiers } from "@/engine/effects/modifier-query";
import { ManualToolkit } from "./ManualToolkit";
import { ActionLog } from "./ActionLog";
import { CardDetailModal } from "./CardDetailModal";
import { CardSelectionModal } from "./CardSelectionModal";
import { useIsMobile } from "@/hooks/useIsMobile";
import { AnimationProvider } from "./AnimationProvider";
import { EvolutionOverlay } from "./EvolutionOverlay";
import { EnergyAttachOverlay } from "./EnergyAttachOverlay";
import { EnergySelectionModal } from "./EnergySelectionModal";
import { CoinFlipModal } from "./CoinFlipModal";
import { ChooseOptionModal } from "./ChooseOptionModal";
import { ConfirmModal } from "./ConfirmModal";
import { OrderCardsModal } from "./OrderCardsModal";
import { SelectPokemonModal } from "./SelectPokemonModal";
import { DeckPile, DiscardPile, PrizePile, LostZone, StadiumSpot } from "./BoardZones";
import { ZoneBrowserModal } from "./ZoneBrowserModal";

// ────────────────────────────────────────────────
// Phase Localization
// ────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  SETUP: "设置阶段",
  MULLIGAN: "调度阶段",
  DRAW: "抽牌阶段",
  MAIN: "主阶段",
  ATTACK: "攻击阶段",
  CHECKUP: "检查阶段",
  BETWEEN_TURNS: "回合间",
  GAME_OVER: "游戏结束",
};

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
): { playable: Set<string>; modifiers: ActiveModifiers } {
  const playable = new Set<string>();
  const modifiers = queryActiveModifiers(state, playerIndex as 0 | 1);

  if (state.phase !== GamePhase.MAIN || state.currentPlayer !== playerIndex) {
    return { playable, modifiers };
  }

  // PTCG Rule: After attacking, turn is over — no more cards can be played
  if (state.turnStatus.hasAttacked) {
    return { playable, modifiers };
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
      // V2: Check prevent_evolution modifier
      if (modifiers.preventEvolution) continue;
      // Can play if there's a valid evolution target on field
      const targets = getEvolutionTargets(state, player, card);
      if (targets.length > 0) {
        playable.add(card.instanceId);
      }
    } else if (supertype === "Energy") {
      // Can attach if there's a Pokemon on field
      const hasPokemonOnField = player.active || player.bench.cards.length > 0;
      if (!hasPokemonOnField) continue;
      if (!player.energyAttachedThisTurn) {
        playable.add(card.instanceId);
      } else if (modifiers.extraEnergyAttach) {
        // V2: Extra energy attachment allowed by ability
        playable.add(card.instanceId);
      }
    } else if (supertype === "Trainer") {
      if (subtypes.includes("Supporter")) {
        // V2: Check prevent_supporter modifier
        if (modifiers.preventSupporterUsage) continue;
        const res = canPlaySupporter(state, card.instanceId);
        if (res.success) playable.add(card.instanceId);
      } else if (subtypes.includes("Pokémon Tool")) {
        // Pokémon Tool — separate from Item because subtypes don't include "Item"
        if (modifiers.preventItemUsage) continue;
        const res = canPlayItem(state, card.instanceId);
        if (res.success) {
          const hasTarget = getToolTargets(player).length > 0;
          if (hasTarget) playable.add(card.instanceId);
        }
      } else if (subtypes.includes("Item")) {
        // V2: Check prevent_item modifier
        if (modifiers.preventItemUsage) continue;
        const res = canPlayItem(state, card.instanceId);
        if (res.success) playable.add(card.instanceId);
      } else if (subtypes.includes("Stadium")) {
        const res = canPlayStadium(state, card.instanceId);
        if (res.success) playable.add(card.instanceId);
      }
    }
  }

  return { playable, modifiers };
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

  const isMyTurn = gameState.currentPlayer === myIndex && gameState.phase === GamePhase.MAIN;

  // Drag state
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeCard, setActiveCard] = React.useState<GameCard | null>(null);

  // Selection state (PTCG Live style)
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(null);
  const [targeting, setTargeting] = React.useState<TargetingState | null>(null);

  // Bench Pokemon selection state
  const [selectedBenchId, setSelectedBenchId] = React.useState<string | null>(null);

  // Bench-initiated targeting state (user clicked bench → "attach energy" → pick from hand)
  const [benchTargeting, setBenchTargeting] = React.useState<{
    benchInstanceId: string;
    action: "attach_energy" | "equip_tool";
  } | null>(null);

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

  // Zone Browser Modal state
  const [browsingZone, setBrowsingZone] = React.useState<{ title: string; cards: GameCard[] } | null>(null);

  // Retreat bench selection state
  const [retreatSelecting, setRetreatSelecting] = React.useState(false);

  // KO Promotion: detect when active is empty but bench has Pokemon
  const promotionRequired = !me.active && me.bench.cards.length > 0;

  // Retreat energy selection state (after bench target is chosen)
  const [retreatEnergyPending, setRetreatEnergyPending] = React.useState<{ benchInstanceId: string } | null>(null);

  // Attack animation state
  const [attackingPlayer, setAttackingPlayer] = React.useState<number | null>(null);

  // Evolution animation state
  const [evolutionAnim, setEvolutionAnim] = React.useState<{ active: boolean; name: string }>({ active: false, name: "" });

  // Energy attach animation state
  const [energyAnim, setEnergyAnim] = React.useState<{ active: boolean; type: string; key: string }>({ active: false, type: "Colorless", key: "" });

  // Detect game events from log for animations (attacks, evolutions, energy)
  const lastLogLengthRef = React.useRef(gameState.log.length);
  React.useEffect(() => {
    const log = gameState.log;
    if (log.length > lastLogLengthRef.current) {
      for (let i = lastLogLengthRef.current; i < log.length; i++) {
        const entry = log[i];

        // Opponent attack animation
        if (entry.type === "attack" && entry.playerIndex === opponentIndex) {
          setAttackingPlayer(opponentIndex);
          setTimeout(() => setAttackingPlayer(null), 400);
        }

        // Evolution animation
        if (entry.type === "evolve_pokemon") {
          const name = entry.message?.match(/进化为\s*(.+)/)?.[1] || "";
          setEvolutionAnim({ active: true, name });
          setTimeout(() => setEvolutionAnim({ active: false, name: "" }), 700);
        }

        // Energy attach animation
        if (entry.type === "attach_energy") {
          const energyType = (entry as any).message?.match(/(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Dragon|Fairy)/)?.[1] || "Colorless";
          setEnergyAnim({ active: true, type: energyType, key: `e-${i}-${Date.now()}` });
          setTimeout(() => setEnergyAnim({ active: false, type: "Colorless", key: "" }), 500);
        }
      }
    }
    lastLogLengthRef.current = log.length;
  }, [gameState.log.length, opponentIndex]);

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

  // Compute playable cards + V2 active modifiers
  const { playable: basePlayableCardIds, modifiers: activeModifiers } = React.useMemo(
    () => computePlayableCardIds(gameState, myIndex, me),
    [gameState, myIndex, me]
  );

  // Override playable cards when bench targeting is active
  const playableCardIds = React.useMemo(() => {
    if (!benchTargeting) return basePlayableCardIds;
    const ids = new Set<string>();
    for (const card of me.hand.cards) {
      if (benchTargeting.action === "attach_energy" && card.card.supertype === "Energy" && (!me.energyAttachedThisTurn || activeModifiers.extraEnergyAttach)) {
        ids.add(card.instanceId);
      }
      if (benchTargeting.action === "equip_tool" && card.card.subtypes?.includes("Pokémon Tool")) {
        ids.add(card.instanceId);
      }
    }
    return ids;
  }, [benchTargeting, basePlayableCardIds, me.hand.cards, me.energyAttachedThisTurn]);

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
    setRetreatSelecting(false);
    setRetreatEnergyPending(null);
    setSelectedBenchId(null);
    setBenchTargeting(null);
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

  // ─── Retreat handler ────────────────────────────
  function handleRetreat() {
    if (!isMyTurn || !me.active) return;
    const retreatCost = getEffectiveRetreatCost(gameState, myIndex, me.active);

    if (me.bench.cards.length === 0) {
      showToast("备战区没有宝可梦可以替换", "error");
      return;
    }

    if (me.bench.cards.length === 1 && retreatCost === 0) {
      // Only one bench target and free retreat — do it directly
      dispatchAction({
        type: "retreat",
        benchInstanceId: me.bench.cards[0].instanceId,
        energyToDiscard: [],
      });
      return;
    }

    // Enter retreat bench-selection mode
    setRetreatSelecting(true);
    cancelSelection();
  }

  function handleRetreatTargetClick(benchInstanceId: string) {
    if (!me.active) return;
    const retreatCost = getEffectiveRetreatCost(gameState, myIndex, me.active);

    if (retreatCost === 0) {
      // Free retreat — dispatch directly
      dispatchAction({
        type: "retreat",
        benchInstanceId,
        energyToDiscard: [],
      });
      setRetreatSelecting(false);
      return;
    }

    // Retreat costs energy — show energy selection modal
    if (me.active.attachedEnergy.length < retreatCost) {
      showToast(`撤退需要 ${retreatCost} 点能量，当前能量不足`, "error");
      setRetreatSelecting(false);
      return;
    }

    if (me.active.attachedEnergy.length === retreatCost) {
      // Exactly enough — auto-select all
      dispatchAction({
        type: "retreat",
        benchInstanceId,
        energyToDiscard: me.active.attachedEnergy.map((e) => e.instanceId),
      });
      setRetreatSelecting(false);
      return;
    }

    // More energy than needed — let user choose
    setRetreatEnergyPending({ benchInstanceId });
    setRetreatSelecting(false);
  }

  function handleRetreatEnergyConfirm(selectedEnergyIds: string[]) {
    if (!retreatEnergyPending) return;
    dispatchAction({
      type: "retreat",
      benchInstanceId: retreatEnergyPending.benchInstanceId,
      energyToDiscard: selectedEnergyIds,
    });
    setRetreatEnergyPending(null);
  }

  // ─── Card click handler (PTCG Live selection model) ─────
  function handleCardClick(card: GameCard) {
    if (!isMyTurn) return;

    // If we're in targeting mode, clicking a hand card cancels targeting
    if (targeting) {
      cancelSelection();
      return;
    }

    // If bench targeting (user clicked bench → "attach energy" → now picking from hand)
    if (benchTargeting) {
      const { benchInstanceId, action } = benchTargeting;
      if (action === "attach_energy" && card.card.supertype === "Energy") {
        dispatchAction({
          type: "play_card",
          cardId: card.instanceId,
          targetZone: "attach",
          targetId: benchInstanceId,
        });
        cancelSelection();
        return;
      }
      if (action === "equip_tool" && card.card.subtypes?.includes("Pokémon Tool")) {
        dispatchAction({
          type: "play_card",
          cardId: card.instanceId,
          targetZone: "attach",
          targetId: benchInstanceId,
        });
        cancelSelection();
        return;
      }
      // Clicked a non-matching card — cancel
      cancelSelection();
      return;
    }

    // Toggle selection
    if (selectedCardId === card.instanceId) {
      cancelSelection();
    } else {
      setSelectedCardId(card.instanceId);
      setSelectedBenchId(null);
    }
  }

  // ─── Bench click handler ─────────────────────
  function handleBenchClick(benchCard: GameCard) {
    // In promotion mode, clicking bench should trigger promotion (not open menu)
    if (promotionRequired) {
      dispatchAction({ type: "promote", benchInstanceId: benchCard.instanceId });
      return;
    }
    if (!isMyTurn) return;
    if (targeting || retreatSelecting || benchTargeting) return;

    // Toggle bench selection
    if (selectedBenchId === benchCard.instanceId) {
      setSelectedBenchId(null);
    } else {
      setSelectedBenchId(benchCard.instanceId);
      setSelectedCardId(null); // Clear hand selection
    }
  }

  // ─── Bench action handler ────────────────────
  function handleBenchAction(benchInstanceId: string, action: string) {
    const benchCard = me.bench.cards.find((c) => c.instanceId === benchInstanceId);
    if (!benchCard) {
      setSelectedBenchId(null);
      return;
    }

    switch (action) {
      case "attach_energy": {
        // V2: Check energy attachment limit with modifier awareness
        if (me.energyAttachedThisTurn && !activeModifiers.extraEnergyAttach) {
          showToast("本回合已附加过能量", "warning");
          setSelectedBenchId(null);
          return;
        }
        const hasEnergy = me.hand.cards.some((c) => c.card.supertype === "Energy");
        if (!hasEnergy) {
          showToast("手牌中没有能量卡", "warning");
          setSelectedBenchId(null);
          return;
        }
        // Enter bench targeting mode — highlight energy cards in hand
        setBenchTargeting({ benchInstanceId, action: "attach_energy" });
        setSelectedBenchId(null);
        break;
      }
      case "equip_tool": {
        if (benchCard.attachedTools.length > 0) {
          showToast("该宝可梦已装备道具", "warning");
          setSelectedBenchId(null);
          return;
        }
        const hasTools = me.hand.cards.some(
          (c) => c.card.subtypes?.includes("Pokémon Tool")
        );
        if (!hasTools) {
          showToast("手牌中没有道具卡", "warning");
          setSelectedBenchId(null);
          return;
        }
        setBenchTargeting({ benchInstanceId, action: "equip_tool" });
        setSelectedBenchId(null);
        break;
      }
      case "view_detail": {
        setViewingCard(benchCard);
        setSelectedBenchId(null);
        break;
      }
      default:
        setSelectedBenchId(null);
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
    <AnimationProvider aiSpeed={aiSpeed}>
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
      <div
        className="relative grid h-screen w-full grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] overflow-hidden bg-zinc-900 text-zinc-100"
        onClick={(e) => {
          if (targeting && e.target === e.currentTarget) {
            cancelSelection();
          }
        }}
      >
        {/* ─── ROW 1: OPPONENT ZONE ─── */}
        <div className={`grid w-full grid-cols-[120px_1fr_120px] grid-rows-[minmax(0,1fr)] gap-4 bg-zinc-900/50 overflow-hidden min-h-0 ${isMobile ? "p-2" : "p-4"}`}>
          {/* Top Left: Discard/Deck/Lost (Opponent Right) */}
          <div className="flex flex-col items-center justify-start gap-4 pt-12">
             <DiscardPile cards={opponent.discard.cards} label="弃牌堆" onClick={() => opponent.discard.cards.length > 0 && setBrowsingZone({ title: `${opponent.name} 弃牌堆`, cards: opponent.discard.cards })} />
             <DeckPile count={opponent.deck.cards.length} label="牌组" />
             <LostZone cards={opponent.lostZone.cards} onClick={() => setBrowsingZone({ title: `${opponent.name} 失落区`, cards: opponent.lostZone.cards })} />
          </div>

          {/* Top Center: Hand/Bench/Active */}
          <div className="flex flex-col items-center justify-start relative overflow-y-auto overflow-x-hidden min-h-0">
             {/* Opponent Info */}
             <div className="absolute top-0 left-0 z-10 flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-1 text-xs shadow-md border border-zinc-700">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="font-bold text-zinc-300">{opponent.name}</span>
             </div>

             {/* Opponent Hand */}
             <div className="-mt-12 mb-2 scale-75 origin-top opacity-80 hover:opacity-100 transition-all hover:scale-90 hover:mt-0 z-20">
               <Hand cards={opponent.hand.cards} isOpponent compact={isMobile} />
             </div>

             {/* Opponent Bench */}
             <div className={`flex ${isMobile ? "mb-2 gap-1" : "mb-4 gap-4"}`}>
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
               gameState={gameState}
               playerIndex={opponentIndex as 0 | 1}
               isOpponent
               onCardContextMenu={handleCardContextMenu}
               isAttacking={attackingPlayer === opponentIndex}
               compact={isMobile}
             />
          </div>

          {/* Top Right: Prizes (Opponent Left) */}
          <div className="flex flex-col items-center justify-center pt-8">
             <PrizePile cards={opponent.prizes.cards} isOpponent />
          </div>
        </div>

        {/* ─── ROW 2: MIDDLE ZONE ─── */}
        <div className="relative flex w-full items-center justify-between border-y border-zinc-800 bg-zinc-950/80 px-4 py-2 shadow-inner z-30">
           {/* Left: Stadium */}
           <div className="w-[120px] flex justify-center">
             <StadiumSpot
               card={gameState.stadium ? gameState.stadium.card : null}
               onClick={() => gameState.stadium && setViewingCard(gameState.stadium.card)}
               effectText={gameState.stadium?.card.card.rules?.[0]?.slice(0, 60)}
               ownerIndex={gameState.stadium?.owner}
               myIndex={myIndex}
             />
           </div>

           {/* Center: Info & Banners */}
           <div className="flex flex-1 flex-col items-center justify-center gap-2">
              {(targeting || retreatSelecting || promotionRequired || benchTargeting) ? (
                 <div className="flex justify-center scale-90 origin-center">
                    {targeting && (
                      <div className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg animate-pulse">
                        <span>选择目标: {targeting.action === "attach_energy" ? "附加能量" : targeting.action === "evolve" ? "进化" : "装备道具"}</span>
                        <button onClick={cancelSelection} className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">取消</button>
                      </div>
                    )}
                    {retreatSelecting && (
                      <div className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg">
                        <span>🔄 选择备战区宝可梦</span>
                        <button onClick={() => setRetreatSelecting(false)} className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">取消</button>
                      </div>
                    )}
                    {promotionRequired && (
                      <div className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg animate-bounce">
                        <span>⚡ 必须选择备战区宝可梦上场</span>
                      </div>
                    )}
                    {benchTargeting && (
                      <div className="flex items-center gap-2 rounded-full bg-yellow-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg">
                        <span>从手牌选择{benchTargeting.action === "attach_energy" ? "能量" : "道具"}卡</span>
                        <button onClick={cancelSelection} className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">取消</button>
                      </div>
                    )}
                 </div>
              ) : (
                 <div className="flex flex-col items-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      第 {gameState.turn} 回合 · {PHASE_LABELS[gameState.phase] || gameState.phase}
                    </div>
                    <div className={`text-lg font-black tracking-tight ${isMyTurn ? "text-blue-400 drop-shadow-sm" : "text-red-400"}`}>
                      {isMyTurn ? "你的回合" : `${opponent.name} 的回合`}
                    </div>
                    {/* V2 modifier warnings */}
                    {isMyTurn && (activeModifiers.preventItemUsage || activeModifiers.preventSupporterUsage || activeModifiers.preventEvolution || activeModifiers.preventAttack) && (
                      <div className="mt-1 flex flex-wrap justify-center gap-1">
                        {activeModifiers.preventItemUsage && (
                          <span className="rounded-full bg-red-600/80 px-2 py-0.5 text-[10px] font-bold text-white">道具被封锁</span>
                        )}
                        {activeModifiers.preventSupporterUsage && (
                          <span className="rounded-full bg-red-600/80 px-2 py-0.5 text-[10px] font-bold text-white">支援者被封锁</span>
                        )}
                        {activeModifiers.preventEvolution && (
                          <span className="rounded-full bg-orange-600/80 px-2 py-0.5 text-[10px] font-bold text-white">进化被封锁</span>
                        )}
                        {activeModifiers.preventAttack && (
                          <span className="rounded-full bg-red-700/80 px-2 py-0.5 text-[10px] font-bold text-white">攻击被封锁</span>
                        )}
                      </div>
                    )}
                 </div>
              )}
           </div>

           {/* Right: Tools / Actions */}
           <div className="w-[120px] flex flex-col items-end gap-1">
              {/* VSTAR Marker Placeholder */}
              <div className="flex w-full justify-end mb-1 opacity-50">
                <div className="px-2 py-0.5 bg-white/5 rounded border border-white/10 text-[10px] text-zinc-500 font-mono tracking-widest">
                  VSTAR
                </div>
              </div>

              <div className="flex gap-1">
                 {/* Coin Area Placeholder */}
                 <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500/50 text-xs" title="Coin Area">
                   🪙
                 </div>
                 <button onClick={() => setLogOpen(!logOpen)} className="rounded bg-zinc-800 p-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors" title="Log">
                   📋
                 </button>
                 {!isMobile && (
                   <button onClick={() => setToolkitOpen(!toolkitOpen)} className="rounded bg-zinc-800 p-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors" title="Tools">
                     🔧
                   </button>
                 )}
              </div>
              <button 
                onClick={() => dispatchAction({ type: "end_turn" })}
                className="w-full rounded bg-red-600 py-1.5 text-xs font-bold text-white hover:bg-red-500 shadow-md transition-colors"
              >
                结束回合
              </button>
           </div>
        </div>

        {/* ─── ROW 3: PLAYER ZONE ─── */}
        <div
          ref={playerField.setNodeRef}
          className={`grid w-full grid-cols-[120px_1fr_120px] grid-rows-[minmax(0,1fr)] gap-4 bg-zinc-800/20 overflow-hidden min-h-0 ${isMobile ? "p-2" : "p-4"} ${playerField.isOver ? "ring-2 ring-blue-500/30" : ""}`}
        >
          {/* Left: Prizes (Player Left) */}
          <div className="flex flex-col items-center justify-center pb-8">
             <PrizePile cards={me.prizes.cards} />
          </div>

          {/* Center: Active/Bench/Hand */}
          <div className="flex flex-col items-center justify-end relative min-h-0 min-w-0 overflow-hidden h-full">
             {/* Player Active */}
             <div className="shrink overflow-hidden min-h-0">
               <ActiveSpot
                 card={me.active}
                 gameState={gameState}
                 playerIndex={myIndex as 0 | 1}
                 showActions={isMyTurn && !targeting && !retreatSelecting}
                 onAttack={(attackName) => {
                   setAttackingPlayer(myIndex);
                   setTimeout(() => setAttackingPlayer(null), 400);
                   dispatchAction({ type: "attack", attackName });
                 }}
                 onUseAbility={(cardInstanceId, abilityName) => {
                   dispatchAction({ type: "use_ability", cardId: cardInstanceId, abilityName });
                 }}
                 onRetreat={handleRetreat}
                 isTargetable={activeIsTargetable}
                 onTargetClick={() => {
                   if (me.active) handleTargetClick(me.active.instanceId);
                 }}
                 onCardContextMenu={handleCardContextMenu}
                 isAttacking={attackingPlayer === myIndex}
                 compact
               />
             </div>

             {/* Player Bench */}
             <div className={`flex shrink items-center justify-center ${isMobile ? "py-1 gap-1" : "py-1 gap-2"}`}>
               {Array.from({ length: 5 }).map((_, i) => {
                 const benchCard = me.bench.cards[i] || null;
                 const isTargetableForCard = benchCard
                   ? benchTargetableIds.has(benchCard.instanceId)
                   : false;
                 const isTargetableForRetreat = retreatSelecting && !!benchCard;
                 const isTargetableForPromotion = promotionRequired && !!benchCard;

                 return (
                   <BenchSpot
                     key={i}
                     index={i}
                     card={benchCard}
                     isTargetable={isTargetableForCard || isTargetableForRetreat || isTargetableForPromotion}
                     onTargetClick={() => {
                       if (benchCard && promotionRequired) {
                         dispatchAction({ type: "promote", benchInstanceId: benchCard.instanceId });
                       } else if (benchCard && retreatSelecting) {
                         handleRetreatTargetClick(benchCard.instanceId);
                       } else if (benchCard) {
                         handleTargetClick(benchCard.instanceId);
                       }
                     }}
                     onClick={() => benchCard && handleBenchClick(benchCard)}
                     isSelected={!!benchCard && selectedBenchId === benchCard.instanceId}
                     onBenchAction={(action) => benchCard && handleBenchAction(benchCard.instanceId, action)}
                     isMyTurn={isMyTurn}
                     gameState={gameState}
                     playerIndex={myIndex as 0 | 1}
                     onUseAbility={(cardInstanceId, abilityName) => {
                       dispatchAction({ type: "use_ability", cardId: cardInstanceId, abilityName });
                       setSelectedBenchId(null);
                     }}
                     onCardContextMenu={handleCardContextMenu}
                     compact
                   />
                 );
               })}
             </div>

             {/* Player Hand */}
             <div className="relative w-full shrink min-h-0 overflow-hidden">
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
                 compact
               />
             </div>
          </div>

          {/* Right: Lost/Deck/Discard (Player Right) */}
          <div className="flex flex-col items-center justify-end gap-4 pb-4">
             <LostZone cards={me.lostZone.cards} onClick={() => setBrowsingZone({ title: "我的失落区", cards: me.lostZone.cards })} />
             <DeckPile count={me.deck.cards.length} label="牌组" />
             <DiscardPile cards={me.discard.cards} label="弃牌堆" onClick={() => me.discard.cards.length > 0 && setBrowsingZone({ title: "我的弃牌堆", cards: me.discard.cards })} />
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
        {gameState.prompt && gameState.prompt.type === "select_cards" && gameState.prompt.playerIndex === myIndex && (
          <CardSelectionModal
            prompt={gameState.prompt}
            gameState={gameState}
            onConfirm={(selectedIds) => onAction?.({ type: "select_cards_response", selectedIds })}
          />
        )}

        {/* Coin Flip Modal */}
        {gameState.prompt && gameState.prompt.type === "coin_flip" && gameState.prompt.playerIndex === myIndex && (
          <CoinFlipModal
            prompt={gameState.prompt}
            onDone={() => onAction?.({ type: "prompt_response", data: { acknowledged: true } })}
          />
        )}

        {/* Choose Option Modal */}
        {gameState.prompt && gameState.prompt.type === "choose_option" && gameState.prompt.playerIndex === myIndex && (
          <ChooseOptionModal
            prompt={gameState.prompt}
            onConfirm={(selectedIds) => onAction?.({ type: "prompt_response", data: { selectedOptions: selectedIds } })}
          />
        )}

        {/* Confirm Modal */}
        {gameState.prompt && gameState.prompt.type === "confirm" && gameState.prompt.playerIndex === myIndex && (
          <ConfirmModal
            prompt={gameState.prompt}
            onConfirm={(yes) => onAction?.({ type: "prompt_response", data: { confirmed: yes } })}
          />
        )}

        {/* Order Cards Modal */}
        {gameState.prompt && gameState.prompt.type === "order_cards" && gameState.prompt.playerIndex === myIndex && (
          <OrderCardsModal
            prompt={gameState.prompt}
            onConfirm={(orderedIds) => onAction?.({ type: "prompt_response", data: { orderedIds } })}
          />
        )}

        {/* Select Pokemon Modal */}
        {gameState.prompt && gameState.prompt.type === "select_pokemon" && gameState.prompt.playerIndex === myIndex && (
          <SelectPokemonModal
            prompt={gameState.prompt}
            gameState={gameState}
            myIndex={myIndex}
            onConfirm={(selectedIds) => onAction?.({ type: "prompt_response", data: { selectedOptions: selectedIds } })}
          />
        )}

        {/* Waiting for opponent indicator */}
        {gameState.prompt && gameState.prompt.playerIndex !== myIndex && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-6 py-3 text-sm text-zinc-300 shadow-lg border border-zinc-700">
              <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              等待对手操作...
            </div>
          </div>
        )}

        {/* Energy Selection Modal (Retreat) */}
        {retreatEnergyPending && me.active && (
          <EnergySelectionModal
            energyCards={me.active.attachedEnergy}
            required={getEffectiveRetreatCost(gameState, myIndex, me.active)}
            pokemonName={me.active.card.name}
            onConfirm={handleRetreatEnergyConfirm}
            onCancel={() => setRetreatEnergyPending(null)}
          />
        )}

        {/* Zone Browser Modal */}
        {browsingZone && (
          <ZoneBrowserModal
            title={browsingZone.title}
            cards={browsingZone.cards}
            onClose={() => setBrowsingZone(null)}
          />
        )}

        {/* Animation Overlays */}
        <EvolutionOverlay isActive={evolutionAnim.active} pokemonName={evolutionAnim.name} />
        <EnergyAttachOverlay isActive={energyAnim.active} energyType={energyAnim.type} animKey={energyAnim.key} />
      </div>
    </DndContext>
    </AnimationProvider>
  );
}
