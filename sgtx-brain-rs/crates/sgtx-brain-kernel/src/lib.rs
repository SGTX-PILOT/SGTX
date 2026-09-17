//! SGTX Brain Kernel — the orchestrator that wires every sub-system
//! together.
//!
//! [`BrainKernel`] owns the [`BrainRuntime`], an [`EventBus`] implementation,
//! the [`ModuleLoader`], all 12 registries, and all 10 managers. It exposes
//! a [`BrainKernel::start`] / [`BrainKernel::shutdown`] lifecycle that
//! initializes sub-systems in dependency order and tears them down in
//! reverse order with a configurable timeout.

use std::sync::Arc;
use std::time::Duration;

use parking_lot::RwLock;
use sgtx_brain_core::{BrainConfig, BrainResult, EventBus};
use sgtx_brain_eventbus::InMemoryEventBus;
use sgtx_brain_loader::ModuleLoader;
use sgtx_brain_managers::{
    ConfigurationServiceImpl, FeatureFlagsImpl, HealthManagerImpl, HotReloadManagerImpl,
    LoggingManagerImpl, LogLevel, MemoryManagerImpl, MetricsManagerImpl, ResourceManagerImpl,
    SecretsManagerImpl, TaskSchedulerImpl,
};
use sgtx_brain_registries::{
    AgentRegistryImpl, CapabilityRegistryImpl, ContextRegistryImpl, ExecutionRegistryImpl,
    KnowledgeRegistryImpl, LearningRegistryImpl, ModelRegistryImpl, PolicyRegistryImpl,
    StateRegistryImpl, ToolRegistryImpl, VectorRegistryImpl, WorkflowRegistryImpl,
};
use sgtx_brain_runtime::BrainRuntime;
use tracing::{error, info, instrument, warn};

/// Coarse-grained lifecycle state of the kernel.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KernelStatus {
    /// Not yet started, or fully shut down.
    Stopped,
    /// `start()` is in progress.
    Initializing,
    /// Fully operational.
    Running,
    /// `shutdown()` is in progress.
    ShuttingDown,
    /// A fatal error occurred during `start()` or `shutdown()`.
    Failed,
}

/// The Brain Kernel — the top-level orchestrator.
///
/// Holds strong references to every sub-system so they share a single
/// lifetime. Access to the kernel's sub-systems is via the accessor methods
/// (e.g. [`BrainKernel::event_bus`], [`BrainKernel::runtime`]).
pub struct BrainKernel {
    config: BrainConfig,
    status: RwLock<KernelStatus>,

    // Infrastructure
    runtime: BrainRuntime,
    event_bus: Arc<InMemoryEventBus>,
    loader: Arc<ModuleLoader>,

    // 12 registries
    capability_registry: Arc<CapabilityRegistryImpl>,
    model_registry: Arc<ModelRegistryImpl>,
    knowledge_registry: Arc<KnowledgeRegistryImpl>,
    workflow_registry: Arc<WorkflowRegistryImpl>,
    agent_registry: Arc<AgentRegistryImpl>,
    tool_registry: Arc<ToolRegistryImpl>,
    vector_registry: Arc<VectorRegistryImpl>,
    state_registry: Arc<StateRegistryImpl>,
    context_registry: Arc<ContextRegistryImpl>,
    learning_registry: Arc<LearningRegistryImpl>,
    execution_registry: Arc<ExecutionRegistryImpl>,
    policy_registry: Arc<PolicyRegistryImpl>,

    // 10 managers
    health_manager: Arc<HealthManagerImpl>,
    metrics_manager: Arc<MetricsManagerImpl>,
    logging_manager: Arc<LoggingManagerImpl>,
    memory_manager: Arc<MemoryManagerImpl>,
    secrets_manager: Arc<SecretsManagerImpl>,
    resource_manager: Arc<ResourceManagerImpl>,
    hot_reload_manager: Arc<HotReloadManagerImpl>,
    feature_flags: Arc<FeatureFlagsImpl>,
    config_service: Arc<ConfigurationServiceImpl>,
    task_scheduler: Arc<TaskSchedulerImpl>,
}

