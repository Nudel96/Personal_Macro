use super::commodity_models::*;
use crate::errors::{CommandError, CommandResult};
use sqlx::SqlitePool;

fn invalid() -> CommandError {
    CommandError::validation("Der gespeicherte Rohstoffstand ist nicht lesbar.")
}
pub async fn read(db: &SqlitePool) -> CommandResult<CommodityResponse> {
    let mut tx = db.begin().await?;
    let raw: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_commodity_dataset WHERE id=?")
            .bind(DATASET_ID)
            .fetch_optional(&mut *tx)
            .await?;
    let provenance = raw
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|_| invalid())?;
    let rows: Vec<(i32, String)> = sqlx::query_as(
        "SELECT year,values_json FROM atlas_commodity_points WHERE dataset_id=? ORDER BY year",
    )
    .bind(DATASET_ID)
    .fetch_all(&mut *tx)
    .await?;
    let points = rows
        .into_iter()
        .map(|(year, s)| {
            Ok(CommodityPoint {
                year,
                values: serde_json::from_str(&s).map_err(|_| invalid())?,
            })
        })
        .collect::<CommandResult<Vec<_>>>()?;
    tx.commit().await?;
    Ok(CommodityResponse {
        status: if provenance.is_some() {
            "available"
        } else {
            "not_downloaded"
        }
        .into(),
        points,
        provenance,
    })
}
pub async fn replace(db: &SqlitePool, data: CommodityDownload) -> CommandResult<()> {
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_commodity_dataset VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET provenance_json=excluded.provenance_json,retrieved_at=excluded.retrieved_at")
        .bind(DATASET_ID).bind(serde_json::to_string(&data.provenance).map_err(|_|invalid())?).bind(&data.provenance.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_commodity_points WHERE dataset_id=?")
        .bind(DATASET_ID)
        .execute(&mut *tx)
        .await?;
    for point in data.points {
        sqlx::query("INSERT INTO atlas_commodity_points VALUES(?,?,?)")
            .bind(DATASET_ID)
            .bind(point.year)
            .bind(serde_json::to_string(&point.values).map_err(|_| invalid())?)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
