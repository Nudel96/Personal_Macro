use chrono::Utc;
use sqlx::SqlitePool;

use super::{market_models::*, market_source, market_wave};
use crate::errors::{CommandError, CommandResult};

pub const PROXIES: &str =
    include_str!("../../../src/features/world-atlas/data/market-proxies.json");
pub fn proxies() -> CommandResult<Vec<MarketProxy>> {
    serde_json::from_str(PROXIES)
        .map_err(|_| CommandError::validation("Der Marktkatalog ist ungültig."))
}
pub fn proxy(id: &str) -> CommandResult<MarketProxy> {
    proxies()?
        .into_iter()
        .find(|p| p.id == id && market_source::validate_proxy(p))
        .ok_or_else(|| CommandError::validation("Unbekannte Atlas-Marktreihe."))
}
pub async fn read(db: &SqlitePool, id: &str) -> CommandResult<MarketResponse> {
    let proxy = proxy(id)?;
    // Read metadata and prices in the same snapshot during concurrent refreshes.
    let mut tx = db.begin().await?;
    let json: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_market_datasets WHERE proxy_id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let provenance: Option<MarketProvenance> = json
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|_| {
        CommandError::validation("Die Quelleninformationen dieser Marktreihe sind nicht lesbar.")
    })?;
    let months: Vec<MarketMonth> = sqlx::query_as(
        "SELECT month, adjusted_close FROM atlas_market_months WHERE proxy_id = ? ORDER BY month",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    let analysis = market_wave::analyze(&months, &proxy.breaks, Utc::now().date_naive());
    let status = if provenance.is_some() {
        "available"
    } else {
        "not_downloaded"
    }
    .into();
    Ok(MarketResponse {
        proxy,
        status,
        provenance,
        analysis,
    })
}
pub async fn replace(db: &SqlitePool, id: &str, data: MarketDownload) -> CommandResult<()> {
    proxy(id)?;
    let json = serde_json::to_string(&data.provenance).map_err(|_| {
        CommandError::validation("Die Quelleninformationen konnten nicht gespeichert werden.")
    })?;
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_market_datasets (proxy_id, provenance_json, retrieved_at) VALUES (?, ?, ?) ON CONFLICT(proxy_id) DO UPDATE SET provenance_json=excluded.provenance_json, retrieved_at=excluded.retrieved_at").bind(id).bind(json).bind(&data.provenance.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_market_months WHERE proxy_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for chunk in data.months.chunks(200) {
        let mut q = sqlx::QueryBuilder::new(
            "INSERT INTO atlas_market_months (proxy_id, month, adjusted_close) ",
        );
        q.push_values(chunk, |mut row, month| {
            row.push_bind(id)
                .push_bind(&month.month)
                .push_bind(month.adjusted_close);
        });
        q.build().execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn world_atlas_market_cache_preserves_prior_dataset_on_failure_and_upgrade() {
        let dir = tempfile::tempdir().unwrap();
        // Upgrade a populated v1 Atlas cache, independently of the journal database.
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(dir.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v1 = sqlx::migrate!("./atlas-migrations");
        v1.migrations = v1.iter().take(1).cloned().collect::<Vec<_>>().into();
        v1.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_datasets (series_id, provenance_json, retrieved_at) VALUES ('upgrade-sentinel', '{}', '2026-01-01')").execute(&old).await.unwrap();
        old.close().await;
        let db = super::super::store::open(dir.path()).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM atlas_datasets WHERE series_id = 'upgrade-sentinel'"
            )
            .fetch_one(&db)
            .await
            .unwrap(),
            1
        );
        let make = |value| MarketDownload {
            provenance: MarketProvenance {
                retrieved_at: "2026-09-08T00:00:00Z".into(),
                source_url: "https://eodhd.com/api/eod/SPY.US".into(),
                sha256: "test".into(),
                source_first_date: "2020-01-31".into(),
                source_last_date: "2020-01-31".into(),
                adjustment: "adjusted".into(),
            },
            months: vec![MarketMonth {
                month: "2020-01".into(),
                adjusted_close: Some(value),
            }],
        };
        replace(&db, "eodhd:SPY.US", make(10.0)).await.unwrap();
        assert!(replace(&db, "eodhd:SPY.US", make(-1.0)).await.is_err());
        assert_eq!(
            read(&db, "eodhd:SPY.US").await.unwrap().analysis.points[0].adjusted_close,
            Some(10.0)
        );
        db.close().await;
        let reopened = super::super::store::open(dir.path()).await.unwrap();
        assert_eq!(
            read(&reopened, "eodhd:SPY.US").await.unwrap().status,
            "available"
        );
        reopened.close().await;
    }

    #[tokio::test]
    #[ignore = "Uses the configured EODHD key; one existing-quota request per catalogue ETF, temporary database only"]
    async fn world_atlas_live_eodhd_proxies_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let db = super::super::store::open(dir.path()).await.unwrap();
        let review = std::env::var("ATLAS_WRITE_REVIEW").as_deref() == Ok("1");
        let mut review_rows = Vec::new();
        for proxy in proxies().unwrap().into_iter().filter(|p| {
            !review
                || ["SPY.US", "EWG.US", "XLV.US", "TAN.US", "HYDR.US"].contains(&p.symbol.as_str())
        }) {
            let download = market_source::download(&proxy)
                .await
                .unwrap_or_else(|e| panic!("{}: {}", proxy.symbol, e.message));
            assert!(!download.provenance.source_url.contains('?'));
            assert_eq!(download.provenance.sha256.len(), 64);
            replace(&db, &proxy.id, download).await.unwrap();
            let result = read(&db, &proxy.id).await.unwrap();
            println!(
                "{}: {} monthly observations, {} wave months, last {}",
                proxy.symbol,
                result.analysis.history_months,
                result.analysis.wave_months,
                result
                    .analysis
                    .last_observation
                    .as_deref()
                    .unwrap_or("none")
            );
            assert!(result.analysis.history_months > 12);
            review_rows.push(result);
        }
        db.close().await;
        if review {
            let destination =
                std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-validation");
            std::fs::create_dir_all(&destination).unwrap();
            std::fs::write(
                destination.join("market-review.json"),
                serde_json::to_vec_pretty(&review_rows).unwrap(),
            )
            .unwrap();
        }
    }
}
