# Rules Comparison: Old vs New Architecture

| Feature | Old Custom Implementation | New Standardized Implementation |
| :--- | :--- | :--- |
| **First Turn Attack** | Inconsistent. Sometimes allowed for P1 depending on "God Mode" or missing checks. | **Strictly Prohibited** for Player 1. Middleware enforces `FIRST_TURN_ATTACK`. |
| **First Turn Supporter** | Checked via `canPlaySupporter` but logic was scattered. | **Strictly Prohibited** for Player 1. Middleware enforces `FIRST_TURN_SUPPORTER`. |
| **Evolution Rule** | "Cannot evolve on turn played" logic was fragile. | **Enforced**. Validates `playedThisTurn` flag and `isFirstTurn` state. |
| **Paralysis Cure** | **Bug**: Cured at end of *any* turn (including opponent's). | **Fixed**: Cures only at end of *affected player's* turn. |
| **Attack Phase** | Attack didn't always end turn immediately in code structure. | **Atomic**: Attack action automatically triggers `endTurn`. |
| **Mulligan** | Auto-resolved in a loop (instant). | **Stateful**: Added `mulliganCount` to support interactive resolution. |
| **Validation** | Ad-hoc checks inside `handleAction`. | **Middleware Pipeline**: Centralized validation in `base-rules.ts`. |
| **Game State** | Loose phase definitions. | **Strict Phases**: Actions rejected if not in `main` phase. |
