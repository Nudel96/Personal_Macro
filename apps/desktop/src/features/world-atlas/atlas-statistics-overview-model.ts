import {
  atlasComparison,
  atlasDisplayedQuality,
  atlasIsolatedPoint,
  atlasValueDomain,
} from "./atlas-analysis";
import type { AtlasCatalog, AtlasSeriesResponse } from "./atlas-types";
import { atlasSeriesConnect } from "./atlas-source-series";

export const atlasStatisticsBatchId = "statistics-overview";
export const statisticsGroup = (catalog: AtlasCatalog, topicId: string) =>
  catalog.topics.find((topic) => topic.id === topicId)?.groupId;
export function statisticsGroups(catalog: AtlasCatalog, domain: string) {
  return catalog.groups.filter(
    (group) =>
      (domain === "all" || group.domainId === domain) &&
      catalog.series.some(
        (series) => statisticsGroup(catalog, series.topicId) === group.id,
      ),
  );
}
export function statisticsFrame(horizon: number | null, now = new Date()) {
  const last = now.getFullYear() - 1;
  return { first: horizon ? Math.max(1960, last - horizon + 1) : 1960, last };
}

export function statisticsPicture(
  rows: AtlasSeriesResponse[],
  frame: ReturnType<typeof statisticsFrame>,
) {
  const visible = rows.map((row) => ({
    ...row,
    points: row.points.filter(
      (point) => point.year >= frame.first && point.year <= frame.last,
    ),
  }));
  const connect = rows.length > 0 && atlasSeriesConnect(rows[0].series);
  const comparison = atlasComparison(visible);
  if (!comparison) return null;
  const scale = atlasValueDomain(comparison.rows.flatMap((row) => row.values))!;
  const y = (value: number) =>
    108 - ((value - scale.min) / (scale.max - scale.min)) * 96;
  const x = (year: number) =>
    8 + ((year - frame.first) / Math.max(1, frame.last - frame.first)) * 304;
  let lastCommon = -1;
  comparison.years.forEach((_, index) => {
    if (comparison.rows.every((row) => row.values[index] !== null))
      lastCommon = index;
  });
  return {
    scale,
    zeroY: y(0),
    quality: atlasDisplayedQuality(visible),
    first: comparison.first,
    last: comparison.last,
    rows: comparison.rows.map((row) => {
      const parts: string[] = [];
      const isolated: { x: number; y: number }[] = [];
      row.values.forEach((value, index) => {
        if (value === null) return;
        const point = { x: x(comparison.years[index]), y: y(value) };
        parts.push(
          `${connect && index > 0 && row.values[index - 1] !== null ? "L" : "M"}${point.x.toFixed(3)},${point.y.toFixed(3)}`,
        );
        if (!connect || atlasIsolatedPoint(row.values, index))
          isolated.push(point);
      });
      return {
        name: row.name,
        path: parts.join(" "),
        isolated,
        latest: {
          year: comparison.years[lastCommon],
          value: row.values[lastCommon]!,
        },
      };
    }),
  };
}

export function statisticsReading(row: AtlasSeriesResponse | undefined) {
  if (!row) return "Lokaler Stand wird geprüft";
  return {
    available: "Zeitreihe verfügbar",
    empty: "Quelle geprüft · keine Werte für dieses Gebiet",
    unsupported_area: "Gebiet in dieser Quelle nicht zugeordnet",
    not_downloaded: "Noch nicht geladen",
    desktop_required: "In der Desktop-App laden",
  }[row.status];
}
