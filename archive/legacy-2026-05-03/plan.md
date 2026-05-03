
# Digital Card Battle System Implementation Plan

## Phase 1: Networking Infrastructure (WebSocket)
- [ ] **Server Setup**: Create a custom Node.js server (or use a separate process) with `socket.io` to handle real-time connections.
- [ ] **Socket Events**: Define core events:
    - `connect` / `disconnect`
    - `matchmaking:join` / `matchmaking:leave`
    - `game:start`
    - `game:action` (play card, attack, etc.)
    - `game:state_update`
- [ ] **Client Integration**: Add `socket.io-client` to the Next.js app and create a `SocketContext` for global access.

## Phase 2: Matchmaking System
- [ ] **Queue Logic**: Implement a simple in-memory matchmaking queue on the server.
- [ ] **UI Implementation**:
    - Update `BattlePage` to show a "Find Match" button instead of immediate local start.
    - Display "Searching for opponent..." status with a timer.
    - Handle "Match Found" event and transition to the battle screen.
- [ ] **Room Management**: Create unique game rooms for matched players.

## Phase 3: Core Battle Engine (Turns & Actions)
- [ ] **State Management**: Move `GameState` management from Client to Server. The server becomes the single source of truth.
- [ ] **Turn Structure**: Implement the full turn cycle:
    - `Draw Phase`: Auto-draw card at turn start.
    - `Main Phase`: Allow playing Basics, evolving, attaching energy, using Trainers.
    - `Attack Phase`: Calculate damage, apply effects, check knockouts.
    - `End Phase`: Check status conditions (poison/burn), switch turns.
- [ ] **Action Validation**: Create a `validateAction` function on the server to prevent illegal moves (e.g., attaching 2 energy per turn).

## Phase 4: Real-time UI & Interaction
- [ ] **Interactive Field**:
    - Make cards draggable (using `dnd-kit` or similar).
    - Add drop zones for Bench, Active, and Discard.
- [ ] **Animations**:
    - Implement CSS/Framer Motion animations for:
        - Drawing cards
        - Playing cards (hand to field)
        - Damage numbers popping up
        - Knockout animations
- [ ] **Battle Log**: Real-time display of server-sent game logs.

## Phase 5: Polish & Fairness
- [ ] **Timer System**: Implement a server-side turn timer (e.g., 60s per turn).
- [ ] **Reconnection**: Handle browser refreshes by sending the current `GameState` on reconnect.
- [ ] **Win Conditions**: Implement checks for:
    - Taking all 6 Prize cards.
    - Opponent has no Pokemon in play.
    - Deck out (cannot draw).

## Technical Stack
- **Frontend**: Next.js, Tailwind CSS, Framer Motion
- **Backend**: Node.js (Custom Server), Socket.io
- **State**: Redux or Context API (Client), In-memory (Server)
