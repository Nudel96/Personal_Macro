use super::{catalog, macrohistory_models::*};
use crate::errors::{CommandError, CommandResult};
use calamine::{Data, Reader, Xlsx};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    time::Duration,
};

const MAX_FILE: usize = 4 * 1024 * 1024;
fn invalid() -> CommandError {
    CommandError::validation(
        "Die JST-Datei weicht von der geprüften Ausgabe ab oder enthält unerwartete Gebiete, Jahre oder Werte. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentliche JST-Datei konnte nicht geladen werden. Bitte später erneut versuchen.",
    )
}

pub async fn download() -> CommandResult<MacrohistoryDownload> {
    let cfg = config()?;
    let target = cfg.resolved_url.clone();
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
        // The official page redirects once to its own published file host.
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() == 1 && attempt.url().as_str() == target {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let mut response = client.get(&cfg.url).send().await.map_err(|_| network())?;
    if !response.status().is_success()
        || response.url().as_str() != cfg.resolved_url
        || response
            .content_length()
            .is_some_and(|n| n > MAX_FILE as u64)
    {
        return Err(network());
    }
    let modified = response
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.len() <= 100)
        .map(str::to_owned);
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
        if bytes.len() + chunk.len() > MAX_FILE {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    let digest = Sha256::digest(&bytes)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect::<String>();
    if digest != cfg.sha256 {
        return Err(invalid());
    }
    let mut data = parse(&bytes, &cfg)?;
    data.provenance.sha256 = digest;
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    data.provenance.file_modified_at = modified;
    Ok(data)
}

fn number(cell: &Data) -> CommandResult<Option<f64>> {
    match cell {
        Data::Empty => Ok(None),
        Data::Int(n) => Ok(Some(*n as f64)),
        Data::Float(n) if n.is_finite() => Ok(Some(*n)),
        _ => Err(invalid()),
    }
}
fn text(cell: &Data) -> CommandResult<&str> {
    match cell {
        Data::String(value) => Ok(value),
        _ => Err(invalid()),
    }
}
fn value(raw: &BTreeMap<String, Option<f64>>, field: &str) -> Option<f64> {
    raw.get(field).copied().flatten()
}

fn calculate(
    raw: &BTreeMap<String, Option<f64>>,
    previous: Option<&MacrohistoryPoint>,
    metric: &Metric,
) -> CommandResult<MacrohistoryValue> {
    let original = value(raw, &metric.field);
    let nominal = if metric.method == "return" {
        original.map(|x| x * 100.)
    } else {
        None
    };
    let amount = match metric.method.as_str() {
        "direct" => original,
        "percent" => original.map(|x| x * 100.),
        "ratio" => original
            .zip(metric.denominator.as_ref().and_then(|key| value(raw, key)))
            .filter(|(_, denominator)| *denominator > 0.)
            .map(|(x, denominator)| x / denominator * 100.),
        "return" => original
            .zip(value(raw, "cpi"))
            .zip(previous.and_then(|p| value(&p.raw, "cpi")))
            .filter(|((_, current), prior)| *current > 0. && *prior > 0.)
            .map(|((r, current), prior)| ((1. + r) * prior / current - 1.) * 100.),
        _ => return Err(invalid()),
    };
    if amount.is_some_and(|v| !v.is_finite()) || nominal.is_some_and(|v| !v.is_finite()) {
        return Err(invalid());
    }
    Ok(MacrohistoryValue {
        value: amount,
        nominal,
        interpolated: metric.flags.iter().any(|flag| value(raw, flag) == Some(1.)),
    })
}

pub(crate) fn parse(bytes: &[u8], cfg: &Config) -> CommandResult<MacrohistoryDownload> {
    if bytes.len() > MAX_FILE {
        return Err(invalid());
    }
    let archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() > 100
        || archive
            .decompressed_size()
            .is_none_or(|n| n > 32 * 1024 * 1024)
    {
        return Err(invalid());
    }
    let mut workbook: Xlsx<_> = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if workbook.sheet_names() != [cfg.sheet.clone()] {
        return Err(invalid());
    }
    let range = workbook
        .worksheet_range(&cfg.sheet)
        .map_err(|_| invalid())?;
    if range.height() != cfg.row_count + 1 || range.width() != cfg.headers.len() {
        return Err(invalid());
    }
    let mut rows = range.rows();
    let header = rows.next().ok_or_else(invalid)?;
    if header.iter().map(text).collect::<CommandResult<Vec<_>>>()?
        != cfg.headers.iter().map(String::as_str).collect::<Vec<_>>()
    {
        return Err(invalid());
    }
    let mut areas: BTreeMap<String, MacrohistoryProfile> = BTreeMap::new();
    let mut numeric = 0;
    for row in rows {
        let year = number(&row[0])?.ok_or_else(invalid)?;
        if year.fract() != 0. || year < cfg.first_year as f64 || year > cfg.last_year as f64 {
            return Err(invalid());
        }
        let iso = text(&row[2])?;
        let area = cfg
            .areas
            .iter()
            .find(|a| a.code == iso)
            .ok_or_else(invalid)?;
        if text(&row[1])? != area.provider_label
            || number(&row[3])? != Some(area.ifs as f64)
            || catalog::geography(&area.geography_id)?.iso3 != iso
        {
            return Err(invalid());
        }
        let mut raw = BTreeMap::new();
        for (index, name) in cfg.headers.iter().enumerate().skip(4) {
            if matches!(name.as_str(), "peg_type" | "peg_base") {
                continue;
            }
            let n = number(&row[index])?;
            if (name.contains("ipolat")
                || name.ends_with("_interp")
                || matches!(
                    name.as_str(),
                    "crisisJST" | "crisisJST_old" | "peg" | "peg_strict"
                ))
                && n.is_some_and(|v| v != 0. && v != 1.)
            {
                return Err(invalid());
            }
            numeric += usize::from(n.is_some());
            raw.insert(name.clone(), n);
        }
        let profile = areas
            .entry(iso.to_owned())
            .or_insert_with(|| MacrohistoryProfile {
                geography_id: area.geography_id.clone(),
                provider_code: iso.to_owned(),
                provider_label: area.provider_label.clone(),
                points: vec![],
            });
        profile.points.push(MacrohistoryPoint {
            year: year as i32,
            raw,
            values: BTreeMap::new(),
        });
    }
    if areas.len() != cfg.areas.len() {
        return Err(invalid());
    }
    for profile in areas.values_mut() {
        profile.points.sort_by_key(|p| p.year);
        if profile
            .points
            .iter()
            .map(|p| p.year)
            .collect::<BTreeSet<_>>()
            != (cfg.first_year..=cfg.last_year).collect()
            || profile.points.len() != (cfg.last_year - cfg.first_year + 1) as usize
        {
            return Err(invalid());
        }
        for index in 0..profile.points.len() {
            let previous = index.checked_sub(1).map(|i| &profile.points[i]);
            profile.points[index].values = cfg
                .metrics
                .iter()
                .map(|metric| {
                    Ok((
                        metric.id.clone(),
                        calculate(&profile.points[index].raw, previous, metric)?,
                    ))
                })
                .collect::<CommandResult<BTreeMap<_, _>>>()?;
        }
    }
    Ok(MacrohistoryDownload {
        profiles: areas.into_values().collect(),
        provenance: MacrohistoryProvenance {
            retrieved_at: String::new(),
            file_modified_at: None,
            url: cfg.url.clone(),
            resolved_url: cfg.resolved_url.clone(),
            sha256: String::new(),
            release: cfg.release.clone(),
            source_row_count: cfg.row_count,
            numeric_cell_count: numeric,
            area_count: cfg.areas.len(),
            recipe: cfg.recipe.clone(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn world_atlas_jst_real_returns_require_a_true_prior_price_and_keep_extremes() {
        let cfg = config().unwrap();
        let metric = cfg.metrics.iter().find(|m| m.id == "equityReturn").unwrap();
        let raw = BTreeMap::from([
            ("eq_tr".into(), Some(9.)),
            ("cpi".into(), Some(100.)),
            ("eq_tr_interp".into(), Some(1.)),
        ]);
        let prior = MacrohistoryPoint {
            year: 1922,
            raw: BTreeMap::from([("cpi".into(), Some(1.))]),
            values: BTreeMap::new(),
        };
        let result = calculate(&raw, Some(&prior), metric).unwrap();
        assert_eq!(result.nominal, Some(900.));
        assert_eq!(result.value, Some(-90.));
        assert!(result.interpolated);
        assert!(calculate(&raw, None, metric).unwrap().value.is_none());
        let mut zero = raw.clone();
        zero.insert("eq_tr".into(), Some(0.));
        zero.insert("cpi".into(), Some(1.));
        assert_eq!(
            calculate(&zero, Some(&prior), metric).unwrap().value,
            Some(0.)
        );
        assert!(number(&Data::String("0".into())).is_err());
        assert!(number(&Data::Float(f64::NAN)).is_err());
        assert_eq!(number(&Data::Empty).unwrap(), None);
    }
    #[test]
    fn world_atlas_jst_ratios_units_and_missing_denominators_stay_distinct() {
        let cfg = config().unwrap();
        let metric = |id: &str| cfg.metrics.iter().find(|m| m.id == id).unwrap();
        let mut raw = BTreeMap::from([
            ("debtgdp".into(), Some(0.8)),
            ("tloans".into(), Some(90.)),
            ("gdp".into(), Some(60.)),
            ("stir".into(), Some(-2.)),
            ("lev".into(), Some(5.)),
        ]);
        assert_eq!(
            calculate(&raw, None, metric("publicDebt")).unwrap().value,
            Some(80.)
        );
        assert_eq!(
            calculate(&raw, None, metric("bankCredit")).unwrap().value,
            Some(150.)
        );
        assert_eq!(
            calculate(&raw, None, metric("shortRate")).unwrap().value,
            Some(-2.)
        );
        assert_eq!(
            calculate(&raw, None, metric("bankCapital")).unwrap().value,
            Some(5.)
        );
        raw.insert("gdp".into(), Some(0.));
        assert!(
            calculate(&raw, None, metric("bankCredit"))
                .unwrap()
                .value
                .is_none()
        );
    }

    fn sample() -> MacrohistoryDownload {
        let cfg = config().unwrap();
        MacrohistoryDownload {
            profiles: vec![MacrohistoryProfile {
                geography_id: "m49:276".into(),
                provider_code: "DEU".into(),
                provider_label: "Germany".into(),
                points: vec![],
            }],
            provenance: MacrohistoryProvenance {
                retrieved_at: Utc::now().to_rfc3339(),
                file_modified_at: None,
                url: cfg.url,
                resolved_url: cfg.resolved_url,
                sha256: cfg.sha256,
                release: cfg.release,
                source_row_count: 1,
                numeric_cell_count: 0,
                area_count: 1,
                recipe: cfg.recipe,
            },
        }
    }
    #[tokio::test]
    async fn world_atlas_jst_upgrade_atomic_rollback_offline_and_global_gate() {
        use super::super::{AtlasState, macrohistory_store};
        let dir = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(dir.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut prior = sqlx::migrate!("./atlas-migrations");
        prior.migrations = prior.iter().take(12).cloned().collect::<Vec<_>>().into();
        prior.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_agriculture_dataset VALUES ('fao-production-indices','{}','2026-09-09')").execute(&old).await.unwrap();
        old.close().await;
        let state = AtlasState::new(dir.path().to_owned());
        let db = state.0.db().await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_agriculture_dataset")
                .fetch_one(db)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            macrohistory_store::read(db, "m49:276")
                .await
                .unwrap()
                .status,
            "not_downloaded"
        );
        macrohistory_store::replace(db, sample()).await.unwrap();
        let mut invalid = sample();
        invalid.profiles.push(invalid.profiles[0].clone());
        invalid.provenance.recipe = "bad".into();
        assert!(macrohistory_store::replace(db, invalid).await.is_err());
        let first =
            serde_json::to_value(macrohistory_store::read(db, "m49:276").await.unwrap()).unwrap();
        assert_ne!(first["provenance"]["recipe"], "bad");
        assert_eq!(
            macrohistory_store::read(db, "m49:356")
                .await
                .unwrap()
                .status,
            "unsupported_area"
        );
        assert!(
            state
                .0
                .start_macrohistory()
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        let guard = state.0.gate.lock().await;
        assert!(
            state
                .0
                .start_macrohistory()
                .await
                .unwrap_err()
                .message
                .contains("bereits")
        );
        drop(guard);
        db.close().await;
        let reopened = super::super::store::open(dir.path()).await.unwrap();
        assert_eq!(
            first,
            serde_json::to_value(
                macrohistory_store::read(&reopened, "m49:276")
                    .await
                    .unwrap()
            )
            .unwrap()
        );
        reopened.close().await;
    }
    #[tokio::test]
    #[ignore = "Downloads the official JST workbook; run explicitly for source review"]
    async fn world_atlas_live_jst_roundtrip() {
        use super::super::{macrohistory_store, store};
        let data = download().await.unwrap();
        assert_eq!(data.profiles.len(), 18);
        assert_eq!(data.provenance.source_row_count, 2718);
        let dir = tempfile::tempdir().unwrap();
        let db = store::open(dir.path()).await.unwrap();
        macrohistory_store::replace(&db, data).await.unwrap();
        let mut snapshots = vec![];
        for area in config().unwrap().areas {
            snapshots.push(
                serde_json::to_value(
                    macrohistory_store::read(&db, &area.geography_id)
                        .await
                        .unwrap(),
                )
                .unwrap(),
            );
        }
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        for row in &snapshots {
            assert_eq!(
                *row,
                serde_json::to_value(
                    macrohistory_store::read(&db, row["geography"]["id"].as_str().unwrap())
                        .await
                        .unwrap()
                )
                .unwrap()
            );
        }
        db.close().await;
        if std::env::var("ATLAS_WRITE_JST_REVIEW").as_deref() == Ok("1") {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../.tmp/atlas-validation/macrohistory/native-review.json");
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, serde_json::to_vec(&snapshots).unwrap()).unwrap();
        }
        println!(
            "JST: 18 profiles, 2718 historical year rows, atomic import and offline readback passed"
        );
    }
}
