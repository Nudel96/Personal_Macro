import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { assetRegions, weatherAssets } from "./weather-catalog";
import { weatherFixture } from "./weather-test-fixture";
import { WeatherPage } from "./weather-page";

const forecast = vi.hoisted(() => vi.fn());
vi.mock("../../services/commands", () => ({
  api: { weatherForecast: forecast },
  isTauri: () => false,
}));
vi.mock("./weather-chart", () => ({
  WeatherChart: () => <div>Wetterdiagramm</div>,
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T12:30:00Z"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forecast.mockReset();
  vi.useRealTimers();
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/weather?asset=coffee-arabica"]}>
        <WeatherPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("weather workspace", () => {
  it("keeps point selection, illustrated weather and forecast day in sync", async () => {
    const asset = weatherAssets[0];
    const region = assetRegions(asset)[0];
    const envelope = weatherFixture(asset);
    const row = envelope.responses[1] as {
      daily: {
        weather_code: number[];
        temperature_2m_min: number[];
        temperature_2m_max: number[];
      };
    };
    row.daily.weather_code[7] = 0;
    row.daily.weather_code[8] = 73;
    row.daily.temperature_2m_min[8] = -2;
    row.daily.temperature_2m_max[8] = 2;
    forecast.mockResolvedValue(envelope);
    mount();
    await screen.findByRole("img", {
      name: /Schematisches Wetterbild.*Mäßiger Regen/,
    });
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Ort für das Wetterbild" }),
      ).getByRole("button", { name: new RegExp(region.points[1].name) }),
    );
    expect(
      screen.getByRole("img", {
        name: /Schematisches Wetterbild.*Klarer Himmel/,
      }),
    ).toHaveAccessibleName(expect.stringContaining(region.points[1].name));
    const outlook = screen.getByRole("group", {
      name: "Visuelle Wettervorhersage",
    });
    fireEvent.click(
      within(outlook).getByRole("button", {
        name: /06\.10\..*Mäßiger Schneefall/,
      }),
    );
    expect(
      screen.getByRole("img", {
        name: /Schematisches Wetterbild.*2026-10-06.*Mäßiger Schneefall/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /^Wetterkarte ·/ }),
    ).toHaveAccessibleName(expect.stringContaining("2026-10-06"));
    expect(forecast).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Bewegung" }));
    expect(
      screen.getByRole("checkbox", { name: "Bewegung" }),
    ).not.toBeChecked();
  });
  it("loads true command data, shows regions and changes asset without stale data", async () => {
    forecast.mockImplementation(async (id: string) =>
      weatherFixture(weatherAssets.find((a) => a.id === id)!),
    );
    mount();
    await waitFor(() =>
      expect(forecast).toHaveBeenCalledWith("coffee-arabica"),
    );
    await screen.findByText(/30-Minuten-Cache/);
    expect(
      screen.getByRole("heading", { name: "Wetter & Rohstoffe" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /^Wetterkarte ·/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Kakao\s*6 Regionen/ }));
    await waitFor(() => expect(forecast).toHaveBeenCalledWith("cocoa"));
    expect(screen.getByRole("heading", { name: "Kakao" })).toBeInTheDocument();
    expect(
      screen.getAllByText("Kakaogürtel · Südwesten").length,
    ).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Vorhersage|Heutiger Modelltag/), {
      target: { value: "10" },
    });
    expect(screen.getByText(/Ab dem achten Vorhersagetag/)).toBeInTheDocument();
  });
  it("keeps an unavailable provider visible and never substitutes demo weather", async () => {
    forecast.mockRejectedValue({
      code: "WEATHER_FETCH_FAILED",
      message: "Der Wetteranbieter ist nicht erreichbar.",
    });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "nicht erreichbar",
    );
    expect(
      screen.getAllByText("Nicht ausreichend verfügbar").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Wetterdiagramm")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Wetterart nicht verfügbar/ }),
    ).toBeInTheDocument();
  });
  it("keeps old values visible while suspending their impact assessment", async () => {
    vi.setSystemTime(new Date("2026-10-05T16:30:00Z"));
    forecast.mockResolvedValue(weatherFixture(weatherAssets[0]));
    mount();
    expect(
      await screen.findByText(/Der Wetterstand ist älter als drei Stunden/),
    ).toHaveAttribute("role", "status");
    expect(screen.getByText("Wetterdiagramm")).toBeInTheDocument();
    expect(
      screen.getAllByText("Nicht ausreichend verfügbar").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Niederschlag kann Wasserversorgung unterstützen"),
    ).not.toBeInTheDocument();
  });
});
import "@testing-library/jest-dom/vitest";
