import {
  assetPoints,
  weatherAssets,
  weatherUrl,
  WEATHER_MAX_BYTES,
  WEATHER_TTL_MS,
} from "../features/weather/weather-catalog";
import type { WeatherEnvelope } from "../features/weather/weather-types";
import { parseWeatherEnvelope } from "../features/weather/weather-model";

const cache = new Map<string, WeatherEnvelope>();
const pending = new Map<string, Promise<WeatherEnvelope>>();
const failures = new Map<string, { at: number; error: unknown }>();

async function fetchForecast(assetId: string): Promise<WeatherEnvelope> {
  const asset = weatherAssets.find((a) => a.id === assetId);
  if (!asset)
    throw {
      code: "VALIDATION_ERROR",
      message: "Dieser Rohstoff ist nicht im Wetterkatalog.",
    };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(weatherUrl(asset), {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw {
        code:
          response.status === 429
            ? "WEATHER_RATE_LIMIT"
            : "WEATHER_PROVIDER_ERROR",
        message:
          response.status === 429
            ? "Das Abruflimit des Wetteranbieters ist erreicht. Bitte später erneut laden."
            : "Der Wetteranbieter hat den Abruf nicht beantwortet. Bitte später erneut laden.",
      };
    if (!response.body) throw Error("missing body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > WEATHER_MAX_BYTES) {
        await reader.cancel();
        throw {
          code: "WEATHER_RESPONSE_INVALID",
          message: "Die Wetterantwort überschreitet die zulässige Größe.",
        };
      }
      chunks.push(part.value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw: unknown = JSON.parse(new TextDecoder().decode(data));
    const envelope: WeatherEnvelope = {
      assetId,
      fetchedAt: new Date().toISOString(),
      pointIds: assetPoints(asset).map((p) => p.id),
      responses: Array.isArray(raw) ? raw : [raw],
    };
    parseWeatherEnvelope(envelope, asset);
    return envelope;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error) throw error;
    throw {
      code: "WEATHER_FETCH_FAILED",
      message:
        "Wetterdaten konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function browserWeatherForecast(
  assetId: string,
): Promise<WeatherEnvelope> {
  const previous = cache.get(assetId);
  if (previous && Date.now() - Date.parse(previous.fetchedAt) < WEATHER_TTL_MS)
    return previous;
  const failed = failures.get(assetId);
  if (failed && Date.now() - failed.at < 60_000) throw failed.error;
  const inFlight = pending.get(assetId);
  if (inFlight) return inFlight;
  const request = fetchForecast(assetId)
    .then((value) => {
      cache.set(assetId, value);
      failures.delete(assetId);
      return value;
    })
    .catch((error: unknown) => {
      failures.set(assetId, { at: Date.now(), error });
      throw error;
    })
    .finally(() => pending.delete(assetId));
  pending.set(assetId, request);
  return request;
}
