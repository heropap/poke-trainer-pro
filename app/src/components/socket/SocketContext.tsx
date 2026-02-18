
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  gameId: string | null;
  setGameId: (id: string | null) => void;
  /** Persistent player ID for reconnection (assigned by server) */
  playerId: string | null;
  setPlayerId: (id: string | null) => void;
  /** Whether the connection was lost and we're attempting to reconnect */
  isReconnecting: boolean;
  /** Whether the opponent is currently disconnected */
  opponentDisconnected: boolean;
  /** Grace period remaining (ms) before opponent auto-concedes */
  opponentGraceMs: number;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  gameId: null,
  setGameId: () => {},
  playerId: null,
  setPlayerId: () => {},
  isReconnecting: false,
  opponentDisconnected: false,
  opponentGraceMs: 0,
});

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [opponentGraceMs, setOpponentGraceMs] = useState(0);

  // Refs to access latest state in callbacks
  const gameIdRef = useRef(gameId);
  const playerIdRef = useRef(playerId);
  const graceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceEndRef = useRef<number>(0);

  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  // Cleanup grace timer
  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    setOpponentGraceMs(0);
    graceEndRef.current = 0;
  }, []);

  useEffect(() => {
    // Connect to the custom server socket with exponential backoff
    const socketInstance = io({
      path: "/api/socket",
      addTrailingSlash: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,        // Start at 1s
      reconnectionDelayMax: 15000,    // Max 15s (exponential backoff)
      randomizationFactor: 0.3,       // Add jitter
      timeout: 10000,
    });

    socketInstance.on("connect", () => {
      console.log("Socket connected:", socketInstance.id);
      setIsConnected(true);

      // If we have a gameId and playerId, attempt reconnection
      if (gameIdRef.current && playerIdRef.current) {
        console.log("[Socket] Attempting game reconnection...", gameIdRef.current);
        socketInstance.emit("game:reconnect", {
          gameId: gameIdRef.current,
          playerId: playerIdRef.current,
        });
      }

      setIsReconnecting(false);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);

      // If we're in a game, show reconnecting state
      if (gameIdRef.current && playerIdRef.current) {
        setIsReconnecting(true);
      }
    });

    socketInstance.on("connect_error", (error) => {
      console.warn("[Socket] Connection error:", error.message);
      setIsConnected(false);
    });

    // Reconnection events from socket.io-client
    socketInstance.io.on("reconnect_attempt", (attempt) => {
      console.log(`[Socket] Reconnection attempt #${attempt}`);
      setIsReconnecting(true);
    });

    socketInstance.io.on("reconnect_failed", () => {
      console.error("[Socket] Reconnection failed after all attempts");
      setIsReconnecting(false);
    });

    socketInstance.io.on("reconnect", (attempt) => {
      console.log(`[Socket] Reconnected after ${attempt} attempt(s)`);
    });

    // Opponent disconnect/reconnect events
    socketInstance.on("game:opponent_disconnected", (data: { graceMs: number }) => {
      console.log(`[Socket] Opponent disconnected, grace period: ${data.graceMs}ms`);
      setOpponentDisconnected(true);
      graceEndRef.current = Date.now() + data.graceMs;

      // Start countdown timer
      graceTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, graceEndRef.current - Date.now());
        setOpponentGraceMs(remaining);
        if (remaining <= 0) {
          clearInterval(graceTimerRef.current!);
          graceTimerRef.current = null;
        }
      }, 1000);
    });

    socketInstance.on("game:opponent_reconnected", () => {
      console.log("[Socket] Opponent reconnected");
      setOpponentDisconnected(false);
      clearGraceTimer();
    });

    socketInstance.on("game:reconnect_failed", (data: { message: string }) => {
      console.warn("[Socket] Game reconnection failed:", data.message);
      setIsReconnecting(false);
      // Clear stale game data
      setGameId(null);
      setPlayerId(null);
    });

    setSocket(socketInstance);

    return () => {
      clearGraceTimer();
      socketInstance.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      gameId,
      setGameId,
      playerId,
      setPlayerId,
      isReconnecting,
      opponentDisconnected,
      opponentGraceMs,
    }}>
      {children}
    </SocketContext.Provider>
  );
}
