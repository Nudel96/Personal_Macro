//! Explicitly import selected public annual statistics, using the normal bounded batch job.
//! --single <id> uses the existing explicit single-series refresh instead.
//! Opens only the public Atlas cache, never the personal journal database.
use personal_macro_desktop_lib::world_atlas::{AtlasState, catalog, store};
use std::{path::PathBuf, time::Duration};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("Pass an absolute public atlas directory")?,
    );
    if !root.is_absolute() || root.file_name().and_then(|p| p.to_str()) != Some("atlas") {
        return Err("The target must be an absolute directory named atlas".into());
    }
    let mut ids: Vec<String> = std::env::args().skip(2).collect();
    let single = ids.first().is_some_and(|id| id == "--single");
    if single {
        ids.remove(0);
        if ids.len() != 1 {
            return Err("--single requires exactly one explicitly selected series ID".into());
        }
    }
    if ids.is_empty() || ids.iter().any(|id| catalog::series(id).is_err()) {
        return Err("Pass at least one explicitly reviewed annual series ID".into());
    }
    let state = AtlasState::new(root);
    let job = if single {
        state.0.start(&ids[0]).await
    } else {
        state.0.start_statistics_batch(ids).await
    }
    .map_err(|e| e.message)?;
    let mut last = String::new();
    loop {
        let current = store::read_job(
            state.0.db().await.map_err(|e| e.message)?,
            &state.0.session,
            Some(&job.id),
        )
        .await
        .map_err(|e| e.message)?
        .ok_or("Job missing")?;
        if last != current.message {
            println!("{}", current.message);
            last = current.message.clone();
        }
        if current.status != "running" {
            println!("{}", serde_json::to_string(&current)?);
            if current.status != "complete" {
                return Err("Selected statistics did not complete".into());
            }
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Ok(())
}
