import { describe, expect, it } from "vitest";
import type {
  TradeScreenshotAnalysis,
  ScreenshotWord,
} from "../../types/domain";
import {
  parseScreenshotNumber,
  parseTradeScreenshot,
} from "./trade-screenshot-parser";

const analysis = (text: string): TradeScreenshotAnalysis => ({
  width: 1200,
  height: 800,
  language: "en-US",
  lines: text.split("\n").map((text) => ({ text, words: [] })),
});
const word = (
  text: string,
  x: number,
  y: number,
  width = 80,
): ScreenshotWord => ({ text, x, y, width, height: 18 });

describe("local screenshot trade extraction", () => {
  it("reads an explicit ticket without fabricating fill times or P&L", () => {
    const result = parseTradeScreenshot(
      analysis(
        "Symbol: EURUSD\nDirection: Long\nStatus: Open\nEntry price: 1.08450\nStop loss: 1.08000\nTake profit: 1.09350\nLots: 0.25\nRisk: 112.50 USD\nTimeframe: H1",
      ),
    );
    expect(
      Object.fromEntries(
        Object.entries(result.fields).map(([key, value]) => [key, value.value]),
      ),
    ).toEqual({
      instrument: "EURUSD",
      direction: "long",
      status: "open",
      actualEntry: "1.0845",
      initialStopLoss: "1.08",
      takeProfit: "1.0935",
      quantity: "0.25",
      plannedRisk: "112.5",
      timeframe: "H1",
    });
    expect(result.quantityUnit).toBe("lots");
    expect(result.currency).toBe("USD");
    expect(result.assetClass).toBe("forex");
  });

  it("reads German decimals, explicit percentage risk, short and closed status", () => {
    const result = parseTradeScreenshot(
      analysis(
        "Instrument: EUR/JPY\nRichtung: Short\nStatus: Geschlossen\nEinstiegspreis: 161,250\nStop Loss: 161,500\nZielpreis: 160,250\nLotzahl: 0,40\nRisiko: 0,5%\nAusstiegspreis: 160,50",
      ),
    );
    expect(result.fields.status?.value).toBe("closed");
    expect(result.fields.direction?.value).toBe("short");
    expect(result.fields.actualEntry?.value).toBe("161.25");
    expect(result.fields.riskPercent?.value).toBe("0.5");
    expect(result.fields.plannedRisk).toBeUndefined();
  });

  it("does not treat simulated Open/Closed P&L, price offsets or stop percentages as broker facts", () => {
    const result = parseTradeScreenshot(
      analysis(
        "EURUSD · 1h · OANDA\nTarget: 0.01000 (0.91%) 100.0, Amount: 1500\nClosed P&L: 0.01000, Qty: 50000\nRisk/Reward Ratio: 2\nStop: 0.00500 (0.45%) 50.0, Amount: 750",
      ),
    );
    expect(result.fields.status).toBeUndefined();
    expect(result.fields.initialStopLoss).toBeUndefined();
    expect(result.fields.actualExit).toBeUndefined();
    expect(result.fields.riskPercent).toBeUndefined();
    expect(result.fields.plannedRisk?.value).toBe("250.00");
    expect(result.fields.quantity?.value).toBe("50000");
    expect(result.quantityUnit).toBe("unknown");
    expect(result.currency).toBeNull();
    expect(result.fields.timeframe?.value).toBe("H1");
  });

  it("matches the actual axis levels against both offsets in a TradingView drawing", () => {
    const input = analysis(
      "EURUSD\nTarget: 0.01000 (0.91%) 100.0, Amount: 1500\nOpen P&L: 0.00200, Qty: 50000\nRisk/Reward Ratio: 2\nStop: 0.00500 (0.45%) 50.0, Amount: 750",
    );
    input.lines[1].words = [word("Target:", 500, 100)];
    input.lines[4].words = [word("Stop:", 500, 500)];
    input.lines.push({
      text: "",
      words: [
        word("1.11000", 1100, 112),
        word("1.10000", 1100, 320),
        word("1.09500", 1100, 489),
        word("1.10500", 1100, 230),
      ],
    });
    const result = parseTradeScreenshot(input);
    expect(result.fields.actualEntry?.value).toBe("1.1");
    expect(result.fields.initialStopLoss?.value).toBe("1.095");
    expect(result.fields.takeProfit?.value).toBe("1.11");
    expect(result.fields.direction?.value).toBe("long");
    expect(result.fields.actualEntry?.derived).toBe(true);
    // Actual Windows OCR can split trailing decimal zeroes into the letter O.
    // Only accept that repair when all three independent axis prices agree.
    input.lines[1].text = "Target: 0.01 OOO (0.91%) 100.01 Amount: 1500";
    expect(parseTradeScreenshot(input).fields.actualEntry?.value).toBe("1.1");
    expect(parseTradeScreenshot(input).fields.plannedRisk?.value).toBe(
      "250.00",
    );
    input.lines[input.lines.length - 1].words[2].text = "1.09000";
    expect(parseTradeScreenshot(input).fields.actualEntry).toBeUndefined();
    expect(parseTradeScreenshot(input).fields.plannedRisk).toBeUndefined();
  });

  it("reconstructs split label/value lines and a single position row", () => {
    const input: TradeScreenshotAnalysis = {
      width: 1200,
      height: 800,
      language: "en-US",
      lines: [
        {
          text: "Symbol Side Qty Entry price Stop loss",
          words: [
            word("Symbol", 20, 100),
            word("Side", 230, 100),
            word("Qty", 430, 100),
            word("Entry", 630, 100, 45),
            word("price", 680, 100, 45),
            word("Stop", 880, 100, 45),
            word("loss", 930, 100, 40),
          ],
        },
        {
          text: "EURUSD Buy 0.25 1.10000 1.09500",
          words: [
            word("EURUSD", 20, 135),
            word("Buy", 230, 135),
            word("0.25", 430, 135),
            word("1.10000", 630, 135),
            word("1.09500", 880, 135),
          ],
        },
      ],
    };
    const result = parseTradeScreenshot(input);
    expect(result.fields.instrument?.value).toBe("EURUSD");
    expect(result.fields.quantity?.value).toBe("0.25");
    expect(result.fields.initialStopLoss?.value).toBe("1.095");
    input.lines.push({
      text: "USDJPY Buy 1.00 150.200 149.500",
      words: [
        word("USDJPY", 20, 170),
        word("Buy", 230, 170),
        word("1.00", 430, 170),
        word("150.200", 630, 170),
        word("149.500", 880, 170),
      ],
    });
    expect(parseTradeScreenshot(input).fields).toEqual({});
    expect(parseTradeScreenshot(input).warnings[0]).toContain(
      "Mehrere Positionen",
    );
  });

  it("does not choose among conflicting trades or infer USD from the dollar sign", () => {
    const result = parseTradeScreenshot(
      analysis(
        "Symbol: EURUSD\nSymbol: GBPUSD\nRisk: $125.50\nLots: 0.2\nLots: 0.4\nBalance: 50000\nOpen P&L: 15",
      ),
    );
    expect(result.fields.instrument).toBeUndefined();
    expect(result.fields.quantity).toBeUndefined();
    expect(result.fields.status).toBeUndefined();
    expect(result.currency).toBeNull();
    expect(result.fields.plannedRisk?.value).toBe("125.5");
  });

  it("preserves missing values and rejects ambiguous grouping, malformed and extreme numbers", () => {
    expect(
      parseTradeScreenshot(
        analysis("TradingView\nBuy Sell\nBalance: 50000\nStop: —"),
      ).fields,
    ).toEqual({});
    expect(parseScreenshotNumber("1,250.50")).toBe("1250.5");
    expect(parseScreenshotNumber("1.250,50")).toBe("1250.5");
    expect(parseScreenshotNumber("1 250,50")).toBe("1250.5");
    expect(parseScreenshotNumber("1,250")).toBeNull();
    expect(parseScreenshotNumber("1.250")).toBeNull();
    expect(parseScreenshotNumber("1.250", true)).toBe("1.25");
    expect(parseScreenshotNumber("12,34,567.89")).toBeNull();
    expect(parseScreenshotNumber("Infinity")).toBeNull();
    expect(parseScreenshotNumber("9999999999999999")).toBeNull();
    expect(
      parseTradeScreenshot(analysis("TradingView\nBuy")).fields.direction,
    ).toBeUndefined();
  });
});
