//! Public, fixed-coordinate weather only. No journal access or user location.
use std::{
    collections::BTreeMap,
    sync::OnceLock,
    time::{Duration, Instant},
};

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::errors::{CommandError, CommandResult};

const CATALOG: &str = include_str!("../../../src/features/weather/data/catalog.json");
const ENDPOINT: &str = "https://api.open-meteo.com/v1/forecast";
const DAILY: &str = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_gusts_10m_max,precipitation_hours,precipitation_probability_max";
const MAX_BYTES: usize = 4 * 1024 * 1024;
const TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeatherInput {
    pub asset_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherEnvelope {
    pub asset_id: String,
    pub fetched_at: String,
    pub point_ids: Vec<String>,
    pub responses: Vec<Value>,
}

#[derive(Deserialize)]
struct Catalog {
    assets: Vec<Asset>,
    regions: Vec<Region>,
}
#[derive(Deserialize)]
struct Asset {
    id: String,
    regions: Vec<RegionLink>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegionLink {
    region_id: String,
}
#[derive(Deserialize)]
struct Region {
    id: String,
    points: Vec<Point>,
}
#[derive(Deserialize, Clone)]
struct Point {
    id: String,
    latitude: f64,
    longitude: f64,
}

#[derive(Default)]
struct ForecastCache {
    entries: BTreeMap<String, (Instant, WeatherEnvelope)>,
    attempted: BTreeMap<String, Instant>,
}
static CACHE: OnceLock<Mutex<ForecastCache>> = OnceLock::new();

fn error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.to_owned(),
        message: message.to_owned(),
        details: None,
    }
}

fn points_for(asset_id: &str) -> CommandResult<Vec<Point>> {
    let catalog: Catalog = serde_json::from_str(CATALOG).map_err(|_| {
        error(
            "WEATHER_CATALOG_INVALID",
            "Der Wetterkatalog konnte nicht gelesen werden.",
        )
    })?;
    let asset = catalog
        .assets
        .iter()
        .find(|a| a.id == asset_id)
        .ok_or_else(|| CommandError::validation("Dieser Rohstoff ist nicht im Wetterkatalog."))?;
    let mut points = Vec::new();
    for link in &asset.regions {
        let region = catalog
            .regions
            .iter()
            .find(|r| r.id == link.region_id)
            .ok_or_else(|| {
                error(
                    "WEATHER_CATALOG_INVALID",
                    "Eine Wetterregion fehlt im Katalog.",
                )
            })?;
        points.extend(region.points.iter().cloned());
    }
    if points.is_empty()
        || points.len() > 30
        || points.iter().any(|p| {
            !p.latitude.is_finite()
                || !p.longitude.is_finite()
                || p.latitude.abs() > 90.0
                || p.longitude.abs() > 180.0
        })
    {
        return Err(CommandError::validation("Die Wetterpunkte sind ungültig."));
    }
    Ok(points)
}

