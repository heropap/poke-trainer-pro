import { getCard } from "../cards";
import { registerOnPlay } from "../effects";
import {
  bumpRng,
  findBasicInDeck,
  logEvent,
  moveDeckToBench,
  setPlayer,
  shuffleDeck,
} from "./helpers";
import type { GameCard, GameState, PlayerIndex } from "../state";

// Tandem Unit — when Miraidon ex is played from hand to active or bench,
// search up to 2 Basic Lightning Pokemon and put them onto your bench.
//
// In v0 we auto-search the first 2 matches and place them in the first empty
// bench slots. UI version (post-F12) will use prompts.
registerOnPlay("svi-81", (state: GameState, player: PlayerIndex, _sourceUid: string) => {
  let next = state;
  const ps = next.players[player];

  // Only fire once per game per Miraidon (track via marker on the source card).
  // For v0 we naively allow re-trigger if a NEW Miraidon is played. Acceptable.
  const eligible: GameCard[] = findBasicInDeck(next, player, "Lightning").filter(
    (c) => {
      const def = getCard(c.cardId);
      // Don't auto-pull another Miraidon ex (would re-trigger and could loop in
      // weird states). Pull non-Miraidon Lightning basics.
      return def.kind === "Pokemon" && c.cardId !== "svi-81";
    },
  );

  const targets = eligible.slice(0, 2);
  for (const t of targets) {
    const emptyIdx = next.players[player].bench.findIndex((b) => b === null);
    if (emptyIdx < 0) break;
    next = moveDeckToBench(next, player, t.uid, emptyIdx);
  }

  if (targets.length > 0) {
    next = shuffleDeck(next, player);
    next = logEvent(next, "TandemUnit", { player, count: targets.length });
  }
  void ps;
  void bumpRng;
  void setPlayer;
  return next;
});
