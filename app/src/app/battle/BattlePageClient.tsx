"use client";

import { BattleBoard } from "@/components/battle/board/BattleBoard";
import { useEffect, useState, useCallback, useRef } from "react";
import { Card } from "@/types/card";
import { useDeckContext } from "@/components/deck/DeckContext";
import { useSocket } from "@/components/socket/SocketContext";
import { StoredDeck } from "@/services/deck-storage";
import { initializeGame, SetupResult } from "@/engine/battle-setup";
import { GameState, GamePhase, GameCard } from "@/engine/game-state";
import { zoneSize } from "@/engine/zones";
import { processAction, startFirstTurn, GameAction } from "@/engine/game-controller";
import { computeAIAction, AIDecision } from "@/engine/ai-player";
import Link from "next/link";
import { adaptGameState } from "@/lib/ryuu-adapter/adapter";
import { MockEngine } from "@/lib/ryuu-adapter/mock-engine";
import { ExternalState, ExternalPlayer, ExternalCard, CardList } from "@/lib/ryuu-adapter/external-types";
import { createMockInitialState } from "@/lib/ryuu-adapter/mock-data";
import { preloadDeckImages, addPreloadLinks } from "@/lib/image-preloader";
import { setPromptStateChangeCallback, pendingPrompts } from "@/engine/effects/effect-context";
import { OpeningSequenceModal } from "@/components/battle/board/OpeningSequenceModal";
import { PokemonPlacementModal } from "@/components/battle/board/PokemonPlacementModal";
import { setFirstPlayer, finalizeManualPlacement, PlacementChoice } from "@/engine/battle-prepare";

// ─── Battle Mode Types ───

type BattleMode = "ai" | "local" | "online" | "mock_engine"; // Added mock_engine mode

// ─── AI Turn Execution Delay (ms) ───
const AI_ACTION_DELAY = 800;
const AI_TURN_START_DELAY = 600;
/** Maximum actions the AI can take per turn to prevent infinite loops */
const AI_MAX_ACTIONS_PER_TURN = 30;

