import { describe, expect, it } from "vitest";
import { browserAtlasHistory } from "../../services/atlas-browser";
import {
  atlasHistoryMode,
  historyView,
  type AtlasHistoryResponse,
} from "./atlas-history";

function row(points: [number, number | null][]): AtlasHistoryResponse {
  return {
    ...browserAtlasHistory("m49:276"),
    status: "available",
    provenance: {
      revision: "Test",
      retrievedAt: "2026-09-08T00:00:00Z",
      pages: [],
      areaCount: 1,
      sourceRowCount: points.length,
      excludedAreas: [],
    },
    profile: {
      geographyId: "m49:276",
      providerLabel: "Germany",
      notes: [],
      points: points.map(([year, value]) => ({
        year,
        gdpPerCapita: value,
        gdp: null,
        worldGdpShare: null,
      })),
    },
  };
}
describe("Historische Bildvergleiche", () => {
  it("erhält Abstände und Lücken zwischen historischen Schätzpunkten", () => {
    const view = historyView(
      [
        row([
          [1800, 2],
          [1850, 3],
          [1851, null],
          [1900, 4],
        ]),
      ],
      "gdpPerCapita",
      1820,
    )!;
    expect(view.first).toBe(1850);
    expect(view.years).toHaveLength(51);
    expect(view.rows[0].values[1]).toBeNull();
    expect(view.rows[0].values[50]).toBe(4);
    expect(view.sparse).toBe(true);
    expect(historyView([row([[1900, 2]])], "worldGdpShare", 1)).toBeNull();
  });
  it("verlangt gemeinsame tatsächliche Jahre und denselben Datenstand", () => {
    const first = row([
      [1800, 2],
      [1850, 4],
      [1900, 6],
    ]);
    const second = row([
      [1820, 2],
      [1850, 3],
      [1910, 4],
    ]);
    expect(historyView([first, second], "gdpPerCapita", 1)?.years[0]).toBe(
      1820,
    );
    second.provenance!.revision = "Andere Ausgabe";
    expect(historyView([first, second], "gdpPerCapita", 1)).toBeNull();
    expect(
      historyView(
        [
          row([
            [1800, 1],
            [1900, 2],
          ]),
          row([[1850, 4]]),
        ],
        "gdpPerCapita",
        1,
      ),
    ).toBeNull();
    expect(historyView([row([[1800, 1]])], "gdpPerCapita", 1950)).toBeNull();
  });
  it("zeigt im Browser keine erfundenen historischen Daten", () => {
    expect(browserAtlasHistory("m49:356")).toMatchObject({
      status: "desktop_required",
      profile: null,
      provenance: null,
    });
    expect(() => browserAtlasHistory("../../journal.sqlite")).toThrow();
    expect(atlasHistoryMode("long_history:long_run_prosperity")).toBe(
      "gdpPerCapita",
    );
    expect(atlasHistoryMode("structural_change:global_economic_weights")).toBe(
      "worldGdpShare",
    );
    expect(atlasHistoryMode("long_history:long_run_rates")).toBeUndefined();
  });
});
