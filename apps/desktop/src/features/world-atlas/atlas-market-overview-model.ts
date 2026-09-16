import type {
  AtlasMarketProxy,
  AtlasMarketResponse,
} from "./atlas-market-types";

export const atlasMarketBatchId = "market-overview";
export type MarketOverviewGroup = "countries" | "sectors" | "themes";
export const marketOverviewGroups = [
  {
    id: "countries",
    label: "Länder & Welt",
    description: "Breite Aktienmärkte der zugeordneten Länder und der Welt",
  },
  {
    id: "sectors",
    label: "US-Börsensektoren",
    description: "Die elf Sektoren des US-Aktienmarkts",
  },
  {
    id: "themes",
    label: "Globale Energiethemen",
    description: "Wasserstoff, Solar, Kernenergie und Uran weltweit",
  },
] as const;
export function marketOverviewGroup(
  proxy: AtlasMarketProxy,
): MarketOverviewGroup {
  if (proxy.topicIds.includes("market_context:sector_equities"))
    return "sectors";
  if (proxy.topicIds.includes("market_context:theme_equities")) return "themes";
  return "countries";
}
const recipe = "log-ols60-trailing12-rank120-min60-v1";
const monthIndex = (month: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1
    : NaN;
export const overviewMonth = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
export const comparableOverviewRow = (row: AtlasMarketResponse) =>
  row.status === "available" &&
  row.analysis.recipe === recipe &&
  row.proxy.currency === "USD";

export function marketOverviewFrame(
  rows: AtlasMarketResponse[],
  horizon: number | null,
  now = new Date(),
) {
  const last = now.getUTCFullYear() * 12 + now.getUTCMonth() - 1;
  const values = rows
    .filter(comparableOverviewRow)
    .flatMap((row) => row.analysis.points)
    .filter(
      (point) =>
        point.wave !== null &&
        Number.isFinite(point.wave) &&
        monthIndex(point.month) <= last,
    );
  const first = horizon
    ? last - horizon * 12 + 1
    : values.length
      ? Math.min(...values.map((point) => monthIndex(point.month)))
      : last - 239;
  const extent = Math.max(
    10,
    Math.ceil(
      (Math.max(
        0,
        ...values
          .filter((p) => monthIndex(p.month) >= first)
          .map((p) => Math.abs(p.wave!)),
      ) *
        1.1) /
        10,
    ) * 10,
  );
  return { first, last, extent };
}
export function marketOverviewPath(
  row: AtlasMarketResponse,
  frame: ReturnType<typeof marketOverviewFrame>,
) {
  if (!comparableOverviewRow(row))
    return {
      path: "",
      current: null,
      isolated: [] as { x: number; y: number }[],
    };
  const points = row.analysis.points.filter(
    (p) =>
      monthIndex(p.month) >= frame.first && monthIndex(p.month) <= frame.last,
  );
  const coordinates = points.map((point) => {
    const index = monthIndex(point.month);
    return {
      index,
      x:
        8 +
        ((index - frame.first) / Math.max(1, frame.last - frame.first)) * 304,
      y:
        point.wave === null || !Number.isFinite(point.wave)
          ? null
          : 60 - (point.wave / frame.extent) * 46,
    };
  });
  let previous = -Infinity;
  const parts: string[] = [];
  const isolated: { x: number; y: number }[] = [];
  coordinates.forEach((p, index) => {
    if (p.y === null) {
      previous = -Infinity;
      return;
    }
    parts.push(
      `${p.index === previous + 1 ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)}`,
    );
    const next = coordinates[index + 1];
    if (
      p.index !== previous + 1 &&
      (!next || next.y === null || next.index !== p.index + 1)
    )
      isolated.push({ x: p.x, y: p.y });
    previous = p.index;
  });
  const last = coordinates[coordinates.length - 1];
  const current =
    last?.index === frame.last && last.y !== null
      ? { x: last.x, y: last.y }
      : null;
  return { path: parts.join(" "), current, isolated };
}
export function marketOverviewReading(row: AtlasMarketResponse | undefined) {
  if (!row) return "Lokaler Stand wird geprüft";
  if (row.status === "desktop_required") return "In der Desktop-App laden";
  if (row.status === "not_downloaded") return "Noch nicht geladen";
  if (!comparableOverviewRow(row))
    return "Berechnung nicht gemeinsam vergleichbar";
  if (row.analysis.stale || row.analysis.state === "stale")
    return "Aktuelle Lage offen · ältere Daten";
  if (row.analysis.state === "insufficient_history")
    return "Aktuell keine ausreichend lange Welle";
  if (row.analysis.parameterSensitive)
    return "Einordnung hängt vom Zeitfenster ab";
  return {
    above_trend: "Über dem eigenen Trend",
    below_trend: "Unter dem eigenen Trend",
    at_trend: "Am eigenen Trend",
    stale: "Aktuelle Lage offen · ältere Daten",
    insufficient_history: "Aktuell keine ausreichend lange Welle",
  }[row.analysis.state];
}
