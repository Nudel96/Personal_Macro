//! Uses the already configured EODHD key; only catalogue ETF symbols leave the device.
use std::{collections::BTreeMap, time::Duration};

use chrono::{Datelike, NaiveDate, Utc};
use reqwest::{Client, Url};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::{
    market_models::*,
    market_wave::{month_index, month_label},
};
use crate::{
    commands::eodhd_prices,
    errors::{CommandError, CommandResult},
};

const LIMIT: usize = 12 * 1024 * 1024;
fn source_error(message: &str) -> CommandError {
    CommandError {
        code: "ATLAS_MARKET_SOURCE_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

#[derive(Deserialize)]
struct Row {
    date: String,
    adjusted_close: Option<f64>,
}

fn parse_history(
    body: &[u8],
    proxy: &MarketProxy,
    today: NaiveDate,
) -> CommandResult<Vec<MarketMonth>> {
    let rows: Vec<Row> = serde_json::from_slice(body)
        .map_err(|_| source_error("EODHD hat keine gültige bereinigte Kurshistorie geliefert."))?;
    if rows.is_empty() || rows.len() > 30_000 {
        return Err(source_error(
            "Die Kurshistorie ist leer oder überschreitet die Abrufgrenze.",
        ));
    }
    let inception = NaiveDate::parse_from_str(&proxy.inception, "%Y-%m-%d")
        .map_err(|_| source_error("Das Auflagedatum im Marktkatalog ist ungültig."))?;
    let cutoff = today.year() * 12 + today.month0() as i32;
    let mut days = BTreeMap::new();
    for row in rows {
        let date = NaiveDate::parse_from_str(&row.date, "%Y-%m-%d")
            .map_err(|_| source_error("Ein Kursdatum von EODHD ist ungültig."))?;
        if date < inception {
            continue;
        }
        if date > today {
            return Err(source_error("Die Quelle hat zukünftige Kurse geliefert."));
        }
        if row
            .adjusted_close
            .is_some_and(|v| !v.is_finite() || v <= 0.0)
        {
            return Err(source_error(
                "Die bereinigte Kurshistorie enthält einen ungültigen Preis.",
            ));
        }
        if let Some(previous) = days.insert(date, row.adjusted_close)
            && previous != row.adjusted_close
        {
            return Err(source_error(
                "Die Quelle enthält widersprüchliche Kurse für denselben Tag.",
            ));
        }
    }
    let mut months = BTreeMap::new();
    for (date, value) in days {
        let index = date.year() * 12 + date.month0() as i32;
        if index < cutoff {
            months.insert(index, value);
        }
    }
    if !months.values().any(Option::is_some) {
        return Err(source_error(
            "Für abgeschlossene Monate fehlen bereinigte Kurse. Unbereinigte Kurse werden nicht ersatzweise verwendet.",
        ));
    }
    let first = *months.keys().next().unwrap();
    Ok((first..cutoff)
        .map(|index| MarketMonth {
            month: month_label(index),
            adjusted_close: months.get(&index).copied().flatten(),
        })
        .collect())
}

pub async fn download(proxy: &MarketProxy) -> CommandResult<MarketDownload> {
    let key = eodhd_prices::api_key().ok_or_else(|| source_error("Für Marktwellen wird der bereits vorgesehene EODHD-Schlüssel benötigt. Er ist noch nicht lokal eingerichtet."))?;
    // A separate bounded client avoids changing Seasonality semantics.
    let client = Client::builder()
        .tls_backend_rustls()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(45))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("PersonalMacro/1 world-atlas")
        .build()
        .map_err(|_| source_error("Der Marktquellen-Client konnte nicht vorbereitet werden."))?;
    let source_url = format!("https://eodhd.com/api/eod/{}", proxy.symbol);
    let mut url = Url::parse(&source_url)
        .map_err(|_| source_error("Der Marktkatalog enthält eine ungültige Quelle."))?;
    let today = Utc::now().date_naive();
    let to = today.to_string();
    url.query_pairs_mut()
        .append_pair("api_token", &key)
        .append_pair("fmt", "json")
        .append_pair("period", "d")
        .append_pair("order", "a")
        .append_pair("from", &proxy.inception)
        .append_pair("to", &to);
    // One explicit request per symbol. No retries on quota errors and no background refresh.
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| source_error("Die EODHD-Kurshistorie ist momentan nicht erreichbar."))?;
    if !response.status().is_success() {
        return Err(source_error(match response.status().as_u16() {
            401 | 403 => {
                "EODHD gibt diese ETF-Historie für die vorhandene Konfiguration nicht frei. Bitte Schlüssel und enthaltenen Datenumfang prüfen."
            }
            429 => {
                "Das vorhandene EODHD-Abrufbudget ist momentan ausgeschöpft. Der lokale Datenstand bleibt erhalten."
            }
            404 => {
                "EODHD führt dieses Katalogsymbol derzeit nicht. Der lokale Datenstand bleibt erhalten."
            }
            _ => {
                "EODHD konnte die Kurshistorie nicht liefern. Der lokale Datenstand bleibt erhalten."
            }
        }));
    }
    if response.content_length().is_some_and(|n| n > LIMIT as u64) {
        return Err(source_error(
            "Die Kursantwort überschreitet die Abrufgrenze.",
        ));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| source_error("Die Kursantwort wurde unvollständig übertragen."))?
    {
        if body.len() + chunk.len() > LIMIT {
            return Err(source_error(
                "Die Kursantwort überschreitet die Abrufgrenze.",
            ));
        }
        body.extend_from_slice(&chunk);
    }
    let months = parse_history(&body, proxy, today)?;
    let rows: Vec<Row> = serde_json::from_slice(&body)
        .map_err(|_| source_error("Die Kurshistorie ist nicht lesbar."))?;
    let dates: Vec<_> = rows
        .iter()
        .filter(|r| r.date >= proxy.inception)
        .map(|r| r.date.as_str())
        .collect();
    let provenance = MarketProvenance {
        retrieved_at: Utc::now().to_rfc3339(), source_url,
        sha256: Sha256::digest(&body).iter().map(|b| format!("{b:02x}")).collect(),
        source_first_date: dates.iter().min().copied().unwrap_or_default().into(),
        source_last_date: dates.iter().max().copied().unwrap_or_default().into(),
        adjustment: "EODHD adjusted_close: Splits und Ausschüttungen; jeweils letzter gelieferter Handelstag des abgeschlossenen Monats. Kein Rohkurs-Fallback.".into(),
    };
    Ok(MarketDownload { provenance, months })
}

