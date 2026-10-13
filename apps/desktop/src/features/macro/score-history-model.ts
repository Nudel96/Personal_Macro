import type {
  MacroScoreHistoryPoint,
  ScoreDailyCandle,
} from "../../types/domain";

export type ScoreBias = "bullish" | "bearish" | "neutral" | "unavailable";
export const biasLabels: Record<ScoreBias, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
  unavailable: "Nicht verfügbar",
};

export function scoreBias(score: number | null, threshold: number): ScoreBias {
  if (
    score == null ||
    !Number.isFinite(score) ||
    !Number.isFinite(threshold) ||
    threshold < 1
  )
    return "unavailable";
  return score >= threshold
    ? "bullish"
    : score <= -threshold
      ? "bearish"
      : "neutral";
}

export interface ScoredCandle extends ScoreDailyCandle {
  point: MacroScoreHistoryPoint | null;
  score: number | null;
  bias: ScoreBias;
  flip: boolean;
}

/** A daily open only knows records captured at or before that open. */
export function alignScoresToCandles(
  candles: ScoreDailyCandle[],
  points: MacroScoreHistoryPoint[],
  threshold: number,
  dateOnly = false,
): ScoredCandle[] {
  const ordered = [...points].sort(
    (a, b) =>
      a.observedAt - b.observedAt ||
      a.observationKey.localeCompare(b.observationKey),
  );
  let cursor = -1;
  let previous: ScoreBias = "unavailable";
  return [...candles]
    .sort((a, b) => a.time - b.time)
    .map((candle) => {
      const cutoff = candle.time - (dateOnly ? 86400 : 0);
      while (
        cursor + 1 < ordered.length &&
        ordered[cursor + 1].observedAt <= cutoff
      )
        cursor++;
      const candidate = ordered[cursor];
      const point =
        candidate && candidate.validUntil > cutoff ? candidate : null;
      const score = point?.score ?? null;
      const bias = scoreBias(score, threshold);
      const flip =
        (bias === "bullish" || bias === "bearish") && bias !== previous;
      previous = bias;
      return { ...candle, point, score, bias, flip };
    });
}

export interface ScoreOutcome {
  time: number;
  endTime: number;
  bias: "bullish" | "bearish";
  returnPct: number;
  alignedReturnPct: number;
  hit: boolean;
}

export function evaluateScoreOutcomes(
  candles: ScoredCandle[],
  horizon: 5 | 20,
): ScoreOutcome[] {
  const result: ScoreOutcome[] = [];
  let nextAllowedIndex = 0;
  for (let i = 0; i < candles.length; i++) {
    const start = candles[i];
    if (
      !start.flip ||
      (start.bias !== "bullish" && start.bias !== "bearish") ||
      i < nextAllowedIndex
    )
      continue;
    const endIndex = i + horizon - 1;
    if (endIndex >= candles.length) continue;
    const window = candles.slice(i, endIndex + 1);
    if (
      window.some(
        (v, index) =>
          !Number.isFinite(v.close) ||
          v.close <= 0 ||
          (index > 0 && v.time - window[index - 1].time > 7 * 86400),
      ) ||
      !Number.isFinite(start.open) ||
      start.open <= 0
    )
      continue;
    const returnPct = (candles[endIndex].close / start.open - 1) * 100;
    const alignedReturnPct = start.bias === "bullish" ? returnPct : -returnPct;
    result.push({
      time: start.time,
      endTime: candles[endIndex].time,
      bias: start.bias,
      returnPct,
      alignedReturnPct,
      hit: alignedReturnPct > 0,
    });
    nextAllowedIndex = endIndex + 1;
  }
  return result;
}

export function summarizeScoreOutcomes(
  outcomes: ScoreOutcome[],
  bias: "bullish" | "bearish",
) {
  const selected = outcomes.filter((v) => v.bias === bias);
  return {
    n: selected.length,
    hitRate: selected.length
      ? selected.filter((v) => v.hit).length / selected.length
      : null,
    averageReturn: selected.length
      ? selected.reduce((sum, v) => sum + v.alignedReturnPct, 0) /
        selected.length
      : null,
  };
}

export function movingAverage(
  candles: ScoreDailyCandle[],
  period: number,
): (number | null)[] {
  return candles.map((_, i) =>
    i + 1 < period
      ? null
      : candles
          .slice(i + 1 - period, i + 1)
          .reduce((sum, v) => sum + v.close, 0) / period,
  );
}
