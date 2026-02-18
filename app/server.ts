
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server, Socket } from "socket.io";
import { GameRoom, DISCONNECT_GRACE_MS } from "./src/server/game-room";
import { Card } from "./src/types/card";
import fs from "fs";
import path from "path";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ─── Server State ───

interface WaitingPlayer {
  socketId: string;
  deck: {
    id: string;
    name: string;
    cards: string[];
  };
}

let waitingPlayer: WaitingPlayer | null = null;
const games: Map<string, GameRoom> = new Map();
/** Map socketId → gameId so we can find a player's game on disconnect */
const playerGameMap: Map<string, string> = new Map();
/** Map socketId → persistent playerId for reconnection */
const socketPlayerIdMap: Map<string, string> = new Map();
let cardIndex: Map<string, Card> = new Map();

// ─── Load Card Data ───

try {
  const dataPath = path.join(process.cwd(), "src/data/cards/_index.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  (data as Card[]).forEach((c) => cardIndex.set(c.id, c));
  console.log(`[Server] Loaded ${cardIndex.size} cards`);
} catch (e) {
  console.error("[Server] Failed to load cards:", e);
}

const cardLookup = (id: string) => cardIndex.get(id);

// ─── Helper: Send masked state to each player in a room ───

function broadcastMaskedState(io: Server, game: GameRoom) {
  const p1Socket = io.sockets.sockets.get(game.player1SocketId);
  const p2Socket = io.sockets.sockets.get(game.player2SocketId);

  if (p1Socket) {
    p1Socket.emit("game:state_update", {
      gameState: game.getMaskedState(game.player1SocketId),
    });
  }
  if (p2Socket) {
    p2Socket.emit("game:state_update", {
      gameState: game.getMaskedState(game.player2SocketId),
    });
  }
}

function broadcastGameOver(io: Server, game: GameRoom) {
  const p1Socket = io.sockets.sockets.get(game.player1SocketId);
  const p2Socket = io.sockets.sockets.get(game.player2SocketId);

  if (p1Socket) {
    p1Socket.emit("game:over", {
      gameState: game.getMaskedState(game.player1SocketId),
      winner: game.state.winner,
    });
  }
  if (p2Socket) {
    p2Socket.emit("game:over", {
      gameState: game.getMaskedState(game.player2SocketId),
      winner: game.state.winner,
    });
  }
}

// ─── Cleanup stale games (every 5 minutes) ───

const GAME_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupStaleGames() {
  const now = Date.now();
  for (const [gameId, game] of games) {
    if (game.isGameOver() || now - game.lastActivityAt > GAME_TTL_MS) {
      console.log(`[Server] Cleaning up game ${gameId}`);
      // Clean playerGameMap entries
      for (const [socketId, gId] of playerGameMap) {
        if (gId === gameId) {
          playerGameMap.delete(socketId);
        }
      }
      games.delete(gameId);
    }
  }
}

setInterval(cleanupStaleGames, 5 * 60 * 1000);

// ─── Start Server ───

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Initialize Socket.io
  const io = new Server(server, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Socket.io event handling
  io.on("connection", (socket: Socket) => {
    console.log(`[Server] Client connected: ${socket.id}`);

    // ─── Matchmaking ───

    socket.on("matchmaking:join", (data) => {
      const deckData = data;
      console.log(`[Server] Player ${socket.id} joined matchmaking with deck: ${deckData?.deckName} (${deckData?.cards?.length} cards)`);

      if (!deckData || !deckData.cards || deckData.cards.length === 0) {
        socket.emit("error", { message: "Invalid deck data" });
        return;
      }

      const playerData: WaitingPlayer = {
        socketId: socket.id,
        deck: {
          id: deckData.deckId,
          name: deckData.deckName || "Unknown Deck",
          cards: deckData.cards,
        },
      };

      if (waitingPlayer) {
        // Match found
        const opponent = waitingPlayer;

        // Prevent self-matching
        if (opponent.socketId === socket.id) return;

        waitingPlayer = null;

        const gameId = `game-${Date.now()}`;
        socket.join(gameId);

        const opponentSocket = io.sockets.sockets.get(opponent.socketId);
        if (opponentSocket) {
          opponentSocket.join(gameId);

          // Create GameRoom
          const room = new GameRoom(
            gameId,
            opponent.socketId,
            "Player 1",
            socket.id,
            "Player 2",
            cardLookup
          );

          // Initialize game with real decks
          const success = room.initialize(opponent.deck, playerData.deck);

          if (success) {
            games.set(gameId, room);
            playerGameMap.set(opponent.socketId, gameId);
            playerGameMap.set(socket.id, gameId);
            socketPlayerIdMap.set(opponent.socketId, room.player1Id);
            socketPlayerIdMap.set(socket.id, room.player2Id);
            console.log(`[Server] Created and initialized game room ${gameId}`);

            // Notify match found
            io.to(gameId).emit("matchmaking:found", {
              gameId,
              opponent: { name: "Opponent" },
            });

            // Send masked initial state to each player individually (include playerId for reconnection)
            opponentSocket.emit("game:start", {
              gameState: room.getMaskedState(opponent.socketId),
              yourPlayerId: 0, // Player 1 is index 0
              gameId,
              playerId: room.player1Id,
            });

            socket.emit("game:start", {
              gameState: room.getMaskedState(socket.id),
              yourPlayerId: 1, // Player 2 is index 1
              gameId,
              playerId: room.player2Id,
            });
          } else {
            console.error("[Server] Failed to initialize game");
            io.to(gameId).emit("error", { message: "Failed to start game" });
          }
        } else {
          // Opponent disconnected, requeue current player
          waitingPlayer = playerData;
          socket.emit("matchmaking:searching");
        }
      } else {
        // Add to queue
        waitingPlayer = playerData;
        socket.emit("matchmaking:searching");
      }
    });

    socket.on("matchmaking:cancel", () => {
      console.log(`[Server] Player ${socket.id} canceled matchmaking`);
      if (waitingPlayer && waitingPlayer.socketId === socket.id) {
        waitingPlayer = null;
      }
    });

    // ─── Game Actions ───

    socket.on("game:action", async (data) => {
      const { gameId, action } = data;
      const game = games.get(gameId);

      if (!game) {
        socket.emit("error", { message: "Game not found" });
        return;
      }

      if (!game.hasPlayer(socket.id)) {
        socket.emit("error", { message: "Not a player in this game" });
        return;
      }

      const result = await game.handleAction(socket.id, action);

      if (result.success) {
        // Broadcast masked state to each player
        broadcastMaskedState(io, game);

        // If promotion is required, notify the specific player
        if (result.promotionRequired && result.promotionPlayerIndex !== undefined) {
          const promotionSocketId =
            result.promotionPlayerIndex === 0
              ? game.player1SocketId
              : game.player2SocketId;
          const promotionSocket = io.sockets.sockets.get(promotionSocketId);
          if (promotionSocket) {
            promotionSocket.emit("game:promotion_required", {
              playerIndex: result.promotionPlayerIndex,
            });
          }
        }

        // If the game ended, emit a game_over event
        if (result.gameEnded) {
          broadcastGameOver(io, game);
        }
      } else {
        socket.emit("game:action_error", {
          error: result.error || "Invalid action",
        });
      }
    });

    // ─── Disconnection ───

    socket.on("disconnect", async () => {
      console.log(`[Server] Client disconnected: ${socket.id}`);

      // Remove from matchmaking queue
      if (waitingPlayer && waitingPlayer.socketId === socket.id) {
        waitingPlayer = null;
        console.log(`[Server] Removed disconnected player from matchmaking queue`);
      }

      // Handle mid-game disconnection with grace period
      const gameId = playerGameMap.get(socket.id);
      const playerId = socketPlayerIdMap.get(socket.id);
      if (gameId && playerId) {
        const game = games.get(gameId);
        if (game && !game.isGameOver()) {
          console.log(`[Server] Player ${socket.id} (${playerId}) disconnected from game ${gameId}, starting grace period (${DISCONNECT_GRACE_MS / 1000}s)`);

          const dcInfo = game.markDisconnected(socket.id);

          if (dcInfo) {
            // Notify opponent of disconnect
            const opponentSocketId = dcInfo.playerIndex === 0 ? game.player2SocketId : game.player1SocketId;
            const opponentSocket = io.sockets.sockets.get(opponentSocketId);
            if (opponentSocket) {
              opponentSocket.emit("game:opponent_disconnected", {
                graceMs: DISCONNECT_GRACE_MS,
              });
            }

            // Set grace period timer for auto-concede
            const dc = game.disconnectedPlayers.get(dcInfo.playerId);
            if (dc) {
              dc.timer = setTimeout(async () => {
                console.log(`[Server] Grace period expired for ${dcInfo.playerId} in game ${gameId}, auto-concede`);
                const result = await game.forceConcede(dcInfo.playerId);
                if (result && result.success) {
                  broadcastMaskedState(io, game);
                  broadcastGameOver(io, game);
                }
              }, DISCONNECT_GRACE_MS);
            }
          }
        }
        // Keep playerGameMap and socketPlayerIdMap for potential reconnection
        // They'll be cleaned up when the game is cleaned up
      }
    });

    // ─── Reconnection (rejoin existing game via persistent playerId) ───

    socket.on("game:reconnect", (data: { gameId: string; playerId: string }) => {
      const game = games.get(data.gameId);
      if (!game) {
        socket.emit("game:reconnect_failed", { message: "Game not found or expired" });
        return;
      }

      if (game.isGameOver()) {
        socket.emit("game:reconnect_failed", { message: "Game is already over" });
        return;
      }

      // Reconnect using persistent player ID
      const playerIndex = game.reconnectPlayer(data.playerId, socket.id);
      if (playerIndex === -1) {
        socket.emit("game:reconnect_failed", { message: "Not a player in this game" });
        return;
      }

      // Update maps for the new socket
      playerGameMap.set(socket.id, data.gameId);
      socketPlayerIdMap.set(socket.id, data.playerId);
      socket.join(data.gameId);

      console.log(`[Server] Player ${data.playerId} reconnected to game ${data.gameId} with new socket ${socket.id}`);

      // Send current state to reconnected player
      socket.emit("game:reconnected", {
        gameState: game.getMaskedState(socket.id),
        yourPlayerId: playerIndex,
        gameId: data.gameId,
        playerId: data.playerId,
      });

      // Notify opponent that player reconnected
      const opponentSocketId = playerIndex === 0 ? game.player2SocketId : game.player1SocketId;
      const opponentSocket = io.sockets.sockets.get(opponentSocketId);
      if (opponentSocket) {
        opponentSocket.emit("game:opponent_reconnected");
      }
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
