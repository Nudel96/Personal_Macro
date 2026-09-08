import { describe, expect, it } from "vitest";
import { transitionJournalAccount } from "./trades-page";

describe("TradesPage journal account transitions", () => {
  it("does not consume a direct link for an invalid persisted id before the first ready selection", () => {
    const initial = { lastReadyAccountId: null, hasReadyAccount: false };

    const invalid = transitionJournalAccount(
      initial,
      "selectionRequired",
      "archived-account",
    );
    expect(invalid.resetTradeState).toBe(false);
    expect(invalid.tracker).toEqual(initial);

    const cleared = transitionJournalAccount(
      invalid.tracker,
      "selectionRequired",
      null,
    );
    expect(cleared.resetTradeState).toBe(false);

    const firstReady = transitionJournalAccount(
      cleared.tracker,
      "ready",
      "account-a",
    );
    expect(firstReady.resetTradeState).toBe(false);
    expect(firstReady.tracker.lastReadyAccountId).toBe("account-a");
  });

  it("resets on a real ready account switch and on clearing a ready account", () => {
    const readyA = transitionJournalAccount(
      { lastReadyAccountId: null, hasReadyAccount: false },
      "ready",
      "account-a",
    );
    const readyB = transitionJournalAccount(
      readyA.tracker,
      "ready",
      "account-b",
    );
    expect(readyB.resetTradeState).toBe(true);

    const cleared = transitionJournalAccount(
      readyB.tracker,
      "selectionRequired",
      null,
    );
    expect(cleared.resetTradeState).toBe(true);
  });
});
