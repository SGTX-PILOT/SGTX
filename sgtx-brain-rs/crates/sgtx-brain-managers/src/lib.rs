//! SGTX Brain Managers — the 10 manager implementations.
//!
//! Each manager is a self-contained struct that implements the corresponding
//! trait from [`sgtx_brain_core`] (where one exists). All managers are
//! `Send + Sync` and use proper `BrainResult<T>` error handling.
//!
//! Managers provided:
//! 1. [`HealthManagerImpl`] — periodic health checks + event publication
//! 2. [`MetricsManagerImpl`] — Prometheus counters/gauges/histograms
//! 3. [`LoggingManagerImpl`] — structured JSON logging with level filter
//! 4. [`MemoryManagerImpl`] — per-module memory budget + OOM prevention
//! 5. [`SecretsManagerImpl`] — in-memory secrets store (pluggable)
//! 6. [`ResourceManagerImpl`] — CPU/memory monitoring per module
//! 7. [`HotReloadManagerImpl`] — hot-reload coordination via `Reloadable`
//! 8. [`FeatureFlagsImpl`] — feature flag store with enable/disable/list
//! 9. [`ConfigurationServiceImpl`] — key-value config store with watch
//! 10. [`TaskSchedulerImpl`] — priority-based task scheduler

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use parking_lot::RwLock;
use prometheus::{
    Encoder, HistogramOpts, IntCounterVec, IntGaugeVec, Opts, Registry, TextEncoder,
};
use sgtx_brain_core::{
    BrainError, BrainResult, BrainEvent, ConfigWatch, ConfigurationService, EventBus, EventMetadata,
    FeatureFlag, FeatureFlags, HealthCheck, HealthChecker, HealthManager, HealthStatus,
    HealthSummary, HotReloadManager, Metric, MetricType, Reloadable, SecretsManager,
    Task, TaskPriority, TaskScheduler,
};
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

// ===========================================================================
// 1. Health Manager
// ===========================================================================

/// Periodic health-check coordinator. Tracks the latest [`HealthCheck`] for
/// each registered module and publishes `brain.module.health` /
/// `brain.module.failed` events through an [`EventBus`].
pub struct HealthManagerImpl {
    checks: DashMap<String, Arc<dyn HealthChecker>>,
    latest: DashMap<String, HealthCheck>,
    event_bus: Arc<dyn EventBus>,
    interval: Duration,
}

impl HealthManagerImpl {
    /// Create a new health manager bound to `event_bus` with a check interval
    /// of `interval_secs` seconds (default 30s if `0` is passed).
    pub fn new(event_bus: Arc<dyn EventBus>, interval_secs: u64) -> Self {
        let interval = if interval_secs == 0 {
            Duration::from_secs(30)
        } else {
            Duration::from_secs(interval_secs)
        };
        Self {
            checks: DashMap::new(),
            latest: DashMap::new(),
            event_bus,
            interval,
        }
    }

