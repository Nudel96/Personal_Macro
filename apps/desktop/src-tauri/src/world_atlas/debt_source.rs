use super::{catalog, debt_models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::{Datelike, Utc};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
    time::Duration,
};

const MAX_ZIP: usize = 8 * 1024 * 1024;
const MAX_CSV: u64 = 100 * 1024 * 1024;
const MEMBER: &str = "WS_TC_csv_flat.csv";
const HEADERS: [&str; 20] = [
    "STRUCTURE",
    "STRUCTURE_ID",
    "ACTION",
    "FREQ:Frequency",
    "BORROWERS_CTY:Borrowers' country",
    "TC_BORROWERS:Borrowing sector",
    "TC_LENDERS:Lending sector",
    "VALUATION:Valuation method",
    "UNIT_TYPE:Unit type",
    "TC_ADJUST:Adjustment",
    "TIME_PERIOD:Time period or range",
    "OBS_VALUE:Observation Value",
    "COLLECTION:Collection Indicator",
    "UNIT_MULT:Unit Multiplier",
    "UNIT_MEASURE:Unit of measure",
    "TITLE_TS:Title (tseries level)",
    "DECIMALS:Decimals",
    "OBS_STATUS:Observation Status",
    "OBS_PRE_BREAK:Pre-Break Observation",
    "OBS_CONF:Observation confidentiality",
];
fn invalid() -> CommandError {
    CommandError::validation(
        "Die BIS-Schuldendatei enthält unerwartete Gebiete, Einheiten, Quellenschlüssel oder widersprüchliche Werte. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentliche BIS-Schuldendatei konnte nicht geladen werden. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<DebtDownload> {
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let mut response = client.get(SOURCE_URL).send().await.map_err(|_| network())?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|n| n > MAX_ZIP as u64)
    {
        return Err(network());
    }
    let modified = response
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|h| h.to_str().ok())
        .filter(|s| s.len() <= 100)
        .map(str::to_owned);
    let mut bytes = vec![];
    while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
        if bytes.len() + chunk.len() > MAX_ZIP {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    let hash = Sha256::digest(&bytes)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect();
    let mut data = tokio::task::spawn_blocking(move || parse_zip(&bytes))
        .await
        .map_err(|_| invalid())??;
    if data.profiles.len() != config()?.areas.len() || data.provenance.numeric_cell_count < 13_000 {
        return Err(invalid());
    }
    data.provenance.sha256 = hash;
    data.provenance.file_modified_at = modified;
    Ok(data)
}
fn parse_zip(bytes: &[u8]) -> CommandResult<DebtDownload> {
    if bytes.len() > MAX_ZIP {
        return Err(invalid());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() != 1 {
        return Err(invalid());
    }
    let entry = zip.by_index(0).map_err(|_| invalid())?;
    if entry.name() != MEMBER || entry.is_dir() || entry.size() > MAX_CSV {
        return Err(invalid());
    }
    let expected = entry.size();
    let mut csv = vec![];
    entry
        .take(MAX_CSV + 1)
        .read_to_end(&mut csv)
        .map_err(|_| invalid())?;
    if csv.len() as u64 != expected {
        return Err(invalid());
    }
    parse(&csv)
}
fn value(raw: &str) -> CommandResult<Option<f64>> {
    if raw.is_empty() {
        return Ok(None);
    }
    if raw.len() > 64 {
        return Err(invalid());
    }
    let number: f64 = raw.parse().map_err(|_| invalid())?;
    if !number.is_finite() || number < 0.0 {
        return Err(invalid());
    }
    Ok(Some(number))
}
fn period(raw: &str) -> bool {
    let b = raw.as_bytes();
    b.len() == 7
        && b[..4].iter().all(u8::is_ascii_digit)
        && &b[4..6] == b"-Q"
        && (b'1'..=b'4').contains(&b[6])
        && raw[..4]
            .parse::<i32>()
            .is_ok_and(|y| (1900..=Utc::now().year()).contains(&y))
}
fn parse(bytes: &[u8]) -> CommandResult<DebtDownload> {
    if bytes.len() as u64 > MAX_CSV {
        return Err(invalid());
    }
    let cfg = config()?;
    let areas: BTreeMap<_, _> = cfg.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    if areas.len() != cfg.areas.len() {
        return Err(invalid());
    }
    let mut reader = csv::Reader::from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != HEADERS
    {
        return Err(invalid());
    }
    let mut points = BTreeMap::<(String, String), DebtPoint>::new();
    let mut identities = BTreeSet::new();
    let mut metadata = BTreeSet::new();
    let mut observed_series = BTreeSet::new();
    let mut rows = 0;
    let mut numeric = 0;
    for row in reader.records() {
        let r = row.map_err(|_| invalid())?;
        rows += 1;
        if r.len() != HEADERS.len()
            || &r[0] != "dataflow"
            || &r[1] != "BIS:WS_TC(2.0): Total credit"
            || &r[2] != "I"
        {
            return Err(invalid());
        }
        if !matches!(
            &r[5],
            "H: Households & NPISHs" | "N: Non-financial corporations"
        ) || &r[6] != "A: All sectors"
            || &r[7] != "M: Market value"
            || &r[8] != "770: Percentage of GDP"
            || &r[9] != "A: Adjusted for breaks"
        {
            continue;
        }
        let (code, label) = r[4].split_once(": ").ok_or_else(invalid)?;
        let area = areas.get(code).ok_or_else(invalid)?;
        if label != area.label || &r[12] != "E: End of period" {
            return Err(invalid());
        }
        let household = r[5].starts_with('H');
        let key = (code.to_owned(), household);
        if r[3].is_empty() {
            let decimals = if area.decimals == 1 {
                "1: One"
            } else if area.decimals == 3 {
                "3: Three"
            } else {
                return Err(invalid());
            };
            if &r[16] != decimals
                || [10, 11, 13, 14, 15, 17, 18, 19]
                    .iter()
                    .any(|i| !r[*i].is_empty())
                || !metadata.insert(key)
            {
                return Err(invalid());
            }
            continue;
        }
        if &r[3] != "Q: Quarterly"
            || !period(&r[10])
            || &r[13] != "0: Units"
            || &r[14] != "367: Per cent"
            || !r[16].is_empty()
            || !matches!(&r[17], "A: Normal value" | "B: Break")
            || &r[19] != "F: Free"
        {
            return Err(invalid());
        }
        let borrower = if household {
            "Households and NPISHs"
        } else {
            "Non-financial corporations"
        };
        let title = format!(
            "{} - Credit to {borrower} from All sectors at Market value - Percentage of GDP - Adjusted for breaks",
            area.series_label
        );
        if r[15] != title
            || (!r[18].is_empty() && (&r[17] != "B: Break" || value(&r[18])?.is_none()))
        {
            return Err(invalid());
        }
        if !identities.insert((code.to_owned(), r[10].to_owned(), household)) {
            return Err(invalid());
        }
        observed_series.insert(key);
        let v = value(&r[11])?;
        numeric += usize::from(v.is_some());
        let p = points
            .entry((code.to_owned(), r[10].to_owned()))
            .or_insert_with(|| DebtPoint {
                period: r[10].to_owned(),
                ..Default::default()
            });
        if household {
            p.households = v;
            p.households_break = r[17].starts_with('B');
            p.households_pre_break = r[18].to_owned();
        } else {
            p.corporations = v;
            p.corporations_break = r[17].starts_with('B');
            p.corporations_pre_break = r[18].to_owned();
        }
    }
    if observed_series != metadata {
        return Err(invalid());
    }
    let mut profiles = vec![];
    for area in &cfg.areas {
        let rows: Vec<_> = points
            .iter()
            .filter(|((code, _), _)| code == &area.code)
            .map(|(_, p)| p.clone())
            .collect();
        if rows.is_empty() {
            continue;
        }
        catalog::geography(&area.geography_id)?;
        profiles.push(DebtProfile {
            geography_id: area.geography_id.clone(),
            provider_code: area.code.clone(),
            provider_label: area.label.clone(),
            decimals: area.decimals,
            points: rows,
        });
    }
    Ok(DebtDownload {
        provenance: DebtProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            file_modified_at: None,
            url: SOURCE_URL.into(),
            sha256: String::new(),
            source_row_count: rows,
            numeric_cell_count: numeric,
            area_count: profiles.len(),
            recipe: cfg.recipe,
        },
        profiles,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(v: &str, status: &str) -> Vec<u8> {
        let mut writer = csv::Writer::from_writer(vec![]);
        writer.write_record(HEADERS).unwrap();
        writer
            .write_record([
                "dataflow",
                "BIS:WS_TC(2.0): Total credit",
                "I",
                "",
                "DE: Germany",
                "H: Households & NPISHs",
                "A: All sectors",
                "M: Market value",
                "770: Percentage of GDP",
                "A: Adjusted for breaks",
                "",
                "",
                "E: End of period",
                "",
                "",
                "",
                "1: One",
                "",
                "",
                "",
            ])
            .unwrap();
        writer.write_record(["dataflow","BIS:WS_TC(2.0): Total credit","I","Q: Quarterly","DE: Germany","H: Households & NPISHs","A: All sectors","M: Market value","770: Percentage of GDP","A: Adjusted for breaks","2025-Q4",v,"E: End of period","0: Units","367: Per cent","Germany - Credit to Households and NPISHs from All sectors at Market value - Percentage of GDP - Adjusted for breaks","",status,"","F: Free"]).unwrap();
        writer.into_inner().unwrap()
    }
    #[test]
    fn world_atlas_debt_preserves_missing_zero_breaks_and_rejects_drift() {
        let empty = parse(&fixture("", "A: Normal value")).unwrap();
        assert_eq!(empty.profiles[0].points[0].households, None);
        let zero = parse(&fixture("0", "B: Break")).unwrap();
        assert_eq!(zero.profiles[0].points[0].households, Some(0.0));
        assert!(zero.profiles[0].points[0].households_break);
        assert!(parse(&fixture("NaN", "A: Normal value")).is_err());
        assert!(parse(&fixture("-1", "A: Normal value")).is_err());
        assert!(parse(&fixture("45", "C: Confidential")).is_err());
        let valid = String::from_utf8(fixture("48.9", "A: Normal value")).unwrap();
        assert!(parse(valid.replace("367: Per cent", "USD: US dollar").as_bytes()).is_err());
        assert!(parse(valid.replace("DE: Germany", "DE: Unknown").as_bytes()).is_err());
        let row = valid.lines().last().unwrap();
        assert!(parse(format!("{valid}{row}\n").as_bytes()).is_err());
        assert!(!period("2025-Q5"));
    }
}
