import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import { atlasValuationCatalog } from "./atlas-valuation";
import type {
  AtlasValuationResponse,
  ValuationSubject,
} from "./atlas-valuation-types";
import AtlasValuationPanel from "./atlas-valuation-panel";

vi.mock("../../services/commands", () => ({
  api: {
    atlasValuation: vi.fn(),
    syncAtlasValuation: vi.fn(),
    cancelAtlasValuation: vi.fn(),
  },
  isTauri: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
let client: QueryClient;
const navigate = vi.fn();
const filters: ComponentProps<typeof AtlasValuationPanel>["filters"] = {
  mode: "countries",
  basis: null,
  scope: null,
  metric: null,
  group: null,
  subject: null,
  compare: null,
  page: null,
};
const education = atlasValuationCatalog.industries.find(
  (i) => i.providerLabel === "Education",
)!;
function regionalResponse(datasetId: string) {
  const dataset = atlasValuationCatalog.datasets.find(
    (d) => d.id === datasetId,
  )!;
  const metricId = datasetId.startsWith("pe-")
    ? "industry_pe_trailing"
    : "industry_pbv";
  const row = subject(education.id, education.label, metricId);
  row.providerLabel = education.providerLabel;
  const files = dataset.files.filter((f) => f.publicationYear >= 2024);
  row.series[0].points = files.map((f, i) => ({
    year: f.publicationYear,
    value: i + 2,
    status: "available",
    firmCount: 30,
    sourceFile: f.fileName,
    methodEpoch: "classification_from_2014",
  }));
  const data = response(datasetId, [row]);
  data.data!.provenance.files = files.map((f) => ({
    ...f,
    sha256: f.reviewedSha256 ?? "a".repeat(64),
    rowCount: f.expectedSubjects,
  }));
  return data;
}
function InteractiveComparison() {
  const [current, setCurrent] = useState({
    ...filters,
    mode: "industries",
    scope: "india",
    subject: education.id,
  });
  return (
    <AtlasValuationPanel
      geography={atlasCatalog.geographies.find((g) => g.id === "m49:356")!}
      showNumbers={false}
      onNumbersChange={() => {}}
      job={null}
      filters={current}
      onNavigate={(values) =>
        setCurrent((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              key
                .replace(/^val/, " ")
                .trim()
                .replace(/^./, (s) => s.toLowerCase()),
              value,
            ]),
          ),
        }))
      }
    />
  );
}
function subject(
  id: string,
  label: string,
  metricId: string,
): ValuationSubject {
  return {
    id,
    label,
    providerLabel: label,
    active: true,
    geographyId: id.startsWith("m49:") ? id : null,
    series: [
      {
        metricId,
        points: [
          {
            year: 2025,
            value: 2.5,
            status: "available",
            firmCount: 30,
            sourceFile: "test",
            methodEpoch: "classification_from_2014",
          },
          {
            year: 2026,
            value: 3.5,
            status: "available",
            firmCount: 30,
            sourceFile: "test",
            methodEpoch: "classification_from_2014",
          },
        ],
        historicalPosition: {
          status: "insufficient_history",
          percentile: null,
          previousMedian: null,
          referenceFirstYear: 2025,
          referenceLastYear: 2025,
          referenceCount: 1,
          compositionChanged: false,
        },
      },
    ],
  };
}
function response(
  datasetId: string,
  subjects: ValuationSubject[],
): AtlasValuationResponse {
  return {
    datasetId,
    status: "available",
    data: {
      datasetId,
      subjects,
      provenance: {
        catalogVersion: atlasValuationCatalog.version,
        retrievedAt: "2020-01-01T00:00:00Z",
        files: [],
        excludedSubjects: [],
      },
    },
  };
}
function mount(overrides: Partial<typeof filters> = {}) {
  render(
    <QueryClientProvider client={client}>
      <AtlasValuationPanel
        geography={atlasCatalog.geographies.find((g) => g.id === "m49:356")!}
        comparison={atlasCatalog.geographies.find((g) => g.id === "m49:156")!}
        showNumbers={false}
        onNumbersChange={() => {}}
        job={null}
        filters={{ ...filters, ...overrides }}
        onNavigate={navigate}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("valuation source scope and visual states", () => {
  it("compares the same industry with region labels and only reads local sources until requested", async () => {
    vi.mocked(api.atlasValuation).mockImplementation(async (id) =>
      regionalResponse(id),
    );
    mount({
      mode: "industries",
      scope: "india",
      subject: education.id,
      compareScope: "us",
    });
    const chart = await screen.findByRole("img", {
      name: /Bildungsunternehmen · Indien.*und Bildungsunternehmen · USA/,
    });
    expect(chart.querySelectorAll("circle")).toHaveLength(4);
    expect(chart.querySelectorAll("polyline")).toHaveLength(1);
    expect(
      screen.getByLabelText("Regionaler Bewertungsvergleich").textContent,
    ).toContain("2026");
    expect(screen.queryByRole("table")).toBeNull();
    expect(chart.querySelectorAll("circle title")).toHaveLength(0);
    expect(api.syncAtlasValuation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Quellenregion vergleichen"), {
      target: { value: "china" },
    });
    expect(navigate).toHaveBeenLastCalledWith({
      valCompareScope: "china",
      valCompare: "",
    });
  });
  it("keeps the main image when no common earnings year exists", async () => {
    vi.mocked(api.atlasValuation).mockImplementation(async (id) =>
      regionalResponse(id),
    );
    mount({
      mode: "industries",
      basis: "pe",
      scope: "india",
      subject: education.id,
      compareScope: "china",
    });
    await screen.findByText(
      /keine gemeinsamen sinnvollen Veröffentlichungsjahre/,
    );
    const chart = screen.getByRole("img");
    expect(chart.querySelectorAll("circle")).toHaveLength(1);
    expect(chart.querySelectorAll("polyline")).toHaveLength(0);
    expect(chart.textContent).toContain("Indien");
    expect(chart.textContent).not.toContain("China");
  });
  it("loads only the explicitly selected comparison package and keeps the primary picture on a local read error", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasValuation).mockImplementation(async (id) => {
      if (id === "pbv-china") throw Error("Lokaler Lesefehler");
      return regionalResponse(id);
    });
    vi.mocked(api.syncAtlasValuation).mockResolvedValue({
      id: "china-download",
      seriesId: "damodaran:pbv-china",
      status: "running",
      page: 0,
      pages: 1,
      observations: 0,
      message: "Lädt China",
      startedAt: "2026-09-09",
      finishedAt: null,
    });
    mount({
      mode: "industries",
      scope: "india",
      subject: education.id,
      compareScope: "china",
    });
    await screen.findByText(/Lokaler Lesefehler/);
    expect(screen.getByRole("img").querySelectorAll("circle")).toHaveLength(1);
    expect(api.syncAtlasValuation).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Vergleich erneut prüfen" }),
    );
    await waitFor(() => expect(api.atlasValuation).toHaveBeenCalledTimes(3));
    fireEvent.click(
      screen.getByRole("button", { name: /China.*Vergleichsregion laden/ }),
    );
    await waitFor(() =>
      expect(api.syncAtlasValuation).toHaveBeenCalledWith("pbv-china"),
    );
    expect(api.syncAtlasValuation).toHaveBeenCalledTimes(1);
  });
  it("does not display a delayed previous region after selecting another region", async () => {
    let resolveUs!: (r: AtlasValuationResponse) => void;
    const pendingUs = new Promise<AtlasValuationResponse>((resolve) => {
      resolveUs = resolve;
    });
    vi.mocked(api.atlasValuation).mockImplementation(async (id) =>
      id === "pbv-us" ? pendingUs : regionalResponse(id),
    );
    render(
      <QueryClientProvider client={client}>
        <InteractiveComparison />
      </QueryClientProvider>,
    );
    await screen.findByRole("img");
    fireEvent.change(screen.getByLabelText("Quellenregion vergleichen"), {
      target: { value: "us" },
    });
    await screen.findByText(/USA.*lokale Vergleichsdaten/);
    fireEvent.change(screen.getByLabelText("Quellenregion vergleichen"), {
      target: { value: "china" },
    });
    await screen.findByRole("img", { name: /und Bildungsunternehmen · China/ });
    resolveUs(regionalResponse("pbv-us"));
    await waitFor(() =>
      expect(
        client.getQueryData(["atlas", "valuation", "pbv-us"]),
      ).toBeDefined(),
    );
    expect(screen.getByRole("img").textContent).not.toContain("USA");
    expect(
      document.querySelectorAll(".atlas-valuation-legend span"),
    ).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Quellenregion"), {
      target: { value: "china" },
    });
    await waitFor(() =>
      expect(
        (
          screen.getByLabelText(
            "Quellenregion vergleichen",
          ) as HTMLSelectElement
        ).value,
      ).toBe(""),
    );
  });
  it("shows countries on one scale without numerical tooltips until requested", async () => {
    vi.mocked(api.atlasValuation).mockResolvedValue(
      response("countries", [
        subject("m49:356", "Indien", "country_median_pbv"),
        subject("m49:156", "China", "country_median_pbv"),
      ]),
    );
    mount();
    expect(
      await screen.findByRole("img", { name: /Indien und China/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelectorAll("circle title")).toHaveLength(0);
    expect(document.querySelectorAll("polyline")).toHaveLength(2);
    expect(screen.getByText(/Ab 2021 veröffentlicht/)).toBeTruthy();
  });
  it("keeps missing countries visible without substituting global industries", async () => {
    vi.mocked(api.atlasValuation).mockResolvedValue(response("countries", []));
    mount();
    expect(
      await screen.findByText(/Für Indien enthält diese Quelle keine eigene/),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(api.atlasValuation).toHaveBeenCalledWith("countries");
    expect(screen.getByText(/Für China fehlt/)).toBeTruthy();
  });
  it("orders industries, supports drilldown and identifies the source region", async () => {
    const education = atlasValuationCatalog.industries.find(
      (i) => i.providerLabel === "Education",
    )!;
    vi.mocked(api.atlasValuation).mockResolvedValue(
      response("pbv-global", [
        subject(education.id, education.label, "industry_pbv"),
      ]),
    );
    mount({ mode: "industries" });
    await screen.findByText("Jährliche veröffentlichte Bewertungen");
    fireEvent.change(screen.getByLabelText("Branche suchen"), {
      target: { value: "Bildung" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Bildungsunternehmen/ }),
    );
    expect(navigate).toHaveBeenCalledWith({
      valSubject: education.id,
      valCompare: "",
      valCompareScope: "",
    });
    expect(
      screen.getByRole("heading", { name: /Global · NYU-Stichprobe/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Ein Branchenbild für ganz Afrika/)).toBeTruthy();
  });
  it("starts only the explicitly selected native dataset and never fabricates browser data", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasValuation).mockResolvedValue({
      datasetId: "countries",
      status: "not_downloaded",
      data: null,
    });
    const job = {
      id: "job",
      seriesId: "damodaran:countries",
      status: "running" as const,
      page: 0,
      pages: 14,
      observations: 0,
      message: "Lädt",
      startedAt: "2026-09-09",
      finishedAt: null,
    };
    vi.mocked(api.syncAtlasValuation).mockResolvedValue(job);
    mount();
    await screen.findByText(
      "Diese Bewertungsgrundlage ist noch nicht lokal gespeichert",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Länderbewertungen laden" }),
    );
    await waitFor(() =>
      expect(client.getQueryData(["atlas", "job"])).toEqual(job),
    );
    expect(api.syncAtlasValuation).toHaveBeenCalledWith("countries");
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("limits a topic gallery and its search to the named source industries, including missing rows", async () => {
    const bank = atlasValuationCatalog.industries.find(
      (i) => i.providerLabel === "Bank (Money Center)",
    )!;
    const insurer = atlasValuationCatalog.industries.find(
      (i) => i.providerLabel === "Insurance (General)",
    )!;
    vi.mocked(api.atlasValuation).mockResolvedValue(
      response("pbv-global", [
        subject(bank.id, bank.label, "industry_pbv"),
        subject(insurer.id, insurer.label, "industry_pbv"),
      ]),
    );
    mount({
      mode: "industries",
      group: "finance",
      topic: "finance:banks",
      subject: insurer.id,
      page: "9",
    });
    await screen.findByRole("button", { name: /Großbanken/ });
    const cards = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".atlas-valuation-card"),
    );
    expect(cards).toHaveLength(2);
    expect(
      cards.map((card) => within(card).getByRole("heading").textContent),
    ).toEqual(["Großbanken", "Regionalbanken"]);
    expect(within(cards[1]).queryByRole("img")).toBeNull();
    expect(within(cards[1]).getByText("Keine passende Kennzahl")).toBeTruthy();
    expect(screen.queryByLabelText("Branchenfeld")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Zur Branchenübersicht/ }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Branche suchen"), {
      target: { value: "Insurance" },
    });
    expect(document.querySelectorAll(".atlas-valuation-card")).toHaveLength(0);
    expect(
      screen.getByText(/Die Suche bleibt auf dieses Thema begrenzt/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Alle Branchenfelder" }),
    );
    expect(navigate).toHaveBeenLastCalledWith({
      valTopic: "",
      valSubject: "",
      valCompare: "",
      valCompareScope: "",
      valPage: "",
      valSearch: "",
    });
  });
  it("preserves the thematic subset while opening a detail, changing its source or returning", async () => {
    const industry = atlasValuationCatalog.industries.find(
      (i) => i.providerLabel === "Machinery",
    )!;
    vi.mocked(api.atlasValuation).mockResolvedValue(
      response("pbv-india", [
        subject(industry.id, industry.label, "industry_pbv"),
      ]),
    );
    mount({
      mode: "industries",
      scope: "india",
      topic: "industry:machinery",
      subject: industry.id,
    });
    await screen.findByRole("img", { name: /Maschinenbau/ });
    expect(screen.getByText("Branchen zum Thema Maschinenbau")).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Buchwerte · Momentaufnahme" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Quellenregion"), {
      target: { value: "global" },
    });
    expect(navigate).toHaveBeenLastCalledWith({
      valScope: "global",
    });
    fireEvent.change(screen.getByLabelText("Bewertungsgrundlage"), {
      target: { value: "pe" },
    });
    expect(navigate).toHaveBeenLastCalledWith({
      valBasis: "pe",
      valMetric: "",
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Zur Branchenübersicht/ }),
    );
    expect(navigate).toHaveBeenLastCalledWith({
      valSubject: "",
      valCompare: "",
      valCompareScope: "",
    });
  });
  it("pages large thematic selections in small groups without dropping their missing industries", async () => {
    vi.mocked(api.atlasValuation).mockResolvedValue(response("pbv-global", []));
    mount({
      mode: "industries",
      topic: "market_context:sector_materials",
      page: "1",
    });
    await screen.findByText("Jährliche veröffentlichte Bewertungen");
    expect(document.querySelectorAll(".atlas-valuation-card")).toHaveLength(3);
    expect(
      (
        screen.getByRole("button", {
          name: "Weitere Bilder",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Vorherige Bilder" }));
    expect(navigate).toHaveBeenLastCalledWith({ valPage: "0" });
  });
  it("shows the earnings archive and preserves gaps in the selected industry", async () => {
    const education = atlasValuationCatalog.industries.find(
      (i) => i.providerLabel === "Education",
    )!;
    const row = subject(education.id, education.label, "industry_pe_trailing");
    row.series[0].points[0].year = 2024;
    vi.mocked(api.atlasValuation).mockResolvedValue(
      response("pe-japan", [row]),
    );
    mount({
      mode: "industries",
      basis: "pe",
      scope: "japan",
      subject: education.id,
    });
    await screen.findByRole("img", { name: /Bildungsunternehmen/ });
    expect(
      screen.getByRole("option", { name: "Gewinne · längere Archive" }),
    ).toBeTruthy();
    expect(document.querySelectorAll("polyline")).toHaveLength(0);
    expect(document.querySelectorAll("circle")).toHaveLength(2);
    expect(document.querySelectorAll("circle title")).toHaveLength(0);
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("describes the older aggregation separately from the modern profitable-firm definition", async () => {
    const education = atlasValuationCatalog.industries.find(
      (i) => i.providerLabel === "Education",
    )!;
    const row = subject(
      education.id,
      education.label,
      "industry_pe_aggregate_legacy",
    );
    row.series[0].points.forEach((p) => {
      p.year -= 10;
    });
    row.series[0].historicalPosition.status = "not_historical_valuation";
    vi.mocked(api.atlasValuation).mockResolvedValue(
      response("pe-global", [row]),
    );
    mount({
      mode: "industries",
      basis: "pe",
      scope: "global",
      metric: "industry_pe_aggregate_legacy",
      subject: education.id,
    });
    await screen.findByRole("img", {
      name: /Archiv: Börsenwert zu Jahresgewinn/,
    });
    expect(screen.getByText(/Ältere Archivdefinition/)).toBeTruthy();
    expect(
      screen.getByText(
        /Neuere Tabellen verwenden genauer bezeichnete Kennzahlen/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Im unteren historischen Bereich")).toBeNull();
    expect(
      screen.getByText("Für diese Definition keine historische Einordnung"),
    ).toBeTruthy();
  });
});