    /// Spawn the periodic health sweep loop. Returns the task handle so the
    /// caller can abort it on shutdown.
    pub fn start_periodic(self: Arc<Self>) -> JoinHandle<()> {
        let me = self.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(me.interval);
            loop {
                ticker.tick().await;
                if let Err(e) = me.check_all().await {
                    error!(error = %e, "periodic health sweep failed");
                }
            }
        })
    }

    async fn publish_health_event(&self, module_id: &str, check: &HealthCheck) {
        let module_id_owned = module_id.to_string();
        let status = check.status;
        let latency_ms = check.latency_ms;
        let health_event = BrainEvent {
            id: Uuid::new_v4(),
            event_type: "brain.module.health".into(),
            aggregate_id: module_id_owned.clone(),
            payload: serde_json::json!({
                "module_id": module_id_owned,
                "status": format!("{:?}", status),
                "latency_ms": latency_ms,
            }),
            metadata: EventMetadata {
                source: "health-manager".into(),
                correlation_id: None,
                causation_id: None,
                timestamp: Utc::now(),
                version: "1".into(),
                tenant_gtid: None,
            },
        };
        if let Err(e) = self.event_bus.publish(health_event).await {
            warn!(error = %e, "failed to publish brain.module.health event");
        }
        if status == HealthStatus::Unhealthy {
            let failed = BrainEvent {
                id: Uuid::new_v4(),
                event_type: "brain.module.failed".into(),
                aggregate_id: module_id_owned.clone(),
                payload: serde_json::json!({
                    "module_id": module_id_owned,
                    "latency_ms": latency_ms,
                }),
                metadata: EventMetadata {
                    source: "health-manager".into(),
                    correlation_id: None,
                    causation_id: None,
                    timestamp: Utc::now(),
                    version: "1".into(),
                    tenant_gtid: None,
                },
            };
            if let Err(e) = self.event_bus.publish(failed).await {
                warn!(error = %e, "failed to publish brain.module.failed event");
            }
        }
    }
}

#[async_trait]
impl HealthManager for HealthManagerImpl {
    #[instrument(skip(self))]
    async fn check(&self, module_id: &str) -> Result<HealthCheck, BrainError> {
        let checker = self
            .checks
            .get(module_id)
            .map(|c| c.clone())
            .ok_or_else(|| BrainError::HealthCheck(format!("no checker for {module_id}")))?;
        let result = checker.check().await?;
        self.latest.insert(module_id.to_string(), result.clone());
        self.publish_health_event(module_id, &result).await;
        Ok(result)
    }

    #[instrument(skip(self))]
    async fn check_all(&self) -> Result<HealthSummary, BrainError> {
        let ids: Vec<String> = self.checks.iter().map(|e| e.key().clone()).collect();
        let mut checks = Vec::with_capacity(ids.len());
        let mut healthy = 0;
        let mut degraded = 0;
        let mut unhealthy = 0;
        for id in ids {
            match self.check(&id).await {
                Ok(c) => {
                    match c.status {
                        HealthStatus::Healthy => healthy += 1,
                        HealthStatus::Degraded => degraded += 1,
                        HealthStatus::Unhealthy => unhealthy += 1,
                        HealthStatus::Unknown => {}
                    }
                    checks.push(c);
                }
                Err(e) => {
                    warn!(module_id = %id, error = %e, "health check error");
                    unhealthy += 1;
                }
            }
        }
        Ok(HealthSummary {
            total: checks.len(),
            healthy,
            degraded,
            unhealthy,
            checks,
        })
    }

    #[instrument(skip(self, check))]
    async fn register_check(
        &self,
        module_id: &str,
        check: Arc<dyn HealthChecker>,
    ) -> Result<(), BrainError> {
        self.checks.insert(module_id.to_string(), check);
        debug!(module_id = %module_id, "health checker registered");
        Ok(())
    }
}

// ===========================================================================
// 2. Metrics Manager
// ===========================================================================

/// Prometheus-backed metrics registry with counters, gauges and histograms.
pub struct MetricsManagerImpl {
    registry: Registry,
    counters: DashMap<String, IntCounterVec>,
    gauges: DashMap<String, IntGaugeVec>,
    histograms: DashMap<String, prometheus::HistogramVec>,
    // simple raw values for the JSON export
    raw: DashMap<String, (MetricType, HashMap<String, String>, f64)>,
    ts: AtomicU64,
}

impl MetricsManagerImpl {
    pub fn new() -> Self {
        Self {
            registry: Registry::new(),
            counters: DashMap::new(),
            gauges: DashMap::new(),
            histograms: DashMap::new(),
            raw: DashMap::new(),
            ts: AtomicU64::new(0),
        }
    }

