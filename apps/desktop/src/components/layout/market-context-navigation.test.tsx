import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MarketContextNavigation } from "./market-context-navigation";

afterEach(cleanup);

function renderNavigation(route = "/macro") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <MarketContextNavigation />
    </MemoryRouter>,
  );
}

describe("MarketContextNavigation", () => {
  it("ordnet Kernanalysen und alle fünf Datenmodule verständlich", () => {
    renderNavigation();

    const navigation = screen.getByRole("navigation", {
      name: "Marktkontext",
    });

    expect(within(navigation).getByText("Signal Research")).toBeTruthy();
    expect(within(navigation).getByText("Macro Heatmap")).toBeTruthy();
    expect(within(navigation).getByText("Regime Insights")).toBeTruthy();

    for (const [label, description] of [
      ["Wirtschaftskalender", "Releases & Termine"],
      ["Wirtschaftsdaten", "Actual · Forecast · Previous"],
      ["COT Analyse", "Institutionelle Positionierung"],
      ["Seasonality", "Saisonale Muster & Zyklen"],
      ["Leitzinsen", "Policy-Pfade & Differenzen"],
    ]) {
      expect(within(navigation).getByText(label)).toBeTruthy();
      expect(within(navigation).getByText(description)).toBeTruthy();
    }
  });

  it("kennzeichnet das aktive Datenmodul semantisch und visuell", () => {
    renderNavigation("/cot");

    const cotLink = screen.getByRole("link", { name: /COT Analyse/ });
    const calendarLink = screen.getByRole("link", {
      name: /Wirtschaftskalender/,
    });

    expect(cotLink.getAttribute("href")).toBe("/cot");
    expect(cotLink.getAttribute("aria-current")).toBe("page");
    expect(cotLink.className).toContain("active");
    expect(calendarLink.getAttribute("aria-current")).toBeNull();
  });
});
