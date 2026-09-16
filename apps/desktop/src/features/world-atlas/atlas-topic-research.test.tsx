import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasContextGuide,
  atlasContextGuides,
  type AtlasContextGuide,
} from "./atlas-context-guides";
import { AtlasContextPanel } from "./atlas-context-panel";
import { coverageOptions, coverageTopicStatus } from "./atlas-coverage";
import { cycleHypothesis } from "./atlas-cycle-hypotheses";
import {
  atlasTopicResearch,
  topicResearchSources,
} from "./atlas-topic-research";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../services/commands", () => ({ isTauri: vi.fn(() => false) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete topicResearchSources["qa-source"];
});

// A standalone source-only fixture remains valid when production topics gain data.
function sourceOnlyGuide(): AtlasContextGuide {
  topicResearchSources["qa-source"] = {
    label: "Prüfquelle",
    url: "https://example.org/atlas-source",
    finding: "Ein isolierter Quellenbefund für die Bedienprüfung.",
  };
  return {
    topicId: "innovation:robotics",
    summary: "Prüffall für eine noch fehlende Datenreihe.",
    boundary: "Ein Quellenlink ist noch keine importierte Messung.",
    links: [],
    research: {
      topicId: "innovation:robotics",
      meaning: "Prüffall für eine noch fehlende Datenreihe.",
      boundary: "Ein Quellenlink ist noch keine importierte Messung.",
      finding: "Die Originaldaten benötigen vor einer Übernahme eine Prüfung.",
      sourceIds: ["qa-source"],
    },
  };
}

it("erreicht jedes Katalogthema über eine Datenperspektive, ein Modell oder einen begründeten Einstieg", () => {
  const numeric = new Set<string>();
  const known = new Set(atlasCatalog.topics.map((topic) => topic.id));
  const unknown = new Set<string>();
  const blank = {
    series: {},
    demography: {},
    history: {},
    energy: {},
    markets: {},
  };
  for (const geography of atlasCatalog.geographies) {
    for (const option of coverageOptions(geography.id, blank)) {
      numeric.add(option.topicId);
      if (!known.has(option.topicId)) unknown.add(option.topicId);
    }
  }
  expect([...unknown]).toEqual([]);
  expect(
    atlasCatalog.groups.every((group) =>
      atlasCatalog.topics.some((topic) => topic.groupId === group.id),
    ),
  ).toBe(true);
  expect(
    atlasCatalog.topics.filter(
      (topic) =>
        !numeric.has(topic.id) &&
        !atlasContextGuide(topic.id) &&
        !cycleHypothesis(topic.id),
    ),
  ).toEqual([]);
  expect(new Set(atlasContextGuides.map((guide) => guide.topicId)).size).toBe(
    atlasContextGuides.length,
  );
  for (const topic of atlasTopicResearch) {
    // Editorial review must never turn a missing numeric series into measured coverage.
    expect(numeric.has(topic.topicId), topic.topicId).toBe(false);
    expect(
      coverageTopicStatus(
        coverageOptions("m49:356", blank).filter(
          (option) => option.topicId === topic.topicId,
        ),
      ),
    ).toBe("unbound");
  }
});

it("bindet die offenen Themen an benannte Primärquellen und echte ergänzende Messgrößen", () => {
  const used = new Set<string>();
  for (const entry of atlasTopicResearch) {
    expect(entry.sourceIds.length, entry.topicId).toBeGreaterThan(0);
    expect(entry.finding.length).toBeGreaterThan(60);
    expect(entry.boundary.length).toBeGreaterThan(60);
    for (const id of entry.sourceIds) {
      const source = topicResearchSources[id];
      expect(source, `${entry.topicId}: ${id}`).toBeDefined();
      const url = new URL(source.url);
      expect(url.protocol).toBe("https:");
      expect(url.username + url.password).toBe("");
      used.add(id);
    }
    for (const code of entry.contextCodes ?? []) {
      const definition = atlasCatalog.series.find(
        (series) => series.providerCode === code,
      );
      expect(definition, `${entry.topicId}: ${code}`).toBeDefined();
      expect(definition?.topicId).not.toBe(entry.topicId);
    }
  }
  expect(used.size).toBe(Object.keys(topicResearchSources).length);
});

it("zeigt einen offenen Quellenbefund ohne Scheindiagramm oder automatische Quellenaufrufe", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const { container } = render(
    <AtlasContextPanel
      guide={sourceOnlyGuide()}
      geography={atlasCatalog.geographies.find((g) => g.id === "m49:156")!}
      onNavigate={vi.fn()}
    />,
  );
  expect(screen.getByText("Eigene Datenansicht noch offen")).toBeTruthy();
  expect(
    screen.getByText(
      "Die Originaldaten benötigen vor einer Übernahme eine Prüfung.",
    ),
  ).toBeTruthy();
  expect(container.querySelector("details")?.open).toBe(false);
  expect(
    container.querySelectorAll("svg[role=img], canvas, .atlas-context-link")
      .length,
  ).toBe(0);
  expect(openUrl).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("link", { hidden: true, name: "Prüfquelle" })
      .getAttribute("href"),
  ).toBe("https://example.org/atlas-source");
});

it("ersetzt den Versorgungskontext durch vier geprüfte UN-Zufriedenheitsbilder", () => {
  expect(atlasContextGuide("institutions:public_services")).toBeUndefined();
  const definitions = atlasCatalog.series.filter(
    (s) => s.topicId === "institutions:public_services",
  );
  expect(definitions.map((s) => s.providerCode)).toEqual([
    "SP_PSR_OSATIS_GOV",
    "SP_PSR_OSATIS_HLTH",
    "SP_PSR_OSATIS_PRM",
    "SP_PSR_OSATIS_SEC",
  ]);
  expect(definitions.every((s) => s.sourceId === "unsdg")).toBe(true);
  const options = coverageOptions("m49:356", {
    series: {},
    demography: {},
    history: {},
    energy: {},
    markets: {},
  }).filter((option) => option.topicId === "institutions:public_services");
  expect(options).toHaveLength(4);
  expect(options.every((option) => option.family === "sdg")).toBe(true);
});

it("meldet einen fehlgeschlagenen nativen Quellenaufruf ohne die Recherche als fehlende Messung umzudeuten", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(openUrl).mockRejectedValueOnce(new Error("Test failure"));
  render(
    <AtlasContextPanel
      guide={sourceOnlyGuide()}
      geography={atlasCatalog.geographies.find((g) => g.id === "m49:276")!}
      onNavigate={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("link", {
      hidden: true,
      name: "Prüfquelle",
    }),
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(
    "https://example.org/atlas-source",
  );
  expect(screen.getByText("Eigene Datenansicht noch offen")).toBeTruthy();
});