    fn ensure_counter(&self, name: &str) -> BrainResult<IntCounterVec> {
        if let Some(c) = self.counters.get(name) {
            return Ok(c.clone());
        }
        let c = IntCounterVec::new(Opts::new(name, name), &["label"]).map_err(|e| {
            BrainError::Internal(format!("prometheus counter {name}: {e}"))
        })?;
        self.registry
            .register(Box::new(c.clone()))
            .map_err(|e| BrainError::Internal(format!("register counter {name}: {e}")))?;
        self.counters.insert(name.to_string(), c.clone());
        Ok(c)
    }

    fn ensure_gauge(&self, name: &str) -> BrainResult<IntGaugeVec> {
        if let Some(g) = self.gauges.get(name) {
            return Ok(g.clone());
        }
        let g = IntGaugeVec::new(Opts::new(name, name), &["label"]).map_err(|e| {
            BrainError::Internal(format!("prometheus gauge {name}: {e}"))
        })?;
        self.registry
            .register(Box::new(g.clone()))
            .map_err(|e| BrainError::Internal(format!("register gauge {name}: {e}")))?;
        self.gauges.insert(name.to_string(), g.clone());
        Ok(g)
    }

    fn ensure_histogram(&self, name: &str) -> BrainResult<prometheus::HistogramVec> {
        if let Some(h) = self.histograms.get(name) {
            return Ok(h.clone());
        }
        let h = prometheus::HistogramVec::new(
            HistogramOpts::new(name, name),
            &["label"],
        )
        .map_err(|e| BrainError::Internal(format!("prometheus histogram {name}: {e}")))?;
        self.registry
            .register(Box::new(h.clone()))
            .map_err(|e| BrainError::Internal(format!("register histogram {name}: {e}")))?;
        self.histograms.insert(name.to_string(), h.clone());
        Ok(h)
    }

    #[instrument(skip(self))]
    pub fn increment_counter(&self, name: &str, value: u64) -> BrainResult<()> {
        let c = self.ensure_counter(name)?;
        c.with_label_values(&[""]).inc_by(value);
        self.raw
            .insert(name.to_string(), (MetricType::Counter, HashMap::new(), value as f64));
        Ok(())
    }

    #[instrument(skip(self))]
    pub fn set_gauge(&self, name: &str, value: i64) -> BrainResult<()> {
        let g = self.ensure_gauge(name)?;
        g.with_label_values(&[""]).set(value);
        self.raw
            .insert(name.to_string(), (MetricType::Gauge, HashMap::new(), value as f64));
        Ok(())
    }

    #[instrument(skip(self))]
    pub fn observe(&self, name: &str, value: f64) -> BrainResult<()> {
        let h = self.ensure_histogram(name)?;
        h.with_label_values(&[""]).observe(value);
        self.raw.insert(
            name.to_string(),
            (MetricType::Histogram, HashMap::new(), value),
        );
        Ok(())
    }

    /// Export the full Prometheus text-format exposition.
    pub fn export_prometheus(&self) -> String {
        let encoder = TextEncoder::new();
        let mut buf = Vec::new();
        let mfs = self.registry.gather();
        let _ = encoder.encode(&mfs, &mut buf);
        String::from_utf8(buf).unwrap_or_default()
    }

    /// Export raw metric values as a [`Metric`] vector (JSON-friendly).
    pub fn export_json(&self) -> Vec<Metric> {
        let ts_offset = self.ts.load(Ordering::Relaxed);
        self.raw
            .iter()
            .map(|e| {
                let (mt, labels, value) = e.value();
                Metric {
                    name: e.key().clone(),
                    value: *value,
                    labels: labels.clone(),
                    metric_type: *mt,
                    timestamp: Utc::now()
                        + chrono::Duration::nanoseconds(ts_offset as i64),
                }
            })
            .collect()
    }
}

impl Default for MetricsManagerImpl {
    fn default() -> Self {
        Self::new()
    }
}

// ===========================================================================
// 3. Logging Manager
// ===========================================================================

