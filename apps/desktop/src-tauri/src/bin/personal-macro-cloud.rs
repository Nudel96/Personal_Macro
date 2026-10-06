#[cfg(feature = "desktop")]
compile_error!("Build the cloud server with --no-default-features --features postgres");

#[cfg(not(feature = "desktop"))]
#[tokio::main]
async fn main() {
    if run().await.is_err() {
        // Provider errors can include connection strings, SQL, and journal values.
        eprintln!("Der private Cloud-Dienst konnte nicht gestartet werden.");
        std::process::exit(1);
    }
}

#[cfg(not(feature = "desktop"))]
async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use personal_macro_desktop_lib::cloud_server::{CloudConfig, CloudServer, router};
    let config = CloudConfig::from_env()?;
    let server = CloudServer::open(config).await?;
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse()?;
    let host = std::env::var("MACRO_BIND_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await?;
    axum::serve(listener, router(server))
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

#[cfg(not(feature = "desktop"))]
async fn shutdown() {
    #[cfg(unix)]
    {
        if let Ok(mut terminate) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
