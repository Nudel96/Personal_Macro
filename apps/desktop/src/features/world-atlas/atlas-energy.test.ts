import { describe, expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasEnergyCatalog,
  atlasEnergyMode,
  energyMix,
  energyUnavailableReason,
  energyView,
  type AtlasEnergyResponse,
} from "./atlas-energy";

const solar = atlasEnergyMode("electricity:solar")!;
function row(id = "m49:276"): AtlasEnergyResponse {
  return {
    geography: atlasCatalog.geographies.find((g) => g.id === id)!,
    status: "available",
    profile: {
      geographyId: id,
      providerLabel: "Test",
      aggregate: false,
      years: [
        {
          year: 2020,
          values: {
            "share.solar": 0,
            "generation.solar": 15,
            "capacity.solar": 20,
          },
        },
        { year: 2021, values: { "share.solar": null, "generation.solar": 18 } },
        {
          year: 2023,
          values: {
            "share.solar": 5,
            "generation.solar": 25,
            "capacity.solar": 30,
          },
        },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T00:00:00Z",
      sourceUpdatedAt: null,
      etag: null,
      source: { url: atlasEnergyCatalog.sourceUrl, sha256: "same-source" },
      sourceRowCount: 8,
      areaCount: 1,
      yearFirst: 2020,
      yearLast: 2023,
    },
  };
}

describe("Ember-Bilder", () => {
  it("ordnet gemeinsame Wind- und Stromdaten zu, ohne nicht vorhandene Einzeltechnologien zu behaupten", () => {
    expect(atlasEnergyMode("electricity:wind_total")).toMatchObject({
      kind: "fuel",
      fuelId: "wind",
    });
    expect(atlasEnergyMode("electricity:electricity_demand")).toEqual({
      kind: "demand",
    });
    expect(atlasEnergyMode("electricity:wind_onshore")).toBeUndefined();
    expect(atlasEnergyMode("electricity:geothermal")).toBeUndefined();
    expect(atlasEnergyMode("fuels:hydrogen")).toBeUndefined();
  });
  it("erhält echte Null, leere Zellen und fehlende Jahre und trennt Mengen von Anteilen und Leistung", () => {
    const share = energyView([row()], solar, "share", 2000)!;
    expect(share.years).toEqual([2020, 2021, 2022, 2023]);
    expect(share.rows[0].values).toEqual([0, null, null, 5]);
    expect(share.sparse).toBe(true);
    const output = energyView([row()], solar, "generation", 2000)!;
    expect(output.metric.unit).toBe("TWh");
    expect(output.rows[0].values).toEqual([15, 18, null, 25]);
    expect(energyView([row()], solar, "capacity", 2000)?.metric.unit).toBe(
      "GW",
    );
  });
  it("vergleicht ausschließlich gemeinsame Zeitfenster und denselben atomaren Quellenstand", () => {
    const other = row("m49:356");
    other.profile!.years.shift();
    const view = energyView([row(), other], solar, "share", 2000)!;
    expect(view.years).toEqual([2023]);
    other.provenance!.source.sha256 = "different";
    expect(energyView([row(), other], solar, "share", 2000)).toBeNull();
    other.provenance!.source.sha256 = "same-source";
    other.provenance!.retrievedAt = "2026-09-08T00:00:00Z";
    expect(energyView([row(), other], solar, "share", 2000)).toBeNull();
    expect(energyView([row()], solar, "share", 2024)).toBeNull();
  });
  it("erfindet keinen gemeinsamen Vergleich aus abwechselnd vorhandenen Jahreswerten", () => {
    const other = row("ember:africa");
    other.profile!.years = [
      { year: 2021, values: { "share.solar": 2 } },
      { year: 2022, values: { "share.solar": 3 } },
    ];
    expect(energyView([row(), other], solar, "share", 2000)).toBeNull();
  });
  it("verwirft unvollständige und leere Strommixe ohne Auffüllen oder Umgewichtung", () => {
    const values = Object.fromEntries(
      atlasEnergyCatalog.fuels.map((fuel) => [`share.${fuel.id}`, 11.11]),
    );
    expect(energyMix({ year: 2020, values })).toEqual(Array(9).fill(11.11));
    expect(
      energyMix({ year: 2020, values: { ...values, "share.solar": 0 } }),
    ).toBeNull();
    expect(
      energyMix({ year: 2020, values: { ...values, "share.solar": null } }),
    ).toBeNull();
    expect(
      energyMix({
        year: 2020,
        values: Object.fromEntries(Object.keys(values).map((key) => [key, 0])),
      }),
    ).toBeNull();
  });
  it("bewahrt Nettoexporte als negative Menge und verwendet den veröffentlichten Pro-Kopf-Bedarf", () => {
    const data = row();
    data.profile!.years = [
      {
        year: 2020,
        values: { net_imports: -2.5, demand: 20, demand_per_capita: 4.25 },
      },
    ];
    expect(
      energyView([data], { kind: "net_imports" }, "share", 2000)?.rows[0]
        .values,
    ).toEqual([-2.5]);
    const demand = energyView([data], { kind: "demand" }, "per_capita", 2000)!;
    expect(demand.rows[0].values).toEqual([4.25]);
    expect(demand.metric.unit).toBe("MWh");
    const missing = row("ember:africa");
    const reason = energyUnavailableReason(
      [data, missing],
      { kind: "net_imports" },
      "share",
      2000,
    );
    expect(reason).toContain("Für Afrika · Ember-Region fehlen");
    expect(reason).toContain("Strom-Nettoimporte");
    expect(reason).not.toContain("Deutschland");
    expect(reason).not.toContain("Strommix");
  });
});