/// Structured JSON log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub level: String,
    pub target: String,
    pub message: String,
    pub fields: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Error = 0,
    Warn = 1,
    Info = 2,
    Debug = 3,
    Trace = 4,
}

impl LogLevel {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "error" => Some(LogLevel::Error),
            "warn" => Some(LogLevel::Warn),
            "info" => Some(LogLevel::Info),
            "debug" => Some(LogLevel::Debug),
            "trace" => Some(LogLevel::Trace),
            _ => None,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Error => "error",
            LogLevel::Warn => "warn",
            LogLevel::Info => "info",
            LogLevel::Debug => "debug",
            LogLevel::Trace => "trace",
        }
    }
}

/// Structured JSON logging manager with a level filter and bounded buffer.
pub struct LoggingManagerImpl {
    entries: RwLock<Vec<LogEntry>>,
    level: RwLock<LogLevel>,
    capacity: usize,
}

impl LoggingManagerImpl {
    pub fn new(level: LogLevel, capacity: usize) -> Self {
        Self {
            entries: RwLock::new(Vec::with_capacity(capacity.min(8192))),
            level: RwLock::new(level),
            capacity,
        }
    }

    pub fn set_level(&self, level: LogLevel) {
        *self.level.write() = level;
    }

    #[instrument(skip(self, fields), fields(level = %level.as_str()))]
    pub fn log(
        &self,
        level: LogLevel,
        target: impl Into<String> + std::fmt::Debug,
        message: impl Into<String> + std::fmt::Debug,
        fields: HashMap<String, serde_json::Value>,
    ) {
        if level > *self.level.read() {
            return;
        }
        let entry = LogEntry {
            timestamp: Utc::now(),
            level: level.as_str().into(),
            target: target.into(),
            message: message.into(),
            fields,
        };
        let mut buf = self.entries.write();
        if buf.len() >= self.capacity {
            buf.remove(0);
        }
        buf.push(entry);
    }

    pub fn export_jsonl(&self) -> String {
        let buf = self.entries.read();
        buf.iter()
            .filter_map(|e| serde_json::to_string(e).ok())
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub fn count(&self) -> usize {
        self.entries.read().len()
    }
}

impl Default for LoggingManagerImpl {
    fn default() -> Self {
        Self::new(LogLevel::Info, 10_000)
    }
}

// ===========================================================================
// 4. Memory Manager
// ===========================================================================

#[derive(Debug, Clone, Default)]
pub struct MemoryUsage {
    pub allocated_bytes: u64,
    pub budget_bytes: u64,
    pub last_updated: DateTime<Utc>,
}

/// Per-module memory budget tracker with OOM prevention.
pub struct MemoryManagerImpl {
    usage: DashMap<String, MemoryUsage>,
}

impl MemoryManagerImpl {
    pub fn new() -> Self {
        Self {
            usage: DashMap::new(),
        }
    }

    pub fn set_budget(&self, module_id: &str, budget_bytes: u64) {
        self.usage
            .entry(module_id.to_string())
            .or_default()
            .budget_bytes = budget_bytes;
    }

    #[instrument(skip(self))]
    pub fn allocate(&self, module_id: &str, bytes: u64) -> BrainResult<()> {
        let mut e = self.usage.entry(module_id.to_string()).or_default();
        if e.budget_bytes > 0 && e.allocated_bytes + bytes > e.budget_bytes {
            return Err(BrainError::Internal(format!(
                "OOM: module {module_id} would exceed memory budget ({} + {} > {})",
                e.allocated_bytes, bytes, e.budget_bytes
            )));
        }
        e.allocated_bytes += bytes;
        e.last_updated = Utc::now();
        Ok(())
    }

    pub fn release(&self, module_id: &str, bytes: u64) {
        if let Some(mut e) = self.usage.get_mut(module_id) {
            e.allocated_bytes = e.allocated_bytes.saturating_sub(bytes);
            e.last_updated = Utc::now();
        }
    }

