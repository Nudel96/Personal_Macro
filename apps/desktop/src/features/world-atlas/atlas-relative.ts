import { atlasMarketProxies } from "./atlas-markets";
import type {
  AtlasMarketProxy,
  AtlasMarketResponse,
} from "./atlas-market-types";

export const relativeTopic = "market_context:relative_strength";
export const relativeRecipe =
  "atlas-relative-monthly-adjusted-ratio-common-base-v1";
export const relativeProxies = atlasMarketProxies.filter(
  (p) => p.symbol !== "ACWI.US",
);
export const relativeProxiesFor = (area: string) =>
  relativeProxies.filter((p) => p.geographyId === area);
export function relativeBenchmark(proxy: AtlasMarketProxy) {
  const sector = proxy.topicIds.includes("market_context:sector_equities");
  return atlasMarketProxies.find(
    (p) => p.symbol === (sector ? "SPY.US" : "ACWI.US"),
  )!;
}
export type RelativePair = {
  market: AtlasMarketResponse;
  benchmark: AtlasMarketResponse;
};
export type RelativePicture = {
  first: string;
  last: string;
  missingMonths: number;
  breakAfter: string | null;
  stale: boolean;
  differentSourceDates: boolean;
  rows: {
    id: string;
    label: string;
    benchmark: string;
    points: { month: string; value: number | null }[];
  }[];
};
const monthNumber = (s: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
    ? Number(s.slice(0, 4)) * 12 + Number(s.slice(5)) - 1
    : NaN;
const monthLabel = (n: number) =>
  `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
const validPrice = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Compare original adjusted monthly closes, never the separately calculated waves. */
export function relativePicture(
  pairs: RelativePair[],
  horizon: number | null,
  now = new Date(),
): RelativePicture | null {
  if (
    !pairs.length ||
    pairs.length > 2 ||
    (horizon !== null && ![10, 20].includes(horizon))
  )
    return null;
  const all = pairs.flatMap((p) => [p.market, p.benchmark]);
  const adjustment = all[0].provenance?.adjustment;
  if (
    !adjustment?.startsWith("EODHD adjusted_close:") ||
    all.some(
      (r) =>
        r.status !== "available" ||
        !r.provenance ||
        r.provenance.adjustment !== adjustment ||
        r.proxy.currency !== "USD",
    )
  )
    return null;
  if (
    pairs.some(
      (p) =>
        p.market.proxy.id === p.benchmark.proxy.id ||
        relativeBenchmark(p.market.proxy).id !== p.benchmark.proxy.id ||
        p.benchmark.proxy.id !== pairs[0].benchmark.proxy.id,
    )
  )
    return null;
  const maps = all.map((r) => {
    const points = r.analysis.points;
    if (
      !points.length ||
      points.length > 1800 ||
      points.some(
        (p, i) =>
          !Number.isFinite(monthNumber(p.month)) ||
          (i > 0 && p.month <= points[i - 1].month) ||
          (p.adjustedClose !== null && !validPrice(p.adjustedClose)),
      )
    )
      return null;
    return new Map(points.map((p) => [monthNumber(p.month), p.adjustedClose]));
  });
  if (maps.some((m) => !m)) return null;
  const series = maps as Map<number, number | null>[];
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  if (!Number.isFinite(currentMonth)) return null;
  const last = Math.min(
    currentMonth - 1,
    ...series.map((m) => Math.max(...m.keys())),
  );
  const breaks = all.flatMap((r) => r.proxy.breaks).map(monthNumber);
  if (breaks.some((b) => !Number.isFinite(b))) return null;
  const lastBreak = Math.max(-1, ...breaks.filter((b) => b <= last));
  // A changed sector definition starts with the first complete month after its break.
  let first = Math.max(
    ...series.map((m) => Math.min(...m.keys())),
    lastBreak + 1,
    horizon ? last - horizon * 12 + 1 : 0,
  );
  while (first <= last && series.some((m) => !validPrice(m.get(first))))
    first++;
  if (last - first < 1 || last - first > 1800) return null;
  const months = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const rows = pairs.map((p, i) => {
    const a = series[i * 2],
      b = series[i * 2 + 1];
    const baseA = a.get(first)!,
      baseB = b.get(first)!;
    return {
      id: p.market.proxy.id,
      label: p.market.proxy.label,
      benchmark: p.benchmark.proxy.label,
      points: months.map((m) => {
        const x = a.get(m),
          y = b.get(m);
        const value =
          validPrice(x) && validPrice(y)
            ? (x / baseA / (y / baseB)) * 100
            : null;
        return {
          month: monthLabel(m),
          value:
            value !== null && Number.isFinite(value) && value > 0
              ? value
              : null,
        };
      }),
    };
  });
  if (rows.some((r) => r.points.filter((p) => p.value !== null).length < 2))
    return null;
  return {
    first: monthLabel(first),
    last: monthLabel(last),
    rows,
    missingMonths: months.filter((_, i) =>
      rows.some((r) => r.points[i].value === null),
    ).length,
    breakAfter: lastBreak >= 0 ? monthLabel(lastBreak) : null,
    stale:
      last < currentMonth - 2 ||
      rows.some((r) => r.points[r.points.length - 1]?.value === null),
    differentSourceDates:
      new Set(all.map((r) => r.provenance!.retrievedAt.slice(0, 10))).size > 1,
  };
}
