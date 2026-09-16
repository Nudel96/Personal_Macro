import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasHouseholdsCatalog as cfg,
  type AtlasHouseholdsResponse,
} from "./atlas-households";
import { WorldAtlasPage } from "./world-atlas-page";

vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: {
    atlasCatalog: vi.fn(),
    atlasHouseholds: vi.fn(),
    atlasSyncStatus: vi.fn(),
  },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
vi.mock("./atlas-notebook-panel", () => ({
  AtlasNotebookPanel: ({ params }: { params: URLSearchParams }) => (
    <output data-testid="household-saved-context">{params.toString()}</output>
  ),
}));
function Location() {
  return (
    <output data-testid="household-location">{useLocation().search}</output>
  );
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
});
function source(id: string, index: number): AtlasHouseholdsResponse {
  const geography = atlasCatalog.geographies.find((g) => g.id === id)!;
  return {
    geography,
    status: "available",
    profile: {
      geographyId: id,
      providerCode: geography.iso3,
      providerLabels: ["Test"],
      observations: [
        {
          recordId: `unhh2026:${index}`,
          sourceRow: index,
          year: 2020,
          sourceCategory: "DHS",
          sourceCatalogId: String(index),
          sourceName: "Synthetische Erhebung",
          unweighted: false,
          values: { averageSize: 2, nuclear: 50 },
        },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T12:00:00Z",
      fileModifiedAt: null,
      url: cfg.url,
      sha256: cfg.sha256,
      release: cfg.release,
      recipe: cfg.recipe,
      sourceRowCount: 1129,
      numericCellCount: 36142,
      areaCount: 200,
    },
  };
}
it("hält schnelle Länder- und Gruppenwechsel auch bei späterem Datenempfang fest und merkt konkrete Erhebungen", async () => {
  vi.mocked(api.atlasCatalog).mockResolvedValue(atlasCatalog);
  vi.mocked(api.atlasSyncStatus).mockResolvedValue(null);
  let deliverChina!: (value: AtlasHouseholdsResponse) => void;
  const china = new Promise<AtlasHouseholdsResponse>((resolve) => {
    deliverChina = resolve;
  });
  vi.mocked(api.atlasHouseholds).mockImplementation((id) =>
    id === "m49:156"
      ? china
      : Promise.resolve(
          source(id, id === "m49:276" ? 6 : id === "m49:840" ? 7 : 8),
        ),
  );
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          "/world-atlas?topic=demography:households&area=m49:276&compare=m49:840",
        ]}
      >
        <WorldAtlasPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("combobox", { name: "Erhebung für Deutschland" });
  await waitFor(() =>
    expect(screen.getByTestId("household-saved-context").textContent).toContain(
      "hhRecord=unhh2026%3A6",
    ),
  );
  expect(screen.getByTestId("household-location").textContent).not.toContain(
    "hhRecord",
  );
  act(() => {
    fireEvent.change(
      screen.getByRole("combobox", { name: "Land oder Gebiet" }),
      { target: { value: "m49:356" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Land vergleichen" }),
      { target: { value: "m49:156" } },
    );
  });
  await screen.findByRole("combobox", { name: "Erhebung für Indien" });
  fireEvent.change(
    screen.getByRole("combobox", {
      name: "Haushaltsbilder ordnen",
    }),
    { target: { value: "generations" } },
  );
  await act(async () => deliverChina(source("m49:156", 9)));
  await screen.findByRole("combobox", { name: "Erhebung für China" });
  expect(
    (
      screen.getByRole("combobox", {
        name: "Land vergleichen",
      }) as HTMLSelectElement
    ).value,
  ).toBe("m49:156");
  const context = new URLSearchParams(
    screen.getByTestId("household-saved-context").textContent!,
  );
  expect(Object.fromEntries(context)).toMatchObject({
    area: "m49:356",
    compare: "m49:156",
    hhGroup: "generations",
    hhMetric: "nuclear",
    hhRecord: "unhh2026:8",
    hhCompareRecord: "unhh2026:9",
  });
  expect(
    screen.queryByRole("combobox", { name: "Erhebung für Vereinigte Staaten" }),
  ).toBeNull();
});
