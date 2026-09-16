use super::public_models::*;
use crate::errors::{CommandError, CommandResult};
use chrono::{NaiveDate, Utc};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
    time::Duration,
};

const MAX_DOWNLOAD: usize = 32 * 1024 * 1024;
const CENSUS_URL: &str = "https://www.census.gov/construction/c30/xlsx/privtime.xlsx";
const MAX_UNCOMPRESSED: u64 = 128 * 1024 * 1024;
const DSR_URL: &str = "https://data.bis.org/static/bulk/WS_DSR_csv_flat.zip";
const WGI_URL: &str = "https://datacatalogfiles.worldbank.org/ddh-published/0038026/DR0095947/wgidataset_with_sourcedata-2025.xlsx";
const WAGES_URL: &str = "https://sdmx.oecd.org/public/rest/data/OECD.ELS.SAE,DSD_EARNINGS@AV_AN_WAGE,1.0/all?dimensionAtObservation=AllDimensions&format=csvfilewithlabels";
const HOURS_URL: &str = "https://sdmx.oecd.org/public/rest/data/OECD.ELS.SAE,DSD_HW@DF_AVG_ANN_HRS_WKD,1.0/all?dimensionAtObservation=AllDimensions&format=csvfilewithlabels";
const DSR_HEADERS: [&str; 16] = [
    "STRUCTURE",
    "STRUCTURE_ID",
    "ACTION",
    "FREQ:Frequency",
    "BORROWERS_CTY:Borrowers' country",
    "DSR_BORROWERS:Borrowers",
    "TIME_PERIOD:Time period or range",
    "OBS_VALUE:Observation Value",
    "COLLECTION:Collection Indicator",
    "UNIT_MEASURE:Unit of measure",
    "UNIT_MULT:Unit Multiplier",
    "DECIMALS:Decimals",
    "TITLE_TS:Title (tseries level)",
    "OBS_CONF:Observation confidentiality",
    "OBS_PRE_BREAK:Pre-Break Observation",
    "OBS_STATUS:Observation Status",
];

pub fn valid_period(period: &str, frequency: &str) -> bool {
    let bytes = period.as_bytes();
    if bytes.len() < 4 || !bytes[..4].iter().all(u8::is_ascii_digit) {
        return false;
    }
    let year = period[..4].parse::<i32>().unwrap_or(0);
    if !(1600..=2200).contains(&year) {
        return false;
    }
    match frequency {
        "annual" | "fiscal_annual_june" => bytes.len() == 4,
        "period_total" => {
            bytes.len() == 9
                && bytes[4] == b'/'
                && bytes[5..].iter().all(u8::is_ascii_digit)
                && period[5..]
                    .parse::<i32>()
                    .is_ok_and(|end| (year..=2200).contains(&end))
        }
        "quarterly" => {
            bytes.len() == 7 && &bytes[4..6] == b"-Q" && (b'1'..=b'4').contains(&bytes[6])
        }
        "half_yearly" => {
            bytes.len() == 7 && &bytes[4..6] == b"-S" && (b'1'..=b'2').contains(&bytes[6])
        }
        "monthly" => {
            bytes.len() == 7
                && bytes[4] == b'-'
                && period[5..]
                    .parse::<u8>()
                    .is_ok_and(|m| (1..=12).contains(&m))
        }
        "irregular" => NaiveDate::parse_from_str(period, "%Y-%m-%d").is_ok(),
        _ => false,
    }
}

pub fn decimal(raw: &str) -> CommandResult<Option<String>> {
    if raw.is_empty() {
        return Ok(None);
    }
    if raw.len() > 80 || raw.trim() != raw || !raw.parse::<f64>().is_ok_and(f64::is_finite) {
        return Err(invalid());
    }
    Ok(Some(raw.to_owned()))
}

