// Brain OS API — health, metrics, and control plane endpoints

use std::sync::Arc;
use axum::{routing::{get, post}, Router, Json, extract::State, http::StatusCode};
use serde::Serialize;
use crate::bootstrap::BrainHandle;

pub fn build_router(brain: Arc<BrainHandle>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(readiness))
        .route("/alive", get(liveness))
        .route("/metrics", get(metrics))
        .route("/api/status", get(status))
        .route("/api/modules", get(list_modules))
        .route("/api/event-bus/metrics", get(event_bus_metrics))
        .with_state(brain)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
    uptime_secs: u64,
}

async fn health(State(_brain): State<Arc<BrainHandle>>) -> (StatusCode, Json<HealthResponse>) {
    (StatusCode::OK, Json(HealthResponse {
        status: "healthy",
        version: env!("CARGO_PKG_VERSION"),
        uptime_secs: 0,
    }))
}

async fn readiness(State(_brain): State<Arc<BrainHandle>>) -> (StatusCode, Json<HealthResponse>) {
    (StatusCode::OK, Json(HealthResponse {
        status: "ready",
        version: env!("CARGO_PKG_VERSION"),
        uptime_secs: 0,
    }))
}

async fn liveness() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(serde_json::json!({"alive": true})))
}

async fn metrics(State(brain): State<Arc<BrainHandle>>) -> String {
    brain.metrics_manager.export_prometheus()
}

#[derive(Serialize)]
struct StatusResponse {
    status: &'static str,
    version: &'static str,
    modules: usize,
    event_bus: EventBusInfo,
}

#[derive(Serialize)]
struct EventBusInfo {
    total_published: u64,
    total_delivered: u64,
    subscriptions: usize,
}

async fn status(State(brain): State<Arc<BrainHandle>>) -> Json<StatusResponse> {
    let eb = brain.event_bus.metrics();
    Json(StatusResponse {
        status: "running",
        version: env!("CARGO_PKG_VERSION"),
        modules: 7,
        event_bus: EventBusInfo {
            total_published: eb.total_published,
            total_delivered: eb.total_delivered,
            subscriptions: eb.subscriptions,
        },
    })
}

async fn list_modules(State(brain): State<Arc<BrainHandle>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "modules": [
            {"id": "kernel", "status": "active"},
            {"id": "runtime", "status": "active"},
            {"id": "event-bus", "status": "active"},
            {"id": "cortex", "status": "active"},
            {"id": "memory", "status": "active"},
            {"id": "knowledge-graph", "status": "active"},
            {"id": "agent-os", "status": "active"},
        ]
    }))
}

async fn event_bus_metrics(State(brain): State<Arc<BrainHandle>>) -> Json<serde_json::Value> {
    let m = brain.event_bus.metrics();
    Json(serde_json::json!({
        "total_published": m.total_published,
        "total_delivered": m.total_delivered,
        "total_failed": m.total_failed,
        "total_retried": m.total_retried,
        "in_flight": m.in_flight,
        "subscriptions": m.subscriptions,
    }))
}
