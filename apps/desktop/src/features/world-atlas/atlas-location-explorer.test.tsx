import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AtlasLocationExplorer from "./atlas-location-explorer";
import { atlasCatalog } from "./atlas-catalog";
import geometry from "./data/map-geometry.json";

vi.mock("../../services/commands", () => ({ isTauri: () => false }));
afterEach(cleanup);
const germany = atlasCatalog.geographies.find((a) => a.iso3 === "DEU")!;
const india = atlasCatalog.geographies.find((a) => a.iso3 === "IND")!;
function mount(region: string | null = null, search: string | null = null) {
  const onChoose = vi.fn(),
    onFilter = vi.fn();
  render(
    <AtlasLocationExplorer
      geography={germany}
      comparison={india}
      allowComparison
      filters={{ region, search }}
      onChoose={onChoose}
      onFilter={onFilter}
    />,
  );
  return { onChoose, onFilter };
}

it("hält unabhängige Kartengebiete getrennt und alle Kataloggebiete über die Liste erreichbar", () => {
  mount();
  const ids = geometry.areas.map((a) => a.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain("m49:254"); // French Guiana is separate from France.
  expect(ids).toContain("m49:250");
  expect(ids).toContain("provider:TWN");
  expect(ids).toContain("provider:XKX");
  expect(geometry.unbound.map((a) => a.id)).toEqual(["CYN", "SOL"]);
  expect(
    ids.every((id) => atlasCatalog.geographies.some((a) => a.id === id)),
  ).toBe(true);
  expect(
    within(
      screen.getByRole("group", { name: "Gefilterte Gebiete" }),
    ).getAllByRole("button"),
  ).toHaveLength(atlasCatalog.geographies.length);
  expect(
    screen.getByRole("button", { name: "Vatikanstadt in der Liste wählen" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Vatikanstadt auf der Karte wählen" }),
  ).toBeNull();
});

it("wählt per Karte oder Liste dasselbe Gebiet und trennt die Vergleichsauswahl", () => {
  const { onChoose } = mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Indien auf der Karte wählen" }),
  );
  expect(onChoose).toHaveBeenLastCalledWith(india, "area");
  fireEvent.click(screen.getByRole("button", { name: "Vergleich wählen" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Indien in der Liste wählen" }),
  );
  expect(onChoose).toHaveBeenLastCalledWith(india, "compare");
});

it("erhält einen Tastatureinstieg und aktiviert gefilterte Kartenländer per Enter", () => {
  const { onChoose, onFilter } = mount("Asia", "IND");
  const map = screen.getByRole("group", {
    name: "Weltkarte zur Gebietsauswahl",
  });
  expect(map.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  const indiaButton = screen.getByRole("button", {
    name: "Indien auf der Karte wählen",
  });
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Deutschland auf der Karte wählen" }),
    { key: "ArrowLeft" },
  );
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Indonesien auf der Karte wählen",
  );
  fireEvent.keyDown(indiaButton, { key: "Home" });
  expect(document.activeElement).toBe(indiaButton);
  fireEvent.keyDown(indiaButton, { key: "Enter" });
  expect(onChoose).toHaveBeenLastCalledWith(india, "area");
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Land oder Gebiet suchen" }),
    { target: { value: "Vatikan" } },
  );
  expect(onFilter).toHaveBeenLastCalledWith({ mapSearch: "Vatikan" });
});

it("meldet eine erfolglose Suche und zeichnet keine erfundene Aggregatfläche", () => {
  render(
    <AtlasLocationExplorer
      geography={atlasCatalog.geographies.find((a) => a.id === "un-wpp:903")!}
      allowComparison={false}
      filters={{ region: "not-a-region", search: "xyzmissing" }}
      onChoose={vi.fn()}
      onFilter={vi.fn()}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain(
    "Kein Gebiet gefunden",
  );
  expect(
    screen.getByText(/Welt- oder Quellenaggregat; keine einzelne Länderfläche/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Vergleich wählen" })).toBeNull();
  expect(
    screen
      .getByRole("group", { name: "Weltkarte zur Gebietsauswahl" })
      .querySelectorAll('[tabindex="0"]'),
  ).toHaveLength(0);
});