pub fn validate_proxy(proxy: &MarketProxy) -> bool {
    proxy.symbol.ends_with(".US")
        && proxy.symbol.len() < 16
        && proxy
            .symbol
            .chars()
            .all(|c| c.is_ascii_uppercase() || c == '.')
        && proxy.inception.get(..7).and_then(month_index).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn world_atlas_market_months_require_adjustments_and_preserve_gaps() {
        let proxy = crate::world_atlas::market_store::proxy("eodhd:SPY.US").unwrap();
        let date = NaiveDate::from_ymd_opt(2020, 5, 1).unwrap();
        let months = parse_history(br#"[{"date":"2020-01-30","adjusted_close":50},{"date":"2020-01-31","adjusted_close":51},{"date":"2020-03-31","adjusted_close":null,"close":100},{"date":"2020-04-30","adjusted_close":60}]"#, &proxy, date).unwrap();
        assert_eq!(months.len(), 4);
        assert_eq!(months[0].adjusted_close, Some(51.0));
        assert_eq!(months[1].adjusted_close, None);
        assert_eq!(months[2].adjusted_close, None);
        assert!(parse_history(br#"[{"date":"2020-01-31","close":10}]"#, &proxy, date).is_err());
        assert!(parse_history(br#"[{"date":"2020-01-31","adjusted_close":10},{"date":"2020-01-31","adjusted_close":11}]"#, &proxy, date).is_err());
        assert!(
            parse_history(
                br#"[{"date":"2021-01-31","adjusted_close":10}]"#,
                &proxy,
                date
            )
            .is_err()
        );
    }
}