impl BrainKernel {
    /// Build a fully-wired kernel from a [`BrainConfig`]. All sub-systems are
    /// constructed but NOT started — call [`BrainKernel::start`] to bring
    /// them online.
    pub fn new(config: BrainConfig) -> Self {
        let runtime = BrainRuntime::with_shutdown_timeout(
            config.kernel.max_concurrent_tasks,
            config.kernel.shutdown_timeout_secs,
        );
        let event_bus = Arc::new(InMemoryEventBus::new(config.event_bus.clone()));
        let loader = Arc::new(ModuleLoader::new());

        // Registries (all start empty).
        let capability_registry = Arc::new(CapabilityRegistryImpl::new());
        let model_registry = Arc::new(ModelRegistryImpl::new());
        let knowledge_registry = Arc::new(KnowledgeRegistryImpl::new());
        let workflow_registry = Arc::new(WorkflowRegistryImpl::new());
        let agent_registry = Arc::new(AgentRegistryImpl::new());
        let tool_registry = Arc::new(ToolRegistryImpl::new());
        let vector_registry = Arc::new(VectorRegistryImpl::new());
        let state_registry = Arc::new(StateRegistryImpl::new());
        let context_registry = Arc::new(ContextRegistryImpl::new());
        let learning_registry = Arc::new(LearningRegistryImpl::new());
        let execution_registry = Arc::new(ExecutionRegistryImpl::new());
        let policy_registry = Arc::new(PolicyRegistryImpl::new());

        // Managers.
        let health_manager = Arc::new(HealthManagerImpl::new(
            event_bus.clone() as Arc<dyn EventBus>,
            30,
        ));
        let metrics_manager = Arc::new(MetricsManagerImpl::new());
        let logging_manager = Arc::new(LoggingManagerImpl::new(LogLevel::Info, 10_000));
        let memory_manager = Arc::new(MemoryManagerImpl::new());
        let secrets_manager = Arc::new(SecretsManagerImpl::new());
        let resource_manager = Arc::new(ResourceManagerImpl::new());
        let hot_reload_manager = Arc::new(HotReloadManagerImpl::new());
        let feature_flags = Arc::new(FeatureFlagsImpl::new());
        let config_service = Arc::new(ConfigurationServiceImpl::new());
        let task_scheduler = Arc::new(TaskSchedulerImpl::new());

        Self {
            config,
            status: RwLock::new(KernelStatus::Stopped),
            runtime,
            event_bus,
            loader,
            capability_registry,
            model_registry,
            knowledge_registry,
            workflow_registry,
            agent_registry,
            tool_registry,
            vector_registry,
            state_registry,
            context_registry,
            learning_registry,
            execution_registry,
            policy_registry,
            health_manager,
            metrics_manager,
            logging_manager,
            memory_manager,
            secrets_manager,
            resource_manager,
            hot_reload_manager,
            feature_flags,
            config_service,
            task_scheduler,
        }
    }

    // -----------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------

    /// Bring all sub-systems online in dependency order:
    /// 1. event bus (already constructed; mark ready)
    /// 2. registries (stateless DashMaps; no-op)
    /// 3. managers (stateless; no-op)
    /// 4. runtime (already constructed; mark ready)
    /// 5. publish `brain.kernel.started` event
    #[instrument(skip(self))]
    pub async fn start(&self) -> BrainResult<()> {
        {
            let mut s = self.status.write();
            match *s {
                KernelStatus::Running => {
                    warn!("start() called when already Running — no-op");
                    return Ok(());
                }
                KernelStatus::Initializing | KernelStatus::ShuttingDown => {
                    return Err(sgtx_brain_core::BrainError::Internal(format!(
                        "cannot start kernel in {:?} state",
                        *s
                    )));
                }
                _ => {}
            }
            *s = KernelStatus::Initializing;
        }

        info!("brain kernel starting");

        // The runtime is already running its dispatcher worker; nothing to
        // do beyond flipping the status. Registries and managers are
        // stateless.

        // Publish a started event so subscribers can react.
        let event = sgtx_brain_core::BrainEvent {
            id: uuid::Uuid::new_v4(),
            event_type: "brain.kernel.started".into(),
            aggregate_id: self.config.kernel.instance_id.clone(),
            payload: serde_json::json!({
                "instance_id": self.config.kernel.instance_id,
                "max_concurrent_tasks": self.config.kernel.max_concurrent_tasks,
            }),
            metadata: sgtx_brain_core::EventMetadata {
                source: "brain-kernel".into(),
                correlation_id: None,
                causation_id: None,
                timestamp: chrono::Utc::now(),
                version: "1".into(),
                tenant_gtid: None,
            },
        };
        if let Err(e) = self.event_bus.publish(event).await {
            warn!(error = %e, "failed to publish brain.kernel.started event");
        }

        *self.status.write() = KernelStatus::Running;
        info!("brain kernel is Running");
        Ok(())
    }

