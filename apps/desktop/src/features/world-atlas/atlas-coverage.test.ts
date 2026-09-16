import { describe, expect, it } from "vitest";
import {
  browserAtlasDemography,
  browserAtlasEnergy,
  browserAtlasHistory,
  browserAtlasMarket,
  browserAtlasSeries,
} from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import { atlasPublicCatalog } from "./atlas-public";
import { atlasEnergyCatalog } from "./atlas-energy";
import { atlasMarketProxies } from "./atlas-markets";
import {
  atlasCoverageMapping,
  coverageAlternatives,
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
  coverageTopicStatus,
  type CoverageInputs,
} from "./atlas-coverage";

const blank = (): CoverageInputs => ({
  series: {},
  demography: {},
  history: {},
  energy: {},
  markets: {},
});
const find = (
  input: CoverageInputs,
  topic: string,
  family = "statistics",
  area = "m49:276",
) =>
  coverageOptions(area, input).find(
    (o) => o.topicId === topic && o.family === family,
  )!;

describe("Atlas-Abdeckung", () => {
  it("hält Branchenbewertungen an ihre tatsächliche Quellenregion gebunden", () => {
    const india = coverageOptions("m49:356", blank()).find(
      (o) =>
        o.family === "valuation" &&
        o.topicId === "education:education_business",
    )!;
    expect(india.target).toMatchObject({
      view: "valuation",
      valMode: "industries",
      valScope: "india",
      valBasis: "pbv",
      valTopic: "education:education_business",
      valPage: "",
      valSearch: "",
    });
    const germany = coverageOptions("m49:276", blank()).find(
      (o) =>
        o.family === "valuation" &&
        o.topicId === "education:education_business",
    )!;
    expect(germany.status).toBe("elsewhere");
    expect(germany.target.valScope).toBe("global");
    const chemicals = coverageOptions("m49:156", blank()).filter(
      (option) =>
        option.family === "valuation" &&
        option.topicId === "industry:chemicals",
    );
    expect(chemicals).toHaveLength(3);
    expect(
      chemicals.every(
        (option) =>
          option.target.valTopic === "industry:chemicals" &&
          option.target.valScope === "china",
      ),
    ).toBe(true);
    expect(
      coverageOptions("m49:356", blank()).filter(
        (o) =>
          o.family === "valuation" &&
          [
            "electricity:solar",
            "electricity:nuclear",
            "fuels:hydrogen",
          ].includes(o.topicId),
      ),
    ).toEqual([]);
    expect(coverageFamilyTarget("valuation", "m49:276")).toMatchObject({
      view: "valuation",
      area: "m49:276",
      valMode: "countries",
    });
  });
  it("hält den geprüften Katalog vollständig und Regionen sowie Kanalinseln getrennt", () => {
    expect(atlasCoverageMapping.catalogVersion).toBe(atlasCatalog.version);
    expect(new Set(atlasCoverageMapping.families.markets)).toEqual(
      new Set(atlasMarketProxies.map((proxy) => proxy.geographyId)),
    );
    for (const [family, ids] of Object.entries(atlasCoverageMapping.families)) {
      expect(new Set(ids).size, family).toBe(ids.length);
      for (const id of ids)
        expect(
          atlasCatalog.geographies.some((g) => g.id === id),
          id,
        ).toBe(true);
      if (family.startsWith("public:")) {
        const source = atlasPublicCatalog.sources.find(
          (s) => `public:${s.id}` === family,
        )!;
        expect(new Set(ids)).toEqual(
          new Set(source.areas.map((a) => a.geographyId)),
        );
      } else {
        for (const id of ["m49:276", "m49:840", "m49:356", "m49:156"])
          expect(ids.includes(id), family).toBe(
            family !== "macrohistory" || ["m49:276", "m49:840"].includes(id),
          );
      }
    }
    expect(coverageMapped("energy", "un-wpp:903")).toBe(false);
    expect(coverageMapped("demography", "ember:africa")).toBe(false);
    expect(coverageMapped("statistics", "m49:832")).toBe(false);
    expect(coverageMapped("statistics", "m49:831")).toBe(false);
    expect(
      coverageAlternatives("energy", "un-wpp:903").map((a) => a.id),
    ).toEqual(["ember:africa", "world"]);
    expect(coverageFamilyTarget("energy", "ember:africa")).toMatchObject({
      area: "ember:africa",
      region: "Africa",
      topic: "electricity:generation_mix",
    });
  });
  it("zählt echte Nullwerte und negative Werte, aber keine leeren Zeilen oder Browserzustände als Bild", () => {
    const input = blank();
    const seriesId = "worldbank:2:SP.POP.TOTL";
    input.series[seriesId] = {
      data: {
        ...browserAtlasSeries({ seriesId, geographyId: "m49:276" }),
        status: "available",
        points: [
          { year: 2020, value: null, sourceFlag: "" },
          { year: 2021, value: 0, sourceFlag: "" },
          { year: 2022, value: -5, sourceFlag: "" },
        ],
      },
    };
    const option = find(input, "demography:population");
    expect(option.status).toBe("available");
    expect(option.years).toEqual([2021, 2022]);
    input.series[seriesId].data!.points = [];
    expect(find(input, "demography:population").status).toBe("empty");
    input.series[seriesId] = {
      data: browserAtlasSeries({ seriesId, geographyId: "m49:276" }),
    };
    expect(find(input, "demography:population").status).toBe(
      "desktop_required",
    );
    input.series[seriesId] = { error: new Error("Test") };
    expect(find(input, "demography:population").status).toBe("error");
    expect(coverageTopicStatus([])).toBe("unbound");
  });
  it("prüft die tatsächliche Darstellbarkeit statt nur das Vorhandensein eines Profils", () => {
    const input = blank();
    input.demography = {
      data: {
        ...browserAtlasDemography("m49:276"),
        status: "available",
        provenance: {
          revision: "Test",
          retrievedAt: "2026-09-09",
          estimateEnd: 2023,
          projectionStart: 2024,
          pages: [],
          areaCount: 1,
          sourceRowCount: 21,
        },
        profile: {
          geographyId: "m49:276",
          providerId: "276",
          providerLabel: "Germany",
          notes: [],
          years: [
            {
              year: 2024,
              kind: "projection",
              ages: Array.from({ length: 21 }, (_, index) => ({
                ageStart: index * 5,
                male: 1,
                female: null,
                total: 2,
              })),
            },
          ],
        },
      },
    };
    expect(find(input, "demography:age_structure", "demography").status).toBe(
      "empty",
    );
    expect(find(input, "demography:working_age", "demography")).toMatchObject({
      status: "available",
      years: [2024],
    });
    expect(find(input, "demography:working_age", "demography").note).toContain(
      "Projektion ab 2024",
    );
    input.history = {
      data: {
        ...browserAtlasHistory("m49:276"),
        status: "available",
        provenance: {
          revision: "Test",
          retrievedAt: "2026-09-09",
          pages: [],
          areaCount: 1,
          sourceRowCount: 1,
          excludedAreas: [],
        },
        profile: {
          geographyId: "m49:276",
          providerLabel: "Germany",
          notes: [],
          points: [
            { year: 1820, gdpPerCapita: 1000, gdp: null, worldGdpShare: null },
          ],
        },
      },
    };
    expect(
      find(input, "long_history:long_run_prosperity", "history").status,
    ).toBe("available");
    expect(find(input, "long_history:long_run_output", "history").status).toBe(
      "empty",
    );
    input.energy = {
      data: {
        ...browserAtlasEnergy("m49:276"),
        status: "available",
        provenance: {
          retrievedAt: "2026-09-09",
          sourceUpdatedAt: null,
          etag: null,
          source: { url: atlasEnergyCatalog.sourceUrl, sha256: "test" },
          sourceRowCount: 1,
          areaCount: 1,
          yearFirst: 2020,
          yearLast: 2020,
        },
        profile: {
          geographyId: "m49:276",
          providerLabel: "Germany",
          aggregate: false,
          years: [
            { year: 2020, values: { "share.solar": 0, "capacity.nuclear": 1 } },
          ],
        },
      },
    };
    expect(find(input, "electricity:solar", "energy")).toMatchObject({
      status: "available",
      years: [2020],
    });
    expect(find(input, "electricity:generation_mix", "energy").status).toBe(
      "empty",
    );
  });
  it("gibt globale Fonds nicht als Landesdaten aus und unterscheidet Kurshistorie von einer nutzbaren Welle", () => {
    const input = blank();
    const hydrogen = atlasMarketProxies.find((p) => p.symbol === "HYDR.US")!;
    const topic = hydrogen.topicIds[0];
    let option = find(input, topic, "markets", "m49:356");
    expect(option.status).toBe("elsewhere");
    expect(option.target).toMatchObject({
      area: "world",
      compare: "",
      proxy: hydrogen.id,
    });
    input.markets[hydrogen.id] = {
      data: { ...browserAtlasMarket(hydrogen.id), status: "available" },
    };
    option = find(input, topic, "markets", "world");
    expect(option.status).toBe("too_short");
    expect(coverageTopicStatus([option])).not.toBe("available");
    input.markets[hydrogen.id].data!.analysis.points = [
      { month: "2020-01", adjustedClose: 10, wave: 0, percentile: null },
    ];
    expect(find(input, topic, "markets", "world").status).toBe("available");
  });
});
