//! Read-only Atlas and government-bond calculations over reviewed public shards.
//! Never creates a disk cache, discovers AppData, starts jobs or reads provider keys.
use super::cache::{ArtifactKind, LoadedShard};
use crate::{
    errors::{CommandError, CommandResult},
    world_atlas as atlas,
};
use serde_json::Value;
use std::{collections::HashSet, sync::LazyLock};

// Only compiled catalogue identities are retained. Manifest validation still
// validates every artifact, schema and identity on every load, but must not
// deserialize the large immutable Atlas catalogues again for every artifact.
// Separate lazy sets preserve each family's independent validation failures.
static SERIES_SCHEMA_IDS: LazyLock<CommandResult<HashSet<String>>> = LazyLock::new(|| {
    Ok(atlas::catalog::catalog()?
        .series
        .into_iter()
        .map(|row| row.id)
        .collect())
});
static MARKET_SCHEMA_IDS: LazyLock<CommandResult<HashSet<String>>> = LazyLock::new(|| {
    Ok(atlas::market_store::proxies()?
        .into_iter()
        // The native lookup also applies market_source::validate_proxy. Keep
        // that predicate, including its treatment of any duplicate identities,
        // without exposing or duplicating the native validation implementation.
        .filter(|row| atlas::market_store::proxy(&row.id).is_ok())
        .map(|row| row.id)
        .collect())
});
static PUBLIC_SCHEMA_IDS: LazyLock<CommandResult<HashSet<String>>> = LazyLock::new(|| {
    Ok(atlas::public_models::config()?
        .sources
        .into_iter()
        .map(|row| row.id)
        .collect())
});
static VALUATION_SCHEMA_IDS: LazyLock<CommandResult<HashSet<String>>> = LazyLock::new(|| {
    Ok(atlas::valuation_models::catalog()?
        .datasets
        .into_iter()
        .map(|row| row.id)
        .collect())
});

pub const COMMANDS: &[&str] = &[
    "get_atlas_catalog",
    "get_atlas_series",
    "get_atlas_market",
    "get_atlas_public_source",
    "get_atlas_valuation",
    "get_atlas_demography",
    "get_atlas_history",
    "get_atlas_energy",
    "get_atlas_capacity",
    "get_atlas_credit",
    "get_atlas_property",
    "get_atlas_housing_ratios",
    "get_atlas_education",
    "get_atlas_agriculture",
    "get_atlas_macrohistory",
    "get_atlas_fiscal",
    "get_atlas_households",
    "get_atlas_debt",
    "get_atlas_health",
    "get_atlas_innovation",
    "get_atlas_labor",
    "get_atlas_commodities",
    "get_atlas_findex",
    "get_government_bonds",
    "get_government_bond_detail",
];

fn invalid() -> CommandError {
    CommandError::validation("Die Auswahl dieser Datenansicht ist ungültig.")
}
fn keys(args: &Value, allowed: &[&str]) -> CommandResult<()> {
    let obj = args.as_object().ok_or_else(invalid)?;
    if obj.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid());
    }
    Ok(())
}
fn arg<T: serde::de::DeserializeOwned>(args: &Value, name: &str) -> CommandResult<T> {
    serde_json::from_value(args.get(name).cloned().ok_or_else(invalid)?).map_err(|_| invalid())
}
fn text(args: &Value, name: &str) -> CommandResult<String> {
    let value: String = arg(args, name)?;
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(invalid());
    }
    Ok(value)
}
fn series_input(args: &Value) -> CommandResult<atlas::models::SeriesInput> {
    keys(args, &["generation", "input"])?;
    let input = args.get("input").ok_or_else(invalid)?;
    keys(input, &["seriesId", "geographyId"])?;
    let parsed: atlas::models::SeriesInput = arg(args, "input")?;
    atlas::catalog::series(&parsed.series_id)?;
    atlas::catalog::geography(&parsed.geography_id)?;
    Ok(parsed)
}
fn bond_input(args: &Value) -> CommandResult<crate::government_bonds::models::DetailInput> {
    keys(args, &["generation", "input"])?;
    keys(
        args.get("input").ok_or_else(invalid)?,
        &["countryId", "comparisonId", "maturityMonths"],
    )?;
    let input: crate::government_bonds::models::DetailInput = arg(args, "input")?;
    let catalog = crate::government_bonds::models::catalog();
    if !(1..=600).contains(&input.maturity_months)
        || [Some(&input.country_id), input.comparison_id.as_ref()]
            .into_iter()
            .flatten()
            .any(|id| !catalog.countries.iter().any(|c| &c.id == id))
    {
        return Err(invalid());
    }
    Ok(input)
}

