use std::{
    collections::{BTreeMap, HashSet},
    str::FromStr,
    time::Duration,
};

use chrono::NaiveDate;
use reqwest::{Client, Url};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::Value;

use super::models::{ExcludedInstrument, Observation, catalog};
use crate::errors::{CommandError, CommandResult};

pub fn error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

pub fn client() -> CommandResult<Client> {
    Client::builder()
        .tls_backend_rustls()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
        .user_agent("PersonalMacro/1 government-bonds")
        .build()
        .map_err(|_| {
            error(
                "BOND_PROVIDER_ERROR",
                "Die Anleiheverbindung konnte nicht vorbereitet werden.",
            )
        })
}

pub async fn download(
    client: &Client,
    path: &str,
    key: &str,
    dates: Option<(&str, &str)>,
) -> CommandResult<Vec<u8>> {
    // The caller supplies only a fixed catalog path or a reviewed symbol. Never accept a user URL.
    let mut url = Url::parse(&format!("https://eodhd.com/api/{path}"))
        .map_err(|_| error("BOND_PROVIDER_ERROR", "Ungültiger Anleihe-Quellenpfad."))?;
    url.query_pairs_mut()
        .append_pair("api_token", key)
        .append_pair("fmt", "json");
    if let Some((from, to)) = dates {
        url.query_pairs_mut()
            .append_pair("from", from)
            .append_pair("to", to)
            .append_pair("period", "d")
            .append_pair("order", "a");
    }
    // Do not format reqwest errors or provider bodies: they can contain the credential URL.
    let mut response = client.get(url).send().await
        .map_err(|_| error("BOND_PROVIDER_ERROR", "EODHD ist für Staatsanleihen momentan nicht erreichbar. Gespeicherte Werte bleiben erhalten."))?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 | 403 => error(
                "BOND_ACCESS_DENIED",
                "EODHD gibt Staatsanleihe-Renditen für diesen Zugang nicht frei. Bitte Schlüssel und Datenpaket prüfen.",
            ),
            429 => error(
                "BOND_RATE_LIMIT",
                "Das EODHD-Abruflimit ist erreicht. Der bisherige Datenstand bleibt erhalten.",
            ),
            404 => error(
                "BOND_NOT_FOUND",
                "Diese Anleihereihe ist bei EODHD derzeit nicht verfügbar.",
            ),
            _ => error(
                "BOND_PROVIDER_ERROR",
                "EODHD konnte die Anleihedaten nicht liefern. Der bisherige Datenstand bleibt erhalten.",
            ),
        });
    }
    const LIMIT: usize = 20 * 1024 * 1024;
    if response
        .content_length()
        .is_some_and(|size| size > LIMIT as u64)
    {
        return Err(error(
            "BOND_PROVIDER_ERROR",
            "Die Anleiheantwort überschreitet die Größenbegrenzung.",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        error(
            "BOND_PROVIDER_ERROR",
            "Die Anleiheantwort wurde unvollständig übertragen.",
        )
    })? {
        if bytes.len() + chunk.len() > LIMIT {
            return Err(error(
                "BOND_PROVIDER_ERROR",
                "Die Anleiheantwort überschreitet die Größenbegrenzung.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SymbolRow {
    code: String,
    name: String,
    country: Option<String>,
    exchange: String,
    currency: Option<String>,
    #[serde(rename = "Type")]
    kind: String,
}

fn optional_text(text: &Option<String>) -> Option<&str> {
    text.as_deref().map(str::trim).filter(|v| !v.is_empty())
}

pub fn parse_catalog(bytes: &[u8]) -> CommandResult<(HashSet<String>, Vec<ExcludedInstrument>)> {
    let rows: Vec<SymbolRow> = serde_json::from_slice(bytes).map_err(|_| {
        error(
            "BOND_CATALOG_ERROR",
            "Der EODHD-Anleihekatalog ist nicht lesbar.",
        )
    })?;
    if rows.is_empty() || rows.len() > 5_000 {
        return Err(error(
            "BOND_CATALOG_ERROR",
            "Der Anleihekatalog hat einen unerwarteten Umfang.",
        ));
    }
    let mut active = HashSet::new();
    let mut seen = HashSet::new();
    let mut excluded = Vec::new();
    for row in rows {
        let symbol = format!("{}.GBOND", row.code);
        if !seen.insert(symbol.clone()) {
            return Err(error(
                "BOND_CATALOG_ERROR",
                "Der Anleihekatalog enthält doppelte Kennungen.",
            ));
        }
        let trusted = catalog().instruments.iter().find(|i| i.symbol == symbol);
        if trusted.is_some_and(|i| {
            row.exchange == "GBOND"
                && row.kind == "BOND"
                && row.name.trim().eq_ignore_ascii_case(&i.name)
                && optional_text(&row.country) == i.provider_country.as_deref()
                && optional_text(&row.currency) == i.currency.as_deref()
        }) {
            active.insert(symbol);
        } else {
            excluded.push(ExcludedInstrument {
                // Untrusted text is bounded; errors never contain raw source bodies.
                symbol: symbol.chars().take(40).collect(),
                reason: if row.code == "USDSB3L1Y" {
                    "Zinsswap; keine Staatsanleihe."
                } else {
                    "Land, Laufzeit oder Quellenmetadaten sind noch nicht freigegeben."
                }
                .into(),
            });
        }
    }
    if active.is_empty() {
        return Err(error(
            "BOND_CATALOG_ERROR",
            "Keine der geprüften Staatsanleihereihen wurde im Quellenkatalog bestätigt.",
        ));
    }
    Ok((active, excluded))
}

#[derive(Deserialize)]
struct HistoryRow {
    date: String,
    close: Option<Value>,
}

pub fn parse_history(
    bytes: &[u8],
    from: NaiveDate,
    through: NaiveDate,
) -> CommandResult<Vec<Observation>> {
    let rows: Vec<HistoryRow> = serde_json::from_slice(bytes)
        .map_err(|_| error("BOND_DATA_ERROR", "Die Renditehistorie ist nicht lesbar."))?;
    if rows.len() > 50_000 {
        return Err(error(
            "BOND_DATA_ERROR",
            "Die Renditehistorie enthält zu viele Beobachtungen.",
        ));
    }
    let mut observations = BTreeMap::new();
    for row in rows {
        let date = NaiveDate::parse_from_str(&row.date, "%Y-%m-%d")
            .ok()
            .filter(|d| d.to_string() == row.date)
            .ok_or_else(|| {
                error(
                    "BOND_DATA_ERROR",
                    "Die Renditehistorie enthält ein ungültiges Datum.",
                )
            })?;
        if date < from || date > through {
            continue;
        }
        // GBOND close is an annualized yield in percent, not a security price.
        // Negative yields and true zero are valid. Missing close remains missing.
        let value = match row.close {
            None | Some(Value::Null) => None,
            Some(Value::Number(n)) => Some(n.to_string()),
            Some(Value::String(s)) => Some(s),
            _ => {
                return Err(error(
                    "BOND_DATA_ERROR",
                    "Die Renditehistorie enthält einen ungültigen Renditewert.",
                ));
            }
        };
        let yield_pct = value
            .map(|text| {
                Decimal::from_str(&text)
                    .map(|v| v.normalize().to_string())
                    .map_err(|_| {
                        error(
                            "BOND_DATA_ERROR",
                            "Die Renditehistorie enthält keinen gültigen Dezimalwert.",
                        )
                    })
            })
            .transpose()?;
        if observations.insert(row.date, yield_pct).is_some() {
            return Err(error(
                "BOND_DATA_ERROR",
                "Die Renditehistorie enthält doppelte Tageswerte.",
            ));
        }
    }
    if !observations.values().any(Option::is_some) {
        return Err(error(
            "BOND_NO_DATA",
            "EODHD liefert für diese Laufzeit im angefragten Zeitraum keine Renditewerte.",
        ));
    }
    Ok(observations
        .into_iter()
        .map(|(date, yield_pct)| Observation { date, yield_pct })
        .collect())
}

pub fn difference_bps(left: Option<&str>, right: Option<&str>) -> Option<String> {
    let left = Decimal::from_str(left?).ok()?;
    let right = Decimal::from_str(right?).ok()?;
    Some(
        ((left - right) * Decimal::from(100))
            .normalize()
            .to_string(),
    )
}
