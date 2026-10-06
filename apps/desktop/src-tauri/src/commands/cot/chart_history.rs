//! Descriptive participant history, kept separate from the Non-Commercial score.
use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotParticipantPoint {
    pub report_date: String,
    pub open_interest: i64,
    pub non_commercial_net: i64,
    pub commercial_net: Option<i64>,
    pub non_reportable_net: Option<i64>,
}

/// Both legs must be reported. Zero is valid; missing legs are never inferred.
pub(super) fn positions(row: &Value, prefix: &str) -> Option<(i64, i64)> {
    let interest = value_i64(row, "open_interest_all")?;
    let long = value_i64(row, &format!("{prefix}_positions_long_all"))?;
    let short = value_i64(row, &format!("{prefix}_positions_short_all"))?;
    (interest > 0 && (0..=interest).contains(&long) && (0..=interest).contains(&short))
        .then_some((long, short))
}

pub(super) async fn store(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    contract_id: &str,
    report_date: &str,
    row: &Value,
) -> Result<(), AppError> {
    let commercial = positions(row, "comm");
    let nonreportable = positions(row, "nonrept");
    sqlx::query("UPDATE cot_legacy_observations SET commercial_long=?,commercial_short=?,nonreportable_long=?,nonreportable_short=? WHERE contract_id=? AND report_date=?")
        .bind(commercial.map(|pair| pair.0)).bind(commercial.map(|pair| pair.1))
        .bind(nonreportable.map(|pair| pair.0)).bind(nonreportable.map(|pair| pair.1))
        .bind(contract_id).bind(report_date).execute(&mut **tx).await?;
    Ok(())
}

pub(super) async fn read(
    pool: &SqlitePool,
    contract_id: &str,
    since: Option<&str>,
) -> Result<Vec<CotParticipantPoint>, AppError> {
    // Older immutable cloud packages are still readable. Their absent groups
    // remain explicitly unavailable until a refreshed package is published.
    let extended: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info('cot_legacy_observations') WHERE name IN ('commercial_long','commercial_short','nonreportable_long','nonreportable_short')")
        .fetch_one(pool).await?;
    let sql = if extended == 4 {
        "SELECT report_date,open_interest,net_positions AS non_commercial_net,commercial_long-commercial_short AS commercial_net,nonreportable_long-nonreportable_short AS non_reportable_net FROM cot_legacy_observations WHERE contract_id=? AND report_date>=? ORDER BY report_date"
    } else if extended == 0 {
        "SELECT report_date,open_interest,net_positions AS non_commercial_net,NULL AS commercial_net,NULL AS non_reportable_net FROM cot_legacy_observations WHERE contract_id=? AND report_date>=? ORDER BY report_date"
    } else {
        return Err(cot_source_error(
            "Die COT-Teilnehmerhistorie ist unvollständig strukturiert.",
        ));
    };
    #[derive(FromRow)]
    struct Row {
        report_date: String,
        open_interest: i64,
        non_commercial_net: i64,
        commercial_net: Option<i64>,
        non_reportable_net: Option<i64>,
    }
    Ok(sqlx::query_as::<_, Row>(sql)
        .bind(contract_id)
        .bind(since.unwrap_or(""))
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| CotParticipantPoint {
            report_date: row.report_date,
            open_interest: row.open_interest,
            non_commercial_net: row.non_commercial_net,
            commercial_net: row.commercial_net,
            non_reportable_net: row.non_reportable_net,
        })
        .collect())
}

/// An old scoring-only import must not satisfy the participant-history upgrade.
/// Once an active market has both supplementary groups, its normal full-history
/// refresh has populated this contract. Individual missing source rows stay null.
pub(super) async fn needs_backfill(pool: &SqlitePool) -> Result<bool, AppError> {
    let missing: i64 = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM cot_contracts c WHERE c.is_active=1 \
         AND EXISTS(SELECT 1 FROM cot_legacy_observations o WHERE o.contract_id=c.id) \
         AND NOT EXISTS(SELECT 1 FROM cot_legacy_observations o WHERE o.contract_id=c.id \
             AND o.commercial_long IS NOT NULL AND o.commercial_short IS NOT NULL \
             AND o.nonreportable_long IS NOT NULL AND o.nonreportable_short IS NOT NULL))",
    )
    .fetch_one(pool)
    .await?;
    Ok(missing != 0)
}

