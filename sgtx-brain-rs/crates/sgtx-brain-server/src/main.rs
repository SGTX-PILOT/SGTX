// SGTX Brain Server — Binary entry point
// Startup sequence: Core → Kernel → Runtime → EventBus → Registries → Managers → Cortex → Memory → Knowledge → Agents → API
// Shutdown sequence: reverse order with graceful timeout

use std::sync::Arc;
use tracing::{info, error, instrument};
use tracing_subscriber::{EnvFilter, fmt};

mod api;
mod bootstrap;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Initialize structured logging + OpenTelemetry tracing
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));
    fmt()
        .with_env_filter(filter)
        .json()
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .init();

    info!(version = env!("CARGO_PKG_VERSION"), "SGTX Brain OS starting");

    // 2. Load configuration
    let config = sgtx_brain_core::types::BrainConfig::default();
    info!(instance_id = %config.kernel.instance_id, "Configuration loaded");

    // 3. Bootstrap all sub-systems (startup sequence)
    let brain = match bootstrap::bootstrap(config).await {
        Ok(b) => {
            info!("All Brain OS sub-systems initialized");
            b
        }
        Err(e) => {
            error!(error = %e, "Failed to bootstrap Brain OS");
            return Err(e.into());
        }
    };

    // 4. Start the HTTP API server (health, metrics, brain-os control plane)
    let app = api::build_router(brain.clone());

    let port = 8090;
    let addr = format!("0.0.0.0:{}", port);
    info!(%addr, "Brain OS API server listening");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(brain.clone()))
        .await?;

    info!("SGTX Brain OS stopped gracefully");
    Ok(())
}

#[instrument(skip(brain))]
async fn shutdown_signal(brain: Arc<bootstrap::BrainHandle>) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("Received SIGINT, initiating graceful shutdown"),
        _ = terminate => info!("Received SIGTERM, initiating graceful shutdown"),
    }

    // Shutdown sequence (reverse of startup)
    if let Err(e) = bootstrap::shutdown(brain).await {
        error!(error = %e, "Error during shutdown");
    }
}
