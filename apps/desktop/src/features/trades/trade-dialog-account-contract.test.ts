import { describe, expect, it } from "vitest";
import { resolveGuidedDraft } from "./guided-trade-dialog";
import { readyTradeAccountId } from "./quick-trade-dialog";

describe("Quick and Guided trade selected-account contracts", () => {
  it("returns an account only for a ready explicit selection", () => {
    expect(readyTradeAccountId("selectionRequired", "account-a")).toBeNull();
    expect(readyTradeAccountId("ready", null)).toBeNull();
    expect(readyTradeAccountId("ready", "account-a")).toBe("account-a");
  });

  it("keeps a matching guided draft and discards a foreign-account draft", () => {
    const saved = {
      accountId: "account-a",
      instrument: "EURUSD",
    } as never;
    expect(resolveGuidedDraft(saved, "account-a").instrument).toBe("EURUSD");

    const switched = resolveGuidedDraft(saved, "account-b");
    expect(switched.instrument).toBe("");
    expect(switched.accountId).toBe("account-b");
  });
});