fn provider_url(points: &[Point]) -> CommandResult<reqwest::Url> {
    let mut url = reqwest::Url::parse(ENDPOINT).map_err(|_| {
        error(
            "WEATHER_CONFIGURATION_ERROR",
            "Die Wetteradresse ist ungültig.",
        )
    })?;
    let lat = points
        .iter()
        .map(|p| p.latitude.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let lon = points
        .iter()
        .map(|p| p.longitude.to_string())
        .collect::<Vec<_>>()
        .join(",");
    url.query_pairs_mut().extend_pairs([
        ("latitude", lat.as_str()),
        ("longitude", lon.as_str()),
        ("daily", DAILY),
        ("current", "temperature_2m"),
        ("timezone", "UTC"),
        ("forecast_days", "14"),
        ("past_days", "7"),
        ("models", "best_match"),
        ("wind_speed_unit", "kmh"),
        ("temperature_unit", "celsius"),
        ("precipitation_unit", "mm"),
    ]);
    Ok(url)
}

fn validate_responses(
    points: &[Point],
    rows: &[Value],
    fetched_at: DateTime<Utc>,
) -> CommandResult<()> {
    let invalid = || {
        error(
            "WEATHER_RESPONSE_INVALID",
            "Wetterdaten passen nicht zu Orten, Zeitfenster oder Einheiten.",
        )
    };
    if rows.len() != points.len() {
        return Err(invalid());
    }
    let fields = [
        ("temperature_2m_min", "°C", -100.0, 65.0),
        ("temperature_2m_max", "°C", -100.0, 65.0),
        ("precipitation_sum", "mm", 0.0, 2000.0),
        ("et0_fao_evapotranspiration", "mm", 0.0, 50.0),
        ("wind_gusts_10m_max", "km/h", 0.0, 500.0),
        ("precipitation_hours", "h", 0.0, 24.0),
        ("precipitation_probability_max", "%", 0.0, 100.0),
    ];
    for (row, point) in rows.iter().zip(points) {
        let lat = row["latitude"].as_f64().ok_or_else(invalid)?;
        let lon = row["longitude"].as_f64().ok_or_else(invalid)?;
        if (lat - point.latitude).abs() > 0.5
            || (lon - point.longitude).abs() > 0.5
            || row["utc_offset_seconds"].as_i64() != Some(0)
            || row["current_units"]["temperature_2m"] != "°C"
            || row["daily_units"]["time"] != "iso8601"
        {
            return Err(invalid());
        }
        let time = row["current"]["time"].as_str().ok_or_else(invalid)?;
        let current_at = NaiveDateTime::parse_from_str(time, "%Y-%m-%dT%H:%M")
            .or_else(|_| NaiveDateTime::parse_from_str(time, "%Y-%m-%dT%H:%M:%S"))
            .map_err(|_| invalid())?
            .and_utc();
        if (fetched_at - current_at).num_seconds().abs() > 7200 {
            return Err(invalid());
        }
        let current_c = &row["current"]["temperature_2m"];
        if !current_c.is_null()
            && !current_c
                .as_f64()
                .is_some_and(|n| n.is_finite() && (-100.0..=65.0).contains(&n))
        {
            return Err(invalid());
        }
        let dates = row["daily"]["time"].as_array().ok_or_else(invalid)?;
        if dates.len() != 21 {
            return Err(invalid());
        }
        for (index, date) in dates.iter().enumerate() {
            let expected =
                (fetched_at.date_naive() + chrono::Duration::days(index as i64 - 7)).to_string();
            if date.as_str() != Some(expected.as_str()) {
                return Err(invalid());
            }
        }
        for (key, unit, min, max) in fields {
            let values = row["daily"][key].as_array().ok_or_else(invalid)?;
            if row["daily_units"][key] != unit
                || values.len() != dates.len()
                || values.iter().any(|value| {
                    !value.is_null()
                        && !value
                            .as_f64()
                            .is_some_and(|n| n.is_finite() && n >= min && n <= max)
                })
            {
                return Err(invalid());
            }
        }
        if let Some(codes) = row["daily"].get("weather_code") {
            let codes = codes.as_array().ok_or_else(invalid)?;
            if row["daily_units"]["weather_code"] != "wmo code"
                || codes.len() != dates.len()
                || codes.iter().any(|value| {
                    !value.is_null()
                        && !value.as_f64().is_some_and(|n| {
                            n.is_finite() && (0.0..=99.0).contains(&n) && n.fract() == 0.0
                        })
                })
            {
                return Err(invalid());
            }
        }
        for index in 0..21 {
            if let (Some(min), Some(max)) = (
                row["daily"]["temperature_2m_min"][index].as_f64(),
                row["daily"]["temperature_2m_max"][index].as_f64(),
            ) && min > max
            {
                return Err(invalid());
            }
        }
    }
    Ok(())
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_weather_forecast(input: WeatherInput) -> CommandResult<WeatherEnvelope> {
    let points = points_for(&input.asset_id)?;
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(ForecastCache::default()))
        .lock()
        .await;
    if let Some((at, entry)) = cache.entries.get(&input.asset_id)
        && at.elapsed() < TTL
    {
        return Ok(entry.clone());
    }
    if cache
        .attempted
        .get(&input.asset_id)
        .is_some_and(|at| at.elapsed() < Duration::from_secs(60))
    {
        return Err(error(
            "WEATHER_RETRY_LATER",
            "Bitte mindestens eine Minute bis zum nächsten Wetterabruf warten.",
        ));
    }
    cache
        .attempted
        .insert(input.asset_id.clone(), Instant::now());
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro/0.1 personal-weather-insights")
        .build()
        .map_err(|_| {
            error(
                "WEATHER_FETCH_FAILED",
                "Der Wetterabruf konnte nicht vorbereitet werden.",
            )
        })?;
    let mut response = client
        .get(provider_url(&points)?)
        .send()
        .await
        .map_err(|_| {
            error(
                "WEATHER_FETCH_FAILED",
                "Wetterdaten konnten nicht geladen werden. Prüfe die Verbindung.",
            )
        })?;
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(error(
            "WEATHER_RATE_LIMIT",
            "Das Abruflimit des Wetteranbieters ist erreicht. Bitte später erneut laden.",
        ));
    }
    if !response.status().is_success() {
        return Err(error(
            "WEATHER_PROVIDER_ERROR",
            "Der Wetteranbieter hat den Abruf nicht beantwortet. Bitte später erneut laden.",
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BYTES as u64)
    {
        return Err(error(
            "WEATHER_RESPONSE_INVALID",
            "Die Wetterantwort überschreitet die zulässige Größe.",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        error(
            "WEATHER_FETCH_FAILED",
            "Die Wetterantwort wurde unterbrochen.",
        )
    })? {
        if bytes.len().saturating_add(chunk.len()) > MAX_BYTES {
            return Err(error(
                "WEATHER_RESPONSE_INVALID",
                "Die Wetterantwort überschreitet die zulässige Größe.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let raw: Value = serde_json::from_slice(&bytes).map_err(|_| {
        error(
            "WEATHER_RESPONSE_INVALID",
            "Die Wetterantwort konnte nicht gelesen werden.",
        )
    })?;
    let responses = match raw {
        Value::Array(rows) => rows,
        value => vec![value],
    };
    let fetched_at = Utc::now();
    validate_responses(&points, &responses, fetched_at)?;
    let entry = WeatherEnvelope {
        asset_id: input.asset_id.clone(),
        fetched_at: fetched_at.to_rfc3339(),
        point_ids: points.iter().map(|p| p.id.clone()).collect(),
        responses,
    };
    cache
        .entries
        .insert(input.asset_id, (Instant::now(), entry.clone()));
    Ok(entry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_catalogued_assets_and_coordinates_are_accepted() {
        assert!(points_for("https://untrusted.test").is_err());
        assert!(points_for("coffee-arabica").is_ok());
        assert!(
            serde_json::from_str::<WeatherInput>(r#"{"assetId":"cocoa","latitude":0}"#).is_err()
        );
        let catalog: Catalog = serde_json::from_str(CATALOG).unwrap();
        for asset in catalog.assets {
            let points = points_for(&asset.id).unwrap();
            assert_eq!(points.len(), asset.regions.len() * 3);
            let url = provider_url(&points).unwrap();
            assert_eq!(url.host_str(), Some("api.open-meteo.com"));
            assert_eq!(url.scheme(), "https");
            assert_eq!(
                url.query_pairs().find(|(k, _)| k == "timezone").unwrap().1,
                "UTC"
            );
        }
    }

    #[test]
    fn transport_validation_preserves_missing_and_rejects_wrong_units_and_dates() {
        let point = points_for("cocoa").unwrap().remove(0);
        let fetched_at = "2026-10-05T12:15:00Z".parse::<DateTime<Utc>>().unwrap();
        let dates = (0..21)
            .map(|i| (fetched_at.date_naive() + chrono::Duration::days(i - 7)).to_string())
            .collect::<Vec<_>>();
        let mut row = serde_json::json!({
            "latitude": point.latitude, "longitude": point.longitude, "utc_offset_seconds": 0,
            "current_units": {"temperature_2m": "°C"},
            "current": {"time":"2026-10-05T12:00", "temperature_2m":26},
            "daily_units": {"time":"iso8601", "temperature_2m_min":"°C", "temperature_2m_max":"°C",
                "precipitation_sum":"mm", "et0_fao_evapotranspiration":"mm", "wind_gusts_10m_max":"km/h",
                "precipitation_hours":"h", "precipitation_probability_max":"%"},
            "daily": {"time":dates, "temperature_2m_min":vec![18;21], "temperature_2m_max":vec![30;21],
                "precipitation_sum":vec![0;21], "et0_fao_evapotranspiration":vec![3;21], "wind_gusts_10m_max":vec![15;21],
                "precipitation_hours":vec![0;21], "precipitation_probability_max":vec![20;21]}
        });
        row["daily"]["precipitation_sum"][0] = Value::Null;
        let points = vec![point];
        assert!(validate_responses(&points, &[row.clone()], fetched_at).is_ok());
        let mut units = row.clone();
        units["daily_units"]["precipitation_sum"] = serde_json::json!("inch");
        assert!(validate_responses(&points, &[units], fetched_at).is_err());
        let mut dates = row.clone();
        dates["daily"]["time"][2] = dates["daily"]["time"][1].clone();
        assert!(validate_responses(&points, &[dates], fetched_at).is_err());
        let mut shifted = row.clone();
        shifted["latitude"] = serde_json::json!(points[0].latitude + 1.0);
        assert!(validate_responses(&points, &[shifted], fetched_at).is_err());
        row["daily_units"]["weather_code"] = serde_json::json!("wmo code");
        row["daily"]["weather_code"] = serde_json::json!(vec![0; 21]);
        row["daily"]["weather_code"][0] = Value::Null;
        row["daily"]["weather_code"][1] = serde_json::json!(97);
        assert!(validate_responses(&points, &[row.clone()], fetched_at).is_ok());
        for invalid_code in [
            serde_json::json!(63.5),
            serde_json::json!(100),
            serde_json::json!(-1),
        ] {
            let mut malformed = row.clone();
            malformed["daily"]["weather_code"][7] = invalid_code;
            assert!(validate_responses(&points, &[malformed], fetched_at).is_err());
        }
        let mut wrong_code_unit = row.clone();
        wrong_code_unit["daily_units"]["weather_code"] = serde_json::json!("symbol");
        assert!(validate_responses(&points, &[wrong_code_unit], fetched_at).is_err());
        let mut short_codes = row.clone();
        short_codes["daily"]["weather_code"] = serde_json::json!(vec![0; 20]);
        assert!(validate_responses(&points, &[short_codes], fetched_at).is_err());
        row["daily"]["precipitation_sum"][1] = serde_json::json!(-1);
        assert!(validate_responses(&points, &[row], fetched_at).is_err());
    }
}
