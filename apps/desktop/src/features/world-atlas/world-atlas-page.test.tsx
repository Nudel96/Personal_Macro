import {
  atlasHouseholdsCatalog as householdCfg,
  type AtlasHouseholdsResponse,
} from "./atlas-households";
import { browserAtlasAgriculture } from "../../services/atlas-browser";
import { browserAtlasCredit } from "../../services/atlas-browser";
import { browserAtlasDebt } from "../../services/atlas-browser";
import {
  atlasDebtCatalog as debtCfg,
  type AtlasDebtResponse,
} from "./atlas-debt";
import { browserAtlasProperty } from "../../services/atlas-browser";
import { browserAtlasHousingRatios } from "../../services/atlas-browser";
import { browserAtlasEducation } from "../../services/atlas-browser";
import {
  browserAtlasFiscal,
  browserAtlasHouseholds,
  browserAtlasMacrohistory,
} from "../../services/atlas-browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, isTauri } from "../../services/commands";
import { browserAtlasSeries } from "../../services/atlas-browser";
import { browserAtlasMarket } from "../../services/atlas-browser";
import { browserAtlasDemography } from "../../services/atlas-browser";
import { browserAtlasHistory } from "../../services/atlas-browser";
import { browserAtlasEnergy } from "../../services/atlas-browser";
import { browserAtlasCapacity } from "../../services/atlas-browser";
import { browserAtlasValuation } from "../../services/atlas-browser";
import type { AtlasDemographyResponse } from "./atlas-demography-types";
import { atlasCatalog } from "./atlas-catalog";
import { WorldAtlasPage } from "./world-atlas-page";
import { browserAtlasFindex } from "../../services/atlas-browser";
import { browserAtlasPublicSource } from "../../services/atlas-browser";
import type { AtlasSeriesInput, AtlasSeriesResponse } from "./atlas-types";
import { atlasMarketProxies } from "./atlas-markets";
import { atlasEnergyCatalog, type AtlasEnergyResponse } from "./atlas-energy";
import { atlasValuationCatalog } from "./atlas-valuation";

