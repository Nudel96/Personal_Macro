import { assetPoints } from "./weather-catalog";
import { utcDate } from "./weather-model";
import type { WeatherAsset, WeatherEnvelope } from "./weather-types";

// Synthetic deterministic schema fixture. Never used by product requests.
export function weatherFixture(asset: WeatherAsset): WeatherEnvelope {
  const today = "2026-10-05";
  const points = assetPoints(asset);
  return {
    assetId: asset.id,
    fetchedAt: `${today}T12:15:00Z`,
    pointIds: points.map((p) => p.id),
    responses: points.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      utc_offset_seconds: 0,
      timezone: "GMT",
      current_units: { temperature_2m: "°C" },
      current: { time: `${today}T12:00`, temperature_2m: 23 },
      daily_units: {
        time: "iso8601",
        weather_code: "wmo code",
        temperature_2m_min: "°C",
        temperature_2m_max: "°C",
        precipitation_sum: "mm",
        et0_fao_evapotranspiration: "mm",
        wind_gusts_10m_max: "km/h",
        precipitation_hours: "h",
        precipitation_probability_max: "%",
      },
      daily: {
        time: Array.from({ length: 21 }, (_, i) => utcDate(i - 7, today)),
        weather_code: Array(21).fill(63),
        temperature_2m_min: Array(21).fill(16),
        temperature_2m_max: Array(21).fill(26),
        precipitation_sum: Array(21).fill(4),
        et0_fao_evapotranspiration: Array(21).fill(3),
        wind_gusts_10m_max: Array(21).fill(18),
        precipitation_hours: Array(21).fill(2),
        precipitation_probability_max: Array(21).fill(60),
      },
    })),
  };
}
