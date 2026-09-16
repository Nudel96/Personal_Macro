import { describe, expect, it } from "vitest";
import { parseTradeScreenshot } from "./trade-screenshot-parser";
import {
  sampleScreenshotColors,
  type ColoredScreenshotAnalysis,
  type ColoredScreenshotWord,
} from "./trade-screenshot-colors";

const word = (
  text: string,
  x: number,
  y: number,
  width: number,
  hue?: number,
  filled = false,
): ColoredScreenshotWord => ({
  text,
  x,
  y,
  width,
  height: 11,
  ...(hue === undefined ? {} : { color: { hue, filled } }),
});

// Synthetic values and coordinates: a short position with overlapping labels,
// detached OCR signs/zeroes, quote prices and unrelated indicator labels.
function chart(long = false): ColoredScreenshotAnalysis {
  const entryHue = long ? 225 : 355;
  const rows = [
    [
      word("Euro/US-Dollar", 25, 10, 115),
      word("•", 145, 10, 4),
      word("IT", 155, 10, 14),
      word("•", 180, 10, 4),
      word("Demo", 195, 10, 35),
    ],
    [word("0,25", 1000, 220, 25, 36)],
    [word("-100,00", 1050, 220, 49, 36), word("USD", 1108, 220, 22, 36)],
    [
      word(long ? "0," : "—O,", 1000, 255, 17, entryHue, true),
      word("25", 1019, 255, 13, entryHue, true),
    ],
    [
      word("-25,00", 1054, 255, 44, entryHue),
      word("USD", 1108, 255, 22, entryHue),
    ],
    [
      word("0,25", 1000, 460, 25, 170),
      word("+", 1040, 460, 6, 170),
      word("600,00", 1051, 460, 49, 170),
      word("USD", 1108, 460, 22, 170),
    ],
    [word(long ? "1,19600" : "1,20400", 1210, 155, 49, 36)],
    // Even a missed/malformed Bid word must not allow its price to become entry.
    [
      word("Bi&", 1170, 230, 25, entryHue, true),
      word("1,20100", 1210, 230, 49, entryHue, true),
    ],
    [word("1,20000", 1210, 295, 49, entryHue, true)],
    [word(long ? "1,22400" : "1,17600", 1210, 460, 49, 170)],
    [
      word("Ask", 1170, 210, 25, 125, true),
      word("1,20200", 1210, 210, 49, 125, true),
    ],
    [
      word("Hoch", 1170, 175, 25, 220, true),
      word("1,20450", 1210, 175, 49, 220, true),
    ],
    [
      word("15,00", 1210, 540, 30, 170, true),
      word("K", 1242, 540, 9, 170, true),
    ],
  ];
  return {
    width: 1280,
    height: 600,
    language: "de-DE",
    lines: rows.map((words) => ({
      text: words.map((word) => word.text).join(" "),
      words,
    })),
  };
}

