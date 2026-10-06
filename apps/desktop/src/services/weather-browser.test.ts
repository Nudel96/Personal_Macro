import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weatherAssets } from "../features/weather/weather-catalog";
import { weatherFixture } from "../features/weather/weather-test-fixture";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T12:30:00Z"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("real browser weather transport", () => {
  it("deduplicates requests, omits credentials and honors the 30-minute cache", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify(weatherFixture(weatherAssets[0]).responses),
          ),
      );
    vi.stubGlobal("fetch", fetcher);
    const { browserWeatherForecast } = await import("./weather-browser");
    const [a, b] = await Promise.all([
      browserWeatherForecast(weatherAssets[0].id),
      browserWeatherForecast(weatherAssets[0].id),
    ]);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    await browserWeatherForecast(weatherAssets[0].id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-05T13:01:00Z"));
    await browserWeatherForecast(weatherAssets[0].id);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects bad units without caching an apparently successful forecast", async () => {
    const fixture = weatherFixture(weatherAssets[0]);
    (
      fixture.responses[0] as { daily_units: { precipitation_sum: string } }
    ).daily_units.precipitation_sum = "inch";
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(fixture.responses)));
    vi.stubGlobal("fetch", fetcher);
    const { browserWeatherForecast } = await import("./weather-browser");
    await expect(
      browserWeatherForecast(weatherAssets[0].id),
    ).rejects.toMatchObject({ code: "WEATHER_RESPONSE_INVALID" });
    await expect(
      browserWeatherForecast(weatherAssets[0].id),
    ).rejects.toMatchObject({ code: "WEATHER_RESPONSE_INVALID" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports a provider limit and refuses arbitrary asset IDs without a fetch", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    const { browserWeatherForecast } = await import("./weather-browser");
    await expect(
      browserWeatherForecast("not-catalogued"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      browserWeatherForecast(weatherAssets[0].id),
    ).rejects.toMatchObject({ code: "WEATHER_RATE_LIMIT" });
  });
});
