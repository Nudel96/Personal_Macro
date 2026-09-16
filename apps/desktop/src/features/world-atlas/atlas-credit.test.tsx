import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browserAtlasCredit } from "../../services/atlas-browser";
import { api } from "../../services/commands";
import { creditView, type AtlasCreditResponse } from "./atlas-credit";
import { AtlasCreditPanel } from "./atlas-credit-panel";
import {
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
} from "./atlas-coverage";
import {
  atlasSavedContext,
  atlasNotebookSources,
} from "./atlas-notebook-model";

vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: { atlasCredit: vi.fn(), syncAtlasCredit: vi.fn() },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ option }: { option: unknown }) => (
    <output data-testid="credit-options">{JSON.stringify(option)}</output>
  ),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
afterEach(cleanup);
function row(id = "m49:276"): AtlasCreditResponse {
  return {
    ...browserAtlasCredit(id),
    status: "available",
    profile: {
      geographyId: id,
      providerCode: "DE",
      providerLabel: "Germany",
      points: [
        { period: "1999-Q4", ratio: 80, trend: null, gap: null },
        { period: "2000-Q1", ratio: 100, trend: 100, gap: 0 },
        { period: "2000-Q3", ratio: 90, trend: 110, gap: -20 },
        { period: "2000-Q4", ratio: 130, trend: 100, gap: 30 },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T10:00:00Z",
      fileModifiedAt: null,
      url: "https://data.bis.org/static/bulk/WS_CREDIT_GAP_csv_flat.zip",
      sha256: "a".repeat(64),
      sourceRowCount: 10,
      numericCellCount: 10,
      areaCount: 1,
      recipe: "bis-published-one-sided-hp400000-gap-v1",
    },
  };
}
it("erhält Quartalslücken, echte Null und die fehlende Modellvorgeschichte", () => {
  const wave = creditView([row()], "gap", 0)!;
  expect(wave.periods).toEqual(["2000-Q1", "2000-Q2", "2000-Q3", "2000-Q4"]);
  expect(wave.series[0].values).toEqual([0, null, -20, 30]);
  expect(wave.limit).toBe(30);
  const ratio = creditView([row()], "ratio", 0)!;
  expect(ratio.periods[0]).toBe("1999-Q4");
  expect(ratio.series[1].values).toEqual([null, 100, null, 110, 100]);
  expect(creditView([row()], "gap", 2020)).toBeNull();
});
it("vergleicht nur dieselbe Herkunft und verwendet eine gemeinsame symmetrische Skala", () => {
  const second = row("m49:356");
  second.profile!.points[3].gap = -75;
  const view = creditView([row(), second], "gap", 0)!;
  expect(view.limit).toBe(75);
  expect(view.series).toHaveLength(2);
  second.provenance!.sha256 = "b".repeat(64);
  expect(creditView([row(), second], "gap", 0)).toBeNull();
  const mismatch = row();
  mismatch.profile!.geographyId = "world";
  expect(creditView([mismatch], "gap", 0)).toBeNull();
});
it("führt den BIS-Euroraum separat und markiert eine fehlende Welle nicht als verfügbare Quote", () => {
  expect(coverageMapped("credit", "bis:euro_area")).toBe(true);
  expect(coverageMapped("credit", "un-wpp:908")).toBe(false);
  expect(coverageMapped("credit", "world")).toBe(false);
  const noGap = row();
  noGap.profile!.points.forEach((p) => (p.gap = null));
  const choices = coverageOptions("m49:276", {
    credit: { data: noGap },
    energy: {},
    history: {},
    demography: {},
    markets: {},
    series: {},
  });
  expect(
    choices.find((o) => o.id === "credit:long_history:long_run_credit:gap")
      ?.status,
  ).toBe("empty");
  expect(
    choices.find((o) => o.id === "credit:long_history:long_run_credit:ratio")
      ?.status,
  ).toBe("available");
  expect(coverageFamilyTarget("credit", "bis:euro_area")).toMatchObject({
    area: "bis:euro_area",
    perspective: "credit",
    creditMode: "gap",
  });
});
it("speichert Quelle und dargestellten Zeitraum im Merkkontext", () => {
  const client = new QueryClient();
  client.setQueryData(["atlas", "credit", "m49:276"], row());
  const observer = new QueryObserver(client, {
    queryKey: ["atlas", "credit", "m49:276"],
    queryFn: async () => row(),
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  const context = atlasSavedContext(
    new URLSearchParams(
      "topic=long_history:long_run_credit&creditMode=ratio&creditSince=1980",
    ),
  );
  expect(context.params.creditMode).toBe("ratio");
  expect(context.params.creditSince).toBe("1980");
  expect(atlasNotebookSources(client, context)[0]).toMatchObject({
    family: "bis",
    hashes: ["a".repeat(64)],
  });
  unsubscribe();
});
function show(compareId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AtlasCreditPanel
        geography={row().geography}
        compareId={compareId}
        showNumbers={false}
        job={null}
        onAreaChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
it("zeigt ein ruhiges Bild ohne Pflichtzahlen und schaltet explizit zur Schuldenquote", async () => {
  vi.mocked(api.atlasCredit).mockImplementation(async (id) => row(id));
  show();
  const chart = await screen.findByTestId("credit-options");
  let option = JSON.parse(chart.textContent!);
  expect(option.tooltip.show).toBe(false);
  expect(option.yAxis.min).toBe(-option.yAxis.max);
  expect(option.animation).toBe(false);
  expect(option.series[0].connectNulls).toBe(false);
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Schulden & Trend" }));
  option = JSON.parse(chart.textContent!);
  expect(option.yAxis.min).toBe(0);
  expect(option.series).toHaveLength(2);
  expect(option.series[1].lineStyle.type).toBe("dotted");
});
it("behält das Hauptbild bei einem fehlenden Vergleich und benennt die Grenze", async () => {
  vi.mocked(api.atlasCredit).mockImplementation(async (id) =>
    id === "world"
      ? { ...browserAtlasCredit(id), status: "unsupported_area" }
      : row(id),
  );
  show("world");
  expect(await screen.findByTestId("credit-options")).toBeTruthy();
  expect(
    await screen.findByText(/Welt: Kein vergleichbares Kreditbild/),
  ).toBeTruthy();
});
it("gibt im Browser keine erfundenen Kreditdaten aus", () => {
  expect(browserAtlasCredit("m49:156")).toMatchObject({
    status: "desktop_required",
    profile: null,
    provenance: null,
  });
  expect(() => browserAtlasCredit("../private")).toThrow();
});
