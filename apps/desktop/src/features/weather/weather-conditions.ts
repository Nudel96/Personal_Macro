export type WeatherKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "freezing"
  | "snow"
  | "storm"
  | "unknown";

export interface WeatherCondition {
  kind: WeatherKind;
  label: string;
}

// Open-Meteo's daily WMO code describes the most severe condition of the day.
// Never infer cloud cover or precipitation type from temperature/rain totals.
const conditions: Record<number, WeatherCondition> = {
  0: { kind: "clear", label: "Klarer Himmel" },
  1: { kind: "clear", label: "Überwiegend klar" },
  2: { kind: "partly-cloudy", label: "Teilweise bewölkt" },
  3: { kind: "cloudy", label: "Bedeckt" },
  45: { kind: "fog", label: "Nebel" },
  48: { kind: "fog", label: "Nebel mit Reifbildung" },
  51: { kind: "drizzle", label: "Leichter Nieselregen" },
  53: { kind: "drizzle", label: "Mäßiger Nieselregen" },
  55: { kind: "drizzle", label: "Dichter Nieselregen" },
  56: { kind: "freezing", label: "Leichter gefrierender Nieselregen" },
  57: { kind: "freezing", label: "Dichter gefrierender Nieselregen" },
  61: { kind: "rain", label: "Leichter Regen" },
  63: { kind: "rain", label: "Mäßiger Regen" },
  65: { kind: "rain", label: "Starker Regen" },
  66: { kind: "freezing", label: "Leichter gefrierender Regen" },
  67: { kind: "freezing", label: "Starker gefrierender Regen" },
  71: { kind: "snow", label: "Leichter Schneefall" },
  73: { kind: "snow", label: "Mäßiger Schneefall" },
  75: { kind: "snow", label: "Starker Schneefall" },
  77: { kind: "snow", label: "Schneegriesel" },
  80: { kind: "rain", label: "Leichte Regenschauer" },
  81: { kind: "rain", label: "Mäßige Regenschauer" },
  82: { kind: "rain", label: "Heftige Regenschauer" },
  85: { kind: "snow", label: "Leichte Schneeschauer" },
  86: { kind: "snow", label: "Starke Schneeschauer" },
  95: { kind: "storm", label: "Gewitter" },
  96: { kind: "storm", label: "Gewitter mit leichtem Hagel" },
  97: { kind: "storm", label: "Starkes Gewitter" },
  99: { kind: "storm", label: "Gewitter mit starkem Hagel" },
};

export function weatherCondition(
  code: number | null | undefined,
): WeatherCondition {
  return code != null && conditions[code]
    ? conditions[code]
    : {
        kind: "unknown",
        label:
          code == null
            ? "Wetterart nicht verfügbar"
            : `Wettercode ${code} nicht zugeordnet`,
      };
}