    pub fn get_usage(&self, module_id: &str) -> Option<MemoryUsage> {
        self.usage.get(module_id).map(|e| e.clone())
    }

    pub fn list(&self) -> Vec<(String, MemoryUsage)> {
        self.usage
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect()
    }
}

impl Default for MemoryManagerImpl {
    fn default() -> Self {
        Self::new()
    }
}

// ===========================================================================
// 5. Secrets Manager
// ===========================================================================

/// In-memory secrets store. The struct is intentionally pluggable: a future
/// backend (Vault / AWS Secrets Manager) can replace the inner `DashMap`
/// with a remote call without changing the trait surface.
pub struct SecretsManagerImpl {
    secrets: DashMap<String, String>,
}

impl SecretsManagerImpl {
    pub fn new() -> Self {
        Self {
            secrets: DashMap::new(),
        }
    }
}

impl Default for SecretsManagerImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SecretsManager for SecretsManagerImpl {
    #[instrument(skip(self))]
    async fn get_secret(&self, key: &str) -> Result<Option<String>, BrainError> {
        Ok(self.secrets.get(key).map(|e| e.clone()))
    }

    #[instrument(skip(self, value))]
    async fn set_secret(&self, key: &str, value: &str) -> Result<(), BrainError> {
        self.secrets.insert(key.to_string(), value.to_string());
        Ok(())
    }

    #[instrument(skip(self))]
    async fn delete_secret(&self, key: &str) -> Result<(), BrainError> {
        self.secrets.remove(key);
        Ok(())
    }

    async fn list_keys(&self) -> Result<Vec<String>, BrainError> {
        Ok(self.secrets.iter().map(|e| e.key().clone()).collect())
    }
}

// ===========================================================================
// 6. Resource Manager
// ===========================================================================

#[derive(Debug, Clone, Default)]
pub struct ResourceUsage {
    pub cpu_percent: f64,
    pub memory_bytes: u64,
    pub last_updated: DateTime<Utc>,
}

/// CPU/memory monitoring per module.
pub struct ResourceManagerImpl {
    usage: DashMap<String, ResourceUsage>,
}

impl ResourceManagerImpl {
    pub fn new() -> Self {
        Self {
            usage: DashMap::new(),
        }
    }

    pub fn record(&self, module_id: &str, usage: ResourceUsage) {
        let mut e = self
            .usage
            .entry(module_id.to_string())
            .or_default();
        *e = usage;
        e.last_updated = Utc::now();
    }

    pub fn get(&self, module_id: &str) -> Option<ResourceUsage> {
        self.usage.get(module_id).map(|e| e.clone())
    }

    pub fn list(&self) -> Vec<(String, ResourceUsage)> {
        self.usage
            .iter()
            .map(|e| (e.key().clone(), e.value().clone()))
            .collect()
    }
}

impl Default for ResourceManagerImpl {
    fn default() -> Self {
        Self::new()
    }
}

// ===========================================================================
// 7. Hot Reload Manager
// ===========================================================================

/// Coordinates hot-reload of registered [`Reloadable`] modules.
pub struct HotReloadManagerImpl {
    reloadables: DashMap<String, Arc<dyn Reloadable>>,
}

impl HotReloadManagerImpl {
    pub fn new() -> Self {
        Self {
            reloadables: DashMap::new(),
        }
    }
}

impl Default for HotReloadManagerImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HotReloadManager for HotReloadManagerImpl {
    #[instrument(skip(self))]
    async fn reload(&self, module_id: &str) -> Result<(), BrainError> {
        let r = self
            .reloadables
            .get(module_id)
            .map(|e| e.clone())
            .ok_or_else(|| BrainError::ModuleNotFound(module_id.to_string()))?;
        info!(module_id = %module_id, "reloading module");
        r.reload().await?;
        Ok(())
    }

