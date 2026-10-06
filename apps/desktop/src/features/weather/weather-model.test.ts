import { describe, expect, it } from "vitest";
import {
  assetPoints,
  assetRegions,
  phaseFor,
  weatherAssets,
  weatherCatalog,
  weatherUrl,
} from "./weather-catalog";
import {
  assessRegion,
  parseWeatherEnvelope,
  summarizeRegion,
} from "./weather-model";
import { projectWeatherPoint } from "./weather-map";
import { weatherFixture } from "./weather-test-fixture";
import { weatherCondition } from "./weather-conditions";

const asset = weatherAssets[0];
const region = assetRegions(asset)[0];
const today = "2026-10-05";
function snapshot() {
  return parseWeatherEnvelope(weatherFixture(asset), asset);
}

describe("weather catalogue and geography", () => {
  it("keeps market varieties and all region calendars explicit", () => {
    expect(weatherAssets.length).toBeGreaterThanOrEqual(20);
    for (const id of [
      "coffee-arabica",
      "coffee-robusta",
      "wheat-winter",
      "wheat-spring",
      "cocoa",
    ])
      expect(weatherAssets.some((a) => a.id === id)).toBe(true);
    expect(new Set(weatherCatalog.regions.map((r) => r.id)).size).toBe(
      weatherCatalog.regions.length,
    );
    for (const a of weatherAssets) {
      expect(a.regions.length).toBeGreaterThan(0);
      expect(assetPoints(a)).toHaveLength(a.regions.length * 3);
      for (const link of a.regions) {
        expect(link.phases).toHaveLength(12);
        expect(
          weatherCatalog.regions.find((r) => r.id === link.regionId)?.points,
        ).toHaveLength(3);
      }
      const url = new URL(weatherUrl(a));
      expect(url.origin).toBe("https://api.open-meteo.com");
      expect(url.searchParams.get("timezone")).toBe("UTC");
      expect(url.searchParams.get("past_days")).toBe("7");
      expect(url.searchParams.get("forecast_days")).toBe("14");
    }
    expect(phaseFor(asset, region.id, today)).toBe("flowering");
    expect(phaseFor(asset, region.id, "2026-06-01")).toBe("harvest");
  });
  it("aligns weather coordinates with the audited Equal Earth map", () => {
    const [x, y] = projectWeatherPoint(0, 0);
    expect(x).toBe(480);
    // Equator ordinate independently rounded in the checked-in map geometry.
    expect(y).toBeCloseTo(238.76, 2);
    const [east] = projectWeatherPoint(180, 0);
    const [west] = projectWeatherPoint(-180, 0);
    expect(east).toBeCloseTo(950, 5);
    expect(west).toBeCloseTo(10, 5);
    expect(projectWeatherPoint(-45.43, -21.55)[0]).toBeLessThan(480);
  });
});

describe("weather response contract", () => {
  it("distinguishes clear skies, missing codes and older backend responses", () => {
    const envelope = weatherFixture(asset);
    const row = envelope.responses[0] as {
      daily_units: { weather_code?: string };
      daily: { weather_code?: (number | null)[] };
    };
    row.daily.weather_code![7] = 0;
    row.daily.weather_code![8] = null;
    const days = parseWeatherEnvelope(envelope, asset).points[0].days;
    expect(weatherCondition(days[7].weatherCode).kind).toBe("clear");
    expect(weatherCondition(days[8].weatherCode).kind).toBe("unknown");
    delete row.daily.weather_code;
    delete row.daily_units.weather_code;
    const old = parseWeatherEnvelope(envelope, asset).points[0].days[7];
    expect(old.weatherCode).toBeNull();
    expect(old.rainMm).toBe(4);
    expect(weatherCondition(97).label).toBe("Starkes Gewitter");
    expect(weatherCondition(99).label).toContain("Hagel");
    expect(weatherCondition(10).kind).toBe("unknown");
  });
  it.each(["unit", "count", "fraction", "range"])(
    "rejects invalid weather code %s before drawing a weather condition",
    (kind) => {
      const envelope = weatherFixture(asset);
      const row = envelope.responses[0] as {
        daily_units: { weather_code: string };
        daily: { weather_code: number[] };
      };
      if (kind === "unit") row.daily_units.weather_code = "symbol";
      if (kind === "count") row.daily.weather_code.pop();
      if (kind === "fraction") row.daily.weather_code[7] = 63.5;
      if (kind === "range") row.daily.weather_code[7] = 100;
      expect(() => parseWeatherEnvelope(envelope, asset)).toThrow();
    },
  );
  it("preserves null separately from true zero", () => {
    const envelope = weatherFixture(asset);
    const row = envelope.responses[0] as {
      daily: { precipitation_sum: (number | null)[] };
    };
    row.daily.precipitation_sum[0] = null;
    row.daily.precipitation_sum[1] = 0;
    const result = parseWeatherEnvelope(envelope, asset);
    expect(result.points[0].days[0].rainMm).toBeNull();
    expect(result.points[0].days[1].rainMm).toBe(0);
  });
  it.each([
    "units",
    "coordinate",
    "timezone",
    "date",
    "count",
    "identity",
    "range",
    "timestamp",
  ])("rejects an invalid %s instead of manufacturing values", (kind) => {
    const envelope = weatherFixture(asset);
    const row = envelope.responses[0] as {
      latitude: number;
      utc_offset_seconds: number;
      current: { time: string };
      daily_units: { precipitation_sum: string };
      daily: { time: string[]; precipitation_sum: number[] };
    };
    if (kind === "units") row.daily_units.precipitation_sum = "inch";
    if (kind === "coordinate") row.latitude += 1;
    if (kind === "timezone") row.utc_offset_seconds = 3600;
    if (kind === "date") row.daily.time[3] = row.daily.time[2];
    if (kind === "count") envelope.responses.pop();
    if (kind === "identity") envelope.pointIds.reverse();
    if (kind === "range") row.daily.precipitation_sum[0] = -1;
    if (kind === "timestamp") row.current.time = "2026-10-04T12:00";
    expect(() => parseWeatherEnvelope(envelope, asset)).toThrow();
  });
});