/// Half-open calendar spans let one source contain original months, quarters
/// and half-years. Lexical comparisons cannot compare "2026-Q2" to "2026-06".
pub fn period_span(period: &str) -> Option<(NaiveDate, NaiveDate)> {
    if valid_period(period, "period_total") {
        return Some((
            NaiveDate::from_ymd_opt(period[..4].parse().ok()?, 1, 1)?,
            NaiveDate::from_ymd_opt(period[5..].parse::<i32>().ok()? + 1, 1, 1)?,
        ));
    }
    if valid_period(period, "irregular") && period.len() == 10 {
        let first = NaiveDate::parse_from_str(period, "%Y-%m-%d").ok()?;
        return Some((first, first.succ_opt()?));
    }
    let year = period.get(..4)?.parse::<i32>().ok()?;
    let (month, months) = if valid_period(period, "annual") {
        (1, 12)
    } else if valid_period(period, "quarterly") {
        ((period[6..].parse::<u32>().ok()? - 1) * 3 + 1, 3)
    } else if valid_period(period, "half_yearly") {
        ((period[6..].parse::<u32>().ok()? - 1) * 6 + 1, 6)
    } else if valid_period(period, "monthly") {
        (period[5..].parse::<u32>().ok()?, 1)
    } else {
        return None;
    };
    let first = NaiveDate::from_ymd_opt(year, month, 1)?;
    let next = month - 1 + months;
    let end = NaiveDate::from_ymd_opt(year + (next / 12) as i32, next % 12 + 1, 1)?;
    Some((first, end))
}

