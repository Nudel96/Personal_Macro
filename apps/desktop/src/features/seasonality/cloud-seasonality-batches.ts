import type {
  SeasonalOpportunity,
  SeasonalityOpportunityResponse,
  SeasonalityScreenerRow,
} from "../../types/domain";

export interface CloudBatch<T> {
  generation: string;
  nextCursor: number | null;
  total: number;
  completed: number;
  value: T;
}

/** An incomplete generation is never presented as a complete market ranking. */
export async function collectCloudBatches<T>(
  generation: string,
  request: (cursor: number) => Promise<CloudBatch<T>>,
  cancelled: () => boolean,
  progress: (completed: number, total: number) => void,
): Promise<T[]> {
  let cursor = 0;
  let total: number | undefined;
  const results: T[] = [];
  do {
    if (cancelled()) throw new Error("Die Berechnung wurde abgebrochen.");
    const batch = await request(cursor);
    if (cancelled()) throw new Error("Die Berechnung wurde abgebrochen.");
    if (
      batch.generation !== generation ||
      !Number.isInteger(batch.total) ||
      batch.total < 0 ||
      batch.total > 10000 ||
      (total !== undefined && batch.total !== total) ||
      !Number.isInteger(batch.completed) ||
      batch.completed < cursor ||
      batch.completed > batch.total ||
      (batch.nextCursor !== null &&
        (!Number.isInteger(batch.nextCursor) ||
          batch.nextCursor <= cursor ||
          batch.nextCursor !== batch.completed ||
          batch.nextCursor >= batch.total)) ||
      (batch.nextCursor === null && batch.completed !== batch.total)
    ) {
      throw new Error(
        "Der Datenstand hat sich während der Berechnung geändert. Bitte lade die Seite neu.",
      );
    }
    total = batch.total;
    results.push(batch.value);
    progress(batch.completed, batch.total);
    if (batch.nextCursor === null) return results;
    cursor = batch.nextCursor;
  } while (results.length <= 10000);
  throw new Error("Die Berechnung überschreitet die zulässige Größe.");
}

// Same Wilson calculation and five-sample minimum as native seasonality.rs.
function bullishScore(row: SeasonalityScreenerRow) {
  const metric = row.bullishWindow;
  if (!metric || metric.samples < 5) return -1;
  const n = metric.samples;
  const p = Math.round((metric.positiveRatio ?? 0) * n) / n;
  const z = 1.959963984540054;
  return (
    (p +
      (z * z) / (2 * n) -
      z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
    (1 + (z * z) / n)
  );
}
export function mergeScreenerBatches(batches: SeasonalityScreenerRow[][]) {
  const rows = batches.flat();
  if (new Set(rows.map((row) => row.symbol)).size !== rows.length)
    throw new Error("Der Screener enthält doppelte Märkte.");
  rows.sort(
    (a, b) =>
      (a.category < b.category ? -1 : a.category > b.category ? 1 : 0) ||
      (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0),
  );
  return rows.sort((a, b) => bullishScore(b) - bullishScore(a));
}

/** Exact native rank / distinct_top semantics; batches retain each asset's ten
 * best windows and original curves, so the global top ten is preserved. */
export function distinctOpportunityTop(
  rows: SeasonalOpportunity[],
  limit: number,
) {
  const strength = (row: SeasonalOpportunity) =>
    Math.abs(row.medianDifference ?? row.medianReturn) /
    Math.max(row.volatility, 0.000001);
  const sorted = [...rows].sort(
    (a, b) =>
      b.wilsonLowerBound - a.wilsonLowerBound ||
      strength(b) - strength(a) ||
      b.samples - a.samples ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const selected: SeasonalOpportunity[] = [];
  for (const row of sorted) {
    if (
      selected.some(
        (prior) =>
          prior.symbol === row.symbol &&
          prior.comparisonSymbol === row.comparisonSymbol &&
          prior.direction === row.direction &&
          Math.max(
            0,
            (Math.min(Date.parse(prior.endDate), Date.parse(row.endDate)) -
              Math.max(
                Date.parse(prior.startDate),
                Date.parse(row.startDate),
              )) /
              86400000,
          ) /
            Math.min(prior.calendarDays, row.calendarDays) >=
            0.75,
      )
    )
      continue;
    selected.push(row);
    if (selected.length === limit) break;
  }
  return selected;
}

export function mergeOpportunityBatches(
  batches: SeasonalityOpportunityResponse[],
): SeasonalityOpportunityResponse {
  const first = batches[0];
  if (!first)
    throw new Error("Es wurden keine saisonalen Ergebnisse übertragen.");
  if (
    batches.some(
      (batch) => JSON.stringify(batch.input) !== JSON.stringify(first.input),
    )
  )
    throw new Error(
      "Die Auswahl der saisonalen Berechnung ist nicht einheitlich.",
    );
  return {
    ...first,
    windows: distinctOpportunityTop(
      batches.flatMap((batch) => batch.windows),
      first.input.limit,
    ),
    divergences: distinctOpportunityTop(
      batches.flatMap((batch) => batch.divergences),
      first.input.limit,
    ),
    instrumentCount: batches.reduce((n, batch) => n + batch.instrumentCount, 0),
    currencyCount: Math.max(...batches.map((batch) => batch.currencyCount)),
    evaluatedWindows: batches.reduce(
      (n, batch) => n + batch.evaluatedWindows,
      0,
    ),
    evaluatedDivergences: batches.reduce(
      (n, batch) => n + batch.evaluatedDivergences,
      0,
    ),
    excludedSymbols: [
      ...new Set(batches.flatMap((batch) => batch.excludedSymbols)),
    ],
  };
}