describe("TradingView chart positions", () => {
  it.each([false, true])(
    "matches colored labels and money independently of vertical displacement (long: %s)",
    (long) => {
      const result = parseTradeScreenshot(chart(long));
      expect(
        Object.fromEntries(
          Object.entries(result.fields).map(([key, value]) => [
            key,
            value.value,
          ]),
        ),
      ).toEqual({
        instrument: "EURUSD",
        timeframe: "D1",
        quantity: "0.25",
        plannedRisk: "100",
        actualEntry: "1.2",
        initialStopLoss: long ? "1.196" : "1.204",
        takeProfit: long ? "1.224" : "1.176",
        direction: long ? "long" : "short",
        status: "open",
      });
      expect(result.currency).toBe("USD");
      expect(result.quantityUnit).toBe("unknown");
      expect(result.fields.riskPercent).toBeUndefined();
      expect(result.fields.actualExit).toBeUndefined();
    },
  );

  it("keeps unknown prices empty when only the same-colored current quote was read", () => {
    const input = chart();
    input.lines = input.lines.filter(
      (line) => !line.words.some((word) => word.text === "1,20000"),
    );
    const result = parseTradeScreenshot(input);
    expect(result.fields.actualEntry).toBeUndefined();
    expect(result.fields.status).toBeUndefined();
    expect(result.fields.plannedRisk?.value).toBe("100");
    expect(result.warnings.join(" ")).toContain("nicht eindeutig");
  });

  it("rejects ambiguous entry labels instead of choosing the closest row", () => {
    const input = chart();
    input.lines.push({
      text: "1,20001",
      words: [word("1,20001", 1210, 280, 49, 355, true)],
    });
    expect(parseTradeScreenshot(input).fields.actualEntry).toBeUndefined();
  });

  it("does not mix different bracket sizes, currencies or multiple positions", () => {
    for (const change of ["size", "currency", "position"] as const) {
      const input = chart();
      if (change === "size") input.lines[5].words[0].text = "0,50";
      if (change === "currency") input.lines[5].words[3].text = "EUR";
      if (change === "position")
        input.lines.push({
          text: "",
          words: [
            word("1,00", 1000, 350, 25, 225, true),
            word("+50,00", 1050, 350, 49, 225),
            word("USD", 1108, 350, 22, 225),
          ],
        });
      const result = parseTradeScreenshot(input);
      expect(result.fields.actualEntry, change).toBeUndefined();
      expect(result.fields.quantity, change).toBeUndefined();
      expect(result.fields.status, change).toBeUndefined();
    }
  });

  it("does not turn a position drawing or a pending order into an open position", () => {
    const input = chart();
    input.lines.push({ text: "Risk/Reward Ratio: 6", words: [] });
    expect(parseTradeScreenshot(input).fields.status).toBeUndefined();
    input.lines.pop();
    input.lines[3].words.forEach((word) => {
      if (word.color) word.color.filled = false;
    });
    expect(parseTradeScreenshot(input).fields.status).toBeUndefined();
  });

  it("accepts duplicate scale OCR and resolves German and English currency names", () => {
    const input = chart();
    input.lines.push(...input.lines.slice(6));
    expect(parseTradeScreenshot(input).fields.actualEntry?.value).toBe("1.2");
    for (const [title, symbol] of [
      ["Kanadischer Dollar/Schweizer Franken", "CADCHF"],
      ["New Zealand Dollar/Japanese Yen", "NZDJPY"],
      ["Britisches Pfund/US-Dollar", "GBPUSD"],
    ]) {
      const named = chart();
      named.lines[0].words[0].text = title;
      expect(parseTradeScreenshot(named).fields.instrument?.value).toBe(symbol);
    }
  });
});

describe("local label colors", () => {
  it("distinguishes filled position cells, outlined text and neutral ticks using pixels", () => {
    const width = 120;
    const height = 30;
    const data = new Uint8ClampedArray(width * height * 4);
    const pixel = (x: number, y: number, rgb: number[]) =>
      data.set([...rgb, 255], (y * width + x) * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) pixel(x, y, [14, 28, 40]);
    for (let y = 5; y < 23; y++)
      for (let x = 5; x < 35; x++) pixel(x, y, [242, 54, 69]);
    for (let y = 10; y < 18; y++)
      for (let x = 12; x < 25; x++) pixel(x, y, [255, 255, 255]);
    for (let y = 11; y < 16; y++)
      for (let x = 50; x < 68; x++) pixel(x, y, [0, 191, 159]);
    for (let y = 11; y < 16; y++)
      for (let x = 90; x < 108; x++) pixel(x, y, [190, 190, 190]);
    const input = {
      width,
      height,
      language: "de-DE",
      lines: [
        {
          text: "",
          words: [
            word("0.25", 10, 8, 20),
            word("0.25", 50, 8, 20),
            word("1.2500", 90, 8, 20),
          ],
        },
      ],
    };
    const result = sampleScreenshotColors(input, { width, height, data })
      .lines[0].words;
    expect(result[0].color?.filled).toBe(true);
    expect(result[0].color?.hue).toBeCloseTo(355.21, 1);
    expect(result[1].color?.filled).toBe(false);
    expect(result[1].color?.hue).toBeCloseTo(169.95, 1);
    expect(result[2].color).toBeUndefined();
    expect(sampleScreenshotColors(input, { width: 1, height, data })).toBe(
      input,
    );
  });
});
