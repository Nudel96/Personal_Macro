import { createRef } from "react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, isTauri } from "../../services/commands";
import { AtlasNotebookPanel } from "./atlas-notebook-panel";
import { captureAtlasPictures } from "./atlas-picture-capture";
import type { AtlasNotebookEntry } from "./atlas-notebook-types";

vi.mock("../../services/commands", () => ({
  isTauri: vi.fn(),
  api: {
    atlasNotebook: vi.fn(),
    atlasNotebookEntry: vi.fn(),
    createAtlasNotebookEntry: vi.fn(),
    updateAtlasNotebookEntry: vi.fn(),
    trashAtlasNotebookEntry: vi.fn(),
  },
}));
vi.mock("./atlas-picture-capture", () => ({ captureAtlasPictures: vi.fn() }));
const saved: AtlasNotebookEntry = {
  id: "note-1",
  title: "Indien im Vergleich",
  note: "<script>persönlicher Text</script>",
  notePreview: "<script>persönlicher Text</script>",
  favorite: true,
  contextLabel: "Indien / China · Demografie",
  context: {
    version: 1,
    params: {
      area: "m49:356",
      compare: "m49:156",
      demoYear: "2050",
      demoProjection: "1",
    },
  },
  sources: [],
  snapshotDataUrl: "data:image/png;base64,cGljdHVyZQ==",
  snapshotStatus: "available",
  hasImage: true,
  capturedAt: "2026-09-09T09:00:00Z",
  createdAt: "2026-09-09T09:00:00Z",
  updatedAt: "2026-09-09T09:00:00Z",
  revision: 1,
  trashedAt: null,
};
let client: QueryClient;
const navigate = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(api.atlasNotebook).mockResolvedValue([saved]);
  vi.mocked(api.atlasNotebookEntry).mockResolvedValue(saved);
  vi.mocked(api.createAtlasNotebookEntry).mockResolvedValue(saved);
  vi.mocked(api.updateAtlasNotebookEntry).mockResolvedValue({
    ...saved,
    revision: 2,
  });
  vi.mocked(api.trashAtlasNotebookEntry).mockResolvedValue({
    ...saved,
    revision: 2,
    trashedAt: saved.createdAt,
  });
  vi.mocked(captureAtlasPictures).mockResolvedValue("cGljdHVyZQ==");
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  client.clear();
});
function mount(
  params = new URLSearchParams(
    "area=m49%3A356&compare=m49%3A156&demoYear=2050&demoProjection=1",
  ),
) {
  const root = createRef<HTMLDivElement>();
  return render(
    <QueryClientProvider client={client}>
      <div ref={root}>
        <AtlasNotebookPanel
          params={params}
          contextLabel="Indien / China · Demografie"
          root={root}
          onNavigate={navigate}
          lastViewError={null}
        />
      </div>
    </QueryClientProvider>,
  );
}
async function openEntry() {
  fireEvent.click(screen.getByRole("button", { name: "Gemerkte Ansichten" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Indien im Vergleich/ }),
  );
  return screen.findByRole("textbox", { name: "Eigene Notiz" });
}

it("merkt die eingefrorene Auswahl, den Bildstand und die eigene Notiz", async () => {
  const params = new URLSearchParams("area=m49%3A356&demoYear=2050&numbers=0");
  mount(params);
  fireEvent.click(screen.getByRole("button", { name: "Ansicht merken" }));
  params.set("demoYear", "2100");
  fireEvent.change(screen.getByRole("textbox", { name: "Eigene Notiz" }), {
    target: { value: "Meine Beobachtung" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /Als Favorit/ }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Ansicht merken",
      }),
    ).not.toBeDisabled(),
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Ansicht merken",
    }),
  );
  await waitFor(() =>
    expect(api.createAtlasNotebookEntry).toHaveBeenCalledOnce(),
  );
  expect(
    vi.mocked(api.createAtlasNotebookEntry).mock.calls[0][0],
  ).toMatchObject({
    note: "Meine Beobachtung",
    favorite: true,
    snapshotBase64: "cGljdHVyZQ==",
    context: { version: 1, params: { demoYear: "2050" } },
  });
  expect(
    vi.mocked(api.createAtlasNotebookEntry).mock.calls[0][0].capturedAt,
  ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("öffnet nur den gespeicherten lokalen Kontext und behandelt Notizen als Text", async () => {
  mount();
  await openEntry();
  expect(screen.getByRole("textbox", { name: "Eigene Notiz" })).toHaveValue(
    saved.note,
  );
  expect(document.querySelector(".atlas-notebook script")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Ansicht mit aktuellem Datenstand öffnen",
    }),
  );
  expect(navigate).toHaveBeenCalledOnce();
  expect(Object.fromEntries(navigate.mock.calls[0][0])).toEqual(
    saved.context.params,
  );
  expect(api.updateAtlasNotebookEntry).not.toHaveBeenCalled();
});

