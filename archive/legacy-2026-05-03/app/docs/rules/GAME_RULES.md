# Pokémon TCG Standard Game Rules (Refactored)

## 1. Game Overview
This document defines the core rules for the Pokémon Trading Card Game engine, refactored to strictly adhere to the standard competitive rule set. All previous custom logic has been replaced with this standardized framework.

## 2. Game Setup Phase
The game begins with a specific sequence of actions to prepare the board.

### 2.1. Coin Flip & Turn Order
1.  **Coin Flip/RPS**: Determine who decides the turn order.
2.  **Decision**: The winner chooses to go **First** or **Second**.

### 2.2. Initial Draw & Mulligan
1.  **Shuffle**: Both players shuffle their decks.
2.  **Draw 7**: Each player draws 7 cards.
3.  **Basic Check**:
    *   **Has Basic Pokémon**: Proceed to Placement.
    *   **No Basic Pokémon (Mulligan)**:
        1.  Reveal hand to opponent.
        2.  Shuffle hand back into deck.
        3.  Draw 7 new cards.
        4.  Repeat until a Basic Pokémon is drawn.
    *   **Opponent Compensation**: For each Mulligan the opponent took, the other player *may* draw 1 additional card after setting up.

### 2.3. Board Placement
1.  **Active Spot**: Place 1 Basic Pokémon face-down in the Active Spot.
2.  **Bench**: Place up to 5 Basic Pokémon face-down on the Bench (Optional).
3.  **Prize Cards**: Set aside the top 6 cards of the deck face-down as Prize Cards.
4.  **Reveal**: Both players flip their Active and Benched Pokémon face-up.
5.  **Game Start**: The game officially begins.

## 3. Turn Structure
The game proceeds in turns, alternating between players.

### 3.1. Turn Phases
1.  **Draw Phase**: Draw 1 card from the deck.
    *   *Loss Condition*: If a player cannot draw a card at the start of their turn, they lose the game (Deck Out).
2.  **Main Phase**: The player may perform any number of actions in any order:
    *   **Attach Energy**: Once per turn, attach 1 Energy card from hand to one of your Pokémon.
    *   **Play Trainer Cards**:
        *   **Items**: Unlimited use.
        *   **Supporters**: Once per turn.
        *   **Stadiums**: Once per turn (cannot play if same name exists).
        *   **Tools**: Attach to Pokémon (max 1 per Pokémon unless specified).
    *   **Evolve**: Evolve a Pokémon that has been in play for a full turn (except Turn 1).
    *   **Use Abilities**: As specified on the cards.
    *   **Retreat**: Once per turn, switch Active Pokémon with Bench by paying Retreat Cost.
3.  **Attack Phase**:
    *   Select an attack (must have necessary Energy).
    *   Apply effects and damage.
    *   Check for Knockouts (KO).
    *   **End of Turn**: The turn ends immediately after attacking.

### 3.2. First Turn Rules
*   **Player 1 (First Turn)**:
    *   **Cannot Attack**.
    *   **Cannot play Supporter cards**.
    *   **Cannot Evolve** (Standard evolution rule).
*   **Player 2 (First Turn)**:
    *   **Can Attack**.
    *   **Can play Supporter cards**.
    *   **Cannot Evolve** (Standard evolution rule).

### 3.3. Pokémon Checkup (Between Turns)
After a turn ends and before the next begins:
1.  **Status Conditions**: Resolve Poison (10 damage), Burn (20 damage + coin flip), Asleep/Paralyzed checks.
2.  **Abilities/Effects**: Resolve any effects that happen "between turns".

## 4. Win Conditions
A player wins immediately if:
1.  **Prize Cards**: They take all 6 of their Prize Cards.
2.  **Knockout**: They knock out the opponent's Active Pokémon, and the opponent has no Benched Pokémon to replace it.
3.  **Deck Out**: The opponent cannot draw a card at the start of their turn.

## 5. Card Type Rules
*   **Pokémon**:
    *   **Basic**: Can be played directly.
    *   **Stage 1**: Evolves from Basic.
    *   **Stage 2**: Evolves from Stage 1.
*   **Trainer**:
    *   **Item**: Play and discard (usually).
    *   **Supporter**: Powerful effects, 1 per turn.
    *   **Stadium**: Stays in play, affects both players.
    *   **Tool**: Attaches to Pokémon to provide buffs.
*   **Energy**:
    *   **Basic**: Provides 1 Energy of a specific type.
    *   **Special**: Provides Energy + effects.

## 6. Implementation Architecture (Refactored)
*   **`GameState`**: Stores the single source of truth (Zones, Turn State, Prizes).
*   **`RuleEngine`**: Stateless validator for actions (CanEvolve, CanAttack, CanPlayCard).
*   **`TurnManager`**: Handles phase transitions and restricted actions.
*   **`EffectSystem`**: Executes card text logic.