    #[instrument(skip(self, reloader))]
    async fn register_reloadable(
        &self,
        module_id: &str,
        reloader: Arc<dyn Reloadable>,
    ) -> Result<(), BrainError> {
        self.reloadables.insert(module_id.to_string(), reloader);
        Ok(())
    }

    async fn list_reloadable(&self) -> Result<Vec<String>, BrainError> {
        Ok(self.reloadables.iter().map(|e| e.key().clone()).collect())
    }
}

// ===========================================================================
// 8. Feature Flags
// ===========================================================================

pub struct FeatureFlagsImpl {
    flags: DashMap<String, FeatureFlag>,
}

impl FeatureFlagsImpl {
    pub fn new() -> Self {
        Self {
            flags: DashMap::new(),
        }
    }
}

impl Default for FeatureFlagsImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl FeatureFlags for FeatureFlagsImpl {
    async fn is_enabled(&self, flag: &str) -> Result<bool, BrainError> {
        Ok(self.flags.get(flag).map(|e| e.enabled).unwrap_or(false))
    }

    #[instrument(skip(self))]
    async fn enable(&self, flag: &str) -> Result<(), BrainError> {
        let mut e = self
            .flags
            .entry(flag.to_string())
            .or_insert(FeatureFlag {
                name: flag.to_string(),
                enabled: false,
                description: String::new(),
                updated_at: Utc::now(),
            });
        e.enabled = true;
        e.updated_at = Utc::now();
        Ok(())
    }

    #[instrument(skip(self))]
    async fn disable(&self, flag: &str) -> Result<(), BrainError> {
        let mut e = self
            .flags
            .entry(flag.to_string())
            .or_insert(FeatureFlag {
                name: flag.to_string(),
                enabled: true,
                description: String::new(),
                updated_at: Utc::now(),
            });
        e.enabled = false;
        e.updated_at = Utc::now();
        Ok(())
    }

    async fn list(&self) -> Result<Vec<FeatureFlag>, BrainError> {
        Ok(self.flags.iter().map(|e| e.value().clone()).collect())
    }
}

// ===========================================================================
// 9. Configuration Service
// ===========================================================================

/// Key-value configuration store with watch capability.
pub struct ConfigurationServiceImpl {
    values: DashMap<String, serde_json::Value>,
    watchers: DashMap<String, Vec<tokio::sync::watch::Sender<serde_json::Value>>>,
}

impl ConfigurationServiceImpl {
    pub fn new() -> Self {
        Self {
            values: DashMap::new(),
            watchers: DashMap::new(),
        }
    }

    pub fn count(&self) -> usize {
        self.values.len()
    }
}

impl Default for ConfigurationServiceImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ConfigurationService for ConfigurationServiceImpl {
    #[instrument(skip(self))]
    async fn get(&self, key: &str) -> Result<Option<serde_json::Value>, BrainError> {
        Ok(self.values.get(key).map(|e| e.clone()))
    }

    #[instrument(skip(self, value))]
    async fn set(&self, key: &str, value: serde_json::Value) -> Result<(), BrainError> {
        self.values.insert(key.to_string(), value.clone());
        if let Some(entry) = self.watchers.get(key) {
            for tx in entry.iter() {
                let _ = tx.send(value.clone());
            }
        }
        Ok(())
    }