vi.mock("../../services/commands", () => ({
  api: {
    atlasFindex: vi.fn(),
    atlasPublicSource: vi.fn(),
    syncAtlasFindex: vi.fn(),
    atlasCatalog: vi.fn(),
    atlasFiscal: vi.fn(),
    atlasHouseholds: vi.fn(),
    syncAtlasHouseholds: vi.fn(),
    atlasMacrohistory: vi.fn(),
    atlasSeries: vi.fn(),
    atlasSyncStatus: vi.fn(),
    syncAtlasSeries: vi.fn(),
    syncAtlasStatisticsBatch: vi.fn(),
    cancelAtlasStatisticsBatch: vi.fn(),
    atlasMarket: vi.fn(),
    syncAtlasMarket: vi.fn(),
    syncAtlasMarketBatch: vi.fn(),
    cancelAtlasMarketBatch: vi.fn(),
    atlasDemography: vi.fn(),
    syncAtlasDemography: vi.fn(),
    atlasHistory: vi.fn(),
    syncAtlasHistory: vi.fn(),
    atlasEnergy: vi.fn(),
    atlasCredit: vi.fn(),
    atlasDebt: vi.fn(),
    syncAtlasDebt: vi.fn(),
    atlasProperty: vi.fn(),
    atlasHousingRatios: vi.fn(),
    atlasAgriculture: vi.fn(),
    syncAtlasAgriculture: vi.fn(),
    atlasEducation: vi.fn(),
    syncAtlasEducation: vi.fn(),
    syncAtlasHousingRatios: vi.fn(),
    syncAtlasProperty: vi.fn(),
    syncAtlasCredit: vi.fn(),
    atlasCapacity: vi.fn(),
    syncAtlasCapacity: vi.fn(),
    atlasValuation: vi.fn(),
    syncAtlasValuation: vi.fn(),
    cancelAtlasValuation: vi.fn(),
    syncAtlasEnergy: vi.fn(),
    atlasLastContext: vi.fn(),
    saveAtlasLastContext: vi.fn(),
  },
  isTauri: vi.fn(),
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

let client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.atlasPublicSource).mockImplementation(async (source, area) =>
    browserAtlasPublicSource(source, area),
  );
  vi.mocked(api.atlasFindex).mockImplementation(async (id) =>
    browserAtlasFindex(id),
  );
  vi.mocked(api.atlasCatalog).mockResolvedValue(atlasCatalog);
  vi.mocked(api.atlasFiscal).mockImplementation(async (id) =>
    browserAtlasFiscal(id),
  );
  vi.mocked(api.atlasHouseholds).mockImplementation(async (id) =>
    browserAtlasHouseholds(id),
  );
  vi.mocked(api.atlasMacrohistory).mockImplementation(async (id) =>
    browserAtlasMacrohistory(id),
  );
  vi.mocked(api.atlasSyncStatus).mockResolvedValue(null);
  vi.mocked(api.atlasLastContext).mockResolvedValue(null);
  vi.mocked(api.saveAtlasLastContext).mockResolvedValue(undefined);
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(api.atlasSeries).mockImplementation(async (input) =>
    browserAtlasSeries(input),
  );
  vi.mocked(api.atlasMarket).mockImplementation(async (id) =>
    browserAtlasMarket(id),
  );
  vi.mocked(api.atlasDemography).mockImplementation(async (id) =>
    browserAtlasDemography(id),
  );
  vi.mocked(api.atlasHistory).mockImplementation(async (id) =>
    browserAtlasHistory(id),
  );
  vi.mocked(api.atlasEnergy).mockImplementation(async (id) =>
    browserAtlasEnergy(id),
  );
  vi.mocked(api.atlasCredit).mockImplementation(async (id) =>
    browserAtlasCredit(id),
  );
  vi.mocked(api.atlasDebt).mockImplementation(async (id) =>
    browserAtlasDebt(id),
  );
  vi.mocked(api.atlasProperty).mockImplementation(async (id) =>
    browserAtlasProperty(id),
  );
  vi.mocked(api.atlasHousingRatios).mockImplementation(async (id) =>
    browserAtlasHousingRatios(id),
  );
  vi.mocked(api.atlasAgriculture).mockImplementation(async (id) =>
    browserAtlasAgriculture(id),
  );
  vi.mocked(api.atlasEducation).mockImplementation(async (id) =>
    browserAtlasEducation(id),
  );
  vi.mocked(api.atlasCapacity).mockImplementation(async (id) =>
    browserAtlasCapacity(id),
  );
  vi.mocked(api.atlasValuation).mockImplementation(async (id) =>
    browserAtlasValuation(id),
  );
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount(url = "/world-atlas") {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <WorldAtlasPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  return (
    <output hidden data-testid="atlas-url">
      {useLocation().search}
    </output>
  );
}

const currentParams = () =>
  new URLSearchParams(screen.getByTestId("atlas-url").textContent ?? "");

it("öffnet afrikanische Wohnungsdaten ausdrücklich aus WDI und wechselt zur getrennten Bestandsquelle", async () => {
  mount(
    "/world-atlas?area=m49:566&compare=m49:404&topic=housing:housing_supply&series=worldbank:2:EN.POP.SLUM.UR.ZS&perspective=worldbank",
  );
  await waitFor(() =>
    expect(api.atlasSeries).toHaveBeenCalledWith({
      seriesId: "worldbank:2:EN.POP.SLUM.UR.ZS",
      geographyId: "m49:566",
    }),
  );
  expect(api.atlasPublicSource).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Weitere Quellenperspektive" }),
  );
  await waitFor(() => expect(api.atlasPublicSource).toHaveBeenCalled());
  fireEvent.click(
    screen.getByRole("button", { name: "WDI-Perspektive · Weltbank" }),
  );
  expect(currentParams().get("perspective")).toBe("worldbank");
  expect(currentParams().get("area")).toBe("m49:566");
  expect(currentParams().get("compare")).toBe("m49:404");
});

it("wählt beim Themenwechsel eine passende Länderquelle und zeigt dieselbe Quelle in der Überschrift", async () => {
  mount(
    "/world-atlas?area=m49:288&topic=labor:wages&publicSource=ilo-real-wage-growth",
  );
  await waitFor(() =>
    expect(api.atlasPublicSource).toHaveBeenCalledWith(
      "ilo-real-wage-growth",
      "m49:288",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Leben & Versorgung" }));
  fireEvent.click(await screen.findByRole("button", { name: "Mieten" }));
  await waitFor(() =>
    expect(api.atlasPublicSource).toHaveBeenCalledWith(
      "worldbank-icp-housing",
      "m49:288",
    ),
  );
  expect(currentParams().get("area")).toBe("m49:288");
  expect(
    document.querySelector(".atlas-picture-heading .atlas-kind")?.textContent,
  ).toBe("Weltbank ICP · Wohnkosten und Versorgung");
  expect(
    (
      screen.getByRole("combobox", {
        name: "Öffentliche Quelle",
      }) as HTMLSelectElement
    ).value,
  ).toBe("worldbank-icp-housing");
});

it("öffnet explizite Einkommensverteilung trotz ergänzendem Themeneinstieg", async () => {
  mount(
    "/world-atlas?area=m49:566&topic=labor:income_distribution&series=worldbank:2:SI.DST.FRST.20&perspective=worldbank",
  );
  await waitFor(() =>
    expect(api.atlasSeries).toHaveBeenCalledWith({
      seriesId: "worldbank:2:SI.DST.FRST.20",
      geographyId: "m49:566",
    }),
  );
});

it("öffnet die neue Armutsstatistik ohne Quellenplatzhalter und erhält beide Länder", async () => {
  mount(
    "/world-atlas?area=m49:356&compare=m49:156&topic=institutions:poverty&numbers=0",
  );
  await waitFor(() =>
    expect(api.atlasSeries).toHaveBeenCalledWith({
      seriesId: "unsdg:SI_POV_DAY1",
      geographyId: "m49:356",
    }),
  );
  expect(screen.queryByText("Eigene Datenansicht noch offen")).toBeNull();
  expect(currentParams().get("area")).toBe("m49:356");
  expect(currentParams().get("compare")).toBe("m49:156");
});

it("öffnet angebundene Robotik ohne alten Quellenplatzhalter und ohne fremdes Länderbild", async () => {
  mount(
    "/world-atlas?area=m49:156&view=coverage&coverageSearch=Robotik&numbers=0",
  );
  const entry = await screen.findByRole("button", {
    name: /Unternehmen mit Industrie- oder Servicerobotern\. Robotik\./,
  });
  expect(
    screen.queryByText(/IFR bietet eine detaillierte historische Datenbank/),
  ).toBeNull();
  fireEvent.click(entry);
  await screen.findByText(
    "Diese Quellenreihe enthält kein eigenes Bild für China.",
  );
  expect(screen.queryByText("Eigene Datenansicht noch offen")).toBeNull();
  expect(currentParams().get("area")).toBe("m49:156");
  expect(currentParams().get("topic")).toBe("innovation:robotics");
  expect(currentParams().get("publicSource")).toBe("eurostat-robotics");
});

describe("Schulden von Haushalten und Unternehmen", () => {
  it("öffnet Findex ohne alte Quellen-Platzhalter und erhält Land, Vergleich und Bevölkerung", async () => {
    mount(
      "/world-atlas?area=m49:356&compare=m49:156&topic=finance:financial_access",
    );
    expect(
      await screen.findByRole("heading", {
        name: "Finanzielle Teilhabe in der Desktop-App laden",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Eigene Datenansicht noch offen")).toBeNull();
    fireEvent.change(screen.getByLabelText("Bevölkerungsgruppe"), {
      target: { value: "women" },
    });
    fireEvent.change(screen.getByLabelText("Findex-Bilder ordnen"), {
      target: { value: "payments" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("atlas-url").textContent).toContain(
        "findexGroup=payments",
      ),
    );
    const url = screen.getByTestId("atlas-url").textContent!;
    expect(url).toContain("findexPopulation=women");
    expect(url).toContain("area=m49%3A356");
    expect(url).toContain("compare=m49%3A156");
    expect(api.atlasSeries).not.toHaveBeenCalled();
  });
  it("wechselt Perspektive und Zeitraum mit ausgeblendeten Zahlen und lädt keine fremde Statistik", async () => {
    const area = debtCfg.areas.find((a) => a.code === "DE")!;
    const row: AtlasDebtResponse = {
      ...browserAtlasDebt(area.geographyId),
      status: "available",
      profile: {
        geographyId: area.geographyId,
        providerCode: area.code,
        providerLabel: area.label,
        decimals: area.decimals,
        points: Array.from({ length: 8 }, (_, i) => ({
          period: `${2000 + Math.floor(i / 4)}-Q${(i % 4) + 1}`,
          households: 40 + i,
          corporations: 70 - i,
          householdsBreak: false,
          corporationsBreak: false,
          householdsPreBreak: "",
          corporationsPreBreak: "",
        })),
      },
      provenance: {
        recipe: debtCfg.recipe,
        url: debtCfg.url,
        sha256: "a".repeat(64),
        retrievedAt: "2026-09-09T12:00:00Z",
        fileModifiedAt: null,
        sourceRowCount: 187215,
        numericCellCount: 14118,
        areaCount: 48,
      },
    };
    vi.mocked(api.atlasDebt).mockResolvedValue(row);
    mount("/world-atlas?topic=finance:corporate_debt&area=m49:276");
    const chart = await screen.findByRole("img", {
      name: /Schulden der Unternehmen: Deutschland/,
    });
    expect(chart.querySelectorAll("circle title")[0].textContent).toBe(
      "Deutschland · 2000-Q1",
    );
    expect(api.atlasSeries).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Steigen & Fallen" }));
    expect(currentParams().get("debtMode")).toBe("change");
    expect(
      await screen.findByRole("img", {
        name: /Prozentpunkte gegenüber dem Vorjahresquartal/,
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Seit 2000" }));
    expect(currentParams().get("debtSince")).toBe("2000");
    fireEvent.click(
      screen.getByRole("button", { name: "Weitere Quellenperspektive" }),
    );
    await waitFor(() =>
      expect(api.atlasPublicSource).toHaveBeenCalledWith(
        "imf-gdd-nfc_ls",
        "m49:276",
      ),
    );
    expect(currentParams().get("perspective")).toBe("public");
    fireEvent.click(
      screen.getByRole("button", { name: "Schuldenbilder · BIS" }),
    );
    await screen.findByRole("img", {
      name: /Prozentpunkte gegenüber dem Vorjahresquartal/,
    });
    expect(currentParams().get("area")).toBe("m49:276");
    expect(currentParams().get("debtSince")).toBe("2000");
  });
  it("leitet vom fehlenden Afrika-Aggregat gezielt zum verfügbaren Südafrika-Profil", async () => {
    vi.mocked(api.atlasDebt).mockImplementation(async (id) => ({
      ...browserAtlasDebt(id),
      status: "unsupported_area",
    }));
    mount("/world-atlas?topic=finance:household_debt&area=un-wpp:903");
    const selector = await screen.findByRole("combobox", {
      name: "BIS-Schuldengebiet öffnen",
    });
    expect(
      within(selector).getByRole("option", { name: "Südafrika" }),
    ).toBeTruthy();
    fireEvent.change(selector, { target: { value: "m49:710" } });
    expect(currentParams().get("area")).toBe("m49:710");
    expect(currentParams().get("topic")).toBe("finance:household_debt");
  });
});

it("öffnet einzelne digitale Verbreitungsbilder und bewahrt die Länder beim Rückweg", async () => {
  mount(
    "/world-atlas?region=Asia&area=m49:356&compare=m49:156&topic=innovation:technology_adoption&perspective=innovation&series=worldbank:2:SP.POP.TOTL",
  );
  expect(api.atlasSeries).not.toHaveBeenCalled();
  for (const [label, code] of [
    ["Menschen mit Internetnutzung", "IT.NET.USER.ZS"],
    ["Feste Breitbandanschlüsse", "IT.NET.BBND.P2"],
    ["Mobilfunkanschlüsse", "IT.CEL.SETS.P2"],
  ]) {
    fireEvent.click(screen.getByRole("button", { name: `${label} öffnen` }));
    await waitFor(() => {
      for (const geographyId of ["m49:356", "m49:156"])
        expect(api.atlasSeries).toHaveBeenCalledWith({
          geographyId,
          seriesId: `worldbank:2:${code}`,
        });
    });
    expect(currentParams().get("perspective")).toBe("worldbank");
    expect(currentParams().get("fromGuide")).toBe(
      "innovation:technology_adoption",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Zum Themen-Einstieg zurück/ }),
    );
    expect(currentParams().get("area")).toBe("m49:356");
    expect(currentParams().get("compare")).toBe("m49:156");
  }
  expect(api.syncAtlasSeries).not.toHaveBeenCalled();
});

it("öffnet das Kreditumfeld mit vollständiger Geschichte und kennzeichnet die fehlende JST-Abdeckung", async () => {
  mount(
    "/world-atlas?region=Asia&area=m49:356&compare=m49:156&topic=finance:financial_stress&perspective=worldbank&creditMode=ratio&creditSince=2000",
  );
  expect(
    screen.getByText("Kein eigenes Quellenprofil für Indien und China."),
  ).toBeTruthy();
  expect(api.atlasCredit).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Kredite im Verhältnis zum langfristigen Trend öffnen",
    }),
  );
  await waitFor(() => expect(api.atlasCredit).toHaveBeenCalledWith("m49:356"));
  expect(api.atlasCredit).toHaveBeenCalledWith("m49:156");
  expect(api.atlasSeries).not.toHaveBeenCalled();
  expect(currentParams().get("creditMode")).toBe("gap");
  expect(currentParams().get("creditSince")).toBe("0");
  expect(currentParams().get("fromGuide")).toBe("finance:financial_stress");
});

it.each([
  ["industry:aerospace", "m49:276", "global", /gemeinsame Branche lässt sich/],
  [
    "industry:defense_industry",
    "m49:356",
    "india",
    /keine gesonderte Rüstungsbewertung/,
  ],
  ["electricity:utilities", "m49:840", "us", /auch Wasserversorgung/],
])(
  "öffnet den abgegrenzten Bewertungsumfang für %s",
  async (topic, area, scope, boundary) => {
    mount(
      `/world-atlas?area=${area}&topic=${topic}&valSearch=Bank&valSubject=obsolete&valScope=china&valCompareScope=us`,
    );
    expect(screen.getByText(boundary)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bewertungsbilder zu diesem Thema öffnen",
      }),
    );
    await screen.findByText(boundary);
    expect(currentParams().get("valTopic")).toBe(topic);
    expect(currentParams().get("valScope")).toBe(scope);
    expect(currentParams().get("area")).toBe(area);
    expect(currentParams().has("valSearch")).toBe(false);
    expect(currentParams().has("valCompareScope")).toBe(false);
  },
);

it("öffnet präzise Industriebilder und erhält Land, Vergleich und Rückweg", async () => {
  mount(
    "/world-atlas?region=Europe&area=m49:276&compare=m49:840&topic=structural_change:industrialization&perspective=market&series=worldbank:2:SP.POP.TOTL",
  );
  expect(
    screen.getByRole("button", { name: "Arbeit in der Industrie öffnen" }),
  ).toBeTruthy();
  expect(api.atlasSeries).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Arbeit in der Industrie öffnen" }),
  );
  await waitFor(() =>
    expect(api.atlasSeries).toHaveBeenCalledWith({
      geographyId: "m49:276",
      seriesId: "worldbank:2:SL.IND.EMPL.ZS",
    }),
  );
  expect(api.atlasSeries).toHaveBeenCalledWith({
    geographyId: "m49:840",
    seriesId: "worldbank:2:SL.IND.EMPL.ZS",
  });
  expect(
    screen.getByRole("heading", {
      name: "Industrie einschließlich Bau · Anteil an der Beschäftigung",
    }),
  ).toBeTruthy();
  expect(currentParams().get("fromGuide")).toBe(
    "structural_change:industrialization",
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Zum Themen-Einstieg zurück/ }),
  );
  expect(screen.getByLabelText("Land oder Gebiet")).toHaveProperty(
    "value",
    "m49:276",
  );
  expect(screen.getByLabelText("Land vergleichen")).toHaveProperty(
    "value",
    "m49:840",
  );
  expect(
    screen.queryByRole("button", { name: /Zum Themen-Einstieg zurück/ }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Verarbeitendes Gewerbe öffnen" }),
  );
  await waitFor(() =>
    expect(api.atlasSeries).toHaveBeenCalledWith({
      geographyId: "m49:276",
      seriesId: "worldbank:2:NV.IND.MANF.ZS",
    }),
  );
  expect(currentParams().get("series")).toBe("worldbank:2:NV.IND.MANF.ZS");
  fireEvent.click(screen.getByRole("button", { name: "Industrieanteil" }));
  expect(currentParams().has("fromGuide")).toBe(false);
  expect(api.syncAtlasSeries).not.toHaveBeenCalled();
});

it("zeigt Ländergrenzen historischer Zinsquellen schon am Einstieg und wechselt keine Länder", async () => {
  mount(
    "/world-atlas?region=Asia&area=m49:356&compare=m49:156&topic=long_history:long_run_rates&jstSince=1980&fiscalSince=2000",
  );
  expect(
    screen.getAllByText("Kein eigenes Quellenprofil für Indien und China."),
  ).toHaveLength(2);
  expect(api.atlasFiscal).not.toHaveBeenCalled();
  expect(api.atlasMacrohistory).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Langfristiger Realzins öffnen" }),
  );
  await waitFor(() => expect(api.atlasFiscal).toHaveBeenCalledWith("m49:356"));
  expect(api.atlasFiscal).toHaveBeenCalledWith("m49:156");
  expect(api.atlasMacrohistory).not.toHaveBeenCalled();
  expect(currentParams().get("fiscalMetric")).toBe("realLongRate");
  expect(currentParams().get("fiscalSince")).toBe("1800");
  expect(screen.getByRole("heading", { name: "Staatsfinanzen" })).toBeTruthy();
});