pub async fn download(source_id: &str) -> CommandResult<PublicDownload> {
    let source = source(source_id)?;
    // Each adapter is explicitly bound to a reviewed public address, never user input.
    let url = match source.adapter.as_str() {
        "bis_dsr" => DSR_URL.to_owned(),
        "bis_cpp" => super::public_cpp::URL.to_owned(),
        "eia_battery" => super::public_eia_storage::URL.to_owned(),
        "epo_embedded" => super::public_epo::url(source_id)?,
        "gfdd_concentration" => super::public_gfdd::URL.to_owned(),
        "iea_battery_chart" => super::public_battery::url(source_id)?,
        "imf_imts" => super::public_imts::url(source_id)?,
        "imf_gdd" | "ilo_wage_xlsx" | "ilo_hours_csv" | "icp_housing" => {
            super::public_gap::url(source_id)?
        }
        "wto_merchandise" => super::public_wto::URL.to_owned(),
        "aci_trilemma" => super::public_trilemma::URL.to_owned(),
        "jst_regimes" => super::public_regimes::URL.to_owned(),
        "eu_materials_pdf" => super::public_materials::URL.to_owned(),
        "sasol_synfuels" => super::public_synfuels::URL.to_owned(),
        "oecd_wages" => WAGES_URL.to_owned(),
        "oecd_hours" => HOURS_URL.to_owned(),
        "worldbank_wgi" => WGI_URL.to_owned(),
        "census_construction" => CENSUS_URL.to_owned(),
        "iea_ev" => super::public_iea::url()?,
        "eurostat_jsonstat" => super::public_eurostat::url(source_id)?,
        "eurostat_energy" => super::public_energy::url(source_id)?,
        "eurostat_sbs" => super::public_sbs::url(source_id)?,
        "oecd_tiva" => super::public_tiva::url(source_id)?,
        "wits_hhpci" => super::public_wits::URL.to_owned(),
        "ndgain" => super::public_ndgain::URL.to_owned(),
        "bgs_csv" => super::public_bgs::url(source_id)?,
        "oecd_housing_stock" => super::public_housing_stock::URL.to_owned(),
        _ => return Err(invalid()),
    };
    if source.url != url {
        return Err(invalid());
    }
    let network = || {
        CommandError::validation(
            "Die zusätzliche öffentliche Atlasquelle konnte nicht geladen werden. Bitte später erneut versuchen.",
        )
    };
    let builder = reqwest::Client::builder();
    // The EC endpoint was verified through Windows' native certificate chain
    // validation. Keep certificate verification enabled in both TLS backends.
    #[cfg(windows)]
    let builder = if matches!(
        source.adapter.as_str(),
        "eurostat_jsonstat" | "eurostat_energy" | "eurostat_sbs"
    ) {
        builder.tls_backend_native()
    } else {
        builder.tls_backend_rustls()
    };
    #[cfg(not(windows))]
    let builder = builder.tls_backend_rustls();
    let client = builder
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    if source.adapter == "wits_hhpci" {
        let bytes = super::public_wits::download_bytes(&client).await?;
        return tokio::task::spawn_blocking(move || parse_download(&source, &bytes))
            .await
            .map_err(|_| invalid())?;
    }
    if source.adapter == "sasol_synfuels" {
        let bytes = super::public_synfuels::download_bytes(&client).await?;
        return tokio::task::spawn_blocking(move || parse_download(&source, &bytes))
            .await
            .map_err(|_| invalid())?;
    }
    let request = client.get(&url);
    let request = if source.adapter == "imf_imts" {
        request.header(reqwest::header::ACCEPT, super::public_imts::ACCEPT)
    } else {
        request
    };
    let mut response = request.send().await.map_err(|_| network())?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|n| n > MAX_DOWNLOAD as u64)
    {
        return Err(network());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
        if bytes.len() + chunk.len() > MAX_DOWNLOAD {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    tokio::task::spawn_blocking(move || parse_download(&source, &bytes))
        .await
        .map_err(|_| invalid())?
}

pub fn parse_download(source: &PublicSource, bytes: &[u8]) -> CommandResult<PublicDownload> {
    validate_geographies(source)?;
    if bytes.len() > MAX_DOWNLOAD {
        return Err(invalid());
    }
    let normalized;
    let bytes = if source.adapter == "iea_battery_chart" {
        normalized = super::public_battery::normalize(source, bytes)?;
        normalized.as_slice()
    } else {
        bytes
    };
    let hash = if source.adapter == "wto_merchandise" {
        super::public_wto::fingerprint(bytes)?
    } else {
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    };
    if bytes.len() > MAX_DOWNLOAD || hash != source.expected_sha256 {
        return Err(invalid());
    }
    let (profiles, source_rows) = match source.adapter.as_str() {
        "worldbank_wgi" => super::public_wgi::parse(source, bytes)?,
        "bis_cpp" => super::public_cpp::parse(source, bytes)?,
        "eia_battery" => super::public_eia_storage::parse(source, bytes)?,
        "epo_embedded" => super::public_epo::parse(source, bytes)?,
        "gfdd_concentration" => super::public_gfdd::parse(source, bytes)?,
        "imf_gdd" => super::public_gap::parse_imf(source, bytes)?,
        "iea_battery_chart" => super::public_battery::parse(source, bytes)?,
        "imf_imts" => super::public_imts::parse(source, bytes)?,
        "ilo_wage_xlsx" => super::public_gap::parse_wage(source, bytes)?,
        "ilo_hours_csv" => super::public_gap::parse_hours(source, bytes)?,
        "icp_housing" => super::public_gap::parse_icp(source, bytes)?,
        "wto_merchandise" => super::public_wto::parse(source, bytes)?,
        "aci_trilemma" => super::public_trilemma::parse(source, bytes)?,
        "jst_regimes" => super::public_regimes::parse(source, bytes)?,
        "eu_materials_pdf" => super::public_materials::parse(source, bytes)?,
        "sasol_synfuels" => super::public_synfuels::parse(source, bytes)?,
        "census_construction" => super::public_census::parse(source, bytes)?,
        "iea_ev" => super::public_iea::parse(source, bytes)?,
        "eurostat_jsonstat" => super::public_eurostat::parse(source, bytes)?,
        "eurostat_energy" => super::public_energy::parse(source, bytes)?,
        "eurostat_sbs" => super::public_sbs::parse(source, bytes)?,
        "oecd_tiva" => super::public_tiva::parse(source, bytes)?,
        "wits_hhpci" => super::public_wits::parse(source, bytes)?,
        "ndgain" => super::public_ndgain::parse(source, bytes)?,
        "bgs_csv" => super::public_bgs::parse(source, bytes)?,
        "oecd_housing_stock" => super::public_housing_stock::parse(source, bytes)?,
        "oecd_wages" | "oecd_hours" => super::public_oecd::parse(source, bytes)?,
        "bis_dsr" => {
            let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
            if zip.len() != 1 {
                return Err(invalid());
            }
            let member = zip.by_index(0).map_err(|_| invalid())?;
            if member.name() != "WS_DSR_csv_flat.csv"
                || member.is_dir()
                || member.size() > MAX_UNCOMPRESSED
            {
                return Err(invalid());
            }
            let size = member.size();
            let mut csv = Vec::new();
            member
                .take(MAX_UNCOMPRESSED + 1)
                .read_to_end(&mut csv)
                .map_err(|_| invalid())?;
            if csv.len() as u64 != size {
                return Err(invalid());
            }
            parse_dsr(source, &csv)?
        }
        _ => return Err(invalid()),
    };
    let numeric_values = profiles
        .iter()
        .flat_map(|p| &p.points)
        .filter(|p| p.value.is_some())
        .count();
    let area_count = profiles
        .iter()
        .map(|p| &p.geography_id)
        .collect::<BTreeSet<_>>()
        .len();
    if source_rows != source.expected_rows
        || numeric_values != source.expected_numeric
        || area_count != source.areas.len()
    {
        return Err(invalid());
    }
    Ok(PublicDownload {
        profiles,
        provenance: PublicProvenance {
            source_id: source.id.clone(),
            retrieved_at: Utc::now().to_rfc3339(),
            published_at: source.published_at.clone(),
            url: source.url.clone(),
            documentation_url: source.documentation_url.clone(),
            sha256: hash,
            recipe: source.recipe.clone(),
            source_rows,
            numeric_values,
            area_count,
        },
    })
}

fn parse_dsr(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let cfg = config()?;
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let metrics: BTreeMap<_, _> = cfg
        .metrics
        .iter()
        .filter(|m| m.source_id == source.id)
        .map(|m| (m.provider_code.as_str(), m))
        .collect();
    let mut reader = csv::Reader::from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != DSR_HEADERS
    {
        return Err(invalid());
    }
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut rows = 0;
    for record in reader.records() {
        let r = record.map_err(|_| invalid())?;
        rows += 1;
        if r.len() != DSR_HEADERS.len()
            || &r[0] != "dataflow"
            || &r[1] != "BIS:WS_DSR(1.0): Debt service ratios"
            || &r[2] != "I"
            || &r[3] != "Q: Quarterly"
            || !r[8].is_empty()
            || &r[9] != "367: Per cent"
            || &r[10] != "0: Units"
            || &r[11] != "1: One"
            || &r[13] != "F: Free"
            || !r[14].is_empty()
            || &r[15] != "A: Normal value"
        {
            return Err(invalid());
        }
        let (code, label) = r[4].split_once(": ").ok_or_else(invalid)?;
        let area = areas.get(code).ok_or_else(invalid)?;
        let borrower = match &r[5] {
            "P: Private non-financial sector" => "P",
            "H: Households & NPISHs" => "H",
            "N: Non-financial corporations" => "N",
            _ => return Err(invalid()),
        };
        let metric = metrics.get(borrower).ok_or_else(invalid)?;
        if label != area.label
            || area
                .series_titles
                .get(borrower)
                .is_none_or(|title| title != &r[12])
            || !valid_period(&r[6], "quarterly")
            || &r[6] < source.first_period.as_str()
            || &r[6] > source.last_period.as_str()
            || !seen.insert((code.to_owned(), borrower.to_owned(), r[6].to_owned()))
        {
            return Err(invalid());
        }
        let value = decimal(&r[7])?;
        if value.as_ref().is_some_and(|v| {
            !v.parse::<rust_decimal::Decimal>()
                .is_ok_and(|v| v.scale() <= 1 && v >= rust_decimal::Decimal::ZERO)
        }) {
            return Err(invalid());
        }
        let profile = profiles
            .entry((area.geography_id.clone(), metric.id.clone()))
            .or_insert_with(|| PublicProfile {
                metric_id: metric.id.clone(),
                geography_id: area.geography_id.clone(),
                provider_area: code.into(),
                provider_label: label.into(),
                provider_title: r[12].into(),
                unit: metric.unit.clone(),
                points: Vec::new(),
            });
        profile.points.push(PublicPoint {
            period: r[6].into(),
            value,
            status: r[15].into(),
            break_before: false,
            notes: vec![],
            lower_bound: None,
            upper_bound: None,
        });
    }
    for area in &source.areas {
        for code in area.series_titles.keys() {
            let metric = metrics.get(code.as_str()).ok_or_else(invalid)?;
            if !profiles.contains_key(&(area.geography_id.clone(), metric.id.clone())) {
                return Err(invalid());
            }
        }
    }
    Ok((
        profiles
            .into_values()
            .map(|mut p| {
                p.points.sort_by(|a, b| a.period.cmp(&b.period));
                p
            })
            .collect(),
        rows,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_periods_and_decimal_values_preserve_meaning() {
        assert!(valid_period("2000-Q4", "quarterly"));
        assert!(!valid_period("2000-Q5", "quarterly"));
        assert!(!valid_period("2000.5", "annual"));
        assert!(!valid_period("2025-02-29", "irregular"));
        assert_eq!(decimal("0").unwrap(), Some("0".into()));
        assert_eq!(decimal("-0.125").unwrap(), Some("-0.125".into()));
        assert_eq!(decimal("").unwrap(), None);
        assert!(decimal("NaN").is_err());
        assert!(decimal("inf").is_err());
        assert!(decimal(" 1").is_err());
    }

    #[test]
    fn dsr_rejects_changed_units_borrowers_titles_and_duplicate_periods() {
        let mut source = source("bis-dsr").unwrap();
        let mut area = source
            .areas
            .iter()
            .find(|a| a.code == "DE")
            .unwrap()
            .clone();
        area.series_titles.retain(|key, _| key == "P");
        source.areas = vec![area.clone()];
        let original = [
            "dataflow",
            "BIS:WS_DSR(1.0): Debt service ratios",
            "I",
            "Q: Quarterly",
            "DE: Germany",
            "P: Private non-financial sector",
            "2025-Q4",
            "12.3",
            "",
            "367: Per cent",
            "0: Units",
            "1: One",
            area.series_titles["P"].as_str(),
            "F: Free",
            "",
            "A: Normal value",
        ];
        let csv = |rows: Vec<Vec<&str>>| {
            let mut w = csv::Writer::from_writer(vec![]);
            w.write_record(DSR_HEADERS).unwrap();
            for row in rows {
                w.write_record(row).unwrap();
            }
            w.into_inner().unwrap()
        };
        assert!(parse_dsr(&source, &csv(vec![original.to_vec()])).is_ok());
        for (index, value) in [
            (4, "DE: Denmark"),
            (5, "G: Government"),
            (6, "2025-Q5"),
            (7, "12.34"),
            (9, "770: Percentage of GDP"),
            (12, "Different source definition"),
        ] {
            let mut altered = original.to_vec();
            altered[index] = value;
            assert!(
                parse_dsr(&source, &csv(vec![altered])).is_err(),
                "accepted changed column {index}"
            );
        }
        assert!(parse_dsr(&source, &csv(vec![original.to_vec(), original.to_vec()])).is_err());
    }

    #[tokio::test]
    #[ignore = "requires independently reviewed public OECD and World Bank originals"]
    async fn reviewed_oecd_and_wgi_releases_preserve_values_and_missing_cells() {
        for (id, file, profiles, values) in [
            ("oecd-wages", "oecd-wages.csv", 38, 1298),
            ("oecd-hours", "oecd-hours.csv", 89, 3722),
            ("worldbank-wgi", "WGI2025.xlsx", 1286, 32319),
        ] {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../.tmp/atlas-remaining-40")
                .join(file);
            let bytes = std::fs::read(path).unwrap();
            let source = source(id).unwrap();
            let data =
                parse_download(&source, &bytes).unwrap_or_else(|e| panic!("{id}: {}", e.message));
            assert_eq!(data.profiles.len(), profiles);
            assert_eq!(data.provenance.numeric_values, values);
            if id == "oecd-hours" {
                let colombia = data
                    .profiles
                    .iter()
                    .find(|p| p.provider_area == "COL" && p.metric_id == "oecd-hours:_T")
                    .unwrap();
                assert_eq!(colombia.points.last().unwrap().period, "2025");
                assert_eq!(colombia.points.last().unwrap().value, None);
            }
            if id == "oecd-wages" {
                let australia = data
                    .profiles
                    .iter()
                    .find(|p| p.provider_area == "AUS")
                    .unwrap();
                assert_eq!(australia.points[0].value.as_deref(), Some("51711.294"));
            }
            if id == "worldbank-wgi" {
                let andorra = data
                    .profiles
                    .iter()
                    .find(|p| p.provider_area == "ADO" && p.metric_id == "worldbank-wgi:va")
                    .unwrap();
                assert_eq!(andorra.geography_id, "m49:020");
                assert!(
                    (andorra.points[0]
                        .value
                        .as_ref()
                        .unwrap()
                        .parse::<f64>()
                        .unwrap()
                        - 83.8372793)
                        .abs()
                        < 1e-9
                );
                assert!(
                    (andorra.points[0]
                        .lower_bound
                        .as_ref()
                        .unwrap()
                        .parse::<f64>()
                        .unwrap()
                        - 75.1967538)
                        .abs()
                        < 1e-9
                );
                assert!(!data.profiles.iter().any(|p| p.provider_area == "ANT"));
            }
            let expected = data
                .profiles
                .iter()
                .find(|p| p.geography_id == "m49:276")
                .unwrap()
                .clone();
            let temp = tempfile::tempdir().unwrap();
            let db = super::super::store::open(temp.path()).await.unwrap();
            super::super::public_store::replace(&db, data)
                .await
                .unwrap();
            db.close().await;
            let db = super::super::store::open(temp.path()).await.unwrap();
            let read = super::super::public_store::read(&db, id, "m49:276")
                .await
                .unwrap();
            assert_eq!(
                read.profiles
                    .iter()
                    .find(|p| p.metric_id == expected.metric_id),
                Some(&expected)
            );
        }
    }

    #[tokio::test]
    #[ignore = "requires the independently reviewed original public BIS file"]
    async fn public_dsr_reviewed_release_roundtrip() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.tmp/atlas-remaining-40/WS_DSR.zip");
        let bytes = std::fs::read(path).unwrap();
        let source = source("bis-dsr").unwrap();
        let data = parse_download(&source, &bytes).unwrap();
        assert_eq!(data.profiles.len(), 66);
        assert_eq!(data.provenance.numeric_values, 7116);
        assert_eq!(data.provenance.area_count, 32);
        let expected = data
            .profiles
            .iter()
            .find(|p| p.geography_id == "m49:276" && p.metric_id == "bis-dsr:P")
            .unwrap()
            .clone();
        let temp = tempfile::tempdir().unwrap();
        let db = super::super::store::open(temp.path()).await.unwrap();
        super::super::public_store::replace(&db, data)
            .await
            .unwrap();
        db.close().await;
        let reopened = super::super::store::open(temp.path()).await.unwrap();
        let read = super::super::public_store::read(&reopened, "bis-dsr", "m49:276")
            .await
            .unwrap();
        assert_eq!(read.status, "available");
        assert_eq!(
            read.profiles.iter().find(|p| p.metric_id == "bis-dsr:P"),
            Some(&expected)
        );
        let india = super::super::public_store::read(&reopened, "bis-dsr", "m49:356")
            .await
            .unwrap();
        assert_eq!(india.profiles.len(), 1);
        assert_eq!(india.profiles[0].metric_id, "bis-dsr:P");
        let world = super::super::public_store::read(&reopened, "bis-dsr", "world")
            .await
            .unwrap();
        assert_eq!(world.status, "unsupported_area");
        assert!(world.profiles.is_empty());
        let mut broken = bytes.clone();
        broken[5] ^= 1;
        assert!(parse_download(&source, &broken).is_err());
    }
}