it("erhält einen Entwurf über Refetch und Konflikt und schützt vor versehentlichem Schließen", async () => {
  mount();
  await openEntry();
  const input = screen.getByRole("textbox", { name: "Eigene Notiz" });
  fireEvent.change(input, {
    target: { value: "Noch nicht gespeicherter Gedanke" },
  });
  act(() =>
    client.setQueryData(["atlas-notebook", "entry", saved.id], {
      ...saved,
      note: "Andere Änderung",
      revision: 2,
    }),
  );
  expect(input).toHaveValue("Noch nicht gespeicherter Gedanke");
  vi.mocked(api.updateAtlasNotebookEntry).mockRejectedValue({
    code: "CONFLICT",
    message: "Bitte erneut öffnen.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
  await screen.findByText("Bitte erneut öffnen.");
  expect(api.updateAtlasNotebookEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 1,
      note: "Noch nicht gespeicherter Gedanke",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Dialog schließen" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
  expect(input).toHaveValue("Noch nicht gespeicherter Gedanke");
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.click(
    await screen.findByRole("button", { name: "Änderungen verwerfen" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("stellt einen Favoriten aus dem Papierkorb ohne Verlust von Bild und Notiz wieder her", async () => {
  vi.mocked(api.atlasNotebookEntry).mockResolvedValue({
    ...saved,
    trashedAt: saved.createdAt,
  });
  mount();
  await openEntry();
  expect(screen.getByRole("textbox", { name: "Eigene Notiz" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
  await waitFor(() =>
    expect(api.trashAtlasNotebookEntry).toHaveBeenCalledWith(
      saved.id,
      1,
      false,
    ),
  );
});

it("meldet einen fehlgeschlagenen Bildstand und speichert ihn nur nach bewusstem Abwählen ohne Bild", async () => {
  vi.mocked(captureAtlasPictures).mockRejectedValue(
    new Error("Bild nicht lesbar."),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Ansicht merken" }));
  await screen.findByRole("alert");
  const button = within(screen.getByRole("dialog")).getByRole("button", {
    name: "Ansicht merken",
  });
  expect(button).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Diagrammstand mitspeichern" }),
  );
  fireEvent.click(button);
  await waitFor(() =>
    expect(api.createAtlasNotebookEntry).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotBase64: null }),
    ),
  );
});

it("zeigt Lesefehler mit erneutem Abruf und keine erfundene leere Sammlung", async () => {
  vi.mocked(api.atlasNotebook).mockRejectedValue(
    new Error("Datenbank nicht lesbar."),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Gemerkte Ansichten" }));
  await screen.findByRole("alert");
  expect(screen.queryByText(/Merke ein Bild, das/)).toBeNull();
  vi.mocked(api.atlasNotebook).mockResolvedValue([saved]);
  fireEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
  await screen.findByRole("button", { name: /Indien im Vergleich/ });
});

it("simuliert im Browser keine persönliche Speicherung", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  mount();
  expect(screen.getByRole("button", { name: "Ansicht merken" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Gemerkte Ansichten" }),
  ).toBeDisabled();
  expect(api.atlasNotebook).not.toHaveBeenCalled();
});

it("allows private cloud notebook editing without a native runtime", async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  vi.stubEnv("VITE_PRIVATE_WEB", "true");
  mount();
  expect(
    screen.getByRole("button", { name: "Ansicht merken" }),
  ).not.toBeDisabled();
  await openEntry();
  fireEvent.change(screen.getByRole("textbox", { name: "Eigene Notiz" }), {
    target: { value: "Cloudnotiz" },
  });
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Notiz speichern",
    }),
  );
  await waitFor(() =>
    expect(api.updateAtlasNotebookEntry).toHaveBeenCalledWith(
      expect.objectContaining({ note: "Cloudnotiz", revision: 1 }),
    ),
  );
  expect(
    screen.getByText(/privat in deinem Cloud-Journal/),
  ).toBeInTheDocument();
});
