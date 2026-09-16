import proxies from "./data/market-proxies.json";
import type {
  AtlasMarketProxy,
  AtlasMarketResponse,
} from "./atlas-market-types";

export const atlasMarketProxies: AtlasMarketProxy[] = proxies;
export const atlasMarketsFor = (topicId: string, geographyId: string) =>
  atlasMarketProxies.filter(
    (proxy) =>
      proxy.topicIds.includes(topicId) && proxy.geographyId === geographyId,
  );

export const atlasMarketReading: Record<
  AtlasMarketResponse["analysis"]["state"],
  string
> = {
  above_trend: "Oberhalb des eigenen langfristigen Trends",
  below_trend: "Unterhalb des eigenen langfristigen Trends",
  at_trend: "Am eigenen langfristigen Trend",
  stale: "Ältere Marktgeschichte · aktuelle Lage offen",
  insufficient_history:
    "Für eine langfristige Welle reicht die zusammenhängende Historie noch nicht",
};

export function atlasMarketComparison(
  rows: AtlasMarketResponse[],
  horizon: number | null,
) {
  if (
    !rows.length ||
    rows.some(
      (row) =>
        row.status !== "available" ||
        row.analysis.recipe !== rows[0].analysis.recipe ||
        row.proxy.currency !== rows[0].proxy.currency,
    )
  )
    return null;
  const valid = rows.map((row) =>
    row.analysis.points.filter((point) => point.wave !== null),
  );
  if (valid.some((points) => !points.length)) return null;
  let first = valid
    .map((points) => points[0].month)
    .sort()
    .slice(-1)[0];
  const last = valid.map((points) => points[points.length - 1].month).sort()[0];
  if (horizon)
    first = [first, `${Number(last.slice(0, 4)) - horizon}${last.slice(4)}`]
      .sort()
      .slice(-1)[0];
  if (first > last) return null;
  const maps = rows.map(
    (row) =>
      new Map(row.analysis.points.map((point) => [point.month, point.wave])),
  );
  const months = [
    ...new Set(
      rows.flatMap((row) => row.analysis.points.map((point) => point.month)),
    ),
  ]
    .filter((month) => month >= first && month <= last)
    .sort();
  if (!months.some((month) => maps.every((map) => map.get(month) != null)))
    return null;
  return {
    months,
    first,
    last,
    rows: rows.map((row, index) => ({
      name: row.proxy.label,
      values: months.map((month) => maps[index].get(month) ?? null),
    })),
  };
}
