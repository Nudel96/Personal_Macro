import { describe, expect, it } from "vitest";
import {
  alignScoresToCandles,
  evaluateScoreOutcomes,
  movingAverage,
  scoreBias,
  summarizeScoreOutcomes,
} from "./score-history-model";
import type {
  MacroScoreHistoryPoint,
  ScoreDailyCandle,
} from "../../types/domain";

const point = (
  time: number,
  score: number | null,
  until = time + 36 * 3600,
): MacroScoreHistoryPoint => ({
  observedAt: time,
  score,
  validUntil: until,
  observationKey: `capture:${time}`,
  snapshotId: "recorded",
  modelVersion: "v1",
  origin: "captured",
  availableComponents: score == null ? 0 : 17,
  totalComponents: 17,
});
const candle = (time: number, close = 101): ScoreDailyCandle => ({
  time,
  open: 100,
  high: Math.max(102, close),
  low: 99,
  close,
});

describe("recorded score alignment", () => {
  it("uses the previous UTC-day boundary for provider dates without an exact open time", () => {
    const result = alignScoresToCandles(
      [candle(2 * 86400), candle(3 * 86400)],
      [point(86400 + 3600, 6)],
      5,
      true,
    );
    expect(result[0].score).toBeNull();
    expect(result[1].score).toBe(6);
  });
  it("keeps true zero and missing evidence distinct and preserves threshold boundaries", () => {
    expect(scoreBias(null, 5)).toBe("unavailable");
    expect(scoreBias(0, 5)).toBe("neutral");
    expect(scoreBias(4, 5)).toBe("neutral");
    expect(scoreBias(5, 5)).toBe("bullish");
    expect(scoreBias(-5, 5)).toBe("bearish");
    expect(scoreBias(10, 0)).toBe("unavailable");
  });
  it("never aligns a later intraday observation to the current daily open", () => {
    const result = alignScoresToCandles(
      [candle(86400), candle(172800)],
      [point(86401, 8)],
      5,
    );
    expect(result[0].score).toBeNull();
    expect(result[1].score).toBe(8);
  });
  it("does not carry a score past its source validity or resurrect old evidence", () => {
    const result = alignScoresToCandles(
      [candle(100), candle(200), candle(300), candle(400)],
      [point(99, 6, 300), point(250, null, 1000)],
      5,
    );
    expect(result.map((v) => v.score)).toEqual([6, 6, null, null]);
    expect(
      alignScoresToCandles([candle(300)], [point(99, 6, 300)], 5)[0].bias,
    ).toBe("unavailable");
  });
  it("marks directional transitions, including a new signal after an unavailable gap", () => {
    const result = alignScoresToCandles(
      [100, 200, 300, 400, 500].map((t) => candle(t)),
      [point(99, 6, 250), point(399, 6, 1000), point(499, -6, 1000)],
      5,
    );
    expect(result.map((v) => v.flip)).toEqual([true, false, false, true, true]);
  });
  it("uses the latest captured observation when archived and captured timestamps coincide", () => {
    const result = alignScoresToCandles(
      [candle(100)],
      [
        { ...point(100, -8), observationKey: "archive:snapshot" },
        point(100, 7),
      ],
      5,
    );
    expect(result[0].score).toBe(7);
  });
});

describe("forward direction evaluation", () => {
  it("counts mature non-overlapping directional starts using future opens and closes", () => {
    const candles = Array.from({ length: 15 }, (_, i) =>
      candle((i + 1) * 86400, i < 5 ? 110 : 90),
    );
    const points = [
      point(1, 7, 20 * 86400),
      point(6 * 86400, -7, 20 * 86400),
      point(7 * 86400, 7, 20 * 86400),
      point(14 * 86400, -7, 20 * 86400),
    ];
    const result = evaluateScoreOutcomes(
      alignScoresToCandles(candles, points, 5),
      5,
    );
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.bias)).toEqual(["bullish", "bearish"]);
    expect(result.every((v) => v.hit)).toBe(true);
    expect(summarizeScoreOutcomes(result, "bearish").hitRate).toBe(1);
  });
  it("does not count incomplete horizons, neutral scores, zero returns or long data gaps as wins", () => {
    const candles = [1, 2, 3, 4, 5].map((i) => candle(i * 86400, 100));
    const aligned = alignScoresToCandles(candles, [point(1, 5, 20 * 86400)], 5);
    expect(evaluateScoreOutcomes(aligned, 20)).toEqual([]);
    expect(evaluateScoreOutcomes(aligned, 5)[0].hit).toBe(false);
    expect(
      evaluateScoreOutcomes(
        alignScoresToCandles(candles, [point(1, 0, 20 * 86400)], 5),
        5,
      ),
    ).toEqual([]);
    const gap = aligned.map((v, i) => ({
      ...v,
      time: v.time + (i > 1 ? 20 * 86400 : 0),
    }));
    expect(evaluateScoreOutcomes(gap, 5)).toEqual([]);
    expect(summarizeScoreOutcomes([], "bullish")).toEqual({
      n: 0,
      hitRate: null,
      averageReturn: null,
    });
  });
  it("leaves SMA warm-up empty", () => {
    expect(
      movingAverage([candle(1, 10), candle(2, 20), candle(3, 30)], 2),
    ).toEqual([null, 15, 25]);
  });
});