it("öffnet Solarstrom und UN-Geschichte mit der benannten Perspektive trotz vorheriger Einstellungen", async () => {
  mount(
    "/world-atlas?region=Africa&area=m49:566&compare=m49:710&topic=structural_change:energy_transitions&perspective=capacity&energySince=2010&energyMeasure=capacity",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Solarstrom im Strommix öffnen" }),
  );
  await waitFor(() => expect(api.atlasEnergy).toHaveBeenCalledWith("m49:566"));
  expect(api.atlasEnergy).toHaveBeenCalledWith("m49:710");
  expect(api.atlasCapacity).not.toHaveBeenCalled();
  expect(currentParams().get("energySince")).toBe("2000");
  expect(currentParams().get("energyMeasure")).toBe("share");
  expect(currentParams().get("perspective")).toBe("energy");
  cleanup();
  client.clear();
  mount(
    "/world-atlas?region=Asia&area=m49:356&compare=m49:156&topic=long_history:long_run_population&demoProjection=1&demoYear=2100",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Bevölkerung seit 1950 öffnen" }),
  );
  await waitFor(() =>
    expect(api.atlasDemography).toHaveBeenCalledWith("m49:356"),
  );
  expect(currentParams().get("demoProjection")).toBe("0");
  expect(currentParams().get("demoYear")).toBe("2023");
});

it("zählt Themen-Einstiege nicht als gemessene Reihen und ignoriert unpassende Rücksprungziele", async () => {
  mount(
    "/world-atlas?view=coverage&coverageSearch=Industrialisierung&coverageStatus=available",
  );
  await screen.findByText("Für diese Filter sind keine Themen vorhanden.");
  fireEvent.change(screen.getByLabelText("Datenstatus eingrenzen"), {
    target: { value: "all" },
  });
  await screen.findByText(/Ein Themen-Einstieg verbindet vorhandene/);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Themen-Einstieg öffnen · Industrialisierung",
    }),
  );
  expect(
    screen.getByRole("button", { name: "Arbeit in der Industrie öffnen" }),
  ).toBeTruthy();
  cleanup();
  client.clear();
  mount(
    "/world-atlas?topic=macro:inflation&fromGuide=structural_change:industrialization",
  );
  expect(
    screen.queryByRole("button", { name: /Zum Themen-Einstieg zurück/ }),
  ).toBeNull();
});

it("öffnet beide Immobilienthemen trotz alter Perspektive und hält die native Aktualisierung aktuell", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(api.syncAtlasProperty).mockResolvedValue({
    id: "property-job",
    seriesId: "bis-residential-property",
    status: "complete",
    page: 2,
    pages: 2,
    observations: 100,
    message: "Immobilienbilder gespeichert",
    startedAt: "2026-09-09T00:00:00Z",
    finishedAt: "2026-09-09T00:00:01Z",
  });
  mount(
    "/world-atlas?region=Asia&area=m49:356&compare=m49:156&topic=long_history:long_run_housing&perspective=market",
  );
  expect(
    await screen.findByRole("button", { name: "Preisentwicklung" }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(api.atlasProperty).toHaveBeenCalledWith("m49:156"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "BIS-Immobilienbilder weltweit laden" }),
  );
  await waitFor(() => expect(api.atlasProperty).toHaveBeenCalledTimes(4));
  fireEvent.click(screen.getByRole("button", { name: "Leben & Versorgung" }));
  fireEvent.click(screen.getByRole("button", { name: "Wohnimmobilienpreise" }));
  expect(
    await screen.findByRole("heading", { name: "Wohnimmobilienpreise" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Preisentwicklung" })).toBeTruthy();
  expect(
    (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
  ).toBe("m49:356");
});

it("öffnet OECD-Wohnvergleiche trotz alter Perspektive, aktualisiert beide Länder und erhält sie beim BIS-Wechsel", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(api.syncAtlasHousingRatios).mockResolvedValue({
    id: "ratio-job",
    seriesId: "oecd-housing-ratios",
    status: "complete",
    page: 2,
    pages: 2,
    observations: 100,
    message: "Wohnvergleiche gespeichert",
    startedAt: "2026-09-09T00:00:00Z",
    finishedAt: "2026-09-09T00:00:01Z",
  });
  mount(
    "/world-atlas?region=Europe&area=m49:276&compare=m49:840&topic=housing:affordability&perspective=market",
  );
  expect(
    await screen.findByRole("button", { name: "Hoch & Tief" }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(api.atlasHousingRatios).toHaveBeenCalledWith("m49:840"),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "OECD-Wohnvergleiche für alle Gebiete laden",
    }),
  );
  await waitFor(() => expect(api.atlasHousingRatios).toHaveBeenCalledTimes(4));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Wohnimmobilienpreise bei der BIS ansehen",
    }),
  );
  expect(
    await screen.findByRole("button", { name: "Preisentwicklung" }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(api.atlasProperty).toHaveBeenCalledWith("m49:840"),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Kaufpreise zu Einkommen & Mieten ansehen",
    }),
  );
  expect(
    (await screen.findByRole("button", { name: "Zu Einkommen" })).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
  expect(
    (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
  ).toBe("m49:276");
  fireEvent.click(
    screen.getByRole("button", { name: "Kaufpreise im Mietvergleich" }),
  );
  expect(
    (await screen.findByRole("button", { name: "Zu Mieten" })).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
});

it("öffnet eine Anlagenperspektive auch bei einem veralteten Börsenparameter ohne passenden Fonds", async () => {
  mount(
    "/world-atlas?area=m49:276&topic=electricity:geothermal&perspective=market",
  );
  expect(
    await screen.findByText("Anlagenbilder in der Desktop-App laden"),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Anlagen & Technologien" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("öffnet veröffentlichte Bewertungen aus dem Katalogthema mit erhaltenem Land", async () => {
  mount(
    "/world-atlas?region=Asia&area=m49%3A356&topic=market_context%3Ahistorical_valuation",
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Bewertungsbilder zu diesem Thema öffnen",
    }),
  );
  expect(
    await screen.findByRole("heading", { name: "Bewertungsbilder · Indien" }),
  ).toBeTruthy();
  expect(
    await screen.findByText("Bewertungsbilder in der Desktop-App laden"),
  ).toBeTruthy();
  expect(api.atlasValuation).toHaveBeenCalledWith("countries");
});

it("erhält schnelle Änderungen der Vergleichsregion und Bewertungsgrundlage ohne alten Quellenzustand", async () => {
  vi.mocked(api.atlasValuation).mockImplementation(async (id) => ({
    datasetId: id,
    status: "available",
    data: {
      datasetId: id,
      subjects: [],
      provenance: {
        catalogVersion: atlasValuationCatalog.version,
        files: [],
        excludedSubjects: [],
        retrievedAt: "2026-09-09T00:00:00Z",
      },
    },
  }));
  const education = atlasValuationCatalog.industries.find(
    (i) => i.providerLabel === "Education",
  )!;
  mount(
    `/world-atlas?view=valuation&valMode=industries&valBasis=pbv&valScope=india&valCompareScope=us&valSubject=${education.id}`,
  );
  await screen.findByLabelText("Quellenregion vergleichen");
  act(() => {
    fireEvent.change(screen.getByLabelText("Quellenregion vergleichen"), {
      target: { value: "china" },
    });
    fireEvent.change(screen.getByLabelText("Bewertungsgrundlage"), {
      target: { value: "pe" },
    });
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Quellenregion vergleichen") as HTMLSelectElement)
        .value,
    ).toBe("china"),
  );
  expect(
    (screen.getByLabelText("Bewertungsgrundlage") as HTMLSelectElement).value,
  ).toBe("pe");
  expect(api.atlasValuation).toHaveBeenCalledWith("pe-china");
  fireEvent.change(screen.getByLabelText("Quellenregion"), {
    target: { value: "china" },
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Quellenregion vergleichen") as HTMLSelectElement)
        .value,
    ).toBe(""),
  );
  fireEvent.change(screen.getByLabelText("Bewertungsgrundlage"), {
    target: { value: "pbv" },
  });
  await within(
    await screen.findByLabelText("Quellenregion vergleichen"),
  ).findByRole("option", {
    name: "Australien, Neuseeland und Kanada · NYU-Gruppe",
  });
  act(() => {
    fireEvent.change(screen.getByLabelText("Quellenregion vergleichen"), {
      target: { value: "rest" },
    });
    fireEvent.change(screen.getByLabelText("Bewertungsgrundlage"), {
      target: { value: "pe" },
    });
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Quellenregion vergleichen") as HTMLSelectElement)
        .value,
    ).toBe(""),
  );
  expect(api.atlasValuation).not.toHaveBeenCalledWith("pe-rest");
});
function available(input: AtlasSeriesInput): AtlasSeriesResponse {
  return {
    ...browserAtlasSeries(input),
    status: "available",
    points: [
      { year: 2000, value: 10, sourceFlag: "" },
      { year: 2002, value: 20, sourceFlag: "" },
    ],
  };
}

it("zeigt Sektorarbeit als Modellbild und erhält Land, Vergleich und konkrete Statistik beim Öffnen", async () => {
  vi.mocked(api.atlasSeries).mockImplementation(async (input) => ({
    ...available(input),
    points: [
      {
        year: 2023,
        value: input.geographyId === "m49:356" ? 40 : 20,
        sourceFlag: "",
      },
      {
        year: 2024,
        value: input.geographyId === "m49:356" ? 39 : 19,
        sourceFlag: "",
      },
    ],
  }));
  mount(
    "/world-atlas?view=statistics&area=m49%3A356&compare=m49%3A156&statDomain=people&statGroup=labor",
  );
  const card = await screen.findByRole("button", {
    name: /^Landwirtschaft · Anteil an der Beschäftigung/,
  });
  expect(
    within(card).getByText("Modellschätzungen · Ausschnitt bis 2024"),
  ).toBeTruthy();
  expect(
    within(card).getByText("Anteil an allen Erwerbstätigen (%)"),
  ).toBeTruthy();
  expect(within(card).queryByText("39 (2024)")).toBeNull();
  fireEvent.click(card);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Statistik auswählen") as HTMLSelectElement).value,
    ).toBe("worldbank:2:SL.AGR.EMPL.ZS"),
  );
  expect(screen.getByText(/Der Nenner sind alle Erwerbstätigen/)).toBeTruthy();
  expect(
    (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
  ).toBe("m49:356");
  expect(
    (screen.getByLabelText("Land vergleichen") as HTMLSelectElement).value,
  ).toBe("m49:156");
  expect(api.syncAtlasStatisticsBatch).not.toHaveBeenCalled();
});

