import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  QueryClient,
  QueryObserver,
  QueryClientProvider,
} from "@tanstack/react-query";
import { atlasMarketProxies } from "./atlas-markets";
import type { AtlasMarketResponse } from "./atlas-market-types";
import { AtlasRelativeChart, AtlasRelativePanel } from "./atlas-relative-panel";
import { api } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import {
  relativeBenchmark,
  relativePicture,
  relativeProxies,
  relativeRecipe,
  relativeTopic,
} from "./atlas-relative";
import { coverageOptions, type CoverageInputs } from "./atlas-coverage";
import {
  atlasContextParams,
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";

afterEach(cleanup);
afterEach(() => vi.restoreAllMocks());
const now = new Date("2026-09-11T10:00:00Z");
function row(
  symbol: string,
  values: [string, number | null][],
): AtlasMarketResponse {
  return {
    proxy: atlasMarketProxies.find((p) => p.symbol === symbol)!,
    status: "available",
    provenance: {
      retrievedAt: "2026-09-11T01:00:00Z",
      sourceUrl: "https://eodhd.com/api/eod/" + symbol,
      sha256: "a".repeat(64),
      sourceFirstDate: "2026-01-01",
      sourceLastDate: "2026-08-31",
      adjustment: "EODHD adjusted_close: Splits und Ausschüttungen",
    },
    analysis: {
      recipe: "wave-is-not-used",
      points: values.map(([month, adjustedClose]) => ({
        month,
        adjustedClose,
        wave: 999,
        percentile: null,
      })),
      state: "insufficient_history",
      historyMonths: values.length,
      waveMonths: 0,
      missingMonths: 0,
      stale: false,
      lastObservation: values[values.length - 1]?.[0] ?? null,
      parameterSensitive: null,
    },
  };
}
const pair = () => ({
  market: row("INDA.US", [
    ["2026-06", 100],
    ["2026-07", 120],
    ["2026-08", 90],
  ]),
  benchmark: row("ACWI.US", [
    ["2026-06", 50],
    ["2026-07", 55],
    ["2026-08", 40],
  ]),
});
const blank = (): CoverageInputs => ({
  series: {},
  demography: {},
  history: {},
  energy: {},
  markets: {},
});

it("ordnet 58 echte Marktstellvertreter einer passenden breiten Referenz zu", () => {
  expect(relativeProxies).toHaveLength(58);
  expect(
    relativeProxies.filter((p) => relativeBenchmark(p).symbol === "SPY.US"),
  ).toHaveLength(11);
  expect(
    relativeProxies.filter((p) => relativeBenchmark(p).symbol === "ACWI.US"),
  ).toHaveLength(47);
  expect(
    relativeProxies.every(
      (p) =>
        p.currency === relativeBenchmark(p).currency &&
        p.id !== relativeBenchmark(p).id,
    ),
  ).toBe(true);
});
it("berechnet relative bereinigte Kurse auch bei fehlender Welle und absolutem Verlust", () => {
  const picture = relativePicture([pair()], 20, now)!;
  expect(picture.rows[0].points.map((p) => p.value)).toEqual([
    100,
    (120 / 100 / (55 / 50)) * 100,
    112.5,
  ]);
  expect(picture.stale).toBe(false);
});
it("verwendet für zwei Länder denselben ersten gemeinsam verfügbaren Monat", () => {
  const a = pair();
  const germany = row("EWG.US", [
    ["2026-07", 80],
    ["2026-08", 88],
  ]);
  const picture = relativePicture(
    [a, { market: germany, benchmark: a.benchmark }],
    null,
    now,
  )!;
  expect(picture.first).toBe("2026-07");
  expect(picture.rows.map((r) => r.points[0].value)).toEqual([100, 100]);
  expect(picture.rows[1].points[1].value).toBeCloseTo(151.25);
});
it("füllt Monatslücken nicht und schließt laufende Monate aus", () => {
  const a = pair();
  a.market.analysis.points.splice(1, 1);
  a.market.analysis.points.push({
    month: "2026-09",
    adjustedClose: 200,
    wave: null,
    percentile: null,
  });
  a.benchmark.analysis.points.push({
    month: "2026-09",
    adjustedClose: 20,
    wave: null,
    percentile: null,
  });
  const p = relativePicture([a], null, now)!;
  expect(p.rows[0].points.map((v) => v.value)).toEqual([100, null, 112.5]);
  expect(p.last).toBe("2026-08");
  expect(p.missingMonths).toBe(1);
});
it("beginnt erst nach einer geänderten Sektordefinition und markiert ältere Daten", () => {
  const p = relativePicture(
    [
      {
        market: row("XLK.US", [
          ["2018-08", 100],
          ["2018-09", 200],
          ["2018-10", 80],
          ["2018-11", 88],
        ]),
        benchmark: row("SPY.US", [
          ["2018-08", 50],
          ["2018-09", 50],
          ["2018-10", 40],
          ["2018-11", 40],
        ]),
      },
    ],
    null,
    now,
  )!;
  expect(p.first).toBe("2018-10");
  expect(p.breakAfter).toBe("2018-09");
  expect(p.rows[0].points[1].value).toBeCloseTo(110);
  expect(p.stale).toBe(true);
});
it("weist Nullkurse, Duplikate, falsche Währung und andere Kursbereinigung zurück", () => {
  for (const mutate of [
    (p: ReturnType<typeof pair>) => {
      p.market.analysis.points[1].adjustedClose = 0;
    },
    (p: ReturnType<typeof pair>) => {
      p.market.analysis.points[1].month = "2026-06";
    },
    (p: ReturnType<typeof pair>) => {
      p.market.proxy = { ...p.market.proxy, currency: "EUR" };
    },
    (p: ReturnType<typeof pair>) => {
      p.market.provenance!.adjustment = "raw close";
    },
  ]) {
    const p = pair();
    mutate(p);
    expect(relativePicture([p], 20, now)).toBeNull();
  }
  expect(
    relativePicture(
      [
        {
          ...pair(),
          benchmark: row("SPY.US", [
            ["2026-06", 50],
            ["2026-08", 60],
          ]),
        },
      ],
      20,
      now,
    ),
  ).toBeNull();
});
it("verlangt zwei echte Beobachtungen und zeigt unterschiedliche Quellenstände", () => {
  const p = pair();
  p.market.analysis.points = p.market.analysis.points.slice(0, 1);
  expect(relativePicture([p], 20, now)).toBeNull();
  const a = pair();
  a.market.provenance!.retrievedAt = "2026-09-10T01:00:00Z";
  expect(relativePicture([a], 20, now)?.differentSourceDates).toBe(true);
});
it("zeichnet Lücken, hält Zahlen optional und erklärt die Basis", () => {
  const a = pair();
  a.market.analysis.points[1].adjustedClose = null;
  const p = relativePicture([a], 20, now)!;
  const { container, rerender } = render(
    <AtlasRelativeChart picture={p} showNumbers={false} />,
  );
  expect(container.querySelectorAll("circle")).toHaveLength(2);
  expect(
    container.querySelector("path")?.getAttribute("d")?.match(/M/g),
  ).toHaveLength(2);
  expect(container.textContent).not.toContain("112,5");
  expect(screen.queryByText("Relative Monatswerte als Tabelle")).toBeNull();
  rerender(<AtlasRelativeChart picture={p} showNumbers />);
  expect(screen.getByText("Relative Monatswerte als Tabelle")).toBeTruthy();
  expect(screen.getByText("Nicht verfügbar")).toBeTruthy();
});
it("zählt lokale relative Abdeckung nur bei vorhandener Referenz und passenden Monaten", () => {
  const input = blank(),
    p = pair();
  input.markets[p.market.proxy.id] = { data: p.market };
  let option = coverageOptions("m49:356", input).find(
    (o) => o.topicId === relativeTopic && o.target.proxy === p.market.proxy.id,
  )!;
  expect(option.status).not.toBe("available");
  input.markets[p.benchmark.proxy.id] = { data: p.benchmark };
  option = coverageOptions("m49:356", input).find(
    (o) => o.topicId === relativeTopic && o.target.proxy === p.market.proxy.id,
  )!;
  expect(option.status).toBe("available");
  expect(
    coverageOptions("m49:288", input)
      .filter((o) => o.topicId === relativeTopic)
      .every((o) => o.status === "elsewhere"),
  ).toBe(true);
});
it("merkt Referenz, Zeitraum, beide Quellen und die tatsächliche Vergleichsberechnung", () => {
  const p = pair(),
    client = new QueryClient();
  const context = atlasSavedContext(
    new URLSearchParams({
      topic: relativeTopic,
      proxy: p.market.proxy.id,
      relativeBenchmark: p.benchmark.proxy.id,
      relativeHorizon: "10",
    }),
  );
  expect(atlasContextParams(context)?.get("relativeHorizon")).toBe("10");
  expect(atlasContextParams(context)?.get("relativeBenchmark")).toBe(
    p.benchmark.proxy.id,
  );
  const unsubscribe = [p.market, p.benchmark].map((r) =>
    new QueryObserver(client, {
      queryKey: ["atlas", "market", r.proxy.id],
      initialData: r,
      staleTime: Infinity,
      queryFn: async () => r,
    }).subscribe(() => {}),
  );
  const sources = atlasNotebookSources(client, context);
  expect(sources).toHaveLength(2);
  expect(
    sources.every((s) => s.recipe === relativeRecipe && s.hashes.length === 1),
  ).toBe(true);
  unsubscribe.forEach((u) => u());
  client.clear();
});

it("erhält das eigene Bild, wenn dem zweiten Land die lokale Marktgeschichte fehlt", async () => {
  const p = pair();
  vi.spyOn(api, "atlasMarket").mockImplementation(async (id) => {
    if (id === p.market.proxy.id) return p.market;
    if (id === p.benchmark.proxy.id) return p.benchmark;
    return { ...row("EWG.US", []), status: "not_downloaded", provenance: null };
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <AtlasRelativePanel
        geography={atlasCatalog.geographies.find((g) => g.id === "m49:356")!}
        compareId="m49:276"
        showNumbers={false}
        job={null}
        onProxyChange={() => {}}
        onAreaChange={() => {}}
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      container.querySelectorAll(".atlas-relative-chart circle"),
    ).toHaveLength(3),
  );
  await waitFor(() =>
    expect(
      screen.getByText(
        /Das vorhandene eigene Bild bleibt mit seiner eigenen Basis sichtbar/,
      ),
    ).toBeTruthy(),
  );
  expect(container.querySelectorAll(".atlas-relative-chart g")).toHaveLength(1);
  client.clear();
});