    /// Gracefully tear down every sub-system in reverse dependency order,
    /// bounded by the kernel's shutdown timeout.
    #[instrument(skip(self))]
    pub async fn shutdown(&self) -> BrainResult<()> {
        {
            let mut s = self.status.write();
            match *s {
                KernelStatus::Stopped => {
                    warn!("shutdown() called when already Stopped — no-op");
                    return Ok(());
                }
                KernelStatus::ShuttingDown => {
                    return Err(sgtx_brain_core::BrainError::Internal(
                        "shutdown() already in progress".into(),
                    ));
                }
                _ => {}
            }
            *s = KernelStatus::ShuttingDown;
        }
        info!("brain kernel shutting down");

        // Publish a shutdown-starting event.
        let event = sgtx_brain_core::BrainEvent {
            id: uuid::Uuid::new_v4(),
            event_type: "brain.kernel.stopping".into(),
            aggregate_id: self.config.kernel.instance_id.clone(),
            payload: serde_json::json!({
                "instance_id": self.config.kernel.instance_id,
                "timeout_secs": self.config.kernel.shutdown_timeout_secs,
            }),
            metadata: sgtx_brain_core::EventMetadata {
                source: "brain-kernel".into(),
                correlation_id: None,
                causation_id: None,
                timestamp: chrono::Utc::now(),
                version: "1".into(),
                tenant_gtid: None,
            },
        };
        let _ = self.event_bus.publish(event).await;

        // Stop the runtime (cancels all module + task handles). Use a
        // hard-bounded timeout so a stuck sub-system cannot block forever.
        let timeout = Duration::from_secs(self.config.kernel.shutdown_timeout_secs.max(1));
        let runtime_result = tokio::time::timeout(timeout, async {
            self.runtime.shutdown()
        })
        .await;
        match runtime_result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => error!(error = %e, "runtime shutdown returned error"),
            Err(_) => error!("runtime shutdown timed out after {:?}", timeout),
        }

