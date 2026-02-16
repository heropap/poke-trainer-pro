
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { GameRoom } from "./src/server/game-room";
import { Card } from "./src/types/card";
import fs from "fs";
import path from "path";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Global state for simple server
let waitingPlayer: { socketId: string; deck: any } | null = null;
const games: Map<string, GameRoom> = new Map();
let cardIndex: Map<string, Card> = new Map();

// Load card data
try {
  const dataPath = path.join(process.cwd(), "src/data/cards/_index.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  (data as Card[]).forEach((c) => cardIndex.set(c.id, c));
  console.log(`[Server] Loaded ${cardIndex.size} cards`);
} catch (e) {
  console.error("[Server] Failed to load cards:", e);
}

const cardLookup = (id: string) => cardIndex.get(id);

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
  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join matchmaking queue
    socket.on("matchmaking:join", (data) => {
      // Data structure: { deckId, deckName, cards: string[] }
      const deckData = data;
      console.log(`Player ${socket.id} joined matchmaking with deck: ${deckData?.deckName} (${deckData?.cards?.length} cards)`);
      
      if (!deckData || !deckData.cards || deckData.cards.length === 0) {
        socket.emit("error", { message: "Invalid deck data" });
        return;
      }
      
      const playerData = { 
        socketId: socket.id, 
        deck: {
          id: deckData.deckId,
          name: deckData.deckName || "Unknown Deck",
          cards: deckData.cards
        }
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
            console.log(`Created and initialized game room ${gameId}`);

            // Notify match found
            io.to(gameId).emit("matchmaking:found", {
              gameId,
              opponent: { name: "Opponent" }
            });
            
            // Send initial state to both players
            // TODO: Mask state for each player in future
            
            // Send specific start event to Player 1
            opponentSocket.emit("game:start", {
              gameState: room.state,
              yourPlayerId: 0 // Player 1 is index 0
            });
            
            // Send specific start event to Player 2
            socket.emit("game:start", {
              gameState: room.state,
              yourPlayerId: 1 // Player 2 is index 1
            });
            
          } else {
            console.error("Failed to initialize game");
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
      console.log(`Player ${socket.id} canceled matchmaking`);
      // TODO: Remove from queue
    });

    socket.on("game:action", (data) => {
      const { gameId, action } = data;
      const game = games.get(gameId);
      
      if (game) {
        const success = game.handleAction(socket.id, action);
        if (success) {
          // Broadcast updated state to all players in the room
          io.to(gameId).emit("game:state_update", {
            gameState: game.state
          });
        } else {
          socket.emit("error", { message: "Invalid action" });
        }
      } else {
        socket.emit("error", { message: "Game not found" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
