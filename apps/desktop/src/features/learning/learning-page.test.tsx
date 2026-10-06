import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LearningPage } from "./learning-page";
import { getLearningProgress, LEARNING_STORAGE_KEY } from "./learning-progress";
import {
  learningLessons,
  learningPaths,
  learningTerms,
} from "./learning-catalog";

vi.mock("../../services/commands", () => ({ isTauri: () => false }));

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_PRIVATE_WEB", "false");
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function mount(url = "/learning") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LearningPage />
    </MemoryRouter>,
  );
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: LEARNING_STORAGE_KEY,
        newValue: null,
      }),
    ),
  );
}

describe("learning workspace flows", () => {
  it("offers contextual entry points and the complete searchable library", () => {
    mount();
    expect(
      screen.getByRole("heading", { name: "Verstehen, was Märkte bewegt." }),
    ).toBeTruthy();
    expect(screen.getByText(`${learningLessons.length} Kapitel`)).toBeTruthy();
    expect(screen.getByText(`${learningPaths.length} Lernwege`)).toBeTruthy();
    expect(
      screen.getByText(`${learningTerms.length} erklärte Begriffe`),
    ).toBeTruthy();
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Learning-Bereiche" }),
      ).getByRole("link", { name: "Alle Kapitel" }),
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Kapitel suchen" }),
      { target: { value: "China PPI" } },
    );
    expect(screen.getByRole("link", { name: /Chinas PPI fällt/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Baumwolle/ })).toBeNull();
  });

  it("preserves search context and the last reading step when returning", () => {
    mount("/learning?view=library&q=CAD&category=currencies");
    fireEvent.click(
      screen.getByRole("link", { name: "CAD · Kanada ist mehr als Öl" }),
    );
    expect(
      screen.getByRole("heading", { name: "Einordnung", level: 2 }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Treiber", level: 2 }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Weiter: Treiber" }));
    expect(
      screen.getByRole("heading", { name: "Treiber", level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText("Worum es hier geht")).toBeTruthy();
    expect(getLearningProgress().last).toEqual({ lesson: "cad", step: 1 });
    fireEvent.click(screen.getByRole("link", { name: "Zur Bibliothek" }));
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Kapitel suchen",
        }) as HTMLInputElement
      ).value,
    ).toBe("CAD");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Themenwelt",
        }) as HTMLSelectElement
      ).value,
    ).toBe("currencies");
    fireEvent.click(screen.getByRole("link", { name: "Entdecken" }));
    fireEvent.click(screen.getByRole("link", { name: "Weiterlesen" }));
    expect(
      screen.getByRole("heading", { name: "Treiber", level: 2 }),
    ).toBeTruthy();
  });

  it("keeps bookmarks independent of understanding and supports correction, notes and all-section reading", () => {
    mount("/learning?lesson=cad&step=5");
    fireEvent.click(screen.getByRole("button", { name: "Merken" }));
    expect(getLearningProgress().saved).toEqual(["cad"]);
    expect(getLearningProgress().known).toEqual([]);
    fireEvent.click(
      screen.getByRole("button", { name: /Reicht der Ölpreisanstieg/ }),
    );
    expect(
      screen.getByText("Schau noch einmal auf den Zusammenhang."),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Steigt Öl wegen Nachfrage/ }),
    );
    expect(screen.getByText("Genau, das ist der Zusammenhang.")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: /In meinen eigenen Worten/ }),
      { target: { value: "CAD: Ölursache, relative Zinsen und USD prüfen." } },
    );
    expect(getLearningProgress().notes.cad).toContain("relative Zinsen");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Als verstanden markieren" })[0],
    );
    expect(getLearningProgress().known).toEqual(["cad"]);
    fireEvent.click(screen.getByRole("button", { name: "Alles" }));
    for (const name of [
      "Einordnung",
      "Treiber",
      "Wirkungskette",
      "Beispiel",
      "Gegenkräfte",
      "Anwenden",
    ])
      expect(screen.getByRole("heading", { name, level: 2 })).toBeTruthy();
  });

  it("links glossary definitions and keeps a selected learning path across chapters", () => {
    mount("/learning?view=glossary&q=PPI");
    expect(
      screen.getByRole("heading", { name: /PPI · Erzeugerpreisindex/ }),
    ).toBeTruthy();
    cleanup();
    mount("/learning?view=paths&path=china");
    fireEvent.click(screen.getByRole("link", { name: "Lernweg beginnen" }));
    expect(screen.getByText(/Kapitel 1 von 7/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("link", {
        name: /Weiter im Lernweg.*Wenn China stagniert/,
      }),
    );
    expect(screen.getByText(/Kapitel 2 von 7/)).toBeTruthy();
  });

  it("recovers from unknown chapters and a search with no results", () => {
    mount("/learning?lesson=missing&step=400");
    fireEvent.click(screen.getByRole("link", { name: "Zur Bibliothek" }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Kapitel suchen" }),
      { target: { value: "xyzunbekannt" } },
    );
    expect(
      screen.getByText("Für diese Auswahl gibt es keine Kapitel."),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Filter zurücksetzen" }),
    );
    expect(screen.getAllByRole("link", { name: /CAD · Kanada/ }).length).toBe(
      1,
    );
  });
});