it("nimmt die letzte native Demografieansicht mit gemeinsamem Projektionsjahr wieder auf", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(api.atlasLastContext).mockResolvedValue({
    version: 1,
    params: {
      region: "Europe",
      area: "m49:276",
      compare: "m49:356",
      topic: "demography:age_structure",
      demoYear: "2100",
      demoProjection: "1",
      numbers: "0",
    },
  });
  vi.mocked(api.atlasDemography).mockImplementation(
    async (id): Promise<AtlasDemographyResponse> => ({
      ...browserAtlasDemography(id),
      status: "available",
      provenance: {
        revision: "Test",
        retrievedAt: "2026-09-09T00:00:00Z",
        estimateEnd: 2023,
        projectionStart: 2024,
        areaCount: 2,
        sourceRowCount: 1,
        pages: [],
      },
      profile: {
        geographyId: id,
        providerId: "test",
        providerLabel: "Test",
        notes: [],
        years: [2023, 2100].map((year) => ({
          year,
          kind: year === 2023 ? "estimate" : "projection",
          ages: Array.from({ length: 21 }, (_, i) => ({
            ageStart: i * 5,
            male: 40,
            female: 60,
            total: 100,
          })),
        })),
      },
    }),
  );
  mount();
  expect(
    await screen.findByRole("img", {
      name: /Deutschland: Altersstruktur 2100/,
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("img", { name: /Indien: Altersstruktur 2100/ }),
  ).toBeTruthy();
  expect(
    (
      screen.getByLabelText(
        "UN-Szenario bis 2100 einblenden",
      ) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(screen.queryByRole("table")).toBeNull();
});

it("wechselt mit Karte und Liste das Land und erhält Thema, Übersicht und Vergleich", async () => {
  mount(
    "/world-atlas?view=statistics&region=Asia&area=m49%3A356&compare=m49%3A156&statDomain=people&statGroup=education",
  );
  expect(
    screen.queryByRole("group", { name: "Weltkarte zur Gebietsauswahl" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Weltkarte & Länderliste öffnen" }),
  );
  fireEvent.click(
    await screen.findByRole(
      "button",
      {
        name: "Deutschland auf der Karte wählen",
      },
      { timeout: 5000 },
    ),
  );
  expect(
    (
      screen.getByRole("combobox", {
        name: "Land oder Gebiet",
      }) as HTMLSelectElement
    ).value,
  ).toBe("m49:276");
  expect(
    (
      screen.getByRole("combobox", {
        name: "Land vergleichen",
      }) as HTMLSelectElement
    ).value,
  ).toBe("m49:156");
  expect(
    screen
      .getByRole("button", { name: "Länderübersicht" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    (
      screen.getByRole("combobox", {
        name: "Gruppe eingrenzen",
      }) as HTMLSelectElement
    ).value,
  ).toBe("education");
  fireEvent.click(screen.getByRole("button", { name: "Vergleich wählen" }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Vereinigte Staaten in der Liste wählen",
    }),
  );
  expect(
    (
      screen.getByRole("combobox", {
        name: "Land vergleichen",
      }) as HTMLSelectElement
    ).value,
  ).toBe("m49:840");
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Land oder Gebiet suchen" }),
    { target: { value: "Vatikan" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Weltkarte & Länderliste schließen" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Weltkarte & Länderliste öffnen" }),
  );
  expect(
    (
      (await screen.findByRole("searchbox", {
        name: "Land oder Gebiet suchen",
      })) as HTMLInputElement
    ).value,
  ).toBe("Vatikan");
});

describe("Weltatlas-Bedienung", () => {
  it("öffnet Modelle bewusst, datiert kein Land und kehrt aus den genauen Kontextdaten zum gewählten Schritt zurück", async () => {
    mount(
      "/world-atlas?region=Europe&area=m49%3A276&compare=m49%3A840&topic=cycle_hypotheses%3Abusiness_cycles",
    );
    expect(
      screen.queryByRole("img", { name: /Unregelmäßige Auf-/ }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Modellbild erkunden" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByLabelText("Land vergleichen")).toBeNull();
    expect(screen.queryByLabelText("Zahlen anzeigen")).toBeNull();
    expect(api.atlasSeries).not.toHaveBeenCalled();
    expect(api.atlasHistory).not.toHaveBeenCalled();
    expect(api.atlasEnergy).not.toHaveBeenCalled();
    expect(api.atlasMarket).not.toHaveBeenCalled();
    expect(api.atlasDemography).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Modellbild erkunden" }),
    );
    await screen.findByRole("img", { name: /Unregelmäßige Auf-/ });
    expect(
      screen.getByText("Modellvorstellung · frei gezeichnet"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rückgang" }));
    expect(
      screen
        .getByRole("button", { name: "Rückgang" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const picture = screen.getByRole("img", {
      name: /Unregelmäßige Auf-/,
    }).innerHTML;
    fireEvent.change(screen.getByLabelText("Land oder Gebiet"), {
      target: { value: "m49:250" },
    });
    expect(
      screen.getByRole("img", { name: /Unregelmäßige Auf-/ }).innerHTML,
    ).toBe(picture);
    expect(api.atlasSeries).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reales Jahreswachstum ansehen" }),
    );
    await screen.findByRole("heading", { name: "Reales Wirtschaftswachstum" });
    expect(screen.getByLabelText("Land vergleichen")).toHaveProperty(
      "value",
      "m49:840",
    );
    expect(api.atlasSeries).toHaveBeenCalledWith({
      geographyId: "m49:250",
      seriesId: "worldbank:2:NY.GDP.MKTP.KD.ZG",
    });
    expect(api.atlasSeries).toHaveBeenCalledWith({
      geographyId: "m49:840",
      seriesId: "worldbank:2:NY.GDP.MKTP.KD.ZG",
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Zur Zyklusthese zurück/ }),
    );
    await screen.findByRole("heading", { name: "Konjunkturelle Schwankungen" });
    expect(
      screen
        .getByRole("button", { name: "Rückgang" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByLabelText("Land oder Gebiet")).toHaveProperty(
      "value",
      "m49:250",
    );
    expect(
      screen.queryByRole("button", { name: /Zur Zyklusthese zurück/ }),
    ).toBeNull();
    expect(api.syncAtlasSeries).not.toHaveBeenCalled();
    expect(api.syncAtlasStatisticsBatch).not.toHaveBeenCalled();
    expect(api.syncAtlasHistory).not.toHaveBeenCalled();
    expect(api.syncAtlasEnergy).not.toHaveBeenCalled();
    expect(api.syncAtlasDemography).not.toHaveBeenCalled();
    expect(api.syncAtlasMarket).not.toHaveBeenCalled();
  });
  it("trennt Theorieabdeckung von vorhandenen Datenbildern", async () => {
    mount(
      "/world-atlas?view=coverage&coverageSearch=Kondratjew&coverageStatus=available",
    );
    await screen.findByText("Für diese Filter sind keine Themen vorhanden.");
    fireEvent.change(screen.getByLabelText("Datenstatus eingrenzen"), {
      target: { value: "all" },
    });
    await screen.findByText(/Eine belegte Theorieansicht ist vorhanden/);
    expect(
      screen.queryByRole("img", { name: /Frei gezeichnete lange Welle/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Theoriemodell öffnen · Kondratjew-Hypothesen",
      }),
    );
    await screen.findByRole("button", { name: "Modellbild erkunden" });
    expect(
      screen.queryByRole("img", { name: /Frei gezeichnete lange Welle/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Modellbild erkunden" }),
    );
    await screen.findByRole("img", { name: /Frei gezeichnete lange Welle/ });
    expect(
      screen.getByText(/Die These liefert hier keinen geprüften Kalender/),
    ).toBeTruthy();
    expect(
      screen.getByText("The Long Waves in Economic Life").getAttribute("href"),
    ).toBe("https://www.jstor.org/stable/1928486");
  });
  it("behandelt ungültige Modellparameter ruhig und öffnet einen neuen Modelltyp geschlossen", async () => {
    mount(
      "/world-atlas?topic=cycle_hypotheses%3Ainnovation_waves&hypothesis=cycle_hypotheses%3Ainnovation_waves&cycleStep=unknown&fromCycle=untrusted",
    );
    await screen.findByRole("img", { name: /Schematische S-Kurve/ });
    expect(
      screen
        .getByRole("button", { name: "Erproben" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: /Zur Zyklusthese zurück/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Säkulare und Jahrhundertzyklus-Hypothesen",
      }),
    );
    await screen.findByRole("button", { name: "Modellbild erkunden" });
    expect(
      screen.queryByRole("img", { name: /Mehrere mögliche gesellschaftliche/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Modellbild erkunden" }),
    );
    await screen.findByRole("img", {
      name: /Mehrere mögliche gesellschaftliche/,
    });
    expect(screen.getByText(/nicht streng periodisch/)).toBeTruthy();
    expect(api.atlasSeries).not.toHaveBeenCalled();
  });
  it("zeigt Datenabdeckung ohne Downloads, öffnet die genaue Statistik und erhält Vergleich und Filter", async () => {
    vi.mocked(api.atlasSeries).mockImplementation(async (input) =>
      input.seriesId === "worldbank:2:SE.ADT.LITR.ZS"
        ? { ...browserAtlasSeries(input), status: "empty" }
        : available(input),
    );
    mount(
      "/world-atlas?view=coverage&region=Europe&area=m49%3A276&compare=m49%3A840&coverageDomain=people&coverageSearch=Alphabetisierung",
    );
    await screen.findByRole("button", {
      name: /Alphabetisierung.*Startansicht ohne nutzbare Werte.*Perspektive öffnen/,
    });
    expect(api.atlasSeries).toHaveBeenCalledTimes(atlasCatalog.series.length);
    expect(api.syncAtlasSeries).not.toHaveBeenCalled();
    expect(api.syncAtlasStatisticsBatch).not.toHaveBeenCalled();
    expect(api.syncAtlasDemography).not.toHaveBeenCalled();
    expect(api.syncAtlasEnergy).not.toHaveBeenCalled();
    expect(api.syncAtlasHistory).not.toHaveBeenCalled();
    expect(api.syncAtlasMarket).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Land vergleichen")).toBeNull();
    fireEvent.change(screen.getByLabelText("Datenstatus eingrenzen"), {
      target: { value: "available" },
    });
    await screen.findByText("Für diese Filter sind keine Themen vorhanden.");
    fireEvent.change(
      screen.getByLabelText("Thema in der Datenabdeckung suchen"),
      { target: { value: "Zugang zur Abschlussklasse" } },
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Grundschule · Zugang zur Abschlussklasse.*Perspektive öffnen/,
      }),
    );
    await screen.findByRole("heading", {
      name: "Grundschule · Zugang zur Abschlussklasse (Brutto)",
    });
    expect(
      (screen.getByLabelText("Statistik auswählen") as HTMLSelectElement).value,
    ).toBe("worldbank:2:SE.PRM.CMPT.ZS");
    expect(
      (screen.getByLabelText("Land vergleichen") as HTMLSelectElement).value,
    ).toBe("m49:840");
    fireEvent.click(screen.getByRole("button", { name: "Daten & Quellen" }));
    expect(
      (
        screen.getByLabelText(
          "Thema in der Datenabdeckung suchen",
        ) as HTMLInputElement
      ).value,
    ).toBe("Zugang zur Abschlussklasse");
    expect(
      (screen.getByLabelText("Datenstatus eingrenzen") as HTMLSelectElement)
        .value,
    ).toBe("available");
  });

  it("öffnet einen globalen Wasserstofffonds nur mit ausdrücklich anderem Gebiet", async () => {
    mount(
      "/world-atlas?view=coverage&region=Asia&area=m49%3A356&compare=m49%3A156&coverageSearch=Wasserstoff",
    );
    fireEvent.click(
      within(
        await screen.findByRole("region", {
          name: atlasCatalog.topics.find(
            (topic) => topic.id === "fuels:hydrogen",
          )!.label,
        }),
      ).getByRole("button", {
        name: /Wasserstoff.*Nur für ein anderes Gebiet angebunden.*Perspektive öffnen/i,
      }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
      ).toBe("world"),
    );
    expect(
      (screen.getByLabelText("Land vergleichen") as HTMLSelectElement).value,
    ).toBe("");
    const proxy = atlasMarketProxies.find((p) => p.symbol === "HYDR.US")!;
    await waitFor(() => expect(api.atlasMarket).toHaveBeenCalledWith(proxy.id));
    expect(api.syncAtlasMarket).not.toHaveBeenCalled();
  });

  it("wertet eine ähnliche verfügbare Reihe nicht als Treffer für eine fehlende gesuchte Messgröße", async () => {
    vi.mocked(api.atlasSeries).mockImplementation(async (input) =>
      input.seriesId === "worldbank:2:SH.H2O.SMDW.ZS"
        ? { ...browserAtlasSeries(input), status: "empty" }
        : available(input),
    );
    mount(
      "/world-atlas?view=coverage&region=Asia&area=m49%3A156&coverageSearch=Sicher%20bewirtschaftete%20Trinkwasserversorgung&coverageStatus=available",
    );
    await waitFor(() =>
      expect(
        screen.getAllByText("Bild lokal vorhanden").length,
      ).toBeGreaterThan(0),
    );
    expect(
      screen.getByText("Für diese Filter sind keine Themen vorhanden."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Datenstatus eingrenzen"), {
      target: { value: "all" },
    });
    await screen.findByRole("button", {
      name: /Sicher bewirtschaftete.*Startansicht ohne nutzbare Werte.*Perspektive öffnen/,
    });
    expect(
      screen.queryByRole("button", {
        name: /Grundversorgung.*Perspektive öffnen/,
      }),
    ).toBeNull();
  });

  it("zeigt Quellenregionen als bewussten Wechsel und ersetzt ein UN-Gebiet nicht stillschweigend", async () => {
    mount(
      "/world-atlas?view=coverage&region=Africa&area=un-wpp%3A903&compare=m49%3A276",
    );
    const energy = within(
      screen
        .getByRole("heading", { name: "Stromwirtschaft · Ember" })
        .closest("article")!,
    );
    expect(energy.getByText("Kein zugeordnetes Quellengebiet")).toBeTruthy();
    fireEvent.click(energy.getByText("Andere Quellengebiete ansehen"));
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
    ).toBe("un-wpp:903");
    fireEvent.click(
      energy.getByRole("button", { name: "Afrika · Ember-Region" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
      ).toBe("ember:africa"),
    );
    expect(
      (screen.getByLabelText("Land vergleichen") as HTMLSelectElement).value,
    ).toBe("");
    await waitFor(() =>
      expect(api.atlasEnergy).toHaveBeenCalledWith("ember:africa"),
    );
    expect(api.syncAtlasEnergy).not.toHaveBeenCalled();
  });

  it("ordnet die Länderübersicht nach Gruppen und öffnet die konkrete Statistik mit Land und Vergleich", async () => {
    vi.mocked(api.atlasSeries).mockImplementation(async (input) =>
      available(input),
    );
    mount(
      "/world-atlas?view=statistics&region=Asia&area=m49%3A356&compare=m49%3A156&statDomain=people&statGroup=education",
    );
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(9));
    const cards = screen.getAllByRole("button", { name: /Statistik öffnen/ });
    expect(cards[0].textContent).toContain("Frühkindliche Bildung");
    expect(cards[1].textContent).toContain("Grundschule");
    expect(screen.getAllByText("Gemeinsames Bild: 2000–2002")).toHaveLength(9);
    expect(api.atlasSeries).toHaveBeenCalledTimes(18);
    expect(screen.queryByRole("table")).toBeNull();
    expect(api.atlasMarket).not.toHaveBeenCalled();
    expect(api.atlasDemography).not.toHaveBeenCalled();
    expect(api.syncAtlasStatisticsBatch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Grundschule · Zugang zur Abschlussklasse.*Statistik öffnen/,
      }),
    );
    await screen.findByRole("heading", {
      name: "Grundschule · Zugang zur Abschlussklasse (Brutto)",
    });
    expect(
      (screen.getByLabelText("Statistik auswählen") as HTMLSelectElement).value,
    ).toBe("worldbank:2:SE.PRM.CMPT.ZS");
    expect(
      (screen.getByLabelText("Land vergleichen") as HTMLSelectElement).value,
    ).toBe("m49:156");
    fireEvent.click(screen.getByRole("button", { name: "Länderübersicht" }));
    await screen.findByRole("heading", { name: "Indien im Überblick" });
    expect(
      (screen.getByLabelText("Gruppe eingrenzen") as HTMLSelectElement).value,
    ).toBe("education");
  });

  it("lädt nur die gewählte Statistikgruppe, stoppt gezielt und zeigt Teilerfolge bereits während des Abrufs", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasSeries).mockImplementation(async (input) => ({
      ...browserAtlasSeries(input),
      status: "not_downloaded",
    }));
    const job = {
      id: "statistics-job",
      seriesId: "statistics-overview",
      status: "running" as const,
      page: 0,
      pages: 4,
      observations: 0,
      message: "Statistikgruppe wird geladen",
      startedAt: "2026-09-09T00:00:00Z",
      finishedAt: null,
    };
    vi.mocked(api.syncAtlasStatisticsBatch).mockResolvedValue(job);
    vi.mocked(api.cancelAtlasStatisticsBatch).mockResolvedValue(undefined);
    mount(
      "/world-atlas?view=statistics&area=m49%3A276&statDomain=technology&statGroup=innovation",
    );
    await waitFor(() => expect(api.atlasSeries).toHaveBeenCalledTimes(4));
    fireEvent.click(
      screen.getByRole("button", { name: "Auswahl laden / aktualisieren" }),
    );
    await waitFor(() =>
      expect(api.syncAtlasStatisticsBatch).toHaveBeenCalledWith([
        "worldbank:2:GB.XPD.RSDV.GD.ZS",
        "worldbank:2:SP.POP.SCIE.RD.P6",
        "worldbank:2:IP.PAT.RESD",
        "worldbank:2:IC.BUS.NDNS.ZS",
      ]),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Nach aktueller Statistik stoppen",
      }),
    );
    await waitFor(() =>
      expect(api.cancelAtlasStatisticsBatch).toHaveBeenCalledWith(
        "statistics-job",
      ),
    );
    expect(
      (
        (await screen.findByRole("button", {
          name: "Stoppen vorgemerkt",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const before = vi.mocked(api.atlasSeries).mock.calls.length;
    act(() =>
      client.setQueryData(["atlas", "job"], {
        ...job,
        page: 1,
        message: "Forschungsreihe gespeichert",
      }),
    );
    await waitFor(() =>
      expect(vi.mocked(api.atlasSeries).mock.calls.length).toBeGreaterThan(
        before,
      ),
    );
    const partial = vi.mocked(api.atlasSeries).mock.calls.length;
    act(() =>
      client.setQueryData(["atlas", "job"], {
        ...job,
        page: 1,
        status: "failed",
        message: "Quelle abgelehnt; Teilerfolg bleibt erhalten",
      }),
    );
    await screen.findByText("Quelle abgelehnt; Teilerfolg bleibt erhalten");
    await waitFor(() =>
      expect(vi.mocked(api.atlasSeries).mock.calls.length).toBeGreaterThan(
        partial,
      ),
    );
    expect(
      screen.queryByRole("button", {
        name: "Nach aktueller Statistik stoppen",
      }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Auswahl laden / aktualisieren",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("bewahrt fehlende und nicht zugeordnete Länderreihen als sichtbare leere Karten", async () => {
    vi.mocked(api.atlasSeries).mockImplementation(async (input) => ({
      ...browserAtlasSeries(input),
      status: input.seriesId.endsWith("SH.H2O.SMDW.ZS")
        ? "empty"
        : "unsupported_area",
    }));
    mount(
      "/world-atlas?view=statistics&region=Asia&area=m49%3A156&statDomain=production&statGroup=food_water",
    );
    await screen.findByRole("button", {
      name: /Sicher bewirtschaftete Trinkwasserversorgung.*keine Werte für dieses Gebiet.*Statistik öffnen/,
    });
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getAllByRole("button", {
        name: /Gebiet in dieser Quelle nicht zugeordnet.*Statistik öffnen/,
      }).length,
    ).toBeGreaterThan(0);
    expect(api.syncAtlasStatisticsBatch).not.toHaveBeenCalled();
  });
  it("trennt Trinkwasserperspektiven und behält eine fehlende sichere Versorgung offen", async () => {
    vi.mocked(api.atlasSeries).mockImplementation(async (input) => ({
      ...available(input),
      ...(input.seriesId.endsWith("SH.H2O.SMDW.ZS") &&
      input.geographyId === "m49:156"
        ? { status: "empty" as const, points: [] }
        : {}),
    }));
    mount(
      "/world-atlas?region=Asia&area=m49%3A156&compare=m49%3A356&topic=food_water%3Adrinking_water",
    );
    await screen.findByText("Keine Werte für dieses Gebiet");
    expect(
      (screen.getByLabelText("Statistik auswählen") as HTMLSelectElement).value,
    ).toBe("worldbank:2:SH.H2O.SMDW.ZS");
    expect(api.atlasSeries).not.toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: "worldbank:2:SH.H2O.BASW.ZS" }),
    );
    fireEvent.change(screen.getByLabelText("Statistik auswählen"), {
      target: { value: "worldbank:2:SH.H2O.BASW.ZS" },
    });
    await screen.findByRole("img", { name: /China und Indien/ });
    expect(api.atlasSeries).toHaveBeenCalledWith({
      seriesId: "worldbank:2:SH.H2O.BASW.ZS",
      geographyId: "m49:356",
    });
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
    ).toBe("m49:156");
    expect(
      screen.getByText(/Daraus folgt keine überall bestätigte Wasserqualität/),
    ).toBeTruthy();
  });

  it("trennt Migrationssaldo, Bestand und Anteil und erhält Indien im Vergleich mit China", async () => {
    mount(
      "/world-atlas?region=Asia&area=m49:356&compare=m49:156&topic=demography:migration",
    );
    await screen.findByText("Atlas-Daten in der Desktop-App laden");
    const select = screen.getByLabelText("Statistik auswählen");
    expect(screen.getByText("Modellschätzungen", { exact: true })).toBeTruthy();
    expect(within(select).getAllByRole("option")).toHaveLength(3);
    expect((select as HTMLSelectElement).value).toBe("worldbank:2:SM.POP.NETM");
    for (const code of ["SM.POP.TOTL", "SM.POP.TOTL.ZS"]) {
      fireEvent.change(select, { target: { value: `worldbank:2:${code}` } });
      await waitFor(() => {
        for (const geographyId of ["m49:356", "m49:156"]) {
          expect(api.atlasSeries).toHaveBeenCalledWith({
            seriesId: `worldbank:2:${code}`,
            geographyId,
          });
        }
      });
    }
    expect(currentParams().get("series")).toBe("worldbank:2:SM.POP.TOTL.ZS");
    expect(currentParams().get("area")).toBe("m49:356");
    expect(currentParams().get("compare")).toBe("m49:156");
    expect(api.atlasDemography).not.toHaveBeenCalled();
    expect(screen.getByText(/UN-Bevölkerung/)).toBeTruthy();
  });

  it("öffnet eine gewählte Bildungsstatistik direkt und verwirft sie beim Wechsel des Themas", async () => {
    mount(
      "/world-atlas?region=Asia&area=m49%3A356&topic=education%3Aprimary_school&series=worldbank%3A2%3ASE.PRM.CMPT.ZS",
    );
    await screen.findByText("Atlas-Daten in der Desktop-App laden");
    expect(
      (screen.getByLabelText("Statistik auswählen") as HTMLSelectElement).value,
    ).toBe("worldbank:2:SE.PRM.CMPT.ZS");
    fireEvent.click(
      screen.getByRole("button", { name: "Weiterführende Bildung" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "WDI-Perspektive · Weltbank" }),
    );
    await waitFor(() =>
      expect(api.atlasSeries).toHaveBeenLastCalledWith({
        seriesId: "worldbank:2:SE.SEC.ENRR",
        geographyId: "m49:356",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Grundbildung" }));
    fireEvent.click(
      screen.getByRole("button", { name: "WDI-Perspektive · Weltbank" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Statistik auswählen") as HTMLSelectElement)
          .value,
      ).toBe("worldbank:2:SE.PRM.ENRR"),
    );
  });

  it("erfindet für fehlende Alphabetisierungswerte keine vollständige Quote", async () => {
    vi.mocked(api.atlasSeries).mockImplementation(async (input) => ({
      ...browserAtlasSeries(input),
      status: "empty",
    }));
    mount(
      "/world-atlas?area=m49%3A276&compare=m49%3A840&topic=education%3Aliteracy&perspective=worldbank",
    );
    await screen.findByText("Keine Werte für dieses Gebiet");
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      vi
        .mocked(api.atlasSeries)
        .mock.calls.every(
          ([input]) => input.seriesId === "worldbank:2:SE.ADT.LITR.ZS",
        ),
    ).toBe(true);
  });
  it("zeigt echte Gebietsprofile für Solar und trennt die Energie- von der Börsenperspektive", async () => {
    vi.mocked(api.atlasEnergy).mockImplementation(
      async (id): Promise<AtlasEnergyResponse> => ({
        ...browserAtlasEnergy(id),
        status: "available",
        profile: {
          geographyId: id,
          providerLabel: "Test",
          aggregate: id.startsWith("ember:"),
          years: [
            {
              year: 2000,
              values: {
                "share.solar": 0,
                "generation.solar": 0,
                "capacity.solar": 0,
              },
            },
            {
              year: 2025,
              values: {
                "share.solar": 5,
                "generation.solar": 40,
                "capacity.solar": 50,
              },
            },
          ],
        },
        provenance: {
          retrievedAt: "2026-09-09T00:00:00Z",
          sourceUpdatedAt: null,
          etag: null,
          source: { url: atlasEnergyCatalog.sourceUrl, sha256: "test" },
          sourceRowCount: 10,
          areaCount: 2,
          yearFirst: 2000,
          yearLast: 2025,
        },
      }),
    );
    mount(
      "/world-atlas?region=Africa&area=ember%3Aafrica&topic=electricity%3Asolar&compare=m49%3A276",
    );
    await screen.findByRole("img", {
      name: /Anteil an der heimischen Stromerzeugung: Afrika.*Deutschland/,
    });
    expect(api.atlasEnergy).toHaveBeenCalledWith("ember:africa");
    expect(api.atlasEnergy).toHaveBeenCalledWith("m49:276");
    expect(api.atlasMarket).not.toHaveBeenCalled();
    expect(api.atlasSeries).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stromerzeugung" }));
    expect(
      screen.getByRole("img", {
        name: /Jährliche Stromerzeugung: Afrika.*Einheit TWh/,
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Zahlen anzeigen"));
    expect(screen.getByText("Stromdaten als Tabelle")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Installierte Leistung",
      }),
    );
    expect(
      screen.getByRole("img", {
        name: /Installierte elektrische Leistung:.*Einheit GW/,
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Börsenlage" }));
    await screen.findByText(
      "Für Afrika · Ember-Region fehlt eine passende Marktreihe",
    );
    expect(api.atlasMarket).not.toHaveBeenCalled();
  });

  it("lädt alle Stromprofile auf ausdrücklichen Abruf und erneuert beide Vergleichsseiten", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasEnergy).mockImplementation(async (id) => ({
      ...browserAtlasEnergy(id),
      status: "not_downloaded",
    }));
    vi.mocked(api.syncAtlasEnergy).mockResolvedValue({
      id: "energy-job",
      seriesId: "ember-yearly-electricity",
      status: "complete",
      page: 2,
      pages: 2,
      observations: 50,
      message: "Stromdaten gespeichert",
      startedAt: "2026-09-09T00:00:00Z",
      finishedAt: "2026-09-09T00:00:01Z",
    });
    mount(
      "/world-atlas?area=m49%3A356&topic=electricity%3Anuclear&compare=m49%3A156",
    );
    await screen.findByText(
      "Die weltweite Stromgrundlage ist noch nicht lokal gespeichert",
    );
    expect(api.syncAtlasEnergy).not.toHaveBeenCalled();
    const before = vi.mocked(api.atlasEnergy).mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", { name: "Stromdaten für alle Länder laden" }),
    );
    await waitFor(() => expect(api.syncAtlasEnergy).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        vi.mocked(api.atlasEnergy).mock.calls.length,
      ).toBeGreaterThanOrEqual(before + 2),
    );
  });

  it("wechselt von einer UN-Region nur ausdrücklich zur eigenen Ember-Definition", async () => {
    vi.mocked(api.atlasEnergy).mockImplementation(async (id) => ({
      ...browserAtlasEnergy(id),
      status: id.startsWith("un-wpp:") ? "unsupported_area" : "not_downloaded",
    }));
    mount(
      "/world-atlas?region=Africa&area=un-wpp%3A903&topic=electricity%3Ageneration_mix",
    );
    await screen.findByText("Keine eigene Ember-Reihe für dieses Gebiet");
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
    ).toBe("un-wpp:903");
    fireEvent.click(
      screen.getByRole("button", { name: "Afrika · Ember-Region öffnen" }),
    );
    await screen.findByText(
      "Die weltweite Stromgrundlage ist noch nicht lokal gespeichert",
    );
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
    ).toBe("ember:africa");
  });

  it("ordnet alle kleinen Marktbilder und öffnet genau den ausgewählten Fonds", async () => {
    mount(
      "/world-atlas?view=markets&region=Asia&area=m49%3A356&topic=education%3Asecondary_school",
    );
    await waitFor(() =>
      expect(api.atlasMarket).toHaveBeenCalledTimes(atlasMarketProxies.length),
    );
    expect(
      screen.getAllByRole("button", { name: /Details öffnen\.$/ }),
    ).toHaveLength(atlasMarketProxies.length);
    expect(screen.queryByLabelText("Land oder Gebiet")).toBeNull();
    expect(api.atlasSeries).not.toHaveBeenCalled();
    expect(api.atlasDemography).not.toHaveBeenCalled();
    expect(api.syncAtlasMarketBatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Globale Energiethemen",
      }),
    );
    expect(
      screen.getAllByRole("button", { name: /Details öffnen\.$/ }),
    ).toHaveLength(4);
    const uranium = atlasMarketProxies.find(
      (proxy) => proxy.symbol === "URA.US",
    )!;
    fireEvent.click(
      screen.getByRole("button", {
        name: (name) => name.startsWith(`${uranium.label}.`),
      }),
    );
    await screen.findByText("Marktwellen in der Desktop-App laden");
    expect(
      (screen.getByLabelText("Markt auswählen") as HTMLSelectElement).value,
    ).toBe(uranium.id);
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
    ).toBe("world");
    fireEvent.change(screen.getByLabelText("Markt auswählen"), {
      target: { value: "eodhd:NLR.US" },
    });
    await waitFor(() =>
      expect(api.atlasMarket).toHaveBeenLastCalledWith("eodhd:NLR.US"),
    );
  });

  it("lädt nur die ausgewählte Marktgruppe und aktualisiert auch teilweise abgeschlossene Bilder", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasMarket).mockImplementation(async (id) => ({
      ...browserAtlasMarket(id),
      status: "not_downloaded",
    }));
    const job = {
      id: "batch-job",
      seriesId: "market-overview",
      status: "running" as const,
      page: 0,
      pages: 4,
      observations: 0,
      message: "Marktbilder werden geladen",
      startedAt: "2026-09-08T00:00:00Z",
      finishedAt: null,
    };
    vi.mocked(api.syncAtlasMarketBatch).mockResolvedValue(job);
    vi.mocked(api.cancelAtlasMarketBatch).mockResolvedValue(undefined);
    mount("/world-atlas?view=markets");
    await waitFor(() =>
      expect(api.atlasMarket).toHaveBeenCalledTimes(atlasMarketProxies.length),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Globale Energiethemen",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Auswahl laden / aktualisieren" }),
    );
    await waitFor(() =>
      expect(api.syncAtlasMarketBatch).toHaveBeenCalledWith([
        "eodhd:HYDR.US",
        "eodhd:TAN.US",
        "eodhd:NLR.US",
        "eodhd:URA.US",
      ]),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Nach aktuellem Fonds stoppen",
      }),
    );
    await waitFor(() =>
      expect(api.cancelAtlasMarketBatch).toHaveBeenCalledWith("batch-job"),
    );
    expect(
      (
        (await screen.findByRole("button", {
          name: "Stoppen vorgemerkt",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const before = vi.mocked(api.atlasMarket).mock.calls.length;
    act(() => {
      client.setQueryData(["atlas", "job"], {
        ...job,
        page: 1,
        observations: 100,
        message: "Ein Markt gespeichert",
      });
    });
    await waitFor(() =>
      expect(vi.mocked(api.atlasMarket).mock.calls.length).toBeGreaterThan(
        before,
      ),
    );
    const partial = vi.mocked(api.atlasMarket).mock.calls.length;
    act(() => {
      client.setQueryData(["atlas", "job"], {
        ...job,
        status: "interrupted",
        page: 1,
        message: "Auswahl gestoppt",
      });
    });
    await screen.findByText("Auswahl gestoppt");
    await waitFor(() =>
      expect(vi.mocked(api.atlasMarket).mock.calls.length).toBeGreaterThan(
        partial,
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Nach aktuellem Fonds stoppen" }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Auswahl laden / aktualisieren",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(api.syncAtlasMarket).not.toHaveBeenCalled();
  });

  it("zeigt lokale Lesefehler auf der betroffenen Karte und liest nach einem fehlgeschlagenen Abruf neu", async () => {
    vi.mocked(api.atlasMarket).mockImplementation(async (id) => {
      if (id === "eodhd:TAN.US")
        throw new Error("Die Quelle ist nicht lesbar.");
      return browserAtlasMarket(id);
    });
    mount("/world-atlas?view=markets");
    await screen.findByText("Die Quelle ist nicht lesbar.");
    expect(
      screen.getByRole("button", {
        name: /Solarunternehmen.*Lokaler Lesefehler/,
      }),
    ).toBeTruthy();
    const before = vi.mocked(api.atlasMarket).mock.calls.length;
    act(() => {
      client.setQueryData(["atlas", "job"], {
        id: "failed-batch",
        seriesId: "market-overview",
        status: "failed",
        page: 1,
        pages: 2,
        observations: 1,
        message: "Zweiter Fonds fehlgeschlagen",
        startedAt: "2026-09-08T00:00:00Z",
        finishedAt: "2026-09-08T00:00:05Z",
      });
    });
    await waitFor(() =>
      expect(vi.mocked(api.atlasMarket).mock.calls.length).toBeGreaterThan(
        before,
      ),
    );
    expect(
      screen.getByText("Zweiter Fonds fehlgeschlagen").getAttribute("role"),
    ).toBe("alert");
  });
  it("zeigt historische Zeiträume und Zahlen bewusst mit gemeinsamem Vergleich", async () => {
    vi.mocked(api.atlasHistory).mockImplementation(async (id) => ({
      ...browserAtlasHistory(id),
      status: "available",
      provenance: {
        revision: "Test",
        retrievedAt: "2026-09-08T00:00:00Z",
        pages: [],
        areaCount: 2,
        sourceRowCount: 1,
        excludedAreas: [],
      },
      profile: {
        geographyId: id,
        providerLabel: "Test",
        notes: [],
        points: [1500, 1820, 1950, 2022].map((year) => ({
          year,
          gdpPerCapita: 1000,
          gdp: 100000,
          worldGdpShare: null,
        })),
      },
    }));
    mount(
      "/world-atlas?area=m49%3A276&compare=m49%3A356&topic=long_history%3Along_run_prosperity",
    );
    await screen.findByRole("img", {
      name: /Deutschland und Indien, 1820 bis 2022/,
    });
    expect(api.atlasSeries).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Alle Quellenjahre" }));
    expect(screen.getByRole("img", { name: /1500 bis 2022/ })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Proportionale Entwicklung"));
    expect(screen.getByRole("img", { name: /Gleiche Abstände/ })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Zahlen anzeigen"));
    expect(screen.getByText("Historische Werte als Tabelle")).toBeTruthy();
  });
  it("lädt die historische Grundlage gemeinsam und invalidiert die Länderansichten", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasHistory).mockImplementation(async (id) => ({
      ...browserAtlasHistory(id),
      status: "not_downloaded",
    }));
    vi.mocked(api.syncAtlasHistory).mockResolvedValue({
      id: "history-job",
      seriesId: "maddison-2023-owid",
      status: "complete",
      page: 3,
      pages: 3,
      observations: 1,
      message: "Historie gespeichert",
      startedAt: "2026-09-08T00:00:00Z",
      finishedAt: "2026-09-08T00:00:05Z",
    });
    mount(
      "/world-atlas?area=m49%3A276&compare=m49%3A356&topic=long_history%3Along_run_prosperity",
    );
    await screen.findByText(
      "Die historische Grundlage ist noch nicht lokal gespeichert",
    );
    const before = vi.mocked(api.atlasHistory).mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", {
        name: "Historische Daten für alle Länder laden",
      }),
    );
    await waitFor(() => expect(api.syncAtlasHistory).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        vi.mocked(api.atlasHistory).mock.calls.length,
      ).toBeGreaterThanOrEqual(before + 2),
    );
  });
  it("öffnet UN-Szenarien bewusst und verwendet für beide Länder dasselbe Jahr", async () => {
    vi.mocked(api.atlasDemography).mockImplementation(
      async (id): Promise<AtlasDemographyResponse> => ({
        ...browserAtlasDemography(id),
        status: "available",
        provenance: {
          revision: "Test",
          retrievedAt: "2026-09-08T00:00:00Z",
          estimateEnd: 2023,
          projectionStart: 2024,
          areaCount: 2,
          sourceRowCount: 1,
          pages: [],
        },
        profile: {
          geographyId: id,
          providerId: "test",
          providerLabel: "Test",
          notes: [],
          years: [1950, 2023, 2024, 2100].map((year) => ({
            year,
            kind: year <= 2023 ? "estimate" : "projection",
            ages: Array.from({ length: 21 }, (_, i) => ({
              ageStart: i * 5,
              male: 40,
              female: 60,
              total: 100,
            })),
          })),
        },
      }),
    );
    mount(
      "/world-atlas?area=m49%3A276&compare=m49%3A356&topic=demography%3Aage_structure",
    );
    await screen.findByRole("img", { name: /Indien: Altersstruktur 2023/ });
    expect(screen.getAllByRole("img").length).toBe(2);
    expect(
      (
        screen.getByLabelText(
          "UN-Szenario bis 2100 einblenden",
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect((screen.getByRole("slider") as HTMLInputElement).max).toBe("1");
    expect(api.atlasSeries).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("UN-Szenario bis 2100 einblenden"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(screen.getByText("Mittleres UN-Szenario · 2024")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /Deutschland: Altersstruktur 2024/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /Indien: Altersstruktur 2024/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByLabelText("UN-Szenario bis 2100 einblenden"));
    expect(screen.getByText("Historische UN-Schätzung · 2023")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anteil 65+ · UN" }));
    expect(currentParams().get("perspective")).toBe("un-age65");
    expect(currentParams().get("demoProjection")).toBe("0");
    expect(
      (
        screen.getByLabelText(
          "UN-Szenario bis 2100 einblenden",
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
    vi.mocked(api.atlasSeries).mockImplementation(async (input) => ({
      ...browserAtlasSeries(input),
      status: "unsupported_area",
    }));
    fireEvent.click(
      screen.getByRole("button", { name: "Anteil 65+ · Weltbank" }),
    );
    await screen.findByText("Gebiet in dieser Quelle nicht enthalten");
    expect(api.atlasSeries).toHaveBeenCalledWith({
      seriesId: "worldbank:2:SP.POP.65UP.TO.ZS",
      geographyId: "m49:276",
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Anteil ab 65 Jahren aus UN-Daten anzeigen",
      }),
    );
    expect(currentParams().get("area")).toBe("m49:276");
    expect(currentParams().get("perspective")).toBe("un-age65");
    fireEvent.click(screen.getByRole("button", { name: "Altersprofil · UN" }));
    await screen.findByRole("img", {
      name: /Deutschland: Altersstruktur 2023/,
    });
  });

  it("lädt Demografie gemeinsam und invalidiert beide Länderprofile", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasDemography).mockImplementation(async (id) => ({
      ...browserAtlasDemography(id),
      status: "not_downloaded",
    }));
    vi.mocked(api.syncAtlasDemography).mockResolvedValue({
      id: "un-job",
      seriesId: "un-wpp-2024-age5",
      status: "complete",
      page: 5,
      pages: 5,
      observations: 1,
      message: "UN-Profile gespeichert",
      startedAt: "2026-09-08T00:00:00Z",
      finishedAt: "2026-09-08T00:00:05Z",
    });
    mount(
      "/world-atlas?area=m49%3A276&compare=m49%3A356&topic=demography%3Aage_structure",
    );
    await screen.findByText(
      "Die UN-Altersprofile sind noch nicht lokal gespeichert",
    );
    const before = vi.mocked(api.atlasDemography).mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", { name: "UN-Profile für alle Länder laden" }),
    );
    await waitFor(() => expect(api.syncAtlasDemography).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        vi.mocked(api.atlasDemography).mock.calls.length,
      ).toBeGreaterThanOrEqual(before + 2),
    );
  });
  it("öffnet globale Themen nur nach ausdrücklichem Gebietswechsel", async () => {
    mount(
      "/world-atlas?region=Africa&area=m49%3A710&topic=electricity%3Asolar&perspective=market",
    );
    await screen.findByText("Für Südafrika fehlt eine passende Marktreihe");
    expect(api.atlasMarket).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Globales Themenbild öffnen" }),
    );
    await screen.findByText("Marktwellen in der Desktop-App laden");
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
    ).toBe("world");
    expect(api.atlasMarket).toHaveBeenCalledWith("eodhd:TAN.US");
    expect(api.syncAtlasMarket).not.toHaveBeenCalled();
  });

  it("lädt Marktgeschichten gezielt und invalidiert den betroffenen Datenstand", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasMarket).mockImplementation(async (id) => ({
      ...browserAtlasMarket(id),
      status: "not_downloaded",
    }));
    vi.mocked(api.syncAtlasMarket).mockResolvedValue({
      id: "market-job",
      seriesId: "eodhd:INDA.US",
      status: "complete",
      page: 1,
      pages: 1,
      observations: 170,
      message: "Die Marktgeschichte ist lokal verfügbar.",
      startedAt: "2026-09-08T00:00:00Z",
      finishedAt: "2026-09-08T00:00:01Z",
    });
    mount(
      "/world-atlas?region=Asia&area=m49%3A356&topic=market_context%3Acountry_equities",
    );
    await screen.findByText(
      "Die Marktgeschichte ist noch nicht lokal gespeichert",
    );
    const before = vi.mocked(api.atlasMarket).mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", { name: "Marktgeschichte laden" }),
    );
    await waitFor(() =>
      expect(api.syncAtlasMarket).toHaveBeenCalledWith("eodhd:INDA.US"),
    );
    await waitFor(() =>
      expect(vi.mocked(api.atlasMarket).mock.calls.length).toBeGreaterThan(
        before,
      ),
    );
  });
  it("macht den Browsermodus kenntlich und ermöglicht weltweite Themennavigation", async () => {
    mount(
      "/world-atlas?region=Asia&area=m49%3A356&topic=education%3Asecondary_school",
    );
    await screen.findByText(
      /Diese kostenlosen Originaldaten lassen sich in der Desktop-App/,
    );
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement)
        .selectedOptions[0].text,
    ).toBe("Indien");
    fireEvent.change(screen.getByLabelText("Thema suchen"), {
      target: { value: "Kernenergie" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Kernenergie/ }));
    expect(screen.getByRole("heading", { name: "Kernenergie" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(api.syncAtlasSeries).not.toHaveBeenCalled();
  });

  it("hält eine Region und die auswählbaren Länder konsistent", async () => {
    mount("/world-atlas?region=Asia&area=m49%3A356");
    fireEvent.change(screen.getByLabelText("Region"), {
      target: { value: "Africa" },
    });
    const selected = (
      screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement
    ).value;
    expect(
      atlasCatalog.geographies.find((area) => area.id === selected)?.regionId,
    ).toBe("Africa");
    await waitFor(() =>
      expect(api.atlasSeries).toHaveBeenLastCalledWith(
        expect.objectContaining({ geographyId: selected }),
      ),
    );
  });

  it("behält rasch gewählte Länder auch bei einem unmittelbar folgenden Themenwechsel", async () => {
    mount("/world-atlas?region=Asia&area=m49%3A004&topic=electricity%3Asolar");
    await screen.findByText("Stromdaten in der Desktop-App laden");
    act(() => {
      fireEvent.change(screen.getByLabelText("Land oder Gebiet"), {
        target: { value: "m49:356" },
      });
      fireEvent.change(screen.getByLabelText("Land vergleichen"), {
        target: { value: "m49:156" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Kernenergie" }));
    });
    await screen.findByRole("heading", { name: "Kernenergie" });
    expect(
      (screen.getByLabelText("Land oder Gebiet") as HTMLSelectElement).value,
    ).toBe("m49:356");
    expect(
      (screen.getByLabelText("Land vergleichen") as HTMLSelectElement).value,
    ).toBe("m49:156");
    await waitFor(() =>
      expect(api.atlasEnergy).toHaveBeenCalledWith("m49:156"),
    );
  });

  it("öffnet die BIS-Kreditgeschichte auch bei einem alten Börsenparameter", async () => {
    mount(
      "/world-atlas?region=Europe&area=m49:276&topic=long_history:long_run_credit&perspective=market",
    );
    expect(
      await screen.findByRole("button", { name: "Welle um den Trend" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(api.atlasCredit).toHaveBeenCalledWith("m49:276"),
    );
  });

  it("wechselt bewusst zwischen Weltbank-Kreditquote und BIS-Kreditbild", async () => {
    mount(
      "/world-atlas?region=Europe&area=m49:276&topic=finance:credit_growth&perspective=worldbank",
    );
    const bank = await screen.findByRole("button", {
      name: "Inlandskredit · Weltbank",
    });
    expect(bank.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() =>
      expect(api.atlasSeries).toHaveBeenCalledWith({
        seriesId: "worldbank:2:FS.AST.PRVT.GD.ZS",
        geographyId: "m49:276",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Kreditwelle · BIS" }));
    expect(
      await screen.findByRole("button", { name: "Welle um den Trend" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(api.atlasCredit).toHaveBeenCalledWith("m49:276"),
    );
    fireEvent.click(bank);
    expect(
      screen.queryByRole("button", { name: "Welle um den Trend" }),
    ).toBeNull();
    expect(bank.getAttribute("aria-pressed")).toBe("true");
  });

  it("zeigt Bilder zunächst ohne Zahlentabelle und öffnet Zahlen bewusst", async () => {
    vi.mocked(api.atlasSeries).mockImplementation(async (input) =>
      available(input),
    );
    mount("/world-atlas?area=m49%3A276&compare=m49%3A840");
    await screen.findByRole("img", {
      name: /Deutschland und Vereinigte Staaten/,
    });
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByLabelText("Zahlen anzeigen"));
    expect(screen.getByText("Werte als Tabelle")).toBeTruthy();
    fireEvent.click(screen.getByText("Werte als Tabelle"));
    expect(screen.getAllByText("Nicht verfügbar").length).toBeGreaterThan(0);
  });

  it("aktualisiert den passenden Cache nach einem abgeschlossenen nativen Abruf", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(api.atlasSeries).mockImplementation(async (input) =>
      vi.mocked(api.syncAtlasSeries).mock.calls.length
        ? available(input)
        : {
            ...available(input),
            status: "not_downloaded",
            points: [],
          },
    );
    vi.mocked(api.syncAtlasSeries).mockResolvedValue({
      id: "job",
      seriesId: "worldbank:2:SP.POP.TOTL",
      status: "complete",
      page: 4,
      pages: 4,
      observations: 100,
      message: "Länderdaten gespeichert",
      startedAt: "2026-09-08T00:00:00Z",
      finishedAt: "2026-09-08T00:00:05Z",
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Für alle Länder laden" }),
    );
    await waitFor(() =>
      expect(api.syncAtlasSeries).toHaveBeenCalledWith(
        "worldbank:2:SP.POP.TOTL",
      ),
    );
    await waitFor(() =>
      expect(vi.mocked(api.atlasSeries).mock.calls.length).toBeGreaterThan(1),
    );
    expect(await screen.findByText("Länderdaten gespeichert")).toBeTruthy();
  });
});

describe("Haushalte im Weltatlas", () => {
  it("zeigt einzelne Quellen, persistiert ihre Auswahl und hält fehlende Werte leer", async () => {
    const household: AtlasHouseholdsResponse = {
      ...browserAtlasHouseholds("m49:276"),
      status: "available",
      profile: {
        geographyId: "m49:276",
        providerCode: "DEU",
        providerLabels: ["Germany"],
        observations: [
          {
            recordId: "unhh2026:6",
            sourceRow: 6,
            year: 2011,
            sourceCategory: "DYB",
            sourceCatalogId: "10",
            sourceName: "Synthetische Volkszählung",
            unweighted: false,
            values: {
              averageSize: 2.14,
              size1: 0,
              onePerson: null,
              nuclear: 55,
            },
          },
          {
            recordId: "unhh2026:7",
            sourceRow: 7,
            year: 2011,
            sourceCategory: "LFS",
            sourceCatalogId: "11",
            sourceName: "Synthetische Befragung",
            unweighted: false,
            values: {
              averageSize: 2.05,
              size1: 35,
              onePerson: 35,
              nuclear: null,
            },
          },
        ],
      },
      provenance: {
        retrievedAt: "2026-09-09T12:00:00Z",
        fileModifiedAt: null,
        url: householdCfg.url,
        sha256: householdCfg.sha256,
        release: householdCfg.release,
        recipe: householdCfg.recipe,
        sourceRowCount: 1129,
        numericCellCount: 36142,
        areaCount: 200,
      },
    };
    vi.mocked(api.atlasHouseholds).mockImplementation(async (id) =>
      id === "m49:276" ? household : browserAtlasHouseholds(id),
    );
    mount("/world-atlas?topic=demography:households&area=m49:276");
    expect(
      await screen.findByRole("img", {
        name: /Menschen pro Haushalt: einzelne Erhebungen/,
      }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Zahlen anzeigen",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    const select = screen.getByRole("combobox", {
      name: "Erhebung für Deutschland",
    });
    expect((select as HTMLSelectElement).value).toBe("unhh2026:6");
    fireEvent.change(select, { target: { value: "unhh2026:7" } });
    await waitFor(() =>
      expect(screen.getByTestId("atlas-url").textContent).toContain(
        "hhRecord=unhh2026%3A7",
      ),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Zahlen anzeigen" }));
    expect(
      screen.getByRole("img", {
        name: /Menschen pro Haushalt in Deutschland, 2011: 2,05/,
      }),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Haushaltsbilder ordnen" }),
      { target: { value: "generations" } },
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Haushaltsperspektive",
          }) as HTMLSelectElement
        ).value,
      ).toBe("nuclear"),
    );
    expect(screen.getByText(/können sich überschneiden/)).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Erhebung für Deutschland" }),
      { target: { value: "unhh2026:7" } },
    );
    expect(
      screen.getByRole("img", {
        name: /Kernfamilienhaushalte in Deutschland, 2011: nicht verfügbar/,
      }),
    ).toBeTruthy();
    expect(api.atlasSeries).not.toHaveBeenCalled();
    expect(api.atlasDemography).not.toHaveBeenCalled();
  });
  it("führt von einem fehlenden Weltaggregat zu einem benannten Land", async () => {
    vi.mocked(api.atlasHouseholds).mockImplementation(async (id) => ({
      ...browserAtlasHouseholds(id),
      status: "unsupported_area",
    }));
    mount("/world-atlas?topic=demography:households&area=world");
    expect(
      await screen.findByRole("heading", {
        name: "Für dieses Gebiet fehlt ein eigenes Haushaltsprofil",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Indien öffnen" }));
    await waitFor(() =>
      expect(api.atlasHouseholds).toHaveBeenCalledWith("m49:356"),
    );
    expect(screen.getByTestId("atlas-url").textContent).toContain(
      "region=Asia",
    );
  });
});
