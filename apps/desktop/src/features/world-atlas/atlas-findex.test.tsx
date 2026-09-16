import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasFindexCatalog as cfg,
  findexValue,
  findexView,
  findexSelection,
  type AtlasFindexResponse,
} from "./atlas-findex";
import { AtlasFindexPanel, FindexChart } from "./atlas-findex-panel";
import {
  coverageOptions,
  coverageMapped,
  coverageFamilyTarget,
} from "./atlas-coverage";
import { browserAtlasFindex } from "../../services/atlas-browser";
import { atlasSavedContext } from "./atlas-notebook-model";
const metric = cfg.metrics.find((m) => m.id === "account_t_d")!;
afterEach(cleanup);
function response(id = "m49:276"): AtlasFindexResponse {
  const area = cfg.areas.find((a) => a.geographyId === id)!;
  return {
    geography: atlasCatalog.geographies.find((g) => g.id === id)!,
    status: "available",
    profile: {
      geographyId: id,
      providerCode: area.code,
      providerLabel: area.label,
      points: [
        { year: 2011, population: "all", values: { account_t_d: "0.25" } },
        { year: 2014, population: "all", values: { account_t_d: "0" } },
        { year: 2017, population: "all", values: { account_t_d: null } },
        { year: 2022, population: "all", values: { account_t_d: "0.5" } },
        { year: 2024, population: "women", values: { account_t_d: "0.7" } },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T12:00:00Z",
      url: cfg.sourceUrl,
      sha256: cfg.sha256,
      glossarySha256: cfg.glossarySha256,
      release: cfg.release,
      recipe: cfg.recipe,
      sourceRowCount: cfg.expectedRows,
      selectedRowCount: cfg.expectedSelectedRows,
      numericCellCount: cfg.expectedNumericCells,
      areaCount: cfg.areas.length,
    },
  };
}
it("preserves exact source fractions, genuine zero and unknown values", () => {
  const points = response().profile!.points;
  expect(findexValue(points[0], metric)).toBe(25);
  expect(findexValue(points[1], metric)).toBe(0);
  expect(findexValue(points[2], metric)).toBeNull();
  expect(
    findexValue(
      { ...points[0], values: { account_t_d: "3.5185418e-4" } },
      metric,
    ),
  ).toBeCloseTo(0.035185418, 10);
  for (const raw of ["", "NaN", "1.1", "-0.1", " 0.2", "NA"])
    expect(
      findexValue({ ...points[0], values: { account_t_d: raw } }, metric),
    ).toBeNull();
  expect(points[0].values.account_t_d).toBe("0.25");
});
it("shares a full percentage scale and keeps 2022 separate from 2021", () => {
  const de = response(),
    us = response("m49:840");
  us.profile!.points[3].year = 2021;
  const view = findexView([de, us], metric, 2011, "all")!;
  expect([view.min, view.max, view.lastCommonYear]).toEqual([0, 100, 2014]);
  expect(view.series[0].points.map((p) => p.year)).toEqual([2011, 2014, 2022]);
  expect(findexView([de, us], metric, 2021, "all")).toBeNull();
  us.provenance!.glossarySha256 = "changed";
  expect(findexView([de, us], metric, 2011, "all")).toBeNull();
});
it("does not substitute all adults for a missing population group", () => {
  expect(
    findexView([response()], metric, 2011, "women")?.series[0].points,
  ).toEqual([{ year: 2024, value: 70 }]);
  expect(findexView([response()], metric, 2011, "men")).toBeNull();
  const selection = findexSelection(
    new URLSearchParams(
      "findexGroup=payments&findexMetric=account_t_d&findexPopulation=unknown&findexSince=2025",
    ),
    "digital:digital_payments",
  );
  expect(selection).toMatchObject({
    group: "payments",
    metric: "",
    population: "all",
    since: 2011,
  });
});
it("draws disconnected survey points and keeps numeric values opt-in", () => {
  const view = findexView([response()], metric, 2011, "all")!;
  const { container } = render(<FindexChart view={view} metric={metric} />);
  expect(container.querySelectorAll("circle")).toHaveLength(3);
  expect(container.querySelectorAll("line")).toHaveLength(3); // only horizontal scale guides
  expect(container.querySelectorAll("polyline")).toHaveLength(0);
  expect(container.textContent).not.toContain("25 Prozent");
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
    "Einzelne Erhebungen ohne Verbindungslinien",
  );
  cleanup();
  render(
    <FindexChart
      view={findexView([response()], metric, 2011, "women")!}
      metric={metric}
    />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
    "Frauen ab 15 Jahren",
  );
});
it("maps the actual source regions and coverage only to adult observations", () => {
  expect(coverageMapped("findex", "findex:sub_saharan_africa")).toBe(true);
  expect(coverageMapped("findex", "un:002")).toBe(false);
  expect(browserAtlasFindex("m49:276")).toMatchObject({
    status: "desktop_required",
    profile: null,
  });
  const option = coverageOptions("m49:276", {
    findex: { data: response() },
    series: {},
    markets: {},
    demography: {},
    history: {},
    energy: {},
  }).find((o) => o.id === "findex:account_t_d")!;
  expect(option.years).toEqual([2011, 2014, 2022]);
  expect(option.target).toMatchObject({
    topic: "finance:financial_access",
    findexPopulation: "all",
    findexMetric: "account_t_d",
  });
  expect(coverageFamilyTarget("findex", "m49:276")).toMatchObject({
    perspective: "findex",
  });
  const context = atlasSavedContext(
    new URLSearchParams(
      "topic=finance:financial_access&findexGroup=accounts&findexMetric=account_t_d&findexPopulation=women&findexSince=2017",
    ),
  );
  expect(context.params).toMatchObject({
    findexPopulation: "women",
    findexSince: "2017",
  });
});
it("shows country data with an unavailable comparison and switches population explicitly", async () => {
  const de = response();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["atlas", "findex", de.geography.id], de);
  client.setQueryData(["atlas", "findex", "m49:010"], {
    ...browserAtlasFindex("m49:010"),
    status: "unsupported_area",
  });
  render(
    <QueryClientProvider client={client}>
      <AtlasFindexPanel
        geography={de.geography}
        compareId="m49:010"
        showNumbers={false}
        job={null}
        topicId="finance:financial_access"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Ein Konto besitzen/ }));
  expect(
    await screen.findByRole("heading", { name: "Ein Konto besitzen" }),
  ).toBeTruthy();
  expect(
    screen.getByText(/Vergleichsgebiet besitzt kein eigenes Findex-Profil/),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Bevölkerungsgruppe"), {
    target: { value: "men" },
  });
  expect(
    screen.getByText("Keine eigenen Werte im gewählten Zeitraum."),
  ).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  client.clear();
});
