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
  // ---------------- main-phase actions (F4) ----------------
  | {
      type: "StartTurn";
    }
  | {
      type: "EndTurn";
      player: PlayerIndex;
    }
  | {
      type: "PlayBasicPokemon";
      player: PlayerIndex;
      uid: string;
      benchSlot: number;
    }
  | {
      type: "AttachEnergy";
      player: PlayerIndex;
      uid: string;
      targetUid: string;
    }
  | {
      type: "Retreat";
      player: PlayerIndex;
      benchSlot: number;
      payEnergyUids: string[];
    }
  | {
      type: "Evolve";
      player: PlayerIndex;
      uid: string;
      targetUid: string;
    }
  | {
      type: "PlayItem";
      player: PlayerIndex;
      uid: string;
    }
  | {
      type: "PlaySupporter";
      player: PlayerIndex;
      uid: string;
    }
  | {
      type: "PlayStadium";
      player: PlayerIndex;
      uid: string;
    }
  | {
      type: "AttachTool";
      player: PlayerIndex;
      uid: string;
      targetUid: string;
    }
  | {
      type: "Attack";
      player: PlayerIndex;
      attackIndex: number;
    }
  | {
      type: "PromoteFromKO";
      player: PlayerIndex;
      benchSlot: number;
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
  | { kind: "chooseOption"; choice: number }
  | { kind: "promoteFromKO"; benchSlot: number };
