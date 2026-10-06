import rawCatalog from "./data/catalog.json";
import type {
  WeatherAsset,
  WeatherCatalog,
  WeatherPhase,
  WeatherPoint,
} from "./weather-types";

export const weatherCatalog = rawCatalog as WeatherCatalog;
export const weatherAssets = weatherCatalog.assets;
export const WEATHER_TTL_MS = 30 * 60_000;
export const WEATHER_MAX_BYTES = 4 * 1024 * 1024;
export const WEATHER_QUERY_VERSION = "daily-wmo-2";
export const WEATHER_DAILY_VARIABLES =
  "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_gusts_10m_max,precipitation_hours,precipitation_probability_max";

export const phaseLabels: Record<WeatherPhase, string> = {
  growth: "Aussaat / Wachstum",
  flowering: "Blüte / Füllung",
  ripening: "Reife",
  harvest: "Ernte / Trocknung",
  dormant: "Ruhe / außerhalb der Hauptsaison",
  mixed: "Dauerkultur · Phasen überlappen",
};

export function assetRegions(asset: WeatherAsset) {
  return asset.regions.map((link) =>
    weatherCatalog.regions.find((r) => r.id === link.regionId)!,
  );
}

export function assetPoints(asset: WeatherAsset): WeatherPoint[] {
  return assetRegions(asset).flatMap((r) => r.points);
}

export function weatherUrl(asset: WeatherAsset): string {
  const points = assetPoints(asset);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", points.map((p) => p.latitude).join(","));
  url.searchParams.set("longitude", points.map((p) => p.longitude).join(","));
  url.searchParams.set("daily", WEATHER_DAILY_VARIABLES);
  url.searchParams.set("current", "temperature_2m");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", "14");
  url.searchParams.set("past_days", "7");
  url.searchParams.set("models", "best_match");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("precipitation_unit", "mm");
  return url.toString();
}

export function phaseFor(
  asset: WeatherAsset,
  regionId: string,
  date: string,
): WeatherPhase {
  const month = Number(date.slice(5, 7));
  return (
    asset.regions.find((r) => r.regionId === regionId)?.phases[month - 1] ??
    "mixed"
  );
}
