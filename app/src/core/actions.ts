import type { PlayerIndex } from "./state";

// Action union — every input to the reducer.

export type Action =
  | {
      type: "GameStart";
      deckSlugs: [string, string];
      goesFirst: PlayerIndex;
    }
  | {
      type: "PlaceActiveSetup";
      player: PlayerIndex;
      uid: string;
    }
  | {
      type: "PlaceBenchSetup";
      player: PlayerIndex;
      uids: string[];
    }
  | {
      type: "FinishSetup";
    }
  | {
      type: "DrawCard";
      player: PlayerIndex;
      count: number;
    }
  | {
      type: "ResolvePrompt";
      payload: PromptResponse;
    }
  | {
      type: "Concede";
      player: PlayerIndex;
    };

export type PromptResponse =
  | { kind: "selectActiveSetup"; uid: string }
  | { kind: "selectBenchSetup"; uids: string[] }
  | { kind: "selectTarget"; uids: string[] }
  | { kind: "selectFromList"; cardIds: string[] }
  | { kind: "coinFlip"; results: boolean[] }
  | { kind: "confirm" }
  | { kind: "chooseOption"; choice: number };
