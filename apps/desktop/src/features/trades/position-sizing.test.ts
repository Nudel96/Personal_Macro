import { describe, expect, it } from "vitest";
import { calculatePositionSize, inferInstrumentSpec } from "./position-sizing";

describe("position sizing", () => {
  it("calculates EURUSD standard lots", () => {
    const spec = inferInstrumentSpec("EURUSD", "forex");
    const result = calculatePositionSize({
      riskAmount: 100,
      entryPrice: 1.1,
      stopPrice: 1.095,
      quotePerAccountCurrency: 1,
      spec,
    });
    expect(result?.quantity).toBeCloseTo(0.2);
    expect(result?.effectiveRisk).toBeCloseTo(100);
  });

  it("uses tick values for currency futures", () => {
    const spec = inferInstrumentSpec("6EU6", "futures");
    const result = calculatePositionSize({
      riskAmount: 500,
      entryPrice: 1.1,
      stopPrice: 1.098,
      quotePerAccountCurrency: 1,
      spec,
    });
    expect(result?.riskPerQuantity).toBeCloseTo(250);
    expect(result?.quantity).toBe(2);
  });

  it("supports metals and crypto contract presets", () => {
    expect(inferInstrumentSpec("XAUUSD", "metals").contractSize).toBe(100);
    expect(inferInstrumentSpec("BTCUSDT", "crypto").quantityLabel).toBe(
      "Coins",
    );
  });
});
