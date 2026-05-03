# Data Dictionary & Classification Logic

## 1. Overview
This document defines the standardized data model for the Pokémon Trading Card Game application. It serves as the single source of truth for data structures, field definitions, and classification logic.

## 2. Classification Hierarchy

The system uses a multi-level classification strategy to organize card data.

### Level 1: Primary Category (Supertype)
*   **Pokémon**: The core units of gameplay.
*   **Trainer**: Support cards played for effects.
*   **Energy**: Resources attached to Pokémon to pay for attacks.

### Level 2: Functional Category (Subtype)
*   **Pokémon Subtypes**:
    *   **Stage**: `Basic`, `Stage 1`, `Stage 2`.
    *   **Rule Box**: `ex`, `V`, `VMAX`, `VSTAR`, `Radiant`.
*   **Trainer Subtypes**:
    *   **Item**: Playable at any time (during Main phase).
    *   **Supporter**: Powerful effects, limited to 1 per turn.
    *   **Stadium**: Global field effects, 1 active at a time.
    *   **Pokémon Tool**: Attach to Pokémon to provide buffs.
*   **Energy Subtypes**:
    *   **Basic**: Infinite usage allowed in deck.
    *   **Special**: Provides effects, max 4 per deck.

### Level 3: Business Tags (Tags)
*   **Era/Mechanic**: `Ancient`, `Future`, `Fusion Strike`, `Single Strike`, `Rapid Strike`.
*   **Rarity/Special**: `ACE SPEC`, `Tera`.

## 3. Data Schema (Standardized JSON)

### 3.1 Card Object
The core entity representing a single card.

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Unique identifier | Format: `{set}-{number}` (e.g., `sv1-001`) |
| `name` | `string` | Card display name | |
| `supertype` | `enum` | Primary category | `Pokémon`, `Trainer`, `Energy` |
| `subtypes` | `array` | Functional categories | Non-empty |
| `hp` | `string` | Health points | Integer string, required for Pokémon |
| `types` | `array` | Energy types | `Grass`, `Fire`, `Water`, etc. |
| `rules` | `array` | Special rule text | Used for V/ex rule boxes, ACE SPEC rules |
| `attacks` | `array` | Attack definitions | See 3.2 |
| `abilities` | `array` | Ability definitions | See 3.3 |
| `weaknesses` | `array` | Damage multipliers | |
| `resistances` | `array` | Damage reduction | |
| `retreatCost` | `array` | Energy cost to retreat | Array of energy types (usually Colorless) |

### 3.2 Attack Object
| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Attack name |
| `cost` | `array` | Energy required |
| `damage` | `string` | Base damage (e.g., "30", "10+", "30×") |
| `text` | `string` | Effect description |

### 3.3 Ability Object
| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Ability name |
| `type` | `string` | `Ability`, `Pokémon Power` |
| `text` | `string` | Effect description |

## 4. Data Quality Standards
1.  **Completeness**: All Pokémon MUST have `hp`, `types`, and `retreatCost`.
2.  **Consistency**: `subtypes` must match the allowed enum list.
3.  **Naming**: `id` must be lowercase and hyphenated.
4.  **Redundancy**: Derived data (e.g., `convertedRetreatCost`) is calculated at runtime, not stored.

## 5. Versioning
*   **Schema Version**: 1.0
*   **Last Updated**: 2026-03-04
