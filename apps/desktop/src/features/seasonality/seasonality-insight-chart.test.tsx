import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SeasonalityAnalysis } from "../../types/domain";
import { annualAnalysisFixture } from "./__fixtures__/annual-analysis";
import { defaultChartSettings } from "./seasonality-annual-chart";
import { SeasonalityInsightChart } from "./seasonality-insight-chart";

vi.mock("../../charts/base-chart", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../charts/base-chart")>()),
  BaseChart: ({
    ariaLabel,
    onEvents,
  }: {
    ariaLabel: string;
    onEvents: Record<string, (value: unknown) => void>;
  }) => (
    <div role="img" aria-label={ariaLabel}>
      <button
        onClick={() =>
          onEvents.click({ componentType: "series", dataIndex: 2 })
        }
      >
        Test: dritten Tag wählen
      </button>
    </div>
  ),
}));

afterEach(cleanup);
function Harness({
  analysis = annualAnalysisFixture(),
}: {
  analysis?: SeasonalityAnalysis;
}) {
  const [settings, setSettings] = useState(defaultChartSettings);
  return (
    <SeasonalityInsightChart
      analysis={analysis}
      settings={settings}
      onSettingsChange={setSettings}
    />
  );
}

describe("seasonality chart interaction", () => {
  it("lets the user adjust smoothing and scale, and shares them with fullscreen", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Ohne Glättung",
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Glättung in Kalendertagen" }),
      { target: { value: "9" } },
    );
    await user.click(screen.getByRole("button", { name: "Rendite %" }));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "9 Kalendertage",
    );
    expect(screen.getByText("+2 %")).toBeTruthy();
    const opener = screen.getByRole("button", {
      name: "Seasonality-Chart im Vollbild öffnen",
    });
    await user.click(opener);
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByRole("slider", { name: "Glättung in Kalendertagen" }),
    ).toHaveProperty("value", "9");
    await user.click(dialog.getByRole("button", { name: "Glättung: 5 Tage" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(
      screen.getByRole("slider", { name: "Glättung in Kalendertagen" }),
    ).toHaveProperty("value", "5");
    await user.click(
      screen.getByRole("button", { name: "Chartdarstellung zurücksetzen" }),
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Ohne Glättung. Index 100",
    );
  });

  it("provides the same raw daily evidence by chart click or accessible day input", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Test: dritten Tag wählen" }),
    );
    expect(screen.getByText("99")).toBeTruthy();
    expect(
      screen.getByRole("slider", { name: "Kalendertag untersuchen" }),
    ).toHaveProperty("value", "3");
    fireEvent.change(
      screen.getByRole("slider", { name: "Kalendertag untersuchen" }),
      { target: { value: "2" } },
    );
    expect(screen.getByText("102")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fensterumfeld" }));
    expect(
      screen
        .getByRole("button", { name: "Ganzes Jahr" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    await user.click(screen.getByRole("button", { name: "Ganzes Jahr" }));
    expect(
      screen
        .getByRole("button", { name: "Ganzes Jahr" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps settings when the cohort changes and identifies empty and exploratory samples", async () => {
    const user = userEvent.setup();
    const analysis = annualAnalysisFixture();
    const view = render(<Harness analysis={analysis} />);
    await user.click(screen.getByRole("button", { name: "Glättung: 15 Tage" }));
    view.rerender(
      <Harness
        analysis={{
          ...analysis,
          selectedYears: [2024],
          annualCurve: analysis.annualCurve.map((point) => ({
            ...point,
            samples: 1,
          })),
        }}
      />,
    );
    expect(screen.getByText("Explorativ")).toBeTruthy();
    expect(
      screen.getByRole("slider", { name: "Glättung in Kalendertagen" }),
    ).toHaveProperty("value", "15");
    view.rerender(
      <Harness
        analysis={{ ...analysis, selectedYears: [], annualCurve: [] }}
      />,
    );
    expect(
      screen.getByText("Keine Jahreskurve für diese Auswahl"),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("slider", { name: "Glättung in Kalendertagen" }),
    ).toHaveProperty("disabled", true);
  });
});
