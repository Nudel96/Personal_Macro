import { describe, expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import { atlasDemographyMode } from "./atlas-demography";
import { atlasEnergyMode } from "./atlas-energy";
import { atlasHistoryMode } from "./atlas-history";
import { creditTopic } from "./atlas-credit";
import { propertyTopic } from "./atlas-property";
import { atlasMacrohistoryTopic } from "./atlas-macrohistory";
import {
  cycleContextTarget,
  cycleHypotheses,
  cycleSources,
} from "./atlas-cycle-hypotheses";

describe("Quellengebundene Zyklusthesen", () => {
  it("deckt die katalogisierten Thesen mit identifizierbaren Arbeiten und Grenzen ab", () => {
    expect(cycleHypotheses.map((m) => m.topicId).sort()).toEqual(
      atlasCatalog.topics
        .filter((t) => t.groupId === "cycle_hypotheses")
        .map((t) => t.id)
        .sort(),
    );
    for (const model of cycleHypotheses) {
      expect(new Set(model.steps.map((s) => s.id)).size).toBe(4);
      expect(model.sourceIds.length).toBeGreaterThan(0);
      expect(model.limitation.length).toBeGreaterThan(30);
      expect(model.alternative.length).toBeGreaterThan(30);
      for (const id of model.sourceIds) {
        const source = cycleSources[id];
        expect(new URL(source.url).protocol).toBe("https:");
        expect(source.scope.length).toBeGreaterThan(30);
        expect(source.locator.length).toBeGreaterThan(15);
      }
    }
  });
  it("führt nur zu tatsächlich angebundenen Perspektiven und erhält Länder und Vergleich", () => {
    for (const model of cycleHypotheses)
      for (const context of model.context) {
        expect(atlasCatalog.topics.some((t) => t.id === context.topicId)).toBe(
          true,
        );
        if (context.seriesId) {
          expect(
            atlasCatalog.series.find((s) => s.id === context.seriesId)?.topicId,
          ).toBe(context.topicId);
          expect(context.perspective).toBe("worldbank");
        } else {
          expect(
            Boolean(
              atlasDemographyMode(context.topicId) ||
              atlasEnergyMode(context.topicId) ||
              atlasHistoryMode(context.topicId) ||
              context.topicId === atlasMacrohistoryTopic ||
              (propertyTopic(context.topicId) &&
                context.perspective === "property") ||
              (creditTopic(context.topicId) &&
                context.perspective === "credit"),
            ),
          ).toBe(true);
        }
        const target = cycleContextTarget(model, context, model.steps[2].id);
        expect(target.area).toBeUndefined();
        expect(target.region).toBeUndefined();
        expect(target.compare).toBeUndefined();
        expect(target.fromCycle).toBe(model.topicId);
        expect(target.cycleStep).toBe(model.steps[2].id);
        expect(target.proxy).toBe("");
        expect(target.series).toBe(context.seriesId ?? "");
      }
  });
});