/// Upgrade only the disposable public shard inside its existing transaction.
/// The original published shard and journal database are never touched here.
pub(super) async fn upgrade_public(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), AppError> {
    let extended: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info('cot_legacy_observations') WHERE name='commercial_long'")
        .fetch_one(&mut **tx).await?;
    if extended == 0 {
        let schema: Value =
            serde_json::from_str(include_str!("../../cloud_public/macro_schema.json"))
                .map_err(|_| cot_source_error("Das COT-Paketschema ist ungültig."))?;
        let ddl = schema["cot"]["tables"]["cot_legacy_observations"]["ddl"]
            .as_str()
            .ok_or_else(|| cot_source_error("Das COT-Paketschema fehlt."))?;
        sqlx::query("ALTER TABLE cot_legacy_observations RENAME TO cot_previous")
            .execute(&mut **tx)
            .await?;
        sqlx::query(ddl).execute(&mut **tx).await?;
        sqlx::query("INSERT INTO cot_legacy_observations(contract_id,report_date,long_positions,short_positions,long_change,short_change,open_interest,open_interest_change,net_positions,net_change,net_position_pct_oi,net_change_pct_oi,long_share,short_share,weekly_long_share_change) SELECT contract_id,report_date,long_positions,short_positions,long_change,short_change,open_interest,open_interest_change,net_positions,net_change,net_position_pct_oi,net_change_pct_oi,long_share,short_share,weekly_long_share_change FROM cot_previous").execute(&mut **tx).await?;
        sqlx::query("DROP TABLE cot_previous")
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_negative_or_oversized_legs_are_not_zero_positions() {
        let mut row = serde_json::json!({"open_interest_all":"100", "comm_positions_long_all":"0", "comm_positions_short_all":"0"});
        assert_eq!(positions(&row, "comm"), Some((0, 0)));
        row["comm_positions_short_all"] = Value::Null;
        assert_eq!(positions(&row, "comm"), None);
        for invalid in ["-1", "101", "1.5", "not-a-number"] {
            row["comm_positions_short_all"] = Value::String(invalid.into());
            assert_eq!(positions(&row, "comm"), None);
        }
    }

    #[tokio::test]
    async fn old_public_history_upgrades_atomically_without_invented_groups() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let schema: Value =
            serde_json::from_str(include_str!("../../cloud_public/macro_schema.json")).unwrap();
        let table = &schema["cot"]["tables"]["cot_legacy_observations"];
        sqlx::query(table["legacyDdl"].as_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO cot_legacy_observations(contract_id,report_date,open_interest,net_positions) VALUES ('eur','2025-12-30',100,20)").execute(&pool).await.unwrap();
        let old = read(&pool, "eur", None).await.unwrap();
        assert_eq!(old[0].non_commercial_net, 20);
        assert_eq!(old[0].commercial_net, None);
        let mut tx = pool.begin().await.unwrap();
        upgrade_public(&mut tx).await.unwrap();
        tx.rollback().await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        upgrade_public(&mut tx).await.unwrap();
        store(&mut tx, "eur", "2025-12-30", &serde_json::json!({
            "open_interest_all":"100", "comm_positions_long_all":"30", "comm_positions_short_all":"60",
            "nonrept_positions_long_all":"10", "nonrept_positions_short_all":"0"
        })).await.unwrap();
        tx.commit().await.unwrap();
        let points = read(&pool, "eur", None).await.unwrap();
        assert_eq!(points[0].commercial_net, Some(-30));
        assert_eq!(points[0].non_reportable_net, Some(10));
        assert_eq!(points[0].non_commercial_net, 20);
        assert!(
            read(&pool, "eur", Some("2026-01-01"))
                .await
                .unwrap()
                .is_empty()
        );
        let actual: String = sqlx::query_scalar(
            "SELECT sql FROM sqlite_master WHERE name='cot_legacy_observations'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(actual, table["ddl"].as_str().unwrap());
    }

    #[tokio::test]
    async fn migration_preserves_existing_scored_observations_and_missing_groups() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql("CREATE TABLE cot_legacy_observations(contract_id TEXT,report_date TEXT,open_interest INTEGER,net_positions INTEGER); INSERT INTO cot_legacy_observations VALUES('eur','2025-12-30',100,20);")
            .execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!(
            "../../../migrations/0050_cot_participant_history.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        let old = read(&pool, "eur", None).await.unwrap();
        assert_eq!(old[0].non_commercial_net, 20);
        assert_eq!(old[0].commercial_net, None);
        assert_eq!(old[0].non_reportable_net, None);
        assert!(
            sqlx::query("UPDATE cot_legacy_observations SET commercial_long=-1")
                .execute(&pool)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn current_scoring_report_does_not_hide_missing_participant_import() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql("CREATE TABLE cot_contracts(id TEXT,is_active INTEGER); INSERT INTO cot_contracts VALUES('eur',1),('usd',1),('inactive',0); CREATE TABLE cot_legacy_observations(contract_id TEXT,report_date TEXT,open_interest INTEGER,net_positions INTEGER); INSERT INTO cot_legacy_observations VALUES('eur','2026-09-22',100,20),('usd','2026-09-22',100,20),('inactive','2026-09-22',100,20);")
            .execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!(
            "../../../migrations/0050_cot_participant_history.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        assert!(needs_backfill(&pool).await.unwrap());
        sqlx::query("UPDATE cot_legacy_observations SET commercial_long=0,commercial_short=20,nonreportable_long=0,nonreportable_short=0 WHERE contract_id='eur'")
            .execute(&pool).await.unwrap();
        assert!(needs_backfill(&pool).await.unwrap());
        sqlx::query("UPDATE cot_legacy_observations SET commercial_long=0,commercial_short=20,nonreportable_long=0,nonreportable_short=0 WHERE contract_id='usd'")
            .execute(&pool).await.unwrap();
        assert!(!needs_backfill(&pool).await.unwrap());
    }
}