describe("explainable agricultural weather rules", () => {
  it("interprets rainfall differently during growth and harvest", () => {
    const s = snapshot();
    for (const p of s.points) p.days[7].rainMm = 12;
    expect(assessRegion(asset, region, s, today, "growth").effect).toBe(
      "supportive",
    );
    const harvest = assessRegion(asset, region, s, today, "harvest");
    expect(harvest.effect).toBe("stress");
    expect(
      harvest.findings.some((f) => f.title.includes("Reife / Ernte")),
    ).toBe(true);
  });
  it("does not score winter rest using an active crop frost rule", () => {
    const s = snapshot();
    for (const p of s.points) p.days[7].minC = -5;
    expect(assessRegion(asset, region, s, today, "dormant").effect).toBe(
      "context",
    );
    expect(assessRegion(asset, region, s, today, "flowering").effect).toBe(
      "stress",
    );
  });
  it("does not turn incomplete coverage into a favorable outcome", () => {
    const s = snapshot();
    s.points[0].days[7].et0Mm = null;
    const result = assessRegion(asset, region, s, today, "growth");
    expect(result.coverage).toBe(2);
    expect(result.effect).toBe("unknown");
    expect(result.findings.some((f) => f.kind === "support")).toBe(false);
  });
  it("shows simultaneous rain support and flowering heat stress", () => {
    const s = snapshot();
    s.points[0].days[7].maxC = 35;
    const result = assessRegion(asset, region, s, today, "flowering");
    expect(result.effect).toBe("mixed");
    expect(result.findings.map((f) => f.kind)).toContain("support");
    expect(result.findings.map((f) => f.kind)).toContain("stress");
  });
  it("does not conceal a point extreme inside an average", () => {
    const s = snapshot();
    s.points[0].days[7].rainMm = 60;
    const result = assessRegion(asset, region, s, today, "growth");
    expect(result.rainMm).toBeCloseTo(68 / 3);
    expect(result.findings.some((f) => f.title === "Starkregenhinweis")).toBe(
      true,
    );
    expect(result.effect).toBe("watch");
  });
  it("requires seven complete days before describing water balance pressure", () => {
    const s = snapshot();
    for (const p of s.points)
      for (const d of p.days) {
        d.rainMm = 0;
        d.et0Mm = 4;
      }
    const result = assessRegion(asset, region, s, today, "flowering", 7);
    expect(result.balanceMm).toBe(-28);
    expect(result.findings.some((f) => f.title.includes("Wasserbilanz"))).toBe(
      true,
    );
    expect(
      result.findings.find((f) => f.title.includes("Wasserbilanz"))
        ?.explanation,
    ).toContain("Bodenwasser und Bewässerung sind unbekannt");
    for (const p of s.points) p.days[9].et0Mm = null;
    expect(
      assessRegion(asset, region, s, today, "flowering").findings.some((f) =>
        f.title.includes("Wasserbilanz"),
      ),
    ).toBe(false);
  });
  it("keeps genuine zero rain available and missing regions unavailable", () => {
    const s = snapshot();
    for (const p of s.points) p.days[7].rainMm = 0;
    expect(summarizeRegion(s, region, today).rainMm).toBe(0);
    expect(assessRegion(asset, region, undefined, today, "growth").effect).toBe(
      "unknown",
    );
    expect(assessRegion(asset, region, s, "2027-01-01", "growth").effect).toBe(
      "unknown",
    );
  });
});
