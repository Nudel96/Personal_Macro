import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, isTauri } from "../../services/commands";
import { useAtlasLastView } from "./use-atlas-last-view";
import type { AtlasSavedContext } from "./atlas-notebook-types";

vi.mock("../../services/commands", () => ({
  isTauri: vi.fn(),
  api: { atlasLastContext: vi.fn(), saveAtlasLastContext: vi.fn() },
}));
function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const error = useAtlasLastView(new URLSearchParams(value), (params) =>
    setValue(params.toString()),
  );
  return (
    <>
      <output>{value}</output>
      <p>{error}</p>
      <button
        onClick={() =>
          setValue("area=m49%3A276&historySince=1500&historyProportional=0")
        }
      >
        Deutschland
      </button>
      <button
        onClick={() =>
          setValue("area=m49%3A156&demoYear=2050&demoProjection=1&numbers=0")
        }
      >
        China
      </button>
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(api.atlasLastContext).mockResolvedValue(null);
  vi.mocked(api.saveAtlasLastContext).mockResolvedValue(undefined);
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  vi.useRealTimers();
});
const tick = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
};

it("stellt die letzte vollständige Auswahl mit Jahr, Projektion und Darstellungsart wieder her", async () => {
  const context = {
    version: 1,
    params: {
      area: "m49:356",
      compare: "m49:156",
      demoYear: "2050",
      demoProjection: "1",
      numbers: "0",
      statGroup: "education",
      mapSearch: "Indien",
    },
  };
  vi.mocked(api.atlasLastContext).mockResolvedValue(context);
  render(<Harness />);
  await tick();
  expect(
    Object.fromEntries(
      new URLSearchParams(screen.getByRole("status").textContent!),
    ),
  ).toEqual(context.params);
  expect(api.saveAtlasLastContext).not.toHaveBeenCalled();
});
it("lässt einen ausdrücklichen Link und eine Navigation während des Ladens vorgehen", async () => {
  let resolve!: (value: AtlasSavedContext) => void;
  vi.mocked(api.atlasLastContext).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<Harness initial="area=m49%3A840" />);
  fireEvent.click(screen.getByRole("button", { name: "Deutschland" }));
  await act(async () => resolve({ version: 1, params: { area: "m49:356" } }));
  await tick();
  expect(screen.getByRole("status").textContent).toContain("historySince=1500");
  expect(api.saveAtlasLastContext).toHaveBeenLastCalledWith({
    version: 1,
    params: { area: "m49:276", historySince: "1500", historyProportional: "0" },
  });
});
it("überschreibt bei Lesefehlern keinen möglicherweise noch vorhandenen Stand", async () => {
  vi.mocked(api.atlasLastContext).mockRejectedValue(new Error("unreadable"));
  render(<Harness />);
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "China" }));
  await tick();
  expect(screen.getByText(/wird deshalb nicht überschrieben/)).toBeTruthy();
  expect(api.saveAtlasLastContext).not.toHaveBeenCalled();
});
it("ordnet langsame Schreibvorgänge und erhält die letzte schnelle Änderung", async () => {
  let resolve!: () => void;
  vi.mocked(api.saveAtlasLastContext).mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<Harness initial="area=m49%3A840" />);
  await tick();
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "Deutschland" }));
  fireEvent.click(screen.getByRole("button", { name: "China" }));
  await tick();
  expect(api.saveAtlasLastContext).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  await tick();
  expect(api.saveAtlasLastContext).toHaveBeenCalledTimes(2);
  expect(api.saveAtlasLastContext).toHaveBeenLastCalledWith({
    version: 1,
    params: {
      area: "m49:156",
      demoYear: "2050",
      demoProjection: "1",
      numbers: "0",
    },
  });
});

const busy = { code: "ATLAS_PREFERENCES_BUSY", message: "Kurzzeitig belegt" };

it("speichert nach vorübergehender Schreibsperre ohne Navigation erneut und meldet danach keinen Fehler", async () => {
  vi.mocked(api.saveAtlasLastContext)
    .mockRejectedValueOnce(busy)
    .mockRejectedValueOnce(busy);
  const page = render(<Harness initial="area=m49%3A356" />);
  await tick();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(api.saveAtlasLastContext).toHaveBeenCalledTimes(3);
  expect(api.saveAtlasLastContext).toHaveBeenLastCalledWith({
    version: 1,
    params: { area: "m49:356" },
  });
  expect(screen.queryByText(/konnte nicht gesichert/)).toBeNull();
  page.unmount();
  await tick();
  expect(api.saveAtlasLastContext).toHaveBeenCalledTimes(3);
});

it("begrenzt Wiederholungen und speichert nach einer späteren Änderung wieder", async () => {
  vi.mocked(api.saveAtlasLastContext).mockRejectedValue(busy);
  render(<Harness initial="area=m49%3A356" />);
  await tick();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(api.saveAtlasLastContext).toHaveBeenCalledTimes(4);
  expect(screen.getByText(/konnte nicht gesichert/)).toBeTruthy();
  vi.mocked(api.saveAtlasLastContext).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button", { name: "China" }));
  await tick();
  expect(api.saveAtlasLastContext).toHaveBeenCalledTimes(5);
  expect(screen.queryByText(/konnte nicht gesichert/)).toBeNull();
});

it("überspringt überholte Auswahlen zwischen einer Sperre und dem nächsten Versuch", async () => {
  let reject!: (error: unknown) => void;
  vi.mocked(api.saveAtlasLastContext).mockImplementationOnce(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  render(<Harness initial="area=m49%3A840" />);
  await tick();
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "Deutschland" }));
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "China" }));
  await tick();
  await act(async () => reject(busy));
  await tick();
  expect(
    vi
      .mocked(api.saveAtlasLastContext)
      .mock.calls.map(([context]) => context.params.area),
  ).toEqual(["m49:840", "m49:156"]);
  expect(screen.queryByText(/konnte nicht gesichert/)).toBeNull();
});

it("wiederholt andere Datenbankfehler nicht automatisch", async () => {
  vi.mocked(api.saveAtlasLastContext).mockRejectedValue({
    code: "DATABASE_ERROR",
    message: "Nicht lesbar",
  });
  const page = render(<Harness initial="area=m49%3A356" />);
  await tick();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(api.saveAtlasLastContext).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/konnte nicht gesichert/)).toBeTruthy();
  // Leaving the page performs its separately requested final flush.
  vi.mocked(api.saveAtlasLastContext).mockResolvedValue(undefined);
  page.unmount();
  await tick();
});

it("wartet beim schnellen Wiederöffnen auf die letzte Speicherung der vorherigen Seite", async () => {
  let stored: AtlasSavedContext | null = null;
  let release!: () => void;
  vi.mocked(api.atlasLastContext).mockImplementation(async () => stored);
  vi.mocked(api.saveAtlasLastContext).mockImplementationOnce(
    (context) =>
      new Promise<void>((resolve) => {
        release = () => {
          stored = context;
          resolve();
        };
      }),
  );
  vi.mocked(api.saveAtlasLastContext).mockImplementation(async (context) => {
    stored = context;
  });
  const first = render(<Harness initial="area=m49%3A276" />);
  await tick();
  first.unmount();
  render(<Harness />);
  await tick();
  expect(api.atlasLastContext).toHaveBeenCalledTimes(1);
  await act(async () => release());
  await tick();
  expect(api.atlasLastContext).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status").textContent).toContain("area=m49%3A276");
});