    async fn watch(&self, key: &str) -> Result<ConfigWatch, BrainError> {
        let initial = self.values.get(key).map(|e| e.clone());
        let (tx, _rx) = tokio::sync::watch::channel(initial.clone().unwrap_or(serde_json::Value::Null));
        self.watchers
            .entry(key.to_string())
            .or_default()
            .push(tx);
        Ok(ConfigWatch {
            key: key.to_string(),
            initial,
        })
    }
}

// ===========================================================================
// 10. Task Scheduler
// ===========================================================================

/// Priority-based task scheduler with 4 priority levels (Low / Normal / High
/// / Critical). Critical tasks are drained first, then High, then Normal,
/// then Low.
pub struct TaskSchedulerImpl {
    pending: DashMap<Uuid, Task>,
    running: DashMap<Uuid, (Task, JoinHandle<()>)>,
    // priority queues indexed 0..=3 (Low=0, Normal=1, High=2, Critical=3)
    queues: parking_lot::Mutex<[Vec<Uuid>; 4]>,
}

fn prio_idx(p: TaskPriority) -> usize {
    match p {
        TaskPriority::Low => 0,
        TaskPriority::Normal => 1,
        TaskPriority::High => 2,
        TaskPriority::Critical => 3,
    }
}

impl TaskSchedulerImpl {
    pub fn new() -> Self {
        Self {
            pending: DashMap::new(),
            running: DashMap::new(),
            queues: parking_lot::Mutex::new([Vec::new(), Vec::new(), Vec::new(), Vec::new()]),
        }
    }

    /// Pop the next highest-priority task id (Critical > High > Normal > Low).
    #[allow(dead_code)]
    fn pop_next(&self) -> Option<Uuid> {
        let mut qs = self.queues.lock();
        for q in qs.iter_mut().rev() {
            if !q.is_empty() {
                return Some(q.remove(0));
            }
        }
        None
    }
}

impl Default for TaskSchedulerImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TaskScheduler for TaskSchedulerImpl {
    #[instrument(skip(self, task))]
    async fn schedule(&self, task: Task) -> Result<Uuid, BrainError> {
        let id = task.id;
        let prio = task.priority;
        let idx = prio_idx(prio);
        self.pending.insert(id, task);
        self.queues.lock()[idx].push(id);
        debug!(task_id = %id, ?prio, "task scheduled");
        Ok(id)
    }

    #[instrument(skip(self))]
    async fn cancel(&self, task_id: Uuid) -> Result<(), BrainError> {
        if self.pending.remove(&task_id).is_some() {
            let mut qs = self.queues.lock();
            for q in qs.iter_mut() {
                q.retain(|x| *x != task_id);
            }
            return Ok(());
        }
        if let Some((_, (_, handle))) = self.running.remove(&task_id) {
            handle.abort();
            return Ok(());
        }
        Err(BrainError::TaskScheduling(format!("task {task_id} not found")))
    }

    async fn list_pending(&self) -> Result<Vec<Task>, BrainError> {
        Ok(self.pending.iter().map(|e| e.value().clone()).collect())
    }