pub fn validate(command: &str, args: &Value) -> CommandResult<()> {
    match command {
        "get_atlas_catalog" | "get_atlas_commodities" | "get_government_bonds" => {
            keys(args, &["generation"])
        }
        "get_atlas_series" => series_input(args).map(|_| ()),
        "get_atlas_market" => {
            keys(args, &["generation", "proxyId"])?;
            atlas::market_store::proxy(&text(args, "proxyId")?).map(|_| ())
        }
        "get_atlas_valuation" => {
            keys(args, &["generation", "datasetId"])?;
            atlas::valuation_models::dataset(&text(args, "datasetId")?).map(|_| ())
        }
        "get_atlas_public_source" => {
            keys(args, &["generation", "sourceId", "geographyId"])?;
            atlas::public_models::source(&text(args, "sourceId")?)?;
            atlas::catalog::geography(&text(args, "geographyId")?).map(|_| ())
        }
        "get_government_bond_detail" => bond_input(args).map(|_| ()),
        name if COMMANDS.contains(&name) => {
            keys(args, &["generation", "geographyId"])?;
            atlas::catalog::geography(&text(args, "geographyId")?).map(|_| ())
        }
        _ => Err(invalid()),
    }
}

/// This resolves an internal catalogue identity, never a path supplied by a caller.
pub fn artifact(command: &str, args: &Value) -> CommandResult<(ArtifactKind, String)> {
    validate(command, args)?;
    let key = match command {
        "get_government_bonds" | "get_government_bond_detail" => {
            return Ok((ArtifactKind::Bonds, "bonds:all".into()));
        }
        "get_atlas_series" => format!("atlas:series:{}", series_input(args)?.series_id),
        "get_atlas_market" => format!("atlas:market:{}", text(args, "proxyId")?),
        "get_atlas_public_source" => format!("atlas:public:{}", text(args, "sourceId")?),
        "get_atlas_valuation" => format!("atlas:valuation:{}", text(args, "datasetId")?),
        name => format!(
            "atlas:{}",
            name.strip_prefix("get_atlas_").ok_or_else(invalid)?
        ),
    };
    Ok((ArtifactKind::Atlas, key))
}

