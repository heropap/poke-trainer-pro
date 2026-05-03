# Game Rules Change Log

## [Refactor 1.0] - 2026-03-04

### Major Architecture Changes
*   **Rule Engine Integration**: Implemented a centralized middleware-based rule engine (`base-rules.ts`) to validate all game actions.
*   **Game Loop Standardization**: Refactored `game-controller.ts` to strictly follow the standard PTCG phase structure (Draw -> Main -> Attack -> End).
*   **Status Effect Overhaul**: Fixed the timing of status condition checks (especially Paralysis) to match competitive rules.

### Rule Updates

#### Setup Phase
*   **Mulligan Tracking**: Added `mulliganCount` to Player state to track and support opponent draw compensation (future UI integration).
*   **Basic Check**: Enforced strict Basic Pokemon verification during initial draw.

#### First Turn Rules
*   **Player 1 (Going First)**:
    *   **Attack**: BLOCKED. (Previously inconsistent or custom).
    *   **Supporter**: BLOCKED. (Previously inconsistent).
    *   **Evolution**: BLOCKED. (Standard rule).
*   **Player 2 (Going Second)**:
    *   **Attack**: ALLOWED.
    *   **Supporter**: ALLOWED.
    *   **Evolution**: BLOCKED (Cannot evolve on first turn in play).

#### Turn Structure
*   **Main Phase**:
    *   Strict phase validation: Actions only allowed in "Main" phase.
    *   Attack ends the turn immediately.
*   **Pokemon Checkup**:
    *   **Paralysis**: Now cures ONLY at the end of the *affected player's* turn, not the opponent's turn.
    *   **Poison/Burn**: Applied to both players between turns.

### API/Code Changes
*   **Removed**: Custom ad-hoc checks in `handleAttack` were replaced/standardized by middleware rules.
*   **Modified**: `processBetweenTurns` now accepts `isTurnOwner` parameter to correctly handle end-of-turn status recovery.
*   **Added**: `mulliganCount` property to `Player` interface.

### Known Issues / Future Work
*   **Mulligan UI**: The backend supports tracking, but the UI needs to implement the "Reveal Hand -> Shuffle -> Draw" interaction loop.
*   **Opponent Draw**: Logic for opponent drawing extra cards for mulligans is prepared but needs UI triggers.