    async fn list_running(&self) -> Result<Vec<Task>, BrainError> {
        Ok(self.running.iter().map(|e| (e.value().0).clone()).collect())
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use sgtx_brain_core::{BrainResult, HealthCheck};

    // ---- test event bus that just counts publishes ----
    struct DummyBus {
        count: Arc<AtomicU64>,
    }
    #[async_trait]
    impl EventBus for DummyBus {
        async fn publish(&self, _event: BrainEvent) -> BrainResult<()> {
            self.count.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
        async fn subscribe(
            &self,
            _event_type: &str,
            _handler: Arc<dyn sgtx_brain_core::EventHandler>,
        ) -> BrainResult<Uuid> {
            Ok(Uuid::new_v4())
        }
        async fn unsubscribe(&self, _id: Uuid) -> BrainResult<()> {
            Ok(())
        }
        async fn replay(
            &self,
            _from: Option<DateTime<Utc>>,
            _types: Option<Vec<String>>,
        ) -> BrainResult<usize> {
            Ok(0)
        }
        fn metrics(&self) -> sgtx_brain_core::EventBusMetrics {
            sgtx_brain_core::EventBusMetrics::default()
        }
    }

    struct AlwaysHealthy;
    #[async_trait]
    impl HealthChecker for AlwaysHealthy {
        async fn check(&self) -> BrainResult<HealthCheck> {
            Ok(HealthCheck {
                status: HealthStatus::Healthy,
                latency_ms: 1.0,
                details: None,
                checked_at: Utc::now(),
            })
        }
    }

    #[tokio::test]
    async fn health_manager_publishes_events() {
        let count = Arc::new(AtomicU64::new(0));
        let bus: Arc<dyn EventBus> = Arc::new(DummyBus { count: count.clone() });
        let hm = Arc::new(HealthManagerImpl::new(bus, 0));
        hm.register_check("m1", Arc::new(AlwaysHealthy))
            .await
            .unwrap();
        let _ = hm.check("m1").await.unwrap();
        // one brain.module.health event published (sync path inside check)
        // note: the publish happens via tokio::spawn for the failed path only
        assert!(count.load(Ordering::SeqCst) >= 1);
    }

    #[tokio::test]
    async fn metrics_counter_export() {
        let m = MetricsManagerImpl::new();
        m.increment_counter("c", 5).unwrap();
        m.set_gauge("g", 42).unwrap();
        let txt = m.export_prometheus();
        assert!(txt.contains("c"));
        assert!(txt.contains("g"));
        let j = m.export_json();
        assert!(!j.is_empty());
    }

    #[tokio::test]
    async fn logging_manager_filters_by_level() {
        let l = LoggingManagerImpl::new(LogLevel::Warn, 100);
        l.log(LogLevel::Info, "t", "should be filtered", HashMap::new());
        l.log(LogLevel::Error, "t", "kept", HashMap::new());
        let out = l.export_jsonl();
        assert!(out.contains("kept"));
        assert!(!out.contains("should be filtered"));
    }

    #[tokio::test]
    async fn memory_manager_oom() {
        let mm = MemoryManagerImpl::new();
        mm.set_budget("m1", 100);
        mm.allocate("m1", 50).unwrap();
        assert!(mm.allocate("m1", 100).is_err());
    }

    #[tokio::test]
    async fn secrets_round_trip() {
        let s = SecretsManagerImpl::new();
        s.set_secret("k", "v").await.unwrap();
        assert_eq!(s.get_secret("k").await.unwrap().as_deref(), Some("v"));
        s.delete_secret("k").await.unwrap();
        assert_eq!(s.get_secret("k").await.unwrap(), None);
    }

    #[tokio::test]
    async fn feature_flags_toggle() {
        let f = FeatureFlagsImpl::new();
        assert!(!f.is_enabled("x").await.unwrap());
        f.enable("x").await.unwrap();
        assert!(f.is_enabled("x").await.unwrap());
        f.disable("x").await.unwrap();
        assert!(!f.is_enabled("x").await.unwrap());
    }

    #[tokio::test]
    async fn config_service_watch_returns_initial() {
        let c = ConfigurationServiceImpl::new();
        c.set("k", serde_json::json!(1)).await.unwrap();
        let w = c.watch("k").await.unwrap();
        assert_eq!(w.initial, Some(serde_json::json!(1)));
    }

    #[tokio::test]
    async fn task_scheduler_priority_ordering() {
        let ts = TaskSchedulerImpl::new();
        let mut t_low = Task {
            id: Uuid::new_v4(),
            name: "low".into(),
            priority: TaskPriority::Low,
            scheduled_at: Utc::now(),
            timeout_secs: 1,
            payload: serde_json::json!({}),
        };
        let mut t_crit = t_low.clone();
        t_crit.id = Uuid::new_v4();
        t_crit.priority = TaskPriority::Critical;
        t_low.id = Uuid::new_v4();
        ts.schedule(t_low.clone()).await.unwrap();
        ts.schedule(t_crit.clone()).await.unwrap();
        let next = ts.pop_next().unwrap();
        assert_eq!(next, t_crit.id);
        let next = ts.pop_next().unwrap();
        assert_eq!(next, t_low.id);
    }
}

// (no trailing items)
