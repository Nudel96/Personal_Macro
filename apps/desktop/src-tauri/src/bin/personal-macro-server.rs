#[cfg(feature = "desktop")]
compile_error!("Build the private server with --no-default-features --features server");

#[cfg(not(feature = "desktop"))]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use personal_macro_desktop_lib::web_server::{PrivateServer, ServerConfig, router};
    tracing_subscriber::fmt().with_target(false).try_init().ok();
    let server = PrivateServer::open(ServerConfig::from_env()?).await?;
    // Loopback by default. Container deployments explicitly select their bind
    // address and publish only to the local TLS reverse proxy.
    let address = std::env::var("MACRO_LISTEN_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!("Privater Datenspeicher gestartet");
    axum::serve(listener, router(server))
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

#[cfg(not(feature = "desktop"))]
async fn shutdown() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("SIGTERM");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
