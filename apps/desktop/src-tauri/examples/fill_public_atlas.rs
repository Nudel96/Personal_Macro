//! Explicitly import reviewed public packages into the Atlas cache; never opens the journal DB.
use personal_macro_desktop_lib::world_atlas::{AtlasState, public_models, store};
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
    let requested: Vec<String> = std::env::args().skip(2).collect();
    let sources = public_models::config().map_err(|e| e.message)?.sources;
    if requested
        .iter()
        .any(|id| !sources.iter().any(|s| &s.id == id))
    {
        return Err("Unknown public source".into());
    }
    let state = AtlasState::new(root);
    for source in sources
        .into_iter()
        .filter(|s| requested.is_empty() || requested.contains(&s.id))
    {
        let job = state
            .0
            .start_public_source(&source.id)
            .await
            .map_err(|e| e.message)?;
        println!("{}: started", source.id);
        loop {
            let current = store::read_job(
                state.0.db().await.map_err(|e| e.message)?,
                &state.0.session,
                Some(&job.id),
            )
            .await
            .map_err(|e| e.message)?
            .ok_or("Job missing")?;
            if current.status != "running" {
                println!("{}", serde_json::to_string(&current)?);
                if current.status != "complete" {
                    return Err(format!("{} did not complete", source.id).into());
                }
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }
    Ok(())
}
