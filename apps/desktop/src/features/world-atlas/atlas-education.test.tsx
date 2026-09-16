import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { browserAtlasEducation } from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasEducationCatalog,
  educationPointKind,
  educationSegments,
  educationView,
  type AtlasEducationResponse,
  type EducationPoint,
} from "./atlas-education";
import { AtlasEducationPanel } from "./atlas-education-panel";
import { coverageOptions } from "./atlas-coverage";
import { atlasSavedContext } from "./atlas-notebook-model";

vi.mock("../../services/commands", () => ({
  api: { atlasEducation: vi.fn(), syncAtlasEducation: vi.fn() },
  isTauri: () => true,
}));
const metric = (code: string) =>
  atlasEducationCatalog.metrics.find((m) => m.code === code)!;
const p = (
  year: number,
  value: number | null,
  qualifier = "",
): EducationPoint => ({ year, value, qualifier, magnitude: "", notes: [] });
function response(
  code = "CR.1",
  points = [p(2005, 76.53), p(2011, 88.35), p(2019, 94.15231323242188)],
  id = "m49:356",
): AtlasEducationResponse {
  return {
    geography: atlasCatalog.geographies.find((g) => g.id === id)!,
    status: "available",
    profile: {
      geographyId: id,
      providerCode: "IND",
      series: { [code]: points },
    },
    provenance: {
      retrievedAt: "2026-09-09T00:00:00Z",
      fileModifiedAt: null,
      url: atlasEducationCatalog.url,
      sha256: "a".repeat(64),
      release: "Februar 2026",
      sourceRowCount: 3,
      numericCellCount: 3,
      metadataCount: 0,
      areaCount: 1,
      recipe: "uis-sdg-202602-v1",
    },
  };
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("UNESCO educational pictures", () => {
  it("preserves survey points, gaps, published zero and gross ratios above a hundred", () => {
    const values = [p(2000, 0), p(2001, 50), p(2003, 70)];
    expect(educationSegments(values, "survey")).toEqual([]);
    expect(
      educationSegments(values, "administrative").map((s) =>
        s.map((p) => p.year),
      ),
    ).toEqual([[2000, 2001]]);
    expect(
      educationView([response("CR.1", values)], metric("CR.1"))?.rows[0]
        .points[0].value,
    ).toBe(0);
    expect(
      educationView([response("GER.5T8", [p(2000, 166)])], metric("GER.5T8"))
        ?.max,
    ).toBeGreaterThan(166);
    expect(
      educationView([response("CR.1", [p(2000, null)])], metric("CR.1")),
    ).toBeNull();
  });
  it("requires common observation years and the same release, and never overlays different learning tests", () => {
    const a = response(),
      b = response("CR.1", [p(2006, 70), p(2010, 80)], "m49:276");
    expect(educationView([a, b], metric("CR.1"))).toBeNull();
    b.profile!.series["CR.1"].push(p(2011, 90));
    expect(educationView([a, b], metric("CR.1"))?.first).toBe(2006);
    b.provenance!.sha256 = "b".repeat(64);
    expect(educationView([a, b], metric("CR.1"))).toBeNull();
    expect(
      educationView(
        [response("READ.PRIMARY"), response("READ.PRIMARY")],
        metric("READ.PRIMARY"),
      ),
    ).toBeNull();
  });
  it("keeps estimate qualifiers and missing-value reasons", () => {
    expect(
      educationPointKind({ ...p(2000, null), magnitude: "NA" }, metric("CR.1")),
    ).toBe("Nicht anwendbar");
    expect(
      educationPointKind(p(2000, 0, "UIS_EST"), metric("CR.MOD.1")),
    ).toContain("UIS-Modellwert");
    expect(
      educationSegments(
        [p(2000, 20), p(2001, 21, "NAT_EST")],
        "administrative",
      ),
    ).toEqual([]);
  });
  it("keeps sparse completion data separate from the model and hides values until selected", async () => {
    const data = response();
    data.profile!.series["CR.MOD.1"] = [p(2018, 93), p(2019, 94), p(2020, 95)];
    data.profile!.series["CR.1"][2].notes = [
      {
        kind: "Source:Data sources",
        text: "National Family Health Survey 2019–21",
      },
    ];
    vi.mocked(api.atlasEducation).mockResolvedValue(data);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const props = {
      geography: data.geography,
      topicId: "education:primary_school",
      showNumbers: false,
      job: null,
      onAreaChange: vi.fn(),
    };
    const view = render(
      <QueryClientProvider client={client}>
        <AtlasEducationPanel {...props} />
      </QueryClientProvider>,
    );
    await screen.findByRole("img", { name: /Grundschule abgeschlossen/ });
    expect(view.container.querySelectorAll("polyline")).toHaveLength(0);
    expect(view.container.textContent).not.toContain("94,15%");
    expect(view.container.textContent).toContain(
      "National Family Health Survey",
    );
    fireEvent.change(screen.getByLabelText("Bildungsperspektive"), {
      target: { value: "CR.MOD.1" },
    });
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Veröffentlichtes UIS-Modell",
    );
    expect(view.container.querySelectorAll("polyline")).toHaveLength(1);
    view.rerender(
      <QueryClientProvider client={client}>
        <AtlasEducationPanel {...props} showNumbers />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Bildungsperspektive"), {
      target: { value: "CR.1" },
    });
    await waitFor(() => expect(view.container.textContent).toContain("94,15%"));
    client.clear();
  });
  it("reports per-metric coverage and preserves display choices", () => {
    const data = response();
    const options = coverageOptions(data.geography.id, {
      series: {},
      markets: {},
      demography: {},
      history: {},
      energy: {},
      education: { data },
    });
    expect(options.find((o) => o.id === "education:CR.1")?.status).toBe(
      "available",
    );
    expect(options.find((o) => o.id === "education:READ.PRIMARY")?.status).toBe(
      "empty",
    );
    const saved = atlasSavedContext(
      new URLSearchParams(
        "educationMetric=CR.MOD.1&educationSince=2010&perspective=education",
      ),
    );
    expect(saved.params.educationMetric).toBe("CR.MOD.1");
    expect(saved.params.educationSince).toBe("2010");
    expect(browserAtlasEducation("m49:356").status).toBe("desktop_required");
  });
});
