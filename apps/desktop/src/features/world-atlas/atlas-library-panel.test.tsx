import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, isTauri } from "../../services/commands";
import { AtlasLibraryPanel } from "./atlas-library-panel";
import type { AtlasSyncJob } from "./atlas-types";

vi.mock("../../services/commands", () => ({
  api: { syncAtlasLibrary: vi.fn(), cancelAtlasLibrary: vi.fn() },
  isTauri: vi.fn(),
}));
const job: AtlasSyncJob = {
  id: "first",
  seriesId: "atlas-library",
  status: "running",
  page: 1,
  pages: 4,
  observations: 1,
  message: "Quelle wird geladen",
  startedAt: "2026-09-10T12:00:00Z",
  finishedAt: null,
};
let client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(isTauri).mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  client.clear();
});
function panel(current: AtlasSyncJob | null) {
  return (
    <QueryClientProvider client={client}>
      <AtlasLibraryPanel job={current} />
    </QueryClientProvider>
  );
}
it("lädt öffentliche Pakete und nimmt vorhandene Marktzugänge nur nach Auswahl hinzu", async () => {
  vi.mocked(api.syncAtlasLibrary).mockResolvedValue(job);
  render(panel(null));
  fireEvent.click(screen.getByText("Lokalen Datenbestand ergänzen"));
  fireEvent.click(
    screen.getByRole("button", { name: "Fehlende Datenpakete laden" }),
  );
  await waitFor(() => expect(api.syncAtlasLibrary).toHaveBeenCalledWith(false));
  await waitFor(() =>
    expect(client.getQueryData(["atlas", "job"])).toEqual(job),
  );
});
it("merkt den Stopp genau für den aktuellen Abruf vor und erlaubt den nächsten", async () => {
  vi.mocked(api.cancelAtlasLibrary).mockResolvedValue(undefined);
  const ui = render(panel(job));
  fireEvent.click(screen.getByText("Lokalen Datenbestand ergänzen"));
  fireEvent.click(
    screen.getByRole("button", { name: "Nach diesem Paket stoppen" }),
  );
  await waitFor(() =>
    expect(api.cancelAtlasLibrary).toHaveBeenCalledWith("first"),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Stoppen vorgemerkt" }),
    ).toHaveProperty("disabled", true),
  );
  ui.rerender(panel({ ...job, id: "second" }));
  expect(
    screen.getByRole("button", { name: "Nach diesem Paket stoppen" }),
  ).toHaveProperty("disabled", false);
});
it("verspricht in der Browser-Vorschau keinen gespeicherten Datenbestand", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  render(panel(null));
  fireEvent.click(screen.getByText("Lokalen Datenbestand ergänzen"));
  expect(
    screen.getByRole("button", { name: "Fehlende Datenpakete laden" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.getByText(
      "Das Laden und Speichern ist in der Desktop-App verfügbar.",
    ),
  ).toBeTruthy();
});
