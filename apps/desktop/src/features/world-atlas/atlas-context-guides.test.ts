import { expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import { atlasContextGuides, atlasContextTarget } from "./atlas-context-guides";
import { atlasDemographyMode } from "./atlas-demography";
import { atlasHistoryMode } from "./atlas-history";
import { atlasEnergyMode } from "./atlas-energy";
import { creditTopic } from "./atlas-credit";
import { educationMetrics } from "./atlas-education";
import { atlasMacrohistoryCatalog } from "./atlas-macrohistory";
import { atlasFiscalCatalog } from "./atlas-fiscal";
import { atlasSavedContext, atlasContextParams } from "./atlas-notebook-model";

it("verknüpft jeden Einstieg mit einer vorhandenen, präzisen Datenperspektive und bewahrt ihren Merkkontext", () => {
  for (const guide of atlasContextGuides) {
    expect(atlasCatalog.topics.some((t) => t.id === guide.topicId)).toBe(true);
    expect(atlasCatalog.series.some((s) => s.topicId === guide.topicId)).toBe(
      false,
    );
    for (const link of guide.links) {
      const target = atlasContextTarget(guide, link);
      expect(atlasCatalog.topics.some((t) => t.id === target.topic)).toBe(true);
      expect(atlasContextGuides.some((g) => g.topicId === target.topic)).toBe(
        false,
      );
      expect(target).not.toHaveProperty("area");
      expect(target).not.toHaveProperty("compare");
      if (link.family === "statistics") {
        expect(
          atlasCatalog.series.find((s) => s.id === target.series)?.topicId,
        ).toBe(target.topic);
        expect(target.perspective).toBe("worldbank");
      } else if (link.family === "education") {
        expect(
          educationMetrics(target.topic).some(
            (m) => m.code === target.educationMetric,
          ),
        ).toBe(true);
      } else if (link.family === "demography")
        expect(atlasDemographyMode(target.topic)).toBeDefined();
      else if (link.family === "history")
        expect(atlasHistoryMode(target.topic)).toBeDefined();
      else if (link.family === "energy")
        expect(atlasEnergyMode(target.topic)).toBeDefined();
      else if (link.family === "credit") {
        expect(creditTopic(target.topic)).toBe(true);
        expect(target.creditMode).toBe("gap");
        expect(target.perspective).toBe("credit");
      } else if (link.family === "macrohistory")
        expect(
          atlasMacrohistoryCatalog.metrics.find(
            (m) => m.id === target.jstMetric,
          )?.group,
        ).toBe(target.jstGroup);
      else if (link.family === "fiscal")
        expect(
          atlasFiscalCatalog.metrics.find((m) => m.id === target.fiscalMetric)
            ?.group,
        ).toBe(target.fiscalGroup);
      else throw new Error(`Ungeprüfte Quellenfamilie: ${link.family}`);
      const params = new URLSearchParams(
        Object.entries(target).filter(([, v]) => v),
      );
      expect(
        Object.fromEntries(atlasContextParams(atlasSavedContext(params))!),
      ).toEqual(Object.fromEntries(params));
    }
  }
});