export default function BattlePageClient() {
  const { validDecks, loading: decksLoading } = useDeckContext();
  const { socket, isConnected, playerId, setPlayerId, isReconnecting, opponentDisconnected, opponentGraceMs } = useSocket();
  const [cardIndex, setCardIndex] = useState<Map<string, Card>>(new Map());
  const [cardsLoading, setCardsLoading] = useState(true);

  const [selectedDeck1, setSelectedDeck1] = useState<string>("");
  const [selectedDeck2, setSelectedDeck2] = useState<string>("");
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [battleMode, setBattleMode] = useState<BattleMode>("ai");
  const [lobbyTab, setLobbyTab] = useState<"ai" | "online" | "mock">("ai");

  // Turn timer state (online games)
  const [turnTimeRemaining, setTurnTimeRemaining] = useState<number>(90);
  const [turnTimeTotal, setTurnTimeTotal] = useState<number>(90);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Client-side turn timer countdown (synced periodically by server)
  useEffect(() => {
    if (battleMode !== "online" || !gameState || gameState.phase === GamePhase.GAME_OVER) {
      if (turnTimerRef.current) { clearInterval(turnTimerRef.current); turnTimerRef.current = null; }
      return;
    }
    turnTimerRef.current = setInterval(() => {
      setTurnTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current); };
  }, [battleMode, gameState?.phase, gameState?.currentPlayer]);

  // Pokemon placement state (shown before coin flip for human players)
  const [placementData, setPlacementData] = useState<{
    basicPokemon: GameCard[];
    playerName: string;
    pendingGameState: GameState;
    effectiveMode: BattleMode;
    coinFlipResult: { winner: 0 | 1; result: "heads" | "tails" } | null;
  } | null>(null);

  // Opening sequence state (coin flip animation + first/second choice)
  const [openingData, setOpeningData] = useState<{
    coinResult: "heads" | "tails";
    flipWinner: 0 | 1;
    playerNames: [string, string];
    pendingGameState: GameState;
    effectiveMode: BattleMode;
  } | null>(null);

  // Mock Engine Ref
  const mockEngineRef = useRef<MockEngine | null>(null);

  // AI state
  const [aiThinking, setAiThinking] = useState(false);
  const [aiLastAction, setAiLastAction] = useState<string>("");
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to hold the latest gameState for AI async callbacks
  const gameStateRef = useRef<GameState | null>(null);

  // AI speed control
  type AiSpeed = "slow" | "normal" | "fast" | "instant";
  const AI_SPEED_MAP: Record<AiSpeed, number> = {
    slow: 1500,
    normal: 800,
    fast: 300,
    instant: 50,
  };
  const [aiSpeed, setAiSpeed] = useState<AiSpeed>("normal");
  const aiSpeedRef = useRef<number>(AI_SPEED_MAP["normal"]);
  // Keep ref in sync
  useEffect(() => {
    aiSpeedRef.current = AI_SPEED_MAP[aiSpeed];
  }, [aiSpeed]);

  // Track whether we're in local mode or online mode
  const isLocalGame = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Cleanup AI timer on unmount
  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  // ─── Prompt State Change Subscription ───
  // When an effect (e.g. promptDiscardFromHand) sets state.prompt mid-execution,
  // this callback fires immediately, triggering a React re-render so the
  // prompt modal appears while processAction is still awaiting the user's response.
  // Use a ref for battleMode to avoid re-registering the callback on every state change.
  const battleModeRef = useRef(battleMode);
  useEffect(() => { battleModeRef.current = battleMode; }, [battleMode]);

  useEffect(() => {
    setPromptStateChangeCallback((updatedState: GameState) => {
      const prompt = updatedState.prompt;
      if (!prompt) return;

      // If this is an AI player's prompt, auto-resolve immediately
      // (AI doesn't need to see a modal — just pick cards automatically)
      if (battleModeRef.current === "ai" && prompt.playerIndex === 1) {
        const resolve = pendingPrompts.get(prompt.id);
        if (resolve) {
          const aiPlayer = updatedState.players[1];
          const oppPlayer = updatedState.players[0];
          const zone = prompt.type === "select_cards" ? prompt.zone : "hand";
          const needed = prompt.type === "select_cards" ? prompt.min : 0;

          // Get cards from the appropriate zone
          let cards: typeof aiPlayer.hand.cards = [];
          switch (zone) {
            case "hand": cards = aiPlayer.hand.cards; break;
            case "deck": cards = aiPlayer.deck.cards; break;
            case "discard": cards = aiPlayer.discard.cards; break;
            case "bench": cards = aiPlayer.bench.cards; break;
            case "opponent_bench": cards = oppPlayer.bench.cards; break;
            case "own_field": cards = [...(aiPlayer.active ? [aiPlayer.active] : []), ...aiPlayer.bench.cards]; break;
          }

          // Filter by prompt.targets if provided (only pick from allowed targets)
          if (prompt.type === "select_cards" && prompt.targets && prompt.targets.length > 0) {
            cards = cards.filter(c => prompt.type === "select_cards" && prompt.targets!.includes(c.instanceId));
          }

          const autoIds: string[] = [];
          for (let i = 0; i < cards.length && autoIds.length < needed; i++) {
            autoIds.push(cards[i].instanceId);
          }
          pendingPrompts.delete(prompt.id);
          updatedState.prompt = null;
          resolve(autoIds);
          return;
        }
      }

      // For human player: trigger re-render with the intermediate state
      // that has prompt set, so BattleBoard shows the selection modal
      setGameState({ ...updatedState });
    });

    return () => {
      setPromptStateChangeCallback(null);
    };
  }, []);

  // ─── Image Preloading at Battle Start ───
  const preloadCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!gameState) return;

    // Collect all visible card image URLs for preloading
    const urls: string[] = [];
    for (const player of gameState.players) {
      // Active Pokemon (priority)
      if (player.active?.card.images?.small) urls.push(player.active.card.images.small);
      // Bench Pokemon
      for (const benchCard of player.bench.cards) {
        if (benchCard.card.images?.small) urls.push(benchCard.card.images.small);
      }
      // Hand cards
      for (const handCard of player.hand.cards) {
        if (handCard.card.images?.small) urls.push(handCard.card.images.small);
      }
    }

    // Add <link rel="preload"> for the most critical images (active Pokemon)
    const criticalUrls: string[] = [];
    if (gameState.players[0]?.active?.card.images?.small) criticalUrls.push(gameState.players[0].active.card.images.small);
    if (gameState.players[1]?.active?.card.images?.small) criticalUrls.push(gameState.players[1].active.card.images.small);
    const removeLinks = addPreloadLinks(criticalUrls);

    // Preload all visible card images in background
    const { cancel } = preloadDeckImages(urls);
    preloadCancelRef.current = cancel;

    return () => {
      cancel();
      removeLinks();
    };
  // Only run once when game starts (gameState becomes non-null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState !== null]);

  // Load card data
  useEffect(() => {
    async function loadData() {
      const data = await import("@/data/cards/_index.json");
      const cards = data.default as Card[];
      const index = new Map<string, Card>();
      cards.forEach((c) => index.set(c.id, c));
      setCardIndex(index);
      setCardsLoading(false);
    }
    loadData();
  }, []);

  const cardLookup = useCallback(
    (id: string) => cardIndex.get(id),
    [cardIndex]
  );

  // Auto-select decks if only one or two available
  useEffect(() => {
    if (validDecks.length >= 1 && !selectedDeck1) {
      setSelectedDeck1(validDecks[0].id);
    }
    if (validDecks.length >= 2 && !selectedDeck2) {
      setSelectedDeck2(validDecks[1].id);
    }
  }, [validDecks, selectedDeck1, selectedDeck2]);

  // Online game ID (tracked separately from local games)
  const [onlineGameId, setOnlineGameId] = useState<string | null>(null);

  // Online error toast
  const [onlineError, setOnlineError] = useState<string | null>(null);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    function onMatchFound(data: any) {
      console.log("Match found!", data);
      setIsMatchmaking(false);
      setMatchFound(true);
    }

    function onGameStart(data: any) {
      console.log("Game started!", data);
      if (data.gameState) {
        isLocalGame.current = false;
        setBattleMode("online");
        setGameState(data.gameState);
      }
      if (typeof data.yourPlayerId === "number") {
        console.log("Assigned Player ID:", data.yourPlayerId);
        setMyPlayerId(data.yourPlayerId);
      }
      if (data.gameId) {
        setOnlineGameId(data.gameId);
      }
      // Save persistent playerId for reconnection
      if (data.playerId) {
        setPlayerId(data.playerId);
      }
    }

    function onReconnected(data: any) {
      console.log("Reconnected to game!", data);
      if (data.gameState) {
        isLocalGame.current = false;
        setBattleMode("online");
        setGameState(data.gameState);
      }
      if (typeof data.yourPlayerId === "number") {
        setMyPlayerId(data.yourPlayerId);
      }
      if (data.gameId) {
        setOnlineGameId(data.gameId);
      }
    }

    function onStateUpdate(data: any) {
      if (data.gameState) {
        setGameState(data.gameState);
      }
    }

    function onGameOver(data: any) {
      console.log("Game over!", data);
      if (data.gameState) {
        setGameState(data.gameState);
      }
    }

    function onActionError(data: any) {
      console.warn("[Online] Action error:", data.error);
      setOnlineError(data.error || "操作失败");
      // Clear error after 3s
      setTimeout(() => setOnlineError(null), 3000);
    }

    function onPromotionRequired(data: any) {
      console.log("[Online] Promotion required for player", data.playerIndex);
      // The state update will have already been received;
      // the BattleBoard will see that active is null and show promotion UI
      // No extra handling needed — the user clicks a bench Pokemon to promote
    }

    function onTimerSync(data: { remaining: number; total: number }) {
      setTurnTimeRemaining(data.remaining);
      setTurnTimeTotal(data.total);
    }

    function onError(data: any) {
      console.error("[Socket] Error:", data.message);
      setOnlineError(data.message || "服务器错误");
      setTimeout(() => setOnlineError(null), 3000);
    }

    socket.on("matchmaking:found", onMatchFound);
    socket.on("game:start", onGameStart);
    socket.on("game:reconnected", onReconnected);
    socket.on("game:state_update", onStateUpdate);
    socket.on("game:over", onGameOver);
    socket.on("game:action_error", onActionError);
    socket.on("game:promotion_required", onPromotionRequired);
    socket.on("game:timer_sync", onTimerSync);
    socket.on("error", onError);

    return () => {
      socket.off("matchmaking:found", onMatchFound);
      socket.off("game:start", onGameStart);
      socket.off("game:reconnected", onReconnected);
      socket.off("game:state_update", onStateUpdate);
      socket.off("game:over", onGameOver);
      socket.off("game:action_error", onActionError);
      socket.off("game:promotion_required", onPromotionRequired);
      socket.off("game:timer_sync", onTimerSync);
      socket.off("error", onError);
    };
  }, [socket]);

  // ─── AI Turn Execution ───

  /**
   * Execute a single AI action with a delay.
   * This runs recursively: after each action, if the AI still
   * has the turn, it computes and executes the next action.
   */
  const handleStartMockEngine = useCallback(() => {
    // 1. Create initial state from enhanced Mock Data
    const initialState = createMockInitialState();

    // 2. Initialize Engine
    const engine = new MockEngine(initialState);
    mockEngineRef.current = engine;
    
    // 3. Adapt & Set State
    const adapted = adaptGameState(engine.getState());
    setGameState(adapted);
    setBattleMode("mock_engine");
    setMyPlayerId(0);
  }, []);

  const handleMockAction = useCallback((action: GameAction): { success: boolean; error?: string } => {
    const engine = mockEngineRef.current;
    if (!engine || !gameState) return { success: false, error: "Engine not ready" };

    const currentPlayer = gameState.currentPlayer;
    const playerId = currentPlayer === 0 ? "p1" : "p2"; // Mock IDs

    let result: { success: boolean; message?: string } = { success: false, message: "Unknown action" };

    if (action.type === "play_card") {
      if (!action.cardId) {
        return { success: false, error: "Missing cardId" };
      }

      // Find card in engine state
      const player = engine.getState().players[currentPlayer];
      // In a real app, action.cardId is the instanceId from frontend (e.g., ext-c-charmeleon-1-...)
      // We need to match it to engine's card ID.
      // Our adapter generates instanceId as `ext-${extCard.id}-...`.
      // So we can try to find the card in hand that matches.
      
      const engineCard = player.hand.cards.find(c => action.cardId!.startsWith(`ext-${c.id}`));
      
      if (!engineCard) {
          return { success: false, error: "Card not found in engine hand" };
      }

      if (engineCard.superType === "Energy") {
          // Assume target is active for now, or use targetId if mapped
          // Simplified: attach to active
          result = engine.playEnergy(playerId, engineCard.id, "active-" + playerId);
      } else if (engineCard.superType === "Trainer") {
          result = engine.playTrainer(playerId, engineCard.id, "active-" + playerId);
      } else if (engineCard.superType === "Pokemon" && engineCard.subType?.includes("Stage")) {
          // Evolve
          result = engine.evolvePokemon(playerId, engineCard.id, "active-" + playerId);
      }
      
    } else if (action.type === "attack") {
       // Mock Engine expects attack name. GameAction usually has 'attackName' or 'moveIndex'
       // Let's assume for mock purposes we use the first attack if name not provided, or hardcode "Scratch"
       const attackName = (action as any).name || "Scratch";
       result = engine.attack(playerId, attackName);
    } else if (action.type === "end_turn") {
       engine.endTurn();
       result = { success: true };
    }

    if (result.success) {
       setGameState(adaptGameState(engine.getState()));
       return { success: true };
    } else {
       return { success: false, error: result.message };
    }
  }, [gameState]);

  // ─── AI Turn Execution ───

  /**
   * Execute a single AI action with a delay.
   * This runs recursively: after each action, if the AI still
   * has the turn, it computes and executes the next action.
   */
  const executeAITurn = useCallback(async (currentState: GameState, actionCount: number = 0) => {
    if (currentState.phase === GamePhase.GAME_OVER) {
      setAiThinking(false);
      return;
    }

    // AI is player index 1
    const aiIndex = 1 as const;

    if (currentState.currentPlayer !== aiIndex) {
      // Not AI's turn anymore
      setAiThinking(false);
      setAiLastAction("");
      return;
    }

    // Safety: prevent infinite action loops
    if (actionCount >= AI_MAX_ACTIONS_PER_TURN) {
      console.warn(`[AI] Hit max actions per turn (${AI_MAX_ACTIONS_PER_TURN}), forcing end turn`);
      const endResult = await processAction(currentState, aiIndex, { type: "end_turn" });
      if (endResult.success) {
        setGameState(endResult.newState);
      }
      setAiThinking(false);
      setAiLastAction("");
      return;
    }

    setAiThinking(true);

    const decision = computeAIAction(currentState, aiIndex);
    if (!decision) {
      setAiThinking(false);
      return;
    }

    // Execute the action after a delay so the player can see it
    aiTimerRef.current = setTimeout(async () => {
      // Use the ref to get the absolute latest state
      const latestState = gameStateRef.current;
      if (!latestState || latestState.phase === GamePhase.GAME_OVER) {
        setAiThinking(false);
        return;
      }

      // Re-check it's still AI's turn
      if (latestState.currentPlayer !== aiIndex) {
        setAiThinking(false);
        return;
      }

      // Re-compute decision with latest state (state might have changed)
      const freshDecision = computeAIAction(latestState, aiIndex);
      if (!freshDecision) {
        setAiThinking(false);
        return;
      }

      console.log(`[AI] (${actionCount + 1}/${AI_MAX_ACTIONS_PER_TURN}) ${freshDecision.reason}`);
      setAiLastAction(freshDecision.reason);

      const result = await processAction(latestState, aiIndex, freshDecision.action);

      if (result.success) {
        setGameState(result.newState);

        // If game ended or turn switched, stop
        if (result.gameEnded || result.newState.phase === GamePhase.GAME_OVER) {
          setAiThinking(false);
          setAiLastAction("");
          return;
        }

        // If it's still AI's turn (e.g., played a card but didn't attack yet),
        // continue executing actions after a short delay
        if (result.newState.currentPlayer === aiIndex) {
          aiTimerRef.current = setTimeout(() => {
            // Get the latest state from ref again
            const nextState = gameStateRef.current;
            if (nextState && nextState.currentPlayer === aiIndex) {
              executeAITurn(nextState, actionCount + 1);
            } else {
              setAiThinking(false);
              setAiLastAction("");
            }
          }, aiSpeedRef.current);
        } else {
          // Turn switched to human
          setAiThinking(false);
          setAiLastAction("");
        }
      } else {
        console.warn(`[AI] Action failed: ${result.error}, ending turn`);
        // If AI action fails, try to end turn
        const endResult = await processAction(latestState, aiIndex, { type: "end_turn" });
        if (endResult.success) {
          setGameState(endResult.newState);
        }
        setAiThinking(false);
        setAiLastAction("");
      }
    }, aiSpeedRef.current);
  }, []);

  /**
   * Trigger AI turn when it becomes AI's turn (only in AI mode).
   */
  useEffect(() => {
    if (!gameState || battleMode !== "ai" || !isLocalGame.current) return;
    if (gameState.phase === GamePhase.GAME_OVER) return;

    // AI is player 1
    if (gameState.currentPlayer === 1 && !aiThinking) {
      // Small delay before AI starts its turn
      aiTimerRef.current = setTimeout(() => {
        const latest = gameStateRef.current;
        if (latest && latest.currentPlayer === 1) {
          executeAITurn(latest);
        }
      }, AI_TURN_START_DELAY);
    }
  }, [gameState, battleMode, aiThinking, executeAITurn]);

  // ─── Action Handlers ───

  const handleEndTurn = useCallback(async () => {
    if (!gameState) return;

    if (isLocalGame.current) {
      const result = await processAction(gameState, gameState.currentPlayer, { type: "end_turn" });
      setGameState(result.newState);
    } else if (socket && onlineGameId) {
      socket.emit("game:action", {
        gameId: onlineGameId,
        action: { type: "end_turn" }
      });
    }
  }, [socket, gameState, onlineGameId]);

  /**
   * Handle all game actions from BattleBoard for local play.
   * In AI mode, only player 0 (human) can issue actions this way.
   */
  const handleLocalAction = useCallback(async (action: GameAction): Promise<{ success: boolean; error?: string }> => {
    if (!gameState || !isLocalGame.current) return { success: false, error: "游戏未初始化" };

    // In AI mode, block actions during AI's turn
    // Exception: select_cards_response and prompt_response are allowed even during AI turn
    // if the prompt is directed at the human player (playerIndex 0).
    const isPromptResponse = action.type === "select_cards_response" || action.type === "prompt_response";
    const humanHasActivePrompt = isPromptResponse && gameState.prompt?.playerIndex === 0;

    if (battleMode === "ai" && gameState.currentPlayer !== 0 && !humanHasActivePrompt) {
      console.warn("[AI Mode] It's the AI's turn, action blocked");
      return { success: false, error: "AI 回合中" };
    }

    // For prompt responses, use the prompt's playerIndex to avoid wrong-turn errors
    const playerIndex = humanHasActivePrompt
      ? (gameState.prompt!.playerIndex as 0 | 1)
      : gameState.currentPlayer;
    const result = await processAction(gameState, playerIndex, action);

    if (result.success) {
      setGameState(result.newState);
      return { success: true };
    } else {
      console.warn(`[LocalGame] Action failed: ${result.error}`);
      return { success: false, error: result.error };
    }
  }, [gameState, battleMode]);

  /**
   * Start a local/AI battle.
   */
  const handleStartBattle = useCallback((overrideDeck2Id?: string, mode?: BattleMode) => {
    const deck1 = validDecks.find((d) => d.id === selectedDeck1);
    const deck2Id = overrideDeck2Id || selectedDeck2;
    const deck2 = validDecks.find((d) => d.id === deck2Id);

    if (!deck1 || !deck2) {
      console.warn("[BattlePage] Missing deck:", { deck1: !!deck1, deck2: !!deck2, selectedDeck1, deck2Id });
      return;
    }

    const effectiveMode = mode || battleMode;
    const p2Name = effectiveMode === "ai" ? "AI 对手" : "玩家 2";

    console.log(`[BattlePage] Starting ${effectiveMode} battle...`);
    console.log(`  Player 1: ${deck1.name}`);
    console.log(`  Player 2 (${p2Name}): ${deck2.name}`);

    // Human player (0) picks manually; AI (1) auto-places
    const manualPlayers: (0 | 1)[] = effectiveMode === "ai" || effectiveMode === "local" ? [0] : [];

    const result = initializeGame(deck1, deck2, cardLookup, "玩家", p2Name, {
      fullPreparation: true,
      enableProxyCards: true,
      manualPlacementPlayers: manualPlayers,
    });
    setSetupResult(result);

    if (result.success && result.gameState) {
      isLocalGame.current = true;
      setMyPlayerId(0);

      // If player 0 has pending placement, show placement modal first
      if (result.pendingPlacements && result.pendingPlacements[0]) {
        setPlacementData({
          basicPokemon: result.pendingPlacements[0],
          playerName: result.gameState.players[0].name,
          pendingGameState: result.gameState,
          effectiveMode,
          coinFlipResult: result.coinFlipResult ?? null,
        });
        setBattleMode(effectiveMode);
        console.log(`[BattlePage] Showing placement modal (${result.pendingPlacements[0].length} basic Pokemon)`);
      } else if (result.coinFlipResult) {
        // No pending placement — show opening sequence directly
        setOpeningData({
          coinResult: result.coinFlipResult.result,
          flipWinner: result.coinFlipResult.winner,
          playerNames: [result.gameState.players[0].name, result.gameState.players[1].name],
          pendingGameState: result.gameState,
          effectiveMode,
        });
        setBattleMode(effectiveMode);
        console.log(`[BattlePage] Showing opening sequence (coin flip winner: player ${result.coinFlipResult.winner})`);
      } else {
        // No coin flip (legacy mode) — start immediately
        setBattleMode(effectiveMode);
        const readyState = startFirstTurn(result.gameState);
        setGameState(readyState);
        console.log(`[BattlePage] ${effectiveMode} game started successfully (legacy mode)`);
      }
    } else {
      console.error("[BattlePage] Game initialization failed:", result.errors);
    }
  }, [selectedDeck1, selectedDeck2, validDecks, cardLookup, battleMode]);

  /**
   * Called when the player finishes placing their Pokemon.
   * Finalizes placement, sets prizes, then moves to coin flip.
   */
  const handlePlacementComplete = useCallback((choice: PlacementChoice) => {
    if (!placementData) return;

    const { pendingGameState, effectiveMode, coinFlipResult } = placementData;

    // Finalize: place pokemon + set prizes for player 0
    const result = finalizeManualPlacement(pendingGameState, 0, choice);
    if (!result.success) {
      console.error("[BattlePage] Placement failed:", result.errors);
      return;
    }

    setPlacementData(null);

    // Now show the opening sequence (coin flip)
    if (coinFlipResult) {
      setOpeningData({
        coinResult: coinFlipResult.result,
        flipWinner: coinFlipResult.winner,
        playerNames: [pendingGameState.players[0].name, pendingGameState.players[1].name],
        pendingGameState,
        effectiveMode,
      });
      console.log(`[BattlePage] Placement done, showing opening sequence`);
    } else {
      // No coin flip — start directly
      const readyState = startFirstTurn(pendingGameState);
      setGameState(readyState);
      console.log(`[BattlePage] Placement done, starting game directly`);
    }
  }, [placementData]);

  /**
   * Called when the opening sequence (coin flip + choice) completes.
   * Sets the chosen first player and starts the game.
   */
  const handleOpeningComplete = useCallback((firstPlayer: 0 | 1) => {
    if (!openingData) return;

    const { pendingGameState, effectiveMode } = openingData;

    // Override the first player if different from the coin flip winner
    if (pendingGameState.currentPlayer !== firstPlayer) {
      setFirstPlayer(pendingGameState, firstPlayer);
    }

    const readyState = startFirstTurn(pendingGameState);
    setGameState(readyState);
    setOpeningData(null);
    console.log(`[BattlePage] Opening sequence complete. First player: ${firstPlayer} (${pendingGameState.players[firstPlayer].name})`);
  }, [openingData]);

  const handleStartMatchmaking = useCallback(() => {
    if (!socket || !selectedDeck1) return;

    const deck = validDecks.find(d => d.id === selectedDeck1);
    if (!deck) return;

    const cardIds: string[] = [];
    deck.cards.forEach(c => {
      if (c.found && c.cardId) {
        for (let i = 0; i < c.quantity; i++) {
          cardIds.push(c.cardId);
        }
      }
    });

    setBattleMode("online");
    setIsMatchmaking(true);
    socket.emit("matchmaking:join", {
      deckId: selectedDeck1,
      deckName: deck.name,
      cards: cardIds
    });
  }, [socket, selectedDeck1, validDecks]);

  const handleCancelMatchmaking = useCallback(() => {
    if (!socket) return;
    setIsMatchmaking(false);
    socket.emit("matchmaking:cancel");
  }, [socket]);

  const handleReturnToLobby = useCallback(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    setGameState(null);
    setSetupResult(null);
    setPlacementData(null);
    setOpeningData(null);
    isLocalGame.current = false;
    setAiThinking(false);
    setAiLastAction("");
    setOnlineGameId(null);
    setOnlineError(null);
    setMatchFound(false);
    setMyPlayerId(null);
  }, []);

  const isLoading = decksLoading || cardsLoading;

  if (isLoading) {
    return (
      <div className="py-8 text-center text-zinc-500">加载中...</div>
    );
  }

  // No decks available
  if (validDecks.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
          尚未导入卡组
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          请先在卡组页面导入至少一副合法卡组，才能开始对战。
        </p>
        <Link
          href="/deck"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          前往导入卡组 →
        </Link>
      </div>
    );
  }

  // ─── Pokemon Placement (before coin flip) ───

  if (placementData && !gameState) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950">
        <PokemonPlacementModal
          basicPokemon={placementData.basicPokemon}
          playerName={placementData.playerName}
          onConfirm={handlePlacementComplete}
        />
      </div>
    );
  }

  // ─── Opening Sequence (Coin Flip + Choice) ───

  if (openingData && !gameState) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950">
        <OpeningSequenceModal
          coinResult={openingData.coinResult}
          flipWinner={openingData.flipWinner}
          playerNames={openingData.playerNames}
          myIndex={0}
          isAI={openingData.effectiveMode === "ai"}
          onComplete={handleOpeningComplete}
        />
      </div>
    );
  }

  // ─── Game In Progress ───

  if (gameState) {
    const isAIMode = battleMode === "ai";
    const isAITurn = isAIMode && gameState.currentPlayer === 1;
    const isMockMode = battleMode === "mock_engine";

    return (
      <div className="fixed inset-0 z-50 bg-zinc-950">
        <BattleBoard
          gameState={gameState}
          currentPlayerId={
            isAIMode
              ? "p1" // AI mode: always from player's perspective
              : battleMode === "local"
                ? (gameState.currentPlayer === 0 ? "p1" : "p2") // Local hot-seat
                : isMockMode 
                  ? "p1" // Mock mode: Player 1
                  : (myPlayerId === 1 ? "p2" : "p1") // Online: fixed perspective
          }
          onAction={(action: any) => {
            if (isLocalGame.current) {
              return handleLocalAction(action as GameAction);
            } else if (isMockMode) {
              return handleMockAction(action as GameAction);
            } else {
              // Online mode: send action to server
              if (socket && onlineGameId && action.type) {
                socket.emit("game:action", {
                  gameId: onlineGameId,
                  action
                });
                // Feedback comes asynchronously via game:action_error or game:state_update
                return { success: true };
              }
              return { success: false, error: "未连接服务器" };
            }
          }}
          battleMode={battleMode}
          aiSpeed={aiSpeed}
          onAiSpeedChange={(speed) => setAiSpeed(speed as AiSpeed)}
        />

        {/* Online Error Toast */}
        {onlineError && (
          <div className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 rounded-full bg-red-600/90 px-6 py-2 text-sm font-medium text-white shadow-xl backdrop-blur-md">
            {onlineError}
          </div>
        )}

        {/* Reconnecting Banner */}
        {isReconnecting && battleMode === "online" && (
          <div className="fixed left-1/2 top-4 z-[70] -translate-x-1/2 flex items-center gap-3 rounded-xl bg-yellow-600/90 px-6 py-3 shadow-xl backdrop-blur-md">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-200 border-t-transparent"></div>
            <span className="text-sm font-medium text-white">连接断开，正在重连...</span>
          </div>
        )}

        {/* Opponent Disconnected Banner */}
        {opponentDisconnected && battleMode === "online" && gameState.phase !== GamePhase.GAME_OVER && (
          <div className="fixed left-1/2 top-4 z-[70] -translate-x-1/2 flex items-center gap-3 rounded-xl bg-orange-600/90 px-6 py-3 shadow-xl backdrop-blur-md">
            <div className="h-3 w-3 animate-pulse rounded-full bg-orange-300"></div>
            <span className="text-sm font-medium text-white">
              对手已掉线 {opponentGraceMs > 0 && `(${Math.ceil(opponentGraceMs / 1000)}s 后自动判负)`}
            </span>
          </div>
        )}

        {/* Online Mode Indicator */}
        {battleMode === "online" && gameState.phase !== GamePhase.GAME_OVER && !isReconnecting && !opponentDisconnected && (
          <div className="fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-full bg-green-600/80 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-300"></div>
            在线对战
          </div>
        )}

        {/* Turn Timer (Online) */}
        {battleMode === "online" && gameState.phase !== GamePhase.GAME_OVER && !isReconnecting && (() => {
          const pct = turnTimeTotal > 0 ? turnTimeRemaining / turnTimeTotal : 1;
          const isWarning = turnTimeRemaining <= 10;
          const isMyTurn = gameState.currentPlayer === (myPlayerId ?? 0);
          const circumference = 2 * Math.PI * 18;
          const strokeDashoffset = circumference * (1 - pct);
          return (
            <div className={`fixed left-4 top-4 z-[60] flex items-center gap-2 rounded-full px-3 py-1.5 shadow-lg backdrop-blur-md ${
              isWarning ? "animate-pulse bg-red-600/90" : "bg-zinc-800/80"
            }`}>
              <svg width="40" height="40" className="-rotate-90">
                <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="20" cy="20" r="18" fill="none"
                  stroke={isWarning ? "#fca5a5" : isMyTurn ? "#4ade80" : "#60a5fa"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
                <text
                  x="20" y="20"
                  textAnchor="middle" dominantBaseline="central"
                  className="rotate-90"
                  transform="rotate(90, 20, 20)"
                  fill="white" fontSize="11" fontWeight="bold"
                >
                  {turnTimeRemaining}
                </text>
              </svg>
              <span className={`text-xs font-medium ${isWarning ? "text-red-100" : "text-zinc-300"}`}>
                {isMyTurn ? "你的回合" : "对手回合"}
              </span>
            </div>
          );
        })()}

        {/* AI Thinking Indicator */}
        {isAITurn && aiThinking && gameState.phase !== GamePhase.GAME_OVER && (
          <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 flex items-center gap-3 rounded-full bg-zinc-800/90 px-6 py-2 shadow-xl backdrop-blur-md">
            <div className="h-3 w-3 animate-pulse rounded-full bg-yellow-400"></div>
            <span className="text-sm font-medium text-zinc-200">
              AI 思考中...
            </span>
            {aiLastAction && (
              <span className="text-xs text-zinc-400">
                {aiLastAction}
              </span>
            )}
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState.phase === GamePhase.GAME_OVER && gameState.winner && (() => {
          // Determine if the local player won
          const localPlayerIndex = myPlayerId ?? 0;
          const iWon = gameState.winner!.playerIndex === localPlayerIndex;
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
              <div className="rounded-2xl bg-zinc-900 p-8 text-center shadow-2xl">
                <h2 className="text-3xl font-bold text-yellow-400">
                  {iWon ? "🏆 胜利！" : "💔 失败"}
                </h2>
                <p className="mt-4 text-xl text-zinc-100">
                  {gameState.players[gameState.winner!.playerIndex].name} 获胜！
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {gameState.winner!.condition === "prizes_taken" && "拿完了所有奖励卡"}
                  {gameState.winner!.condition === "no_bench_pokemon" && "对方场上没有宝可梦了"}
                  {gameState.winner!.condition === "deck_out" && "对方无法抽牌"}
                  {gameState.winner!.condition === "concede" && "对方认输"}
                </p>
                <button
                  onClick={handleReturnToLobby}
                  className="mt-6 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
                >
                  返回大厅
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // Matchmaking Searching View
  if (isMatchmaking) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">正在寻找对手...</h3>
        <p className="mt-2 text-zinc-500">预计等待时间: 3 秒</p>
        <button
          onClick={handleCancelMatchmaking}
          className="mt-8 rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          取消匹配
        </button>
      </div>
    );
  }

  // ─── Lobby: Deck Selection ───

  return (
    <div className="space-y-6">
      {/* Setup errors */}
      {setupResult && !setupResult.success && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <h4 className="font-medium text-red-700 dark:text-red-300">
            对战初始化失败
          </h4>
          <ul className="mt-2 space-y-1">
            {setupResult.errors.map((e, i) => (
              <li key={i} className="text-sm text-red-600 dark:text-red-400">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mode Selection Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex gap-6">
          <button
            onClick={() => setLobbyTab("ai")}
            className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
              lobbyTab === "ai"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            AI 对战
          </button>
          <button
            onClick={() => setLobbyTab("online")}
            className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
              lobbyTab === "online"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            在线匹配 (Beta)
          </button>
          <button
            onClick={() => { setLobbyTab("mock"); handleStartMockEngine(); }}
            className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
              lobbyTab === "mock"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            引擎测试 (Mock)
          </button>
        </div>
      </div>

      {/* Mock Tab Content */}
      {lobbyTab === "mock" && (
        <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border border-purple-200 bg-purple-50 p-8 dark:border-purple-900 dark:bg-purple-950/30">
          <div className="text-center">
            <h3 className="text-lg font-medium text-purple-900 dark:text-purple-100">
              外部引擎测试模式
            </h3>
            <p className="mt-2 text-sm text-purple-700 dark:text-purple-300">
              这是一个使用模拟外部引擎 (MockEngine) 的沙盒模式。
              <br />
              它绕过了原有的 GameController，直接测试核心规则 (贴能限制、伤害计算)。
            </p>
          </div>
          <div className="text-sm text-zinc-500">
             (游戏已在后台初始化，点击上方标签切换回 AI 或在线模式)
          </div>
        </div>
      )}

      {/* AI Tab Content */}
      {lobbyTab === "ai" && (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Player deck */}
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                选择你的卡组
              </label>
              <select
                value={selectedDeck1}
                onChange={(e) => setSelectedDeck1(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">选择卡组...</option>
                {validDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.totalCards} 张)
                  </option>
                ))}
              </select>
              {selectedDeck1 && (
                <DeckPreview deck={validDecks.find((d) => d.id === selectedDeck1)} />
              )}
            </div>

            {/* AI opponent deck */}
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                AI 对手卡组
              </label>
              <select
                value={selectedDeck2}
                onChange={(e) => setSelectedDeck2(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">选择卡组...</option>
                {validDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.totalCards} 张)
                  </option>
                ))}
              </select>
              {selectedDeck2 && (
                <DeckPreview deck={validDecks.find((d) => d.id === selectedDeck2)} />
              )}
              <p className="mt-2 text-xs text-zinc-400">
                AI 会自动操作对手的卡组。选择同一副卡组进行镜像对战。
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              let deck2Id = selectedDeck2;
              if (!deck2Id && validDecks.length >= 2) {
                deck2Id = validDecks[1].id;
                setSelectedDeck2(deck2Id);
              } else if (!deck2Id && validDecks.length === 1) {
                deck2Id = validDecks[0].id;
                setSelectedDeck2(deck2Id);
              }
              handleStartBattle(deck2Id, "ai");
            }}
            disabled={!selectedDeck1}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 px-6 py-3 text-base font-bold text-white shadow-lg transition-all hover:from-orange-600 hover:to-red-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-lg">⚔️</span>
            开始 AI 对战
          </button>
        </>
      )}

      {/* Online Tab Content */}
      {lobbyTab === "online" && (
        <>
          {/* Socket Status */}
          <div className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-600' : 'text-amber-600'}`}>
            <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-amber-500'}`}></div>
            {isConnected ? '已连接服务器' : '未连接服务器 (请使用 npm run dev 启动统一服务器)'}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Player deck */}
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                选择你的卡组
              </label>
              <select
                value={selectedDeck1}
                onChange={(e) => setSelectedDeck1(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">选择卡组...</option>
                {validDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.totalCards} 张)
                  </option>
                ))}
              </select>
              {selectedDeck1 && (
                <DeckPreview deck={validDecks.find((d) => d.id === selectedDeck1)} />
              )}
            </div>

            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <h4 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">在线匹配说明</h4>
              <p className="text-sm text-zinc-500">
                点击下方按钮开始寻找对手。匹配成功后将自动进入对战。
                <br/>
                <span className="text-xs opacity-75">需要两个浏览器窗口同时匹配</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={handleStartMatchmaking}
              disabled={!selectedDeck1 || !isConnected}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConnected ? '开始在线匹配' : '服务器未连接'}
            </button>

            <button
              onClick={() => {
                let deck2Id = selectedDeck2;
                if (!deck2Id && validDecks.length >= 2) {
                  deck2Id = validDecks[1].id;
                  setSelectedDeck2(deck2Id);
                } else if (!deck2Id && validDecks.length === 1) {
                  deck2Id = validDecks[0].id;
                  setSelectedDeck2(deck2Id);
                }
                handleStartBattle(deck2Id, "local");
              }}
              disabled={!selectedDeck1}
              className="w-full rounded-lg border border-zinc-300 bg-white px-6 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              本地双人对战
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───

function PlayerField({
  player,
  isCurrentPlayer,
}: {
  player: GameState["players"][0];
  isCurrentPlayer: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isCurrentPlayer
          ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950"
          : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {player.name}
        {isCurrentPlayer && (
          <span className="ml-2 text-sm text-blue-500">(当前回合)</span>
        )}
      </h3>

      {/* Active Pokemon */}
      <div className="mt-3 rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          战斗区
        </p>
        {player.active ? (
          <GameCardMini card={player.active} />
        ) : (
          <p className="mt-1 text-sm text-zinc-400">空</p>
        )}
      </div>

      {/* Bench */}
      <div className="mt-2 rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          备战区 ({zoneSize(player.bench)}/5)
        </p>
        {zoneSize(player.bench) > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {player.bench.cards.map((gc) => (
              <GameCardMini key={gc.instanceId} card={gc} compact />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">空</p>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
        <div>
          <p className="text-xs text-zinc-400">牌组</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.deck)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">手牌</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.hand)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">奖励卡</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.prizes)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">弃牌堆</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.discard)}</p>
        </div>
      </div>
    </div>
  );
}

function GameCardMini({ card, compact }: { card: GameCard; compact?: boolean }) {
  const hp = card.card.hp ? parseInt(card.card.hp, 10) : 0;
  const currentHp = hp > 0 ? hp - card.damageCounters * 10 : 0;

  if (compact) {
    return (
      <div className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {card.card.name}
        </span>
        {hp > 0 && (
          <span className="ml-1 text-zinc-400">
            {currentHp}/{hp}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-3">
      <div>
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          {card.card.name}
        </p>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {hp > 0 && (
            <span>
              HP: {currentHp}/{hp}
            </span>
          )}
          {card.card.types && card.card.types.length > 0 && (
            <span>
              {card.card.types.join("/")}
            </span>
          )}
          {card.statusConditions.length > 0 && (
            <span className="text-red-500">
              {card.statusConditions.join(", ")}
            </span>
          )}
        </div>
        {card.card.attacks && card.card.attacks.length > 0 && (
          <div className="mt-1 text-xs text-zinc-500">
            {card.card.attacks.map((a, i) => (
              <span key={i}>
                {a.name}
                {a.damage ? ` (${a.damage})` : ""}
                {i < card.card.attacks!.length - 1 ? " | " : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeckPreview({ deck }: { deck?: StoredDeck }) {
  if (!deck) return null;

  const pokemon = deck.cards.filter((c) => c.category === "pokemon");
  const trainers = deck.cards.filter((c) => c.category === "trainer");
  const energy = deck.cards.filter((c) => c.category === "energy");

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-zinc-400">宝可梦</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {pokemon.reduce((s, c) => s + c.quantity, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">训练家</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {trainers.reduce((s, c) => s + c.quantity, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">能量</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {energy.reduce((s, c) => s + c.quantity, 0)}
          </p>
        </div>
      </div>
      {deck.warnings.length > 0 && (
        <p className="mt-2 text-xs text-yellow-500">
          {deck.warnings.length} 个警告
        </p>
      )}
    </div>
  );
}