/// Shared schema family for strict package validation. Unknown keys fail closed.
pub fn schema_family(kind: ArtifactKind, key: &str) -> CommandResult<&'static str> {
    if kind == ArtifactKind::Bonds {
        return if key == "bonds:all" {
            Ok("bonds")
        } else {
            Err(invalid())
        };
    }
    if kind != ArtifactKind::Atlas {
        return Err(invalid());
    }
    for (prefix, family) in [
        ("atlas:series:", "series"),
        ("atlas:market:", "market"),
        ("atlas:public:", "public"),
        ("atlas:valuation:", "valuation"),
    ] {
        if let Some(id) = key.strip_prefix(prefix) {
            let known = match family {
                "series" => &*SERIES_SCHEMA_IDS,
                "market" => &*MARKET_SCHEMA_IDS,
                "public" => &*PUBLIC_SCHEMA_IDS,
                "valuation" => &*VALUATION_SCHEMA_IDS,
                _ => unreachable!(),
            };
            return known
                .as_ref()
                .map_err(Clone::clone)?
                .contains(id)
                .then_some(family)
                .ok_or_else(invalid);
        }
    }
    match key.strip_prefix("atlas:") {
        Some("catalog") => Ok("catalog"),
        Some("demography") => Ok("demography"),
        Some("history") => Ok("history"),
        Some("energy") => Ok("energy"),
        Some("capacity") => Ok("capacity"),
        Some("credit") => Ok("credit"),
        Some("property") => Ok("property"),
        Some("housing_ratios") => Ok("housing_ratios"),
        Some("education") => Ok("education"),
        Some("agriculture") => Ok("agriculture"),
        Some("macrohistory") => Ok("macrohistory"),
        Some("fiscal") => Ok("fiscal"),
        Some("households") => Ok("households"),
        Some("debt") => Ok("debt"),
        Some("health") => Ok("health"),
        Some("innovation") => Ok("innovation"),
        Some("labor") => Ok("labor"),
        Some("commodities") => Ok("commodities"),
        Some("findex") => Ok("findex"),
        _ => Err(invalid()),
    }
}

