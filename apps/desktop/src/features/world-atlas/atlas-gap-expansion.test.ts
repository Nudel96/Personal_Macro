import { describe, expect, it } from "vitest";
import { browserAtlasPublicSource } from "../../services/atlas-browser";
import {
  atlasPublicCatalog,
  publicPicture,
  publicSelection,
  type AtlasPublicResponse,
} from "./atlas-public";
import { atlasMarketProxies } from "./atlas-markets";
import { innovationSelection } from "./atlas-innovation";

function row(id: string, area: string): AtlasPublicResponse {
  const result = browserAtlasPublicSource(id, area);
  const source = result.source;
  return {
    ...result,
    status: "available",
    provenance: {
      sourceId: source.id,
      retrievedAt: "2026-09-15T00:00:00Z",
      publishedAt: source.publishedAt,
      url: source.url,
      documentationUrl: source.documentationUrl,
      sha256: source.expectedSha256,
      recipe: source.recipe,
      sourceRows: source.expectedRows,
      numericValues: source.expectedNumeric,
      areaCount: source.areas.length,
    },
  };
}

describe("Weltweite Ergänzungen des Atlas", () => {
  it("findet beim ersten Öffnen eine Länderquelle und erhält eine ausdrücklich gewählte fehlende Perspektive", () => {
    const wage = atlasPublicCatalog.metrics.find(
      (m) => m.sourceId === "ilo-real-wage-growth",
    )!;
    const oecd = atlasPublicCatalog.metrics.find(
      (m) => m.sourceId === "oecd-wages",
    )!;
    expect(
      publicSelection(new URLSearchParams(), wage.topicId, "m49:566").source
        ?.id,
    ).toBe("ilo-real-wage-growth");
    expect(
      publicSelection(
        new URLSearchParams({ publicMetric: oecd.id }),
        wage.topicId,
        "m49:566",
      ).metric.id,
    ).toBe(oecd.id);
    expect(
      publicSelection(
        new URLSearchParams({ publicSource: "oecd-wages" }),
        wage.topicId,
        "m49:566",
      ).source?.id,
    ).toBe("oecd-wages");
  });

  it("bewahrt ICP-Benchmarkjahre und echte Null ohne eine jährliche Mietreihe zu erzeugen", () => {
    const response = row("worldbank-icp-housing", "m49:288");
    const metric = response.metrics.find((m) => m.providerCode === "PX.WL")!;
    const area = response.source.areas.find(
      (a) => a.geographyId === response.geography.id,
    )!;
    response.profiles = [
      {
        metricId: metric.id,
        geographyId: response.geography.id,
        providerArea: area.code,
        providerLabel: area.label,
        providerTitle: area.seriesTitles[metric.providerCode]!,
        unit: metric.unit,
        points: [
          {
            period: "2017",
            value: null,
            status: "estimated",
            breakBefore: false,
            notes: [],
            lowerBound: null,
            upperBound: null,
          },
          {
            period: "2021",
            value: "0",
            status: "estimated",
            breakBefore: false,
            notes: [],
            lowerBound: null,
            upperBound: null,
          },
        ],
      },
    ];
    const picture = publicPicture(response, metric, 0)!;
    expect(picture.missingPeriods).toEqual(["2017"]);
    expect(picture.points.map((p) => [p.period, p.n])).toEqual([["2021", 0]]);
    expect(picture.segments).toHaveLength(1);
    expect(metric.connectAdjacent).toBe(false);
    expect(
      response.source.areas.find((a) => a.code === "BON")?.geographyId,
    ).toBe("icp:BON");
    expect(
      response.source.areas.find((a) => a.code === "RUT")?.geographyId,
    ).toBe("m49:643");
  });

  it("trennt die neuen Handelswerte von TiVA-Anteilen und von einer privaten Schulden-Wachstumsrate", () => {
    const imts = row("imf-imts-usa", "m49:566");
    expect(imts.metrics.map((m) => m.providerCode).sort()).toEqual([
      "MG_CIF_USD",
      "XG_FOB_USD",
    ]);
    expect(
      imts.metrics.every(
        (m) => m.unit === "Laufende US-Dollar" && m.kind !== "partner_share",
      ),
    ).toBe(true);
    expect(
      imts.source.areas.some((a) => a.code === "SUN" || a.code === "G001"),
    ).toBe(false);
    expect(imts.source.areas.find((a) => a.code === "KOS")?.geographyId).toBe(
      "provider:XKX",
    );
    const debt = atlasPublicCatalog.metrics.find(
      (m) => m.sourceId === "imf-gdd-pvd_ls",
    )!;
    expect(debt.unit).toBe("% des BIP");
    expect(debt.scopeNote).toContain("keine jährliche Kreditwachstumsrate");
    const wto = row("wto-merchandise", "m49:642");
    expect(wto.source.areas.find((a) => a.code === "642")?.geographyId).toBe(
      "m49:642",
    );
    expect(wto.source.areas.find((a) => a.code === "158")?.geographyId).toBe(
      "provider:TWN",
    );
    expect(wto.source.areas.find((a) => a.code === "535")?.geographyId).toBe(
      "m49:535",
    );
    expect(wto.source.areas.find((a) => a.code === "810")?.geographyId).toBe(
      "wto:810",
    );
  });

  it("erhält Indexwechsel der Länderfonds und kennzeichnet die WIPO-Teilperspektive", () => {
    expect(
      atlasMarketProxies.find((p) => p.symbol === "VNM.US")?.breaks,
    ).toEqual(["2023-03"]);
    expect(
      atlasMarketProxies.find((p) => p.symbol === "GREK.US")?.breaks,
    ).toEqual(["2016-03"]);
    expect(atlasMarketProxies.some((p) => p.symbol === "EGPT.US")).toBe(false);
    expect(
      innovationSelection(
        new URLSearchParams(),
        "innovation:advanced_materials",
      ),
    ).toMatchObject({ group: "materials", metric: "22" });
  });
});
