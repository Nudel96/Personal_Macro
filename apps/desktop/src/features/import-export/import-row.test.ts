import { describe, expect, it } from "vitest";
import { mapImportRow } from "./import-row";
describe("transfer preserves money units and missing values", () => {
  it("roundtrips integer minor amounts without scaling, preserving a genuine zero", () => {
    expect(
      mapImportRow(
        {
          instrument: "EURUSD",
          status: "draft",
          netPnlMinor: 0,
          plannedRiskMinor: 1234,
        },
        "selected",
      ),
    ).toMatchObject({
      accountId: "selected",
      netPnlMinor: 0,
      plannedRiskMinor: 1234,
      status: "draft",
    });
    expect(
      mapImportRow(
        { instrument: "EURUSD", status: "planned", netPnlMinor: -1234 },
        "selected",
      ),
    ).toMatchObject({ netPnlMinor: -1234, status: "planned" });
  });
  it("keeps null and empty exported money unavailable", () => {
    expect(
      mapImportRow(
        { instrument: "EURUSD", status: "draft", netPnlMinor: "" },
        "selected",
      )?.netPnlMinor,
    ).toBeUndefined();
    expect(
      mapImportRow(
        { instrument: "EURUSD", status: "draft", netPnlMinor: null },
        "selected",
      )?.netPnlMinor,
    ).toBeUndefined();
  });
  it("reads both German decimal amounts and machine decimal amounts", () => {
    expect(
      mapImportRow(
        { instrument: "EURUSD", status: "draft", netPnl: "1.234,56" },
        "selected",
      )?.netPnlMinor,
    ).toBe(123456);
    expect(
      mapImportRow(
        { instrument: "EURUSD", status: "draft", netPnl: "1234.56" },
        "selected",
      )?.netPnlMinor,
    ).toBe(123456);
  });
});