pub async fn read(command: &str, args: &Value, shard: &LoadedShard) -> CommandResult<Value> {
    let (kind, key) = artifact(command, args)?;
    if shard.artifact.kind != kind || shard.artifact.key != key {
        return Err(invalid());
    }
    let db = shard.pool();
    macro_rules! encode {
        ($e:expr) => {
            serde_json::to_value($e?).map_err(|_| invalid())
        };
    }
    let result = match command {
        "get_atlas_catalog" => atlas::catalog::catalog_value(),
        "get_atlas_series" => encode!(atlas::store::read_series(db, series_input(args)?).await),
        "get_atlas_market" => encode!(atlas::market_store::read(db, &text(args, "proxyId")?).await),
        "get_atlas_public_source" => encode!(
            atlas::public_store::read(db, &text(args, "sourceId")?, &text(args, "geographyId")?)
                .await
        ),
        "get_atlas_valuation" => {
            encode!(atlas::valuation_store::read(db, &text(args, "datasetId")?).await)
        }
        "get_atlas_demography" => {
            encode!(atlas::demography_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_history" => {
            encode!(atlas::history_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_energy" => {
            encode!(atlas::energy_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_capacity" => {
            encode!(atlas::capacity_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_credit" => {
            encode!(atlas::credit_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_property" => {
            encode!(atlas::property_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_housing_ratios" => {
            encode!(atlas::ratio_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_education" => {
            encode!(atlas::education_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_agriculture" => {
            encode!(atlas::agriculture_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_macrohistory" => {
            encode!(atlas::macrohistory_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_fiscal" => {
            encode!(atlas::fiscal_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_households" => {
            encode!(atlas::households_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_debt" => encode!(atlas::debt_store::read(db, &text(args, "geographyId")?).await),
        "get_atlas_health" => {
            encode!(atlas::health_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_innovation" => {
            encode!(atlas::innovation_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_labor" => {
            encode!(atlas::labor_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_atlas_commodities" => encode!(atlas::commodity_store::read(db).await),
        "get_atlas_findex" => {
            encode!(atlas::findex_store::read(db, &text(args, "geographyId")?).await)
        }
        "get_government_bonds" => encode!(bonds_dashboard(db).await),
        "get_government_bond_detail" => {
            encode!(crate::government_bonds::store::detail(db, &bond_input(args)?).await)
        }
        _ => Err(invalid()),
    };
    result.map_err(|_| CommandError {
        code: "MARKET_DATA_UNAVAILABLE".into(),
        message: "Der geprüfte Datenstand konnte nicht gelesen werden.".into(),
        details: None,
    })
}

async fn bonds_dashboard(
    db: &sqlx::SqlitePool,
) -> CommandResult<crate::government_bonds::models::Dashboard> {
    use crate::government_bonds::{models::*, store};
    let mut instruments = store::quotes(db, chrono::Utc::now().date_naive()).await?;
    for item in &mut instruments {
        item.last_error = None;
    }
    Ok(Dashboard {
        as_of: chrono::Utc::now().to_rfc3339(),
        configured: false,
        desktop: false,
        catalog_reviewed_at: catalog().reviewed_at.clone(),
        catalog_checked_at: store::metadata(db, "catalogCheckedAt").await?,
        source_url: catalog().source_url.clone(),
        methodology_url: catalog().methodology_url.clone(),
        countries: catalog().countries.clone(),
        instruments,
        excluded: catalog().excluded.clone(),
        job: None,
    })
}

/// Defense in depth after exact schema/hash verification: public geography and
/// instrument identities still have to belong to the compiled catalogues.
pub async fn verify_identity(
    db: &sqlx::SqlitePool,
    kind: ArtifactKind,
    key: &str,
) -> CommandResult<()> {
    let family = schema_family(kind, key)?;
    let schemas: Value =
        serde_json::from_str(include_str!("atlas_schema.json")).map_err(|_| invalid())?;
    let tables = schemas[family]["tables"].as_object().ok_or_else(invalid)?;
    let geographies = atlas::catalog::catalog()?.geographies;
    for (name, definition) in tables {
        if definition["columns"].get("geography_id").is_some() {
            // name comes from the embedded reviewed schema, never a caller.
            let ids: Vec<String> =
                sqlx::query_scalar(&format!("SELECT DISTINCT geography_id FROM {name}"))
                    .fetch_all(db)
                    .await
                    .map_err(|_| invalid())?;
            if ids
                .iter()
                .any(|id| !geographies.iter().any(|g| &g.id == id))
            {
                return Err(invalid());
            }
        }
    }
    if family == "bonds" {
        let catalog = crate::government_bonds::models::catalog();
        for name in ["bond_series", "bond_observations"] {
            let symbols: Vec<String> =
                sqlx::query_scalar(&format!("SELECT DISTINCT symbol FROM {name}"))
                    .fetch_all(db)
                    .await
                    .map_err(|_| invalid())?;
            if symbols
                .iter()
                .any(|symbol| !catalog.instruments.iter().any(|i| &i.symbol == symbol))
            {
                return Err(invalid());
            }
        }
        let bad:i64=sqlx::query_scalar("SELECT COUNT(*) FROM bond_series WHERE last_error IS NOT NULL OR last_attempt_at IS NOT NULL OR active NOT IN (0,1)")
            .fetch_one(db).await.map_err(|_|invalid())?;
        if bad != 0 {
            return Err(invalid());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn rejects_paths_unlisted_commands_and_extra_arguments() {
        for (name, args) in [
            ("sync_atlas_library", json!({})),
            ("get_atlas_catalog", json!({"path":"C:/private.sqlite"})),
            (
                "get_atlas_series",
                json!({"input":{"seriesId":"unknown","geographyId":"m49:276"}}),
            ),
            (
                "get_government_bond_detail",
                json!({"input":{"countryId":"DE","maturityMonths":601}}),
            ),
        ] {
            assert!(validate(name, &args).is_err());
        }
        assert!(schema_family(ArtifactKind::Atlas, "atlas:../../journal").is_err());
    }
    #[test]
    fn keys_use_reviewed_catalogue_identities() {
        let result = artifact(
            "get_atlas_series",
            &json!({"input":{"seriesId":"worldbank:2:SP.POP.TOTL","geographyId":"m49:276"}}),
        )
        .unwrap();
        assert_eq!(
            result,
            (
                ArtifactKind::Atlas,
                "atlas:series:worldbank:2:SP.POP.TOTL".into()
            )
        );
        assert_eq!(schema_family(result.0, &result.1).unwrap(), "series");
    }

    #[test]
    fn schema_identities_match_complete_native_catalogues() {
        // Parse each source catalogue once, rather than reproducing the costly
        // per-ID catalogue reparsing that this regression protects against.
        let series: HashSet<_> = atlas::catalog::catalog()
            .unwrap()
            .series
            .into_iter()
            .map(|row| row.id)
            .collect();
        let public: HashSet<_> = atlas::public_models::config()
            .unwrap()
            .sources
            .into_iter()
            .map(|row| row.id)
            .collect();
        let valuation: HashSet<_> = atlas::valuation_models::catalog()
            .unwrap()
            .datasets
            .into_iter()
            .map(|row| row.id)
            .collect();
        let market: HashSet<_> = atlas::market_store::proxies()
            .unwrap()
            .into_iter()
            .filter(|row| atlas::market_store::proxy(&row.id).is_ok())
            .map(|row| row.id)
            .collect();
        for (family, expected, cached) in [
            ("series", series, &*SERIES_SCHEMA_IDS),
            ("market", market, &*MARKET_SCHEMA_IDS),
            ("public", public, &*PUBLIC_SCHEMA_IDS),
            ("valuation", valuation, &*VALUATION_SCHEMA_IDS),
        ] {
            assert!(!expected.is_empty());
            assert_eq!(&expected, cached.as_ref().unwrap());
            for id in &expected {
                assert_eq!(
                    schema_family(ArtifactKind::Atlas, &format!("atlas:{family}:{id}")).unwrap(),
                    family
                );
            }
            // Unknown request strings never become retained cache entries.
            for index in 0..100 {
                assert!(
                    schema_family(
                        ArtifactKind::Atlas,
                        &format!("atlas:{family}:unlisted-request-{index}")
                    )
                    .is_err()
                );
            }
            assert_eq!(&expected, cached.as_ref().unwrap());
        }
    }

    #[test]
    fn schema_identity_lookup_preserves_native_rejections_and_exact_matching() {
        let examples = [
            (
                "series",
                atlas::catalog::catalog().unwrap().series[0].id.clone(),
            ),
            (
                "market",
                atlas::market_store::proxies().unwrap()[0].id.clone(),
            ),
            (
                "public",
                atlas::public_models::config().unwrap().sources[0]
                    .id
                    .clone(),
            ),
            (
                "valuation",
                atlas::valuation_models::catalog().unwrap().datasets[0]
                    .id
                    .clone(),
            ),
        ];
        for (family, id) in examples {
            let native_accepts = match family {
                "series" => atlas::catalog::series(&id).is_ok(),
                "market" => atlas::market_store::proxy(&id).is_ok(),
                "public" => atlas::public_models::source(&id).is_ok(),
                "valuation" => atlas::valuation_models::dataset(&id).is_ok(),
                _ => unreachable!(),
            };
            let key = format!("atlas:{family}:{id}");
            assert_eq!(
                schema_family(ArtifactKind::Atlas, &key).is_ok(),
                native_accepts
            );
            assert!(schema_family(ArtifactKind::Bonds, &key).is_err());
            assert!(schema_family(ArtifactKind::Macro, &key).is_err());
            for invalid_id in [
                "",
                "../../journal.sqlite",
                "https://untrusted.invalid",
                "\0",
            ] {
                assert!(
                    schema_family(ArtifactKind::Atlas, &format!("atlas:{family}:{invalid_id}"))
                        .is_err()
                );
            }
            for altered in [format!(" {key}"), format!("{key} "), format!("{key}/extra")] {
                assert!(schema_family(ArtifactKind::Atlas, &altered).is_err());
            }
        }
        assert_eq!(
            schema_family(ArtifactKind::Bonds, "bonds:all").unwrap(),
            "bonds"
        );
        assert!(schema_family(ArtifactKind::Atlas, "bonds:all").is_err());
    }
}
