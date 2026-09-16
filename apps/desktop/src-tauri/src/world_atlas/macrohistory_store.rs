use super::{catalog, macrohistory_models::*};
use crate::errors::{CommandError, CommandResult};
use sqlx::SqlitePool;

pub async fn read(db: &SqlitePool, geography_id: &str) -> CommandResult<MacrohistoryResponse> {
    let geography = catalog::geography(geography_id)?;
    let mut tx = db.begin().await?;
    let metadata: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_macrohistory_dataset WHERE id = ?")
            .bind(DATASET_ID)
            .fetch_optional(&mut *tx)
            .await?;
    let profile: Option<String> = sqlx::query_scalar(
        "SELECT profile_json FROM atlas_macrohistory_areas WHERE dataset_id = ? AND geography_id = ?",
    )
    .bind(DATASET_ID)
    .bind(geography_id)
    .fetch_optional(&mut *tx)
    .await?;
    let invalid =
        |_| CommandError::validation("Das gespeicherte JST-Finanzprofil ist nicht lesbar.");
    let provenance = metadata
        .map(|v| serde_json::from_str(&v))
        .transpose()
        .map_err(invalid)?;
    let profile = profile
        .map(|v| serde_json::from_str(&v))
        .transpose()
        .map_err(invalid)?;
    tx.commit().await?;
    Ok(MacrohistoryResponse {
        geography,
        status: if provenance.is_none() {
            "not_downloaded"
        } else if profile.is_none() {
            "unsupported_area"
        } else {
            "available"
        }
        .into(),
        profile,
        provenance,
    })
}
pub async fn replace(db: &SqlitePool, data: MacrohistoryDownload) -> CommandResult<()> {
    let invalid =
        |_| CommandError::validation("Das JST-Finanzprofil konnte nicht gespeichert werden.");
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_macrohistory_dataset(id, provenance_json, retrieved_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET provenance_json=excluded.provenance_json, retrieved_at=excluded.retrieved_at")
        .bind(DATASET_ID).bind(serde_json::to_string(&data.provenance).map_err(invalid)?).bind(&data.provenance.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_macrohistory_areas WHERE dataset_id = ?")
        .bind(DATASET_ID)
        .execute(&mut *tx)
        .await?;
    for profile in data.profiles {
        catalog::geography(&profile.geography_id)?;
        sqlx::query(
            "INSERT INTO atlas_macrohistory_areas(dataset_id, geography_id, profile_json) VALUES(?,?,?)",
        )
        .bind(DATASET_ID)
        .bind(&profile.geography_id)
        .bind(serde_json::to_string(&profile).map_err(invalid)?)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
