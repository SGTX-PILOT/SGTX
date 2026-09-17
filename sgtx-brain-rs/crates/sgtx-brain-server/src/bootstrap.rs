// Brain OS Bootstrap — startup + shutdown sequences
// Startup order: Core → Runtime → EventBus → Registries → Managers → Cortex → Memory → Knowledge → Agents
// Shutdown order: reverse

use std::sync::Arc;
use sgtx_brain_core::types::*;
use sgtx_brain_core::traits::*;
use sgtx_brain_core::BrainResult;
use tracing::{info, instrument, error};

pub struct BrainHandle {
    pub kernel: Arc<sgtx_brain_kernel::BrainKernel>,
    pub runtime: Arc<sgtx_brain_runtime::BrainRuntime>,
    pub event_bus: Arc<dyn EventBus>,
    pub capability_registry: Arc<dyn CapabilityRegistry>,
    pub model_registry: Arc<dyn ModelRegistry>,
    pub health_manager: Arc<dyn HealthManager>,
    pub metrics_manager: Arc<sgtx_brain_managers::MetricsManagerImpl>,
    pub task_scheduler: Arc<dyn TaskScheduler>,
    pub cortex: Option<Arc<sgtx_brain_cortex::ExecutiveCortex>>,
    pub memory: Arc<sgtx_brain_memory::MemoryArchitecture>,
    pub knowledge: Option<Arc<sgtx_brain_knowledge::KnowledgeGraphEngine>>,
    pub agents: Arc<sgtx_brain_agents::AgentOS>,
    pub config: BrainConfig,
}

#[instrument(skip(config))]
pub async fn bootstrap(config: BrainConfig) -> BrainResult<BrainHandle> {
    info!("Brain OS bootstrap starting");

    // 1. Runtime (Tokio executor)
    let runtime = Arc::new(sgtx_brain_runtime::BrainRuntime::new(
        config.kernel.max_concurrent_tasks,
    ));
    info!("Runtime initialized");

    // 2. Event Bus
    let event_bus: Arc<dyn EventBus> = Arc::new(
        sgtx_brain_eventbus::InMemoryEventBus::new(
            config.event_bus.max_in_flight,
            config.event_bus.retry_attempts,
            config.event_bus.retry_delay_ms,
        ),
    );
    info!("Event bus initialized");

    // 3. Registries
    let capability_registry: Arc<dyn CapabilityRegistry> =
        Arc::new(sgtx_brain_registries::CapabilityRegistryImpl::new());
    let model_registry: Arc<dyn ModelRegistry> =
        Arc::new(sgtx_brain_registries::ModelRegistryImpl::new());
    info!("Registries initialized");

    // 4. Managers
    let health_manager: Arc<dyn HealthManager> =
        Arc::new(sgtx_brain_managers::HealthManagerImpl::new(
            std::time::Duration::from_secs(30),
            event_bus.clone(),
        ));
    let metrics_manager = Arc::new(sgtx_brain_managers::MetricsManagerImpl::new());
    let task_scheduler: Arc<dyn TaskScheduler> =
        Arc::new(sgtx_brain_managers::TaskSchedulerImpl::new());
    info!("Managers initialized");

    // 5. Memory Architecture
    let memory = Arc::new(sgtx_brain_memory::MemoryArchitecture::new(100_000));
    info!("Memory architecture initialized");

    // 6. Knowledge Graph Engine
    let knowledge = Arc::new(sgtx_brain_knowledge::KnowledgeGraphEngine::new(
        std::sync::Arc::new(sgtx_brain_managers::ConfigurationServiceImpl::new()),
    ));
    info!("Knowledge graph engine initialized");

    // 7. Agent OS
    let agents = Arc::new(sgtx_brain_agents::AgentOS::new(
        config.agents.max_concurrent_agents,
    ));
    info!("Agent OS initialized");

    // 8. Executive Cortex (depends on all above)
    let cortex = Arc::new(sgtx_brain_cortex::ExecutiveCortex::new(
        event_bus.clone(),
        sgtx_brain_cortex::Registries {
            capability: capability_registry.clone(),
            model: model_registry.clone(),
        },
        memory.clone(),
        agents.clone(),
    ));
    info!("Executive cortex initialized");

    // 9. Kernel (coordinates everything)
    let kernel = Arc::new(sgtx_brain_kernel::BrainKernel::new(config.clone()));
    info!("Kernel initialized");

    info!("Brain OS bootstrap complete — all sub-systems active");

    Ok(BrainHandle {
        kernel,
        runtime,
        event_bus,
        capability_registry,
        model_registry,
        health_manager,
        metrics_manager,
        task_scheduler,
        cortex: Some(cortex),
        memory,
        knowledge: Some(knowledge),
        agents,
        config,
    })
}

#[instrument(skip(handle))]
pub async fn shutdown(handle: Arc<BrainHandle>) -> BrainResult<()> {
    info!("Brain OS shutdown starting");

    // Reverse order: Agents → Knowledge → Memory → Cortex → Managers → Registries → EventBus → Runtime
    handle.agents.shutdown_all().await.unwrap_or_else(|e| error!(error = %e, "Agent OS shutdown error"));
    info!("Agent OS stopped");

    handle.cortex.as_ref().map(|c| c.shutdown());
    info!("Cortex stopped");

    handle.memory.shutdown().await.unwrap_or_else(|e| error!(error = %e, "Memory shutdown error"));
    info!("Memory stopped");

    handle.runtime.shutdown().await.unwrap_or_else(|e| error!(error = %e, "Runtime shutdown error"));
    info!("Runtime stopped");

    info!("Brain OS shutdown complete");
    Ok(())
}
