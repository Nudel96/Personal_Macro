//! Explicitly populate a public Atlas cache; never opens the journal database.
use personal_macro_desktop_lib::world_atlas::{AtlasState, store};
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
    let state = AtlasState::new(root);
    let markets = std::env::args().any(|arg| arg == "--markets");
    let job = state
        .0
        .start_library(markets)
        .await
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
        if current.message != last {
            println!("{}/{} {}", current.page, current.pages, current.message);
            last = current.message.clone();
        }
        if current.status != "running" {
            println!("{}", serde_json::to_string(&current)?);
            if current.status == "failed" {
                std::process::exit(2);
            }
            break;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    Ok(())
}
