import { beforeEach, describe, expect, it } from "vitest";
import {
  captureDefaults,
  captureDraftKey,
  captureInput,
  captureNetPnl,
  captureSchema,
  readCaptureDraft,
} from "./trade-capture";

describe("compact trade capture", () => {
  beforeEach(() => localStorage.clear());
  it("stores an explicit net result without deducting costs again", () => {
    const values = {
      ...captureDefaults(),
      instrument: "EURUSD",
      netPnl: "34,59",
      fees: "2,00",
    };
    expect(captureSchema.safeParse(values).success).toBe(true);
    expect(captureInput(values, "a", null)).toMatchObject({
      accountId: "a",
      netPnlMinor: 3459,
      feesMinor: 200,
    });
    expect(captureNetPnl(values)).toBe(3459);
    expect(captureInput(values, "a", null).grossPnlMinor).toBeUndefined();
  });
  it("deducts separate costs for a gross result and preserves unknown versus zero", () => {
    const values = {
      ...captureDefaults(),
      instrument: "EURUSD",
      pnlMode: "gross" as const,
      grossPnl: "40,75",
      fees: "2",
      commission: "3",
      swap: "1,16",
    };
    expect(captureNetPnl(values)).toBe(3459);
    expect(captureInput(values, "a", null).netPnlMinor).toBeUndefined();
    expect(captureNetPnl({ ...values, grossPnl: "" })).toBeUndefined();
    expect(captureNetPnl({ ...captureDefaults(), netPnl: "0" })).toBe(0);
  });
  it("does not give an open trade an exit date or realized result", () => {
    const input = captureInput(
      {
        ...captureDefaults(),
        instrument: "EURUSD",
        status: "open",
        netPnl: "34.59",
      },
      "a",
      null,
    );
    expect(input.closedAt).toBeUndefined();
    expect(input.netPnlMinor).toBeUndefined();
  });
  it("retains entered outcomes when saving a draft for later completion", () => {
    const input = captureInput(
      {
        ...captureDefaults(),
        instrument: "EURUSD",
        status: "draft",
        netPnl: "34.59",
        actualExit: "1.18",
      },
      "a",
      null,
    );
    expect(input).toMatchObject({
      status: "draft",
      netPnlMinor: 3459,
      actualExit: "1.18",
    });
    expect(input.closedAt).toBeTruthy();
  });
  it("validates chronology and malformed amounts before saving", () => {
    const base = { ...captureDefaults(), instrument: "EURUSD" };
    expect(
      captureSchema.safeParse({ ...base, netPnl: "invalid" }).success,
    ).toBe(false);
    expect(
      captureSchema.safeParse({
        ...base,
        openedAt: "2026-09-10T15:00",
        closedAt: "2026-09-10T12:00",
      }).success,
    ).toBe(false);
    expect(captureSchema.safeParse({ ...base, closedAt: "" }).success).toBe(
      false,
    );
  });
  it("restores incomplete inputs only for their account and persists no image bytes", () => {
    localStorage.setItem(
      captureDraftKey("a"),
      JSON.stringify({
        values: { ...captureDefaults(), instrument: "EURUSD", netPnl: "-" },
        screenshotReview: null,
        hadScreenshot: true,
      }),
    );
    expect(readCaptureDraft("a")).toMatchObject({
      values: { instrument: "EURUSD", netPnl: "-" },
      hadScreenshot: true,
    });
    expect(readCaptureDraft("b")).toBeNull();
  });
});