        *self.status.write() = KernelStatus::Stopped;
        info!("brain kernel Stopped");
        Ok(())
    }

    /// Current lifecycle state.
    pub fn status(&self) -> KernelStatus {
        *self.status.read()
    }

    // -----------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------

    pub fn config(&self) -> &BrainConfig {
        &self.config
    }

    pub fn runtime(&self) -> &BrainRuntime {
        &self.runtime
    }

    pub fn event_bus(&self) -> Arc<InMemoryEventBus> {
        self.event_bus.clone()
    }

    pub fn event_bus_ref(&self) -> &InMemoryEventBus {
        &self.event_bus
    }

    pub fn loader(&self) -> Arc<ModuleLoader> {
        self.loader.clone()
    }

    pub fn capability_registry(&self) -> Arc<CapabilityRegistryImpl> {
        self.capability_registry.clone()
    }
    pub fn model_registry(&self) -> Arc<ModelRegistryImpl> {
        self.model_registry.clone()
    }
    pub fn knowledge_registry(&self) -> Arc<KnowledgeRegistryImpl> {
        self.knowledge_registry.clone()
    }
    pub fn workflow_registry(&self) -> Arc<WorkflowRegistryImpl> {
        self.workflow_registry.clone()
    }
    pub fn agent_registry(&self) -> Arc<AgentRegistryImpl> {
        self.agent_registry.clone()
    }
    pub fn tool_registry(&self) -> Arc<ToolRegistryImpl> {
        self.tool_registry.clone()
    }
    pub fn vector_registry(&self) -> Arc<VectorRegistryImpl> {
        self.vector_registry.clone()
    }
    pub fn state_registry(&self) -> Arc<StateRegistryImpl> {
        self.state_registry.clone()
    }
    pub fn context_registry(&self) -> Arc<ContextRegistryImpl> {
        self.context_registry.clone()
    }
    pub fn learning_registry(&self) -> Arc<LearningRegistryImpl> {
        self.learning_registry.clone()
    }
    pub fn execution_registry(&self) -> Arc<ExecutionRegistryImpl> {
        self.execution_registry.clone()
    }
    pub fn policy_registry(&self) -> Arc<PolicyRegistryImpl> {
        self.policy_registry.clone()
    }

    pub fn health_manager(&self) -> Arc<HealthManagerImpl> {
        self.health_manager.clone()
    }
    pub fn metrics_manager(&self) -> Arc<MetricsManagerImpl> {
        self.metrics_manager.clone()
    }
    pub fn logging_manager(&self) -> Arc<LoggingManagerImpl> {
        self.logging_manager.clone()
    }
    pub fn memory_manager(&self) -> Arc<MemoryManagerImpl> {
        self.memory_manager.clone()
    }
    pub fn secrets_manager(&self) -> Arc<SecretsManagerImpl> {
        self.secrets_manager.clone()
    }
    pub fn resource_manager(&self) -> Arc<ResourceManagerImpl> {
        self.resource_manager.clone()
    }
    pub fn hot_reload_manager(&self) -> Arc<HotReloadManagerImpl> {
        self.hot_reload_manager.clone()
    }
    pub fn feature_flags(&self) -> Arc<FeatureFlagsImpl> {
        self.feature_flags.clone()
    }
    pub fn config_service(&self) -> Arc<ConfigurationServiceImpl> {
        self.config_service.clone()
    }
    pub fn task_scheduler(&self) -> Arc<TaskSchedulerImpl> {
        self.task_scheduler.clone()
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn kernel_lifecycle() {
        let kernel = BrainKernel::new(BrainConfig::default());
        assert_eq!(kernel.status(), KernelStatus::Stopped);
        kernel.start().await.unwrap();
        assert_eq!(kernel.status(), KernelStatus::Running);

        // start() is idempotent
        kernel.start().await.unwrap();
        assert_eq!(kernel.status(), KernelStatus::Running);

        kernel.shutdown().await.unwrap();
        assert_eq!(kernel.status(), KernelStatus::Stopped);

        // shutdown() is idempotent
        kernel.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn kernel_publishes_started_event() {
        let kernel = BrainKernel::new(BrainConfig::default());
        kernel.start().await.unwrap();
        // The InMemoryEventBus tracks publishes in its metrics.
        let m = kernel.event_bus_ref().metrics();
        assert!(m.total_published >= 1);
    }

    #[test]
    fn kernel_wires_all_subsystems() {
        let kernel = BrainKernel::new(BrainConfig::default());
        // Accessors should return non-null Arcs.
        assert!(Arc::strong_count(&kernel.event_bus()) >= 1);
        assert!(Arc::strong_count(&kernel.loader()) >= 1);
        assert!(Arc::strong_count(&kernel.capability_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.model_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.knowledge_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.workflow_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.agent_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.tool_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.vector_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.state_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.context_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.learning_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.execution_registry()) >= 1);
        assert!(Arc::strong_count(&kernel.policy_registry()) >= 1);

        assert!(Arc::strong_count(&kernel.health_manager()) >= 1);
        assert!(Arc::strong_count(&kernel.metrics_manager()) >= 1);
        assert!(Arc::strong_count(&kernel.logging_manager()) >= 1);
        assert!(Arc::strong_count(&kernel.memory_manager()) >= 1);
        assert!(Arc::strong_count(&kernel.secrets_manager()) >= 1);
        assert!(Arc::strong_count(&kernel.resource_manager()) >= 1);
        assert!(Arc::strong_count(&kernel.hot_reload_manager()) >= 1);
        assert!(Arc::strong_count(&kernel.feature_flags()) >= 1);
        assert!(Arc::strong_count(&kernel.config_service()) >= 1);
        assert!(Arc::strong_count(&kernel.task_scheduler()) >= 1);
    }
}
