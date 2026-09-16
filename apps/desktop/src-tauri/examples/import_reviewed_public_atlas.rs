//! Explicit local import of previously reviewed public originals; no journal access.
use personal_macro_desktop_lib::world_atlas::AtlasState;
use std::{io::Read, path::PathBuf};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() < 3 || args.len() % 2 != 1 {
        return Err("Use: absolute-atlas-directory source-id absolute-original-file [source-id absolute-original-file ...]".into());
    }
    let root = PathBuf::from(&args[0]);
    if !root.is_absolute() || root.file_name().and_then(|p| p.to_str()) != Some("atlas") {
        return Err("The target must be an absolute directory named atlas".into());
    }
    let state = AtlasState::new(root);
    for pair in args[1..].chunks_exact(2) {
        let path = PathBuf::from(&pair[1]);
        if !path.is_absolute() {
            return Err("Original-file paths must be absolute".into());
        }
        let mut bytes = Vec::new();
        std::fs::File::open(&path)?
            .take(32 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)?;
        let job = state
            .0
            .import_reviewed_public_original(&pair[0], bytes)
            .await
            .map_err(|e| e.message)?;
        println!("{}", serde_json::to_string(&job)?);
    }
    Ok(())
}
