import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../services/commands";
import { browserAtlasPublicSource } from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import { AtlasPublicPanel, PublicChart } from "./atlas-public-panel";
import {
  atlasPublicCatalog,
  publicComparisonSelection,
  publicPeriod,
  publicPartnerOverview,
  publicPicture,
  publicRegimeLabel,
  publicSelection,
  publicValue,
  type AtlasPublicResponse,
  type PublicPoint,
} from "./atlas-public";
import {
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
} from "./atlas-coverage";
import { atlasContextGuide } from "./atlas-context-guides";

const source = atlasPublicCatalog.sources.find((s) => s.id === "bis-dsr")!;
const metric = atlasPublicCatalog.metrics.find((m) => m.id === "bis-dsr:P")!;
const germany = atlasCatalog.geographies.find((g) => g.id === "m49:276")!;
const point = (
  period: string,
  value: string | null,
  breakBefore = false,
): PublicPoint => ({
  period,
  value,
  breakBefore,
  status: "A: Normal value",
  notes: [],
  lowerBound: null,
  upperBound: null,
});
function response(points: PublicPoint[]): AtlasPublicResponse {
  const area = source.areas.find((a) => a.geographyId === germany.id)!;
  return {
    source,
    geography: germany,
    status: "available",
    metrics: atlasPublicCatalog.metrics.filter((m) => m.sourceId === source.id),
    provenance: {
      sourceId: source.id,
      url: source.url,
      documentationUrl: source.documentationUrl,
      publishedAt: source.publishedAt,
      retrievedAt: "2026-09-11T00:00:00Z",
      sha256: source.expectedSha256,
      recipe: source.recipe,
      sourceRows: 7116,
      numericValues: 7116,
      areaCount: 32,
    },
    profiles: [
      {
        metricId: metric.id,
        geographyId: germany.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles.P!,
        unit: metric.unit,
        points,
      },
    ],
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Additional public source integrity", () => {
  it("separates synthetic-fuel plants, fiscal years and the historical product definitions", () => {
    const id = "sasol-synthetic-fuels";
    const row = browserAtlasPublicSource(id, "m49:710");
    const total = row.metrics.find((m) => m.providerCode === "secunda_total")!;
    const white = row.metrics.find((m) => m.providerCode === "secunda_white")!;
    expect(total.frequency).toBe("fiscal_annual_june");
    expect(total.explanation).toContain("eigene Perspektive");
    expect(white.explanation).toContain("Keine Verlängerung");
    expect(publicPeriod("2024", "fiscal_annual_june")).toBe(2024);
    expect(publicPeriod("2024-Q1", "fiscal_annual_june")).toBeNull();
    const selection = publicSelection(
      new URLSearchParams(),
      total.topicId,
      "m49:634",
    );
    expect(selection.metric.providerCode).toBe("oryx_production");
    expect(
      publicSelection(
        new URLSearchParams({ publicMetric: total.id }),
        total.topicId,
        "m49:634",
      ).metric.id,
    ).toBe(total.id);
    const qatarOptions = coverageOptions("m49:634", {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    });
    expect(qatarOptions.find((o) => o.id === total.id)?.status).toBe(
      "unsupported_area",
    );
    for (const geo of ["world", "m49:356", "m49:276"])
      expect(browserAtlasPublicSource(id, geo).status).toBe("unsupported_area");
    const a = row.source.areas.find((a) => a.geographyId === row.geography.id)!;
    row.status = "available";
    row.provenance = {
      sourceId: id,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      retrievedAt: "2026-09-11T00:00:00Z",
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
      sourceRows: 48,
      numericValues: 36,
      areaCount: 2,
    };
    row.profiles = [
      {
        metricId: total.id,
        geographyId: row.geography.id,
        providerArea: a.code,
        providerLabel: a.label,
        providerTitle: a.seriesTitles[total.providerCode]!,
        unit: total.unit,
        points: [
          {
            ...point("2024", "29.1"),
            notes: ["Geschäftsjahr 2023/2024, Ende 30. Juni 2024."],
          },
          point("2025", null),
          point("2026", "30.6"),
        ],
      },
    ];
    const picture = publicPicture(row, total, 0)!;
    expect(picture.segments).toHaveLength(2);
    expect(picture.min).toBe(0);
    const { container } = render(
      <PublicChart picture={picture} metric={total} numbers={false} />,
    );
    expect(container.textContent).toContain("Geschäftsjahr 2023/2024");
    expect(container.textContent).not.toContain("29,1");
    expect(publicPicture(row, white, 0)).toBeNull();
  });
  it("keeps advanced materials as one whole-window observation with comparable scales and distinct priority jurisdictions", () => {
    const id = "eu-advanced-materials";
    const row = browserAtlasPublicSource(id, "eu:am_priority");
    expect(row.profiles).toEqual([]);
    for (const geo of ["world", "m49:276", "eurostat:eu27_2020"])
      expect(browserAtlasPublicSource(id, geo).status).toBe("unsupported_area");
    const m = row.metrics.find((m) => m.providerCode === "total_count")!;
    const a = row.source.areas.find((a) => a.geographyId === row.geography.id)!;
    row.status = "available";
    row.provenance = {
      sourceId: id,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      retrievedAt: "2026-09-11T00:00:00Z",
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
      sourceRows: 6,
      numericValues: 36,
      areaCount: 3,
    };
    row.profiles = [
      {
        metricId: m.id,
        geographyId: row.geography.id,
        providerArea: a.code,
        providerLabel: a.label,
        providerTitle: a.seriesTitles[m.providerCode]!,
        unit: m.unit,
        points: [
          {
            ...point("2010/2024", "28865"),
            notes: ["Erste Patentzuständigkeit; kein Unternehmenssitz."],
          },
        ],
      },
    ];
    expect(publicPeriod("2010/2024", "period_total")).toBe(2010);
    expect(publicPeriod("2024/2010", "period_total")).toBeNull();
    expect(publicPeriod("2010/2024", "annual")).toBeNull();
    const picture = publicPicture(row, m, 2020)!;
    expect(picture.points).toHaveLength(1);
    expect([picture.min, picture.max]).toEqual([0, 200000]);
    const { container, rerender } = render(
      <PublicChart picture={picture} metric={m} numbers={false} />,
    );
    expect(container.querySelectorAll("circle,polyline,path")).toHaveLength(0);
    const bar = container.querySelector(".atlas-public-period-value")!;
    expect(Number(bar.getAttribute("width"))).toBeCloseTo(
      (28865 / 200000) * 752,
    );
    expect(container.textContent).toContain("2010–2024");
    expect(container.textContent).not.toContain("28.865");
    rerender(<PublicChart picture={picture} metric={m} numbers />);
    expect(container.textContent).toContain("28.865");
    const options = coverageOptions(row.geography.id, {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
      publicSources: { [id]: { data: row } },
    });
    expect(options.find((o) => o.id === m.id)?.periodNote).toBe(
      "Zeitraumwert 2010–2024",
    );
    row.profiles[0].points[0].period = "2024";
    expect(publicPicture(row, m, 0)).toBeNull();
    row.profiles[0].points[0] = point("2010/2024", "28865.5");
    expect(publicPicture(row, m, 0)).toBeNull();
    row.profiles[0].points[0] = point("2010/2024", null);
    expect(publicPicture(row, m, 0)).toBeNull();
  });
  it("renders JST classifications as dated categories without numerical waves or invented missing years", () => {
    const id = "jst-exchange-regimes";
    const row = browserAtlasPublicSource(id, germany.id);
    expect(row.profiles).toEqual([]);
    for (const geo of ["world", "m49:356", "m49:710"])
      expect(browserAtlasPublicSource(id, geo).status).toBe("unsupported_area");
    const m = row.metrics.find((m) => m.providerCode === "peg")!;
    const strict = row.metrics.find((m) => m.providerCode === "peg_strict")!;
    expect(publicRegimeLabel(m, 0)).toBe("Nicht gebunden");
    expect(publicRegimeLabel(strict, 0)).toBe("Ohne strenge Bindung");
    expect(publicRegimeLabel(m, 0.5)).toBeNull();
    expect(m.scopeNote).toContain("keine Golddeckung");
    const a = row.source.areas.find((a) => a.geographyId === germany.id)!;
    row.status = "available";
    row.provenance = {
      sourceId: id,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      retrievedAt: "2026-09-11T00:00:00Z",
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
      sourceRows: row.source.expectedRows,
      numericValues: row.source.expectedNumeric,
      areaCount: row.source.areas.length,
    };
    row.profiles = [
      {
        metricId: m.id,
        geographyId: germany.id,
        providerArea: a.code,
        providerLabel: a.label,
        providerTitle: a.seriesTitles.peg!,
        unit: m.unit,
        points: [
          point("1918", null),
          point("1919", "0"),
          {
            ...point("1920", "1"),
            notes: [
              "Modellrolle: Basisland im Modell (BASE)",
              "Modell-Bezugsbasis: Keine eigene Bezugsbasis angegeben (NA)",
            ],
          },
          point("1921", null),
          point("1922", "0"),
        ],
      },
    ];
    const pic = publicPicture(row, m, 0)!;
    expect(pic.missingPeriods).toEqual(["1918", "1921"]);
    expect(pic.segments.every((s) => s.length === 1)).toBe(true);
    const { container, rerender } = render(
      <PublicChart picture={pic} metric={m} numbers={false} />,
    );
    expect(container.querySelectorAll("polyline,path,circle")).toHaveLength(0);
    expect(container.querySelectorAll(".atlas-regime-year")).toHaveLength(3);
    expect(container.textContent).toContain("1919 · Nicht gebunden");
    expect(container.textContent).toContain("1920 · Gebunden");
    expect(container.textContent).toContain("BASE");
    expect(container.textContent).toContain("(NA)");
    const before = container.innerHTML;
    rerender(<PublicChart picture={pic} metric={m} numbers />);
    expect(container.innerHTML).toBe(before);
    expect(publicPicture(row, strict, 0)).toBeNull();
    row.profiles[0].points[1].value = "0.5";
    expect(publicPicture(row, m, 0)).toBeNull();
  });
  it("keeps ACI dimensions separate, bounded, vintage-specific and distinct from political quality", () => {
    const id = "aci-trilemma";
    const row = browserAtlasPublicSource(id, germany.id);
    expect(row.profiles).toEqual([]);
    expect(row.metrics.map((m) => m.providerCode)).toEqual([
      "ers",
      "mi",
      "kaopen",
    ]);
    for (const geo of ["world", "m49:840", "m49:688"])
      expect(browserAtlasPublicSource(id, geo).status).toBe("unsupported_area");
    expect(row.source.areas.find((a) => a.code === "528")?.geographyId).toBe(
      "provider:TWN",
    );
    expect(row.source.areas.find((a) => a.code === "924")?.geographyId).toBe(
      "m49:156",
    );
    const m = row.metrics.find((m) => m.providerCode === "mi")!;
    expect(m.scopeNote).toContain("Folgejahr");
    expect(m.scopeNote).toContain("keine politische Neutralität");
    expect(
      row.metrics.find((m) => m.providerCode === "kaopen")!.scopeNote,
    ).toContain("2019");
    const a = row.source.areas.find((a) => a.geographyId === germany.id)!;
    row.status = "available";
    row.provenance = {
      sourceId: id,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      retrievedAt: "2026-09-11T00:00:00Z",
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
      sourceRows: row.source.expectedRows,
      numericValues: row.source.expectedNumeric,
      areaCount: row.source.areas.length,
    };
    row.profiles = [
      {
        metricId: m.id,
        geographyId: germany.id,
        providerArea: a.code,
        providerLabel: a.label,
        providerTitle: a.seriesTitles.mi!,
        unit: m.unit,
        points: [
          point("1989", "0"),
          point("1990", "0.5"),
          point("1991", "1", true),
          point("1992", null),
          point("1993", "0.7"),
        ],
      },
    ];
    const pic = publicPicture(row, m, 0)!;
    expect([pic.min, pic.max]).toEqual([0, 1]);
    expect(pic.points.map((p) => p.n)).toEqual([0, 0.5, 1, 0.7]);
    expect(pic.segments.map((s) => s.map((p) => p.period))).toEqual([
      ["1989", "1990"],
      ["1991"],
      ["1993"],
    ]);
    expect(publicPicture(row, row.metrics[0], 0)).toBeNull();
    const { container, rerender } = render(
      <PublicChart picture={pic} metric={m} numbers={false} />,
    );
    expect(
      container.querySelectorAll("circle title")[1].textContent,
    ).not.toContain("0,5");
    rerender(<PublicChart picture={pic} metric={m} numbers />);
    expect(container.querySelectorAll("circle title")[1].textContent).toContain(
      "0,5",
    );
    row.profiles[0].points[0].value = "1.01";
    expect(publicPicture(row, m, 0)).toBeNull();
  });
  it("keeps GFDD shares outside the top ten on their original scale and preserves archive gaps", async () => {
    const id = "worldbank-gfdd-concentration";
    const row = browserAtlasPublicSource(id, germany.id);
    expect(row.profiles).toEqual([]);
    expect(browserAtlasPublicSource(id, "world").status).toBe(
      "unsupported_area",
    );
    expect(browserAtlasPublicSource(id, "m49:250").status).toBe(
      "unsupported_area",
    );
    expect(row.source.areas.find((a) => a.code === "TWN")?.geographyId).toBe(
      "provider:TWN",
    );
    const m = row.metrics.find((m) => m.providerCode === "am01")!;
    const area = row.source.areas.find((a) => a.geographyId === germany.id)!;
    row.status = "available";
    row.provenance = {
      ...response([]).provenance!,
      sourceId: id,
      url: row.source.url,
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
    };
    row.profiles = [
      {
        metricId: m.id,
        geographyId: germany.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles.am01!,
        unit: m.unit,
        points: [
          point("2018", "56.657960000000003"),
          point("2019", null),
          point("2020", "65.540000000000006"),
        ],
      },
    ];
    const picture = publicPicture(row, m, 0)!;
    expect([picture.min, picture.max]).toEqual([0, 100]);
    expect(picture.points.map((p) => p.n)).toEqual([56.65796, 65.54]);
    expect(picture.segments.map((s) => s.length)).toEqual([1, 1]);
    expect(picture.missingPeriods).toEqual(["2019"]);
    vi.spyOn(api, "atlasPublicSource").mockResolvedValue(row);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AtlasPublicPanel
          topicId={m.topicId}
          geography={germany}
          showNumbers={false}
          job={null}
          onAreaChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText(/GFDD-Archiv 2022, Quellenjahre/);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Datenperspektive" }),
      { target: { value: m.id } },
    );
    await screen.findByRole("img");
    expect(
      screen.getByText(
        /Niedrigerer Anteil außerhalb der Top 10 bedeutet stärkere Konzentration/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("65,54")).toBeNull();
    row.profiles[0].points[0].value = "100.01";
    expect(publicPicture(row, m, 0)).toBeNull();
    client.clear();
  });

  it("defaults to actual EPO country data while retaining an explicitly requested world-only metric", () => {
    const topic = "innovation:quantum";
    const params = new URLSearchParams();
    expect(publicSelection(params, topic, "world").metric.providerCode).toBe(
      "families",
    );
    expect(publicSelection(params, topic, "m49:156").metric.providerCode).toBe(
      "priority",
    );
    params.set("publicMetric", "epo-quantum-sensing:families");
    const explicit = publicSelection(params, topic, "m49:156");
    expect(explicit.metric.providerCode).toBe("families");
    expect(explicit.metrics).toHaveLength(2);
    expect(
      publicSelection(
        new URLSearchParams(),
        "innovation:space_technology",
        germany.id,
      ).metric.providerCode,
    ).toBe("applicant_origin");
    expect(browserAtlasPublicSource("epo-cosmonautics", "m49:356").status).toBe(
      "unsupported_area",
    );
    expect(browserAtlasPublicSource("epo-cosmonautics", "m49:688").status).toBe(
      "unsupported_area",
    );
    expect(
      browserAtlasPublicSource("epo-quantum-sensing", "m49:156").profiles,
    ).toEqual([]);
  });

  it("retains patent zeros and unpublished years, labels the archive and uses integer count axes", async () => {
    const row = browserAtlasPublicSource("epo-cosmonautics", "m49:440");
    const m = row.metrics.find((m) => m.providerCode === "applicant_origin")!;
    const area = row.source.areas.find(
      (a) => a.geographyId === row.geography.id,
    )!;
    row.status = "available";
    row.provenance = {
      ...response([]).provenance!,
      sourceId: row.source.id,
      url: row.source.url,
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
    };
    row.profiles = [
      {
        metricId: m.id,
        geographyId: row.geography.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles[m.providerCode]!,
        unit: m.unit,
        points: [
          point("2014", "0"),
          point("2015", null),
          point("2016", "1"),
          point("2017", "1"),
        ],
      },
    ];
    const picture = publicPicture(row, m, 0)!;
    expect(picture.segments.map((s) => s.map((p) => p.period))).toEqual([
      ["2014"],
      ["2016", "2017"],
    ]);
    expect(picture.missingPeriods).toEqual(["2015"]);
    expect([picture.min, picture.max]).toEqual([0, 2]);
    expect(publicPicture(row, m, 2020)).toBeNull();
    vi.spyOn(api, "atlasPublicSource").mockResolvedValue(row);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const panel = render(
      <QueryClientProvider client={client}>
        <AtlasPublicPanel
          topicId={m.topicId}
          geography={row.geography}
          showNumbers={true}
          job={null}
          onAreaChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole("img");
    expect(screen.getByText(/Archivstudie 2021 zur Raumfahrt/)).toBeTruthy();
    const titles = [
      ...panel.container.querySelectorAll("svg circle title"),
    ].map((n) => n.textContent);
    expect(titles.some((t) => t?.startsWith("2014 · 0 "))).toBe(true);
    expect(titles.some((t) => t?.startsWith("2015"))).toBe(false);
    row.profiles[0].points[0].value = "-1";
    expect(publicPicture(row, m, 0)).toBeNull();
    client.clear();
  });

  it("selects actual national commercial series without replacing an absent building type", () => {
    const params = new URLSearchParams();
    const local = publicSelection(
      params,
      "housing:commercial_property",
      germany.id,
    );
    expect(local.source!.id).toBe("bis-commercial-property");
    expect(local.metric.providerCode).toBe("Q.DE.0.D.0.2.6.0");
    expect(local.metrics).toHaveLength(5);
    expect(
      local.metrics.every((m) => m.providerCode.split(".")[1] === "DE"),
    ).toBe(true);
    params.set("publicMetric", "bis-commercial-property:Q.DE.0.B.0.2.6.0");
    const france = publicSelection(
      params,
      "housing:commercial_property",
      "m49:250",
    );
    expect(france.metric.id).toBe(params.get("publicMetric"));
    expect(
      france.metrics.filter((m) => m.providerCode.split(".")[1] === "FR"),
    ).toHaveLength(2);
    const absent = publicComparisonSelection(params, local.metric, "m49:250");
    expect(absent.metric).toBeUndefined();
    expect(absent.metrics).toHaveLength(2);
    params.set(
      "publicCompareMetric",
      "bis-commercial-property:Q.FR.0.A.0.0.6.0",
    );
    expect(
      publicComparisonSelection(params, local.metric, "m49:250").metric?.unit,
    ).toBe("Index (2010-Q1 = 100)");
    expect(
      coverageOptions(germany.id, {
        series: {},
        demography: {},
        history: {},
        energy: {},
        markets: {},
      }).filter((m) => m.family === "public:bis-commercial-property"),
    ).toHaveLength(5);
    expect(
      browserAtlasPublicSource("bis-commercial-property", "bis:euro_area")
        .status,
    ).toBe("unsupported_area");
    expect(
      browserAtlasPublicSource("bis-commercial-property", "bis:cpp_euro_area20")
        .status,
    ).toBe("desktop_required");
  });

  it("preserves half-year periods and a commercial comparison with separate original price bases", async () => {
    expect(publicPeriod("2025-S2", "half_yearly")).toBe(2025.5);
    expect(publicPeriod("2025-S3", "half_yearly")).toBeNull();
    const fixture = (geo: string, code: string, points: PublicPoint[]) => {
      const row = browserAtlasPublicSource("bis-commercial-property", geo);
      const area = row.source.areas.find((a) => a.geographyId === geo)!;
      const m = row.metrics.find((m) => m.providerCode === code)!;
      row.status = "available";
      row.provenance = {
        ...response([]).provenance!,
        sourceId: row.source.id,
        url: row.source.url,
        sha256: row.source.expectedSha256,
        recipe: row.source.recipe,
      };
      row.profiles = [
        {
          metricId: m.id,
          geographyId: geo,
          providerArea: area.code,
          providerLabel: area.label,
          providerTitle: area.seriesTitles[code]!,
          unit: m.unit,
          points,
        },
      ];
      return { row, metric: m };
    };
    const greek = fixture("m49:300", "H.GR.0.B.0.0.6.0", [
      point("2020-S1", "100"),
      point("2020-S2", "101"),
      point("2021-S1", null),
      point("2021-S2", "102"),
    ]);
    const picture = publicPicture(greek.row, greek.metric, 0)!;
    expect(picture.segments.map((s) => s.length)).toEqual([2, 1]);
    expect(picture.missingPeriods).toEqual(["2021-S1"]);
    const de = fixture(germany.id, "Q.DE.0.D.0.2.6.0", [
      point("2020-Q1", "120"),
      point("2020-Q2", "121"),
    ]);
    const fr = fixture("m49:250", "Q.FR.0.A.0.0.6.0", [
      point("2020-Q1", "140"),
      point("2020-Q2", "142"),
    ]);
    vi.spyOn(api, "atlasPublicSource").mockImplementation(
      async (_source, geo) => (geo === germany.id ? de.row : fr.row),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const panel = render(
      <QueryClientProvider client={client}>
        <AtlasPublicPanel
          topicId="housing:commercial_property"
          geography={germany}
          compareId="m49:250"
          showNumbers={true}
          job={null}
          onAreaChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole("img");
    expect(panel.container.querySelectorAll("svg")).toHaveLength(1);
    fireEvent.change(
      screen.getByLabelText("Gewerbeimmobilienreihe des Vergleichslands"),
      { target: { value: fr.metric.id } },
    );
    await screen.findByText(/Beide Originalreihen behalten/);
    expect(panel.container.querySelectorAll("svg")).toHaveLength(2);
    expect(panel.container.textContent).toContain("Index (2010-Q1 = 100)");
    expect(panel.container.textContent).not.toContain(
      "Beide Länderbilder verwenden dieselbe Definition",
    );
    client.clear();
  });

  it("shows constant climate exposure as a projection marker without an annual axis", async () => {
    const row = browserAtlasPublicSource("ndgain-climate", germany.id);
    const area = row.source.areas.find((a) => a.geographyId === germany.id)!;
    const exposure = row.metrics.find((m) => m.providerCode === "exposure")!;
    row.status = "available";
    row.provenance = {
      ...response([]).provenance!,
      sourceId: row.source.id,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
    };
    row.profiles = [
      {
        metricId: exposure.id,
        geographyId: germany.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles.exposure!,
        unit: exposure.unit,
        points: [point("2024", "0.327918")],
      },
    ];
    const picture = publicPicture(row, exposure, 2030)!;
    expect(picture).not.toBeNull(); // A stored history filter cannot hide a fixed projection.
    expect([picture.min, picture.max]).toEqual([0, 1]);
    const chart = render(
      <PublicChart picture={picture} metric={exposure} numbers={false} />,
    );
    expect(chart.container.querySelectorAll("circle")).toHaveLength(1);
    expect(chart.container.querySelectorAll("polyline")).toHaveLength(0);
    expect(chart.container.textContent).not.toMatch(/2024|0,328/);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Projektionsmodell",
    );
    chart.rerender(
      <PublicChart picture={picture} metric={exposure} numbers={true} />,
    );
    expect(
      chart.container.querySelector("circle title")?.textContent,
    ).toContain("0,328");
    chart.unmount();
    const options = coverageOptions(germany.id, {
      publicSources: { [row.source.id]: { data: row } },
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    });
    expect(options.find((o) => o.id === exposure.id)?.periodNote).toBe(
      "Projektionsmodell · Ausgabe 2026",
    );
    row.profiles[0].points.unshift(point("2023", "0.327918"));
    expect(publicPicture(row, exposure, 0)).toBeNull();
    row.profiles[0].points = [point("2024", "1.01")];
    expect(publicPicture(row, exposure, 0)).toBeNull();
    row.profiles[0].points = [point("2024", "0.327918")];
    vi.spyOn(api, "atlasPublicSource").mockResolvedValue(row);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AtlasPublicPanel
          topicId={exposure.topicId}
          geography={germany}
          showNumbers={false}
          job={null}
          onAreaChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Datenperspektive"), {
      target: { value: exposure.id },
    });
    await screen.findByRole("img", {
      name: /Zeitlich konstantes Projektionsmodell/,
    });
    expect(screen.queryByLabelText("Beginn des Datenbilds")).toBeNull();
    expect(screen.queryByText(/Beobachtungen bis/)).toBeNull();
    expect(screen.queryByText(/2024 bis 2024/)).toBeNull();
    expect(
      screen.getByText(/Klimaprojektionen · fester Modellstand/),
    ).toBeTruthy();
  });

  it("keeps ND-GAIN model history, missing components and worldwide absence separate", () => {
    const row = browserAtlasPublicSource("ndgain-climate", germany.id);
    const area = row.source.areas.find((a) => a.geographyId === germany.id)!;
    const vulnerability = row.metrics.find(
      (m) => m.providerCode === "vulnerability",
    )!;
    row.status = "available";
    row.provenance = {
      ...response([]).provenance!,
      sourceId: row.source.id,
      url: row.source.url,
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
    };
    row.profiles = [
      {
        metricId: vulnerability.id,
        geographyId: germany.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles.vulnerability!,
        unit: vulnerability.unit,
        points: [
          point("1995", "0.4"),
          point("1996", null),
          point("1997", "0.3"),
          point("1998", "0.2"),
        ],
      },
    ];
    const picture = publicPicture(row, vulnerability, 0)!;
    expect([picture.min, picture.max]).toEqual([0, 1]);
    expect(picture.segments.map((s) => s.length)).toEqual([1, 2]);
    expect(
      row.metrics.find((m) => m.providerCode === "capacity")?.explanation,
    ).toContain("geringere Kapazität");
    const lie = row.source.areas.find((a) => a.geographyId === "m49:438")!;
    expect(lie.seriesTitles.vulnerability).toBeUndefined();
    expect(lie.seriesTitles.exposure).toBeDefined();
    expect(browserAtlasPublicSource("ndgain-climate", "world").status).toBe(
      "unsupported_area",
    );
  });

  it("preserves WITS mirror coverage, the thin archive edge and small nonzero indices", () => {
    const row = browserAtlasPublicSource(
      "wits-export-concentration",
      germany.id,
    );
    const area = row.source.areas.find((a) => a.geographyId === germany.id)!;
    const index = row.metrics[0];
    row.status = "available";
    row.provenance = {
      ...response([]).provenance!,
      sourceId: row.source.id,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
    };
    row.profiles = [
      {
        metricId: index.id,
        geographyId: germany.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles.HHPCI!,
        unit: index.unit,
        points: [
          point("2018", "0.007"),
          point("2019", null),
          point("2020", "0.006"),
          point("2021", "0.005"),
          point("2022", "0.0001180680522971933", true),
        ],
      },
    ];
    const picture = publicPicture(row, index, 0)!;
    expect([picture.min, picture.max]).toEqual([0, 1]);
    expect(picture.segments.map((s) => s.length)).toEqual([1, 2, 1]);
    expect(picture.missingPeriods).toEqual(["2019"]);
    expect(row.source.areas.find((a) => a.code === "SUD")?.geographyId).toBe(
      "m49:729",
    );
    expect(row.source.areas.some((a) => a.code === "SDN")).toBe(false);
    expect(row.source.areas.find((a) => a.code === "WLD")?.geographyId).toBe(
      "world",
    );
    const chart = render(
      <PublicChart picture={picture} metric={index} numbers={true} />,
    );
    expect(
      chart.container.querySelectorAll("circle title")[3].textContent,
    ).toContain("0,000118");
    chart.rerender(
      <PublicChart picture={picture} metric={index} numbers={false} />,
    );
    expect(
      chart.container.querySelectorAll("circle title")[3].textContent,
    ).not.toContain("0,000118");
    row.profiles[0].points[0].value = "1.1";
    expect(publicPicture(row, index, 0)).toBeNull();
  });
  it("uses the same TiVA year for partner comparisons and keeps the country's own diagonal empty", async () => {
    const row = browserAtlasPublicSource("oecd-tiva-partners", germany.id);
    const area = row.source.areas.find((a) => a.geographyId === germany.id)!;
    row.status = "available";
    row.provenance = {
      ...response([]).provenance!,
      sourceId: row.source.id,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
    };
    const values: Record<string, PublicPoint[]> = {
      USA: [point("2021", "8.125"), point("2022", "9.343")],
      CHN: [point("2021", "7.1"), point("2022", "7.862")],
      FRA: [point("2021", "6.5"), point("2022", null)],
    };
    row.profiles = Object.entries(values).map(([code, points]) => {
      const metric = atlasPublicCatalog.metrics.find(
        (m) => m.id === `${row.source.id}:${code}`,
      )!;
      return {
        metricId: metric.id,
        geographyId: germany.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles[code]!,
        unit: metric.unit,
        points,
      };
    });
    const overview = publicPartnerOverview(row, 0)!;
    expect(overview.period).toBe("2022");
    expect(overview.rows.map((r) => r.metric.providerCode)).toEqual([
      "USA",
      "CHN",
    ]);
    expect(overview.rows.map((r) => r.value)).toEqual([9.343, 7.862]);
    expect(area.seriesTitles.DEU).toBeUndefined();
    const china = overview.rows[1].metric;
    expect([
      publicPicture(row, china, 0)!.min,
      publicPicture(row, china, 0)!.max,
    ]).toEqual([0, 100]);
    vi.spyOn(api, "atlasPublicSource").mockResolvedValue(row);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AtlasPublicPanel
          topicId="trade:trade_partners"
          geography={germany}
          showNumbers={false}
          job={null}
          onAreaChange={() => {}}
        />
      </QueryClientProvider>,
    );
    const partner = await screen.findByRole("button", {
      name: "China",
    });
    expect(screen.queryByText("9,343 %")).toBeNull();
    fireEvent.click(partner);
    expect(
      screen.getByRole("combobox", { name: "Datenperspektive" }),
    ).toHaveProperty("value", china.id);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "China",
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Datenperspektive" }),
      { target: { value: "oecd-tiva-partners:DEU" } },
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByText("Das eigene Land ist kein Auslandspartner."),
    ).toBeTruthy();
    client.clear();
  });
  it("keeps the SBS classification break, confidential gaps and EBS history separate", () => {
    const sourceId = "eurostat-professional-history";
    const history = atlasPublicCatalog.metrics.find(
      (m) => m.id === `${sourceId}:M_V16110`,
    )!;
    const row = browserAtlasPublicSource(sourceId, germany.id);
    const area = row.source.areas.find((a) => a.geographyId === germany.id)!;
    row.status = "available";
    row.provenance = {
      ...response([]).provenance!,
      sourceId,
      url: row.source.url,
      documentationUrl: row.source.documentationUrl,
      publishedAt: row.source.publishedAt,
      sha256: row.source.expectedSha256,
      recipe: row.source.recipe,
    };
    row.profiles = [
      {
        metricId: history.id,
        geographyId: germany.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles[history.providerCode]!,
        unit: history.unit,
        points: [
          point("2006", "123"),
          point("2007", "125"),
          {
            ...point("2008", "140", true),
            notes: ["Redaktionelle Trennung 2008"],
          },
          { ...point("2009", null), status: "Vertraulich laut Quelle (|C)" },
          point("2010", "144"),
        ],
      },
    ];
    const picture = publicPicture(row, history, 0)!;
    expect(picture.segments.map((s) => s.map((p) => p.period))).toEqual([
      ["2006", "2007"],
      ["2008"],
      ["2010"],
    ]);
    expect(picture.missingPeriods).toEqual(["2009"]);
    const selected = publicSelection(
      new URLSearchParams(`publicMetric=${history.id}`),
      history.topicId,
    );
    expect(selected.source?.id).toBe(sourceId);
    const personal = atlasPublicCatalog.metrics.filter(
      (m) => m.topicId === "consumer_services:personal_services",
    );
    expect(personal).toHaveLength(2);
    expect(
      personal.every(
        (m) =>
          m.sourceId === "eurostat-business-services" &&
          m.providerCode.startsWith("S96/"),
      ),
    ).toBe(true);
    expect(
      browserAtlasPublicSource("eurostat-business-services", "m49:356").status,
    ).toBe("unsupported_area");
    expect(
      browserAtlasPublicSource("eurostat-business-services", germany.id)
        .profiles,
    ).toEqual([]);
  });
  it("keeps heat capacity, fuel production and the single household survey distinct", () => {
    const heat = atlasPublicCatalog.sources.find(
      (s) => s.id === "eurostat-heat-pumps",
    )!;
    expect(heat.firstPeriod).toBe("2004");
    expect(heat.areas.some((a) => a.geographyId === "world")).toBe(false);
    const metrics = atlasPublicCatalog.metrics.filter(
      (m) => m.sourceId === heat.id,
    );
    expect(metrics.map((m) => m.providerCode)).toEqual(["ATH", "GTH", "HTH"]);
    expect(metrics.every((m) => m.unit === "Thermische Leistung (MW)")).toBe(
      true,
    );
    const district = atlasPublicCatalog.metrics.find(
      (m) => m.id === "eurostat-district-heating:DHEAT",
    )!;
    expect(district.connectAdjacent).toBe(false);
    expect(district.kind).toBe("household_survey");
    const districtData = browserAtlasPublicSource(
      district.sourceId,
      germany.id,
    );
    const districtArea = districtData.source.areas.find(
      (a) => a.geographyId === germany.id,
    )!;
    districtData.status = "available";
    districtData.provenance = {
      ...response([]).provenance!,
      sourceId: districtData.source.id,
      url: districtData.source.url,
      documentationUrl: districtData.source.documentationUrl,
      publishedAt: districtData.source.publishedAt,
      sha256: districtData.source.expectedSha256,
      recipe: districtData.source.recipe,
    };
    districtData.profiles = [
      {
        metricId: district.id,
        geographyId: germany.id,
        providerArea: districtArea.code,
        providerLabel: districtArea.label,
        providerTitle: districtArea.seriesTitles.DHEAT!,
        unit: district.unit,
        points: [point("2023", "13.7")],
      },
    ];
    const districtPicture = publicPicture(districtData, district, 0)!;
    expect([districtPicture.min, districtPicture.max]).toEqual([0, 100]);
    expect(districtPicture.segments).toHaveLength(1);
    expect(districtPicture.segments[0]).toHaveLength(1);
    const bio = atlasPublicCatalog.metrics.filter(
      (m) => m.sourceId === "eurostat-bioenergy",
    );
    expect(bio.map((m) => m.providerCode)).toEqual([
      "R5110-5150_W6000RI",
      "R5300",
    ]);
    expect(bio.every((m) => m.unit === "Energieinhalt (TJ)")).toBe(true);
    expect(browserAtlasPublicSource(heat.id, "m49:356").status).toBe(
      "unsupported_area",
    );
    expect(browserAtlasPublicSource(heat.id, germany.id).profiles).toEqual([]);
  });
  it("keeps Census activity and IEA historical categories bound to their actual areas", () => {
    const census = atlasPublicCatalog.sources.find(
      (s) => s.id === "census-construction",
    )!;
    expect(census.areas.map((a) => a.geographyId)).toEqual(["m49:840"]);
    const iea = atlasPublicCatalog.sources.find((s) => s.id === "iea-ev")!;
    expect(iea.areas.find((a) => a.code === "Africa")?.geographyId).toBe(
      "iea:africa",
    );
    expect(iea.areas.find((a) => a.code === "World")?.geographyId).toBe(
      "world",
    );
    expect(iea.lastPeriod).toBe("2025");
    const input = {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    };
    const india = coverageOptions("m49:356", input);
    expect(
      india.find((o) => o.id.includes("census-construction:data_centers"))
        ?.status,
    ).toBe("unsupported_area");
    const world = coverageOptions("world", input).filter(
      (o) => o.family === "public:iea-ev",
    );
    expect(world).toHaveLength(13);
    expect(world.every((o) => o.status === "checking")).toBe(true);
    expect(atlasContextGuide("transport:electric_vehicles")).toBeUndefined();
    expect(atlasContextGuide("digital:cloud")).toBeUndefined();
  });
  it("retains actual quarters and months without annual compression", () => {
    expect(publicPeriod("2024-Q4", "quarterly")).toBe(2024.75);
    expect(publicPeriod("2024-02", "monthly")).toBeCloseTo(2024 + 1 / 12);
    expect(publicPeriod("2024-13", "monthly")).toBeNull();
    expect(publicPeriod("2025-02-29", "irregular")).toBeNull();
    expect(publicPeriod("2024-Q5", "quarterly")).toBeNull();
    expect(publicPeriod("2024-Q2", "annual")).toBeNull();
    expect(publicValue(null)).toBeNull();
    expect(publicValue("")).toBeNull();
    expect(publicValue("0")).toBe(0);
    expect(publicValue("-2.4")).toBe(-2.4);
    expect(publicValue("NaN")).toBeNull();
  });
  it("leaves absent quarters, explicit missing observations and breaks unconnected", () => {
    const data = response([
      point("2020-Q1", "0"),
      point("2020-Q2", "1"),
      point("2020-Q3", null),
      point("2020-Q4", "2"),
      point("2021-Q1", "3", true),
      point("2021-Q3", "4"),
    ]);
    const picture = publicPicture(data, metric, 0)!;
    expect(picture.points.length).toBe(5);
    expect(picture.segments.map((s) => s.map((p) => p.period))).toEqual([
      ["2020-Q1", "2020-Q2"],
      ["2020-Q4"],
      ["2021-Q1"],
      ["2021-Q3"],
    ]);
    expect(publicPicture(data, metric, 2022)).toBeNull();
    data.provenance!.sha256 = "a".repeat(64);
    expect(publicPicture(data, metric, 0)).toBeNull();
  });
  it("rejects wrong identities and duplicate periods instead of repairing the picture", () => {
    const data = response([point("2020-Q1", "1"), point("2020-Q1", "2")]);
    expect(publicPicture(data, metric, 0)).toBeNull();
    data.profiles[0].points.pop();
    data.profiles[0].providerLabel = "France";
    expect(publicPicture(data, metric, 0)).toBeNull();
  });
  it("does not fill unsupported geographies or turn a missing household series into private debt", () => {
    const row = browserAtlasPublicSource("bis-dsr", "world");
    expect(row.status).toBe("unsupported_area");
    expect(row.profiles).toEqual([]);
    expect(coverageMapped("public:bis-dsr", "world")).toBe(false);
    const selected = publicSelection(
      new URLSearchParams("publicMetric=bis-dsr%3AH&publicSince=2010"),
      metric.topicId,
    );
    expect(selected.metric.id).toBe("bis-dsr:H");
    const options = coverageOptions("m49:356", {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    }).filter((o) => o.family === "public:bis-dsr");
    expect(options.find((o) => o.id === "bis-dsr:H")?.status).toBe(
      "unsupported_area",
    );
    expect(options.find((o) => o.id === "bis-dsr:P")?.status).toBe("checking");
    expect(coverageFamilyTarget("public:bis-dsr", germany.id).topic).toBe(
      metric.topicId,
    );
    expect(atlasContextGuide(metric.topicId)).toBeUndefined();
  });
  it("hides numeric values in the chart and tooltips until explicitly selected", () => {
    const picture = publicPicture(
      response([point("2020-Q1", "12.3"), point("2020-Q2", "13.1")]),
      metric,
      0,
    )!;
    const { container, rerender } = render(
      <PublicChart picture={picture} metric={metric} numbers={false} />,
    );
    expect(container.textContent).not.toContain("12,3");
    rerender(<PublicChart picture={picture} metric={metric} numbers />);
    expect(container.textContent).toContain("12,3");
  });
  it.each([
    ["eurostat-ai", "Geringe Zuverlässigkeit laut Quelle (u)"],
    ["bgs-cement", "Keine Produktion laut Quelle (—) · Quellenschätzung (*)"],
  ])("retains %s source status when numbers are hidden", (sourceId, status) => {
    const picture = publicPicture(
      response([{ ...point("2020-Q1", "12.3"), status }]),
      metric,
      0,
    )!;
    const { container } = render(
      <PublicChart
        picture={picture}
        metric={{ ...metric, sourceId }}
        numbers={false}
      />,
    );
    expect(container.textContent).toContain(status);
    expect(container.textContent).not.toContain("12,3");
  });
  it("renders the local series and keeps an unavailable selected perspective empty", async () => {
    vi.spyOn(api, "atlasPublicSource").mockResolvedValue(
      response([point("2020-Q1", "12.3"), point("2020-Q2", "13.1")]),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AtlasPublicPanel
          topicId={metric.topicId}
          geography={germany}
          showNumbers={false}
          job={null}
          onAreaChange={() => {}}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole("img");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Datenperspektive" }),
      { target: { value: "bis-dsr:H" } },
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Keine eigenen Beobachtungen/)).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Datenperspektive",
        }) as HTMLSelectElement
      ).value,
    ).toBe("bis-dsr:H");
    client.clear();
  });
});
