//! SGTX Brain Cortex — Phase 2: Executive Decision-Making.
//!
//! The Executive Cortex is the global decision-maker of the Brain OS. It
//! receives [`DecisionRequest`]s, plans tasks, selects capabilities, validates
//! plans against the constitution, and supervises ongoing executions.
//!
//! # Design Principle
//! **The Cortex never executes work.** It only decides *which* subsystem
//! performs the work (a capability module via the registry, or an agent via
//! Agent OS). All side-effecting execution is delegated.
//!
//! # Event Topology
//! - Subscribes to `brain.decision.requested`.
//! - Publishes `brain.decision.made` for every decision (including
//!   reject/defer/escalate).
//! - Publishes `brain.execution.supervised` after each supervision tick.
//! - Publishes `brain.plan.replanned` when dynamic replanning fires.
//!
//! # Subsystems used
//! - [`EventBus`] — pub/sub backbone.
//! - [`CapabilityRegistry`] — resolves capability names to module IDs.
//! - [`MemoryStore`] — context assembly (working + semantic memory).
//! - [`AgentRuntime`] — multi-agent delegation.
//! - [`ConstitutionalGate`] — validates every decision before publishing.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sgtx_brain_core::{
    AgentId, AgentRuntime, AuthorityLevel, BrainError, BrainEvent, BrainResult, BrainModule,
    CapabilityRegistry, ConditionStatus, ConstitutionalCondition, ConstitutionalVerdict,
    EventBus, EventMetadata, HealthCheck, HealthStatus, MemoryEntry, MemoryQuery, MemoryStore,
    MemoryType, ModuleDescriptor, ModuleStatus, ModuleType, TaskPriority,
};
use tracing::{error, info, instrument, warn};
use uuid::Uuid;

// ============================================================================
// Constants — event types and capability routing table
// ============================================================================

/// Inbound: a subsystem is asking the Cortex to make a decision.
pub const EVT_DECISION_REQUESTED: &str = "brain.decision.requested";
/// Outbound: the Cortex has decided.
pub const EVT_DECISION_MADE: &str = "brain.decision.made";
/// Outbound: the Cortex supervised an execution.
pub const EVT_EXECUTION_SUPERVISED: &str = "brain.execution.supervised";
/// Outbound: a plan was dynamically replanned after a step failure.
pub const EVT_PLAN_REPLANNED: &str = "brain.plan.replanned";

/// Default per-step timeout (30 minutes) when none is specified.
pub const DEFAULT_STEP_TIMEOUT_SECS: u64 = 30 * 60;
/// Default retry attempts for a single step.
pub const DEFAULT_RETRY_ATTEMPTS: u32 = 3;
/// Default backoff base (200 ms — exponentiated per attempt).
pub const DEFAULT_BACKOFF_MS: u64 = 200;

// ============================================================================
// Public types
// ============================================================================

/// A request for the Cortex to make a decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionRequest {
    pub goal: String,
    pub context: serde_json::Value,
    pub authority: AuthorityLevel,
    pub constraints: Vec<Constraint>,
    pub priority: TaskPriority,
    pub deadline: Option<DateTime<Utc>>,
}

/// A constitutional / operational constraint on a plan or decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraint {
    pub kind: ConstraintKind,
    pub description: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ConstraintKind {
    Authority,
    Deadline,
    Resource,
    Constitutional,
    Cost,
    Latency,
    Custom,
}

/// The Cortex's decision for a [`DecisionRequest`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    pub decision_id: Uuid,
    pub action: DecisionAction,
    pub rationale: String,
    pub assigned_module: Option<String>,
    pub assigned_agent: Option<AgentId>,
    pub conditions: Vec<ConstitutionalCondition>,
    pub confidence: f64,
    pub created_at: DateTime<Utc>,
}

/// The action chosen by the Cortex. The Cortex never executes the action
/// itself — it emits this enum so the runtime / agent OS can act on it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DecisionAction {
    /// Execute a capability on a registered module.
    Execute {
        capability: String,
        input: serde_json::Value,
    },
    /// Delegate the task to a spawned agent.
    Delegate {
        agent_id: AgentId,
        task: String,
    },
    /// Defer the decision (e.g. missing context).
    Defer { reason: String },
    /// Escalate to a human / higher-authority reviewer.
    Escalate { reason: String },
    /// Reject outright (e.g. constitutional violation).
    Reject { reason: String },
}

/// A decomposed task plan: a goal broken into ordered, dependent steps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPlan {
    pub plan_id: Uuid,
    pub goal: String,
    pub steps: Vec<PlanStep>,
    /// step_id -> step_ids it depends on (must complete first).
    pub dependencies: HashMap<Uuid, Vec<Uuid>>,
    pub estimated_duration_secs: u64,
    pub required_capabilities: Vec<String>,
    pub required_authority: AuthorityLevel,
}

/// A single step in a [`TaskPlan`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: Uuid,
    pub description: String,
    pub capability: String,
    pub input: serde_json::Value,
    pub timeout_secs: u64,
    pub retry_policy: RetryPolicy,
}

/// Retry policy attached to every [`PlanStep`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff_ms: u64,
    /// Fallback capability to try when the primary fails all attempts.
    pub fallback: Option<String>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: DEFAULT_RETRY_ATTEMPTS,
            backoff_ms: DEFAULT_BACKOFF_MS,
            fallback: None,
        }
    }
}

/// The result of validating a [`TaskPlan`] against the constitution and
/// request constraints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintCheck {
    pub passed: bool,
    pub violations: Vec<String>,
    pub constitutional_verdict: ConstitutionalVerdict,
}

/// A snapshot of an execution's health from the supervisor's perspective.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupervisionReport {
    pub execution_id: String,
    pub status: SupervisionStatus,
    pub steps_completed: usize,
    pub steps_total: usize,
    pub errors: Vec<String>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SupervisionStatus {
    OnTrack,
    Delayed,
    Failing,
    Completed,
    Aborted,
}

// ============================================================================
// Constitutional Gate trait + default impl
// ============================================================================

/// Constitutional gate — validates every decision before it is published.
///
/// Implementations may consult a remote Governor service, a static ruleset,
/// or any other policy source. The Cortex always calls this gate before
/// publishing `brain.decision.made`.
#[async_trait]
pub trait ConstitutionalGate: Send + Sync {
    /// Evaluate the proposed action for a request. Returns the verdict, any
    /// preconditions, and a rationale.
    async fn evaluate(
        &self,
        request: &DecisionRequest,
        action: &DecisionAction,
    ) -> BrainResult<ConstitutionalEvaluation>;
}

/// Output of [`ConstitutionalGate::evaluate`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstitutionalEvaluation {
    pub verdict: ConstitutionalVerdict,
    pub conditions: Vec<ConstitutionalCondition>,
    pub rationale: String,
}

/// Default in-process constitutional gate. Enforces the SGTX constitution:
/// - A5 (autonomous execution) is FORBIDDEN.
/// - A4 (orchestrated actions) requires an explicit human-in-the-loop
///   condition to be marked `Met` (callers signal this via a
///   `human_in_loop=true` flag in `request.context`).
/// - A0–A3 are allowed without precondition.
pub struct DefaultConstitutionalGate;

impl DefaultConstitutionalGate {
    pub fn new() -> Self {
        Self
    }
}

impl Default for DefaultConstitutionalGate {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ConstitutionalGate for DefaultConstitutionalGate {
    #[instrument(skip(self, request, action), fields(authority = ?request.authority))]
    async fn evaluate(
        &self,
        request: &DecisionRequest,
        action: &DecisionAction,
    ) -> BrainResult<ConstitutionalEvaluation> {
        // Rule 1: A5 is constitutionally blocked.
        if request.authority == AuthorityLevel::A5 {
            return Ok(ConstitutionalEvaluation {
                verdict: ConstitutionalVerdict::Deny,
                conditions: vec![],
                rationale: "Authority A5 (autonomous execution) is constitutionally blocked"
                    .into(),
            });
        }

        // Rule 2: A4 requires a human-in-the-loop condition.
        if request.authority == AuthorityLevel::A4 {
            let human_in_loop = request
                .context
                .get("human_in_loop")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let condition = ConstitutionalCondition {
                condition_id: "human_in_loop".into(),
                label: "Human reviewer must approve A4 orchestrated action".into(),
                status: if human_in_loop {
                    ConditionStatus::Met
                } else {
                    ConditionStatus::Unmet
                },
                action_url: Some("/sgtx/gov/review".into()),
            };
            let verdict = if human_in_loop {
                ConstitutionalVerdict::Allow
            } else {
                ConstitutionalVerdict::Conditional
            };
            return Ok(ConstitutionalEvaluation {
                verdict,
                conditions: vec![condition],
                rationale: "A4 orchestrated action requires human-in-the-loop approval".into(),
            });
        }

        // Rule 3: Reject actions that attempt execution at A0 (pure
        // computation) — A0 may not drive side-effecting Execute/Delegate.
        if request.authority == AuthorityLevel::A0 {
            if matches!(
                action,
                DecisionAction::Execute { .. } | DecisionAction::Delegate { .. }
            ) {
                return Ok(ConstitutionalEvaluation {
                    verdict: ConstitutionalVerdict::Deny,
                    conditions: vec![],
                    rationale:
                        "A0 (pure computation) may not drive side-effecting Execute/Delegate"
                            .into(),
                });
            }
        }

        // Default: allow A1–A3 unconditionally.
        Ok(ConstitutionalEvaluation {
            verdict: ConstitutionalVerdict::Allow,
            conditions: vec![],
            rationale: format!("Authority {:?} permitted by constitution", request.authority),
        })
    }
}

// ============================================================================
// Registries bundle
// ============================================================================

/// Bundles the registries the Cortex needs. Construct with [`Registries::new`]
/// or [`Registries::builder`].
#[derive(Clone)]
pub struct Registries {
    pub capabilities: Arc<dyn CapabilityRegistry>,
    pub models: Option<Arc<dyn sgtx_brain_core::ModelRegistry>>,
}

impl Registries {
    pub fn new(capabilities: Arc<dyn CapabilityRegistry>) -> Self {
        Self {
            capabilities,
            models: None,
        }
    }

    pub fn with_models(mut self, models: Arc<dyn sgtx_brain_core::ModelRegistry>) -> Self {
        self.models = Some(models);
        self
    }
}

// ============================================================================
// Internal: execution tracking for supervision
// ============================================================================

/// Internal bookkeeping for a supervised execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExecutionRecord {
    execution_id: String,
    plan: TaskPlan,
    started_at: DateTime<Utc>,
    last_updated_at: DateTime<Utc>,
    completed_step_ids: Vec<Uuid>,
    failed_step_ids: Vec<Uuid>,
    errors: Vec<String>,
    aborted: bool,
    /// Soft deadline derived from the request (if any) or plan estimate.
    deadline: Option<DateTime<Utc>>,
}

// ============================================================================
// ExecutiveCortex
// ============================================================================

/// The Executive Cortex. Holds references to the subsystems it orchestrates
/// (never executes work itself) and tracks in-flight executions for
/// supervision.
///
/// # Thread safety
/// All fields are `Send + Sync`. Execution records live in a `DashMap`; the
/// constitutional gate is read through an `Arc`.
pub struct ExecutiveCortex {
    event_bus: Arc<dyn EventBus>,
    registries: Registries,
    memory: Arc<dyn MemoryStore>,
    agents: Arc<dyn AgentRuntime>,
    constitutional_gate: RwLock<Arc<dyn ConstitutionalGate>>,
    executions: DashMap<String, ExecutionRecord>,
    /// Counters for observability.
    decisions_made: AtomicU64,
    decisions_rejected: AtomicU64,
    decisions_delegated: AtomicU64,
    plans_replanned: AtomicU64,
}

impl ExecutiveCortex {
    /// Construct a new Cortex wired to its subsystems. Uses
    /// [`DefaultConstitutionalGate`]; swap with [`Self::set_constitutional_gate`].
    pub fn new(
        event_bus: Arc<dyn EventBus>,
        registries: Registries,
        memory: Arc<dyn MemoryStore>,
        agents: Arc<dyn AgentRuntime>,
    ) -> Self {
        Self {
            event_bus,
            registries,
            memory,
            agents,
            constitutional_gate: RwLock::new(Arc::new(DefaultConstitutionalGate::new())),
            executions: DashMap::new(),
            decisions_made: AtomicU64::new(0),
            decisions_rejected: AtomicU64::new(0),
            decisions_delegated: AtomicU64::new(0),
            plans_replanned: AtomicU64::new(0),
        }
    }

    /// Replace the constitutional gate at runtime (e.g. to wire a remote
    /// Governor service).
    pub fn set_constitutional_gate(&self, gate: Arc<dyn ConstitutionalGate>) {
        let mut g = self.constitutional_gate.write();
        *g = gate;
    }

    /// Wire the Cortex to the event bus: subscribe to
    /// `brain.decision.requested` so external callers can drive the Cortex
    /// purely via events. The returned subscription ID can be used to
    /// unsubscribe later.
    pub async fn start(self: &Arc<Self>) -> BrainResult<sgtx_brain_core::SubscriptionId> {
        let handler: Arc<dyn sgtx_brain_core::EventHandler> =
            Arc::new(DecisionRequestHandler {
                cortex: self.clone(),
            });
        let sub_id = self
            .event_bus
            .subscribe(EVT_DECISION_REQUESTED, handler)
            .await?;
        info!(subscription = %sub_id, "cortex subscribed to decision requests");
        Ok(sub_id)
    }

    // ----------------------------------------------------------------------
    // Core decision API
    // ----------------------------------------------------------------------

    /// The core decision-making method.
    ///
    /// Pipeline:
    /// 1. Assemble context from memory + the request's own context.
    /// 2. Select a capability for the goal (or decide to delegate / defer).
    /// 3. Run the constitutional gate over the proposed action.
    /// 4. On `Deny`, reject. On `Conditional`, attach conditions. On `Allow`,
    ///    proceed.
    /// 5. Publish `brain.decision.made`.
    #[instrument(skip(self, request), fields(goal = %request.goal, authority = ?request.authority, priority = ?request.priority))]
    pub async fn decide(&self, request: DecisionRequest) -> BrainResult<Decision> {
        // 1. A5 short-circuit — never even assemble context for forbidden
        //    authority.
        if request.authority == AuthorityLevel::A5 {
            let decision = Decision {
                decision_id: Uuid::new_v4(),
                action: DecisionAction::Reject {
                    reason: "A5 autonomous execution is constitutionally blocked".into(),
                },
                rationale: "Constitutional hard-block on A5".into(),
                assigned_module: None,
                assigned_agent: None,
                conditions: vec![],
                confidence: 1.0,
                created_at: Utc::now(),
            };
            self.decisions_rejected.fetch_add(1, Ordering::Relaxed);
            self.publish_decision_made(&request, &decision).await?;
            return Ok(decision);
        }

        // 2. Context assembly — gather relevant memory.
        let assembled = self.assemble_context(&request).await;

        // 3. Select the proposed action.
        let (proposed_action, assigned_module, confidence) = self
            .propose_action(&request, &assembled)
            .await?;

        // 4. Constitutional gate.
        let gate = self.constitutional_gate.read().clone();
        let evaluation = gate.evaluate(&request, &proposed_action).await?;

        let (final_action, final_confidence, conditions) = match evaluation.verdict {
            ConstitutionalVerdict::Deny => {
                self.decisions_rejected.fetch_add(1, Ordering::Relaxed);
                let action = DecisionAction::Reject {
                    reason: evaluation.rationale.clone(),
                };
                (action, 1.0, vec![])
            }
            ConstitutionalVerdict::Conditional => {
                // If the proposed action is Execute/Delegate and the
                // conditions are unmet, defer until the caller resolves them.
                let any_unmet = evaluation
                    .conditions
                    .iter()
                    .any(|c| c.status == ConditionStatus::Unmet);
                if any_unmet {
                    let action = DecisionAction::Defer {
                        reason: format!(
                            "Constitutional conditions unmet: {}",
                            evaluation
                                .conditions
                                .iter()
                                .filter(|c| c.status == ConditionStatus::Unmet)
                                .map(|c| c.condition_id.as_str())
                                .collect::<Vec<_>>()
                                .join(", ")
                        ),
                    };
                    (action, 0.4, evaluation.conditions)
                } else {
                    (proposed_action, final_confidence_inner(confidence, 0.85), evaluation.conditions)
                }
            }
            ConstitutionalVerdict::Allow => {
                // Count delegates.
                if matches!(final_action_check(&proposed_action), ActionKind::Delegate) {
                    self.decisions_delegated.fetch_add(1, Ordering::Relaxed);
                }
                (proposed_action, final_confidence_inner(confidence, 0.95), evaluation.conditions)
            }
        };

        let decision = Decision {
            decision_id: Uuid::new_v4(),
            action: final_action,
            rationale: evaluation.rationale,
            assigned_module,
            assigned_agent: assigned_agent_of(&request, &self.agents).await,
            conditions,
            confidence: final_confidence.clamp(0.0, 1.0),
            created_at: Utc::now(),
        };

        self.decisions_made.fetch_add(1, Ordering::Relaxed);

        // 5. Publish the decision.
        self.publish_decision_made(&request, &decision).await?;

        Ok(decision)
    }

    // ----------------------------------------------------------------------
    // Planning
    // ----------------------------------------------------------------------

    /// Break a goal into a sequence of dependent [`PlanStep`]s.
    ///
    /// The current implementation uses a keyword-driven planner: it scans the
    /// goal for known capability prefixes and emits one step per capability
    /// plus a final verification step. Real LLM-driven planning can be plugged
    /// in by replacing this method or by subscribing to `brain.plan.requested`
    /// and overriding the result via a `Delegate` action.
    #[instrument(skip(self, constraints), fields(goal = %goal))]
    pub async fn plan_task(
        &self,
        goal: &str,
        constraints: &[Constraint],
    ) -> BrainResult<TaskPlan> {
        let capabilities = self
            .registries
            .capabilities
            .list_capabilities()
            .await
            .unwrap_or_default();

        // Derive required capabilities from goal keywords.
        let mut required: Vec<String> = Vec::new();
        for cap in &capabilities {
            if let Some(prefix) = cap.split('.').next() {
                if goal.to_lowercase().contains(prefix) {
                    required.push(cap.clone());
                }
            }
        }
        // Always include a verification step at the end.
        required.push("workflow.validate".to_string());

        let required_authority = constraints
            .iter()
            .find(|c| c.kind == ConstraintKind::Authority)
            .and_then(|c| {
                c.value
                    .as_str()
                    .and_then(|s| authority_from_str(s))
                    .or_else(|| {
                        serde_json::from_value::<AuthoritySer>(c.value.clone())
                            .ok()
                            .map(|a| a.0)
                    })
            })
            .unwrap_or(AuthorityLevel::A2);

        // Build steps.
        let mut steps: Vec<PlanStep> = Vec::new();
        let mut dependencies: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
        let mut prev_id: Option<Uuid> = None;
        let mut total_timeout: u64 = 0;

        for cap in &required {
            let id = Uuid::new_v4();
            let step = PlanStep {
                id,
                description: format!("Invoke capability `{}` for goal: {}", cap, goal),
                capability: cap.clone(),
                input: serde_json::json!({ "goal": goal }),
                timeout_secs: DEFAULT_STEP_TIMEOUT_SECS,
                retry_policy: RetryPolicy::default(),
            };
            total_timeout = total_timeout.saturating_add(step.timeout_secs);
            if let Some(pid) = prev_id {
                dependencies.insert(id, vec![pid]);
            }
            prev_id = Some(id);
            steps.push(step);
        }

        let plan = TaskPlan {
            plan_id: Uuid::new_v4(),
            goal: goal.to_string(),
            steps,
            dependencies,
            estimated_duration_secs: total_timeout,
            required_capabilities: required,
            required_authority,
        };

        // Record plan in memory for future context assembly.
        let _ = self
            .memory
            .store(MemoryEntry {
                id: format!("plan:{}", plan.plan_id),
                memory_type: MemoryType::Procedural,
                content: serde_json::to_value(&plan).unwrap_or(serde_json::Value::Null),
                embedding: None,
                metadata: HashMap::new(),
                created_at: Utc::now(),
                expires_at: None,
                importance: 0.6,
                source: "cortex".into(),
                lineage: vec!["cortex.plan_task".into()],
            })
            .await;

        Ok(plan)
    }

    /// Pick the best capability for a task description. Returns the highest
    /// priority (lexicographically first) matching capability, falling back to
    /// `workflow.validate` if nothing matches.
    #[instrument(skip(self), fields(task = %task))]
    pub async fn select_capability(&self, task: &str) -> BrainResult<String> {
        let capabilities = self
            .registries
            .capabilities
            .list_capabilities()
            .await
            .map_err(|e| BrainError::Internal(format!("capability list failed: {e}")))?;

        if capabilities.is_empty() {
            return Err(BrainError::CapabilityNotFound(
                "no capabilities registered".into(),
            ));
        }

        // Score each capability by counting keyword matches against the task.
        let task_lower = task.to_lowercase();
        let mut best: Option<(usize, String)> = None;
        for cap in &capabilities {
            let cap_lower = cap.to_lowercase();
            let mut score: usize = 0;
            // exact full match is the strongest signal.
            if task_lower.contains(&cap_lower) {
                score += cap_lower.len() * 2;
            }
            // prefix match (e.g. "compliance" in "compliance.precheck").
            if let Some(prefix) = cap.split('.').next() {
                if task_lower.contains(&prefix.to_lowercase()) {
                    score += prefix.len();
                }
            }
            if score > 0 {
                if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
                    best = Some((score, cap.clone()));
                }
            }
        }

        Ok(best
            .map(|(_, c)| c)
            .unwrap_or_else(|| "workflow.validate".to_string()))
    }

    // ----------------------------------------------------------------------
    // Constraint validation
    // ----------------------------------------------------------------------

    /// Validate a [`TaskPlan`] against request constraints and the
    /// constitution.
    #[instrument(skip(self, plan))]
    pub async fn check_constraints(&self, plan: &TaskPlan) -> BrainResult<ConstraintCheck> {
        let mut violations: Vec<String> = Vec::new();

        // 1. A5 is forbidden for any plan.
        if plan.required_authority == AuthorityLevel::A5 {
            violations.push(
                "Plan requires A5 authority which is constitutionally blocked".into(),
            );
        }

        // 2. Each required capability must resolve to a module.
        for cap in &plan.required_capabilities {
            match self.registries.capabilities.resolve(cap).await {
                Ok(Some(_)) => {}
                Ok(None) => violations.push(format!(
                    "Capability `{}` required by plan is not registered",
                    cap
                )),
                Err(e) => violations.push(format!(
                    "Capability registry error resolving `{}`: {}",
                    cap, e
                )),
            }
        }

        // 3. Dependency graph must be acyclic (topological sort feasibility).
        if has_cycle(&plan.steps, &plan.dependencies) {
            violations.push("Plan dependency graph contains a cycle".into());
        }

        // 4. Every step with a fallback capability must also resolve.
        for step in &plan.steps {
            if let Some(fb) = &step.retry_policy.fallback {
                if let Ok(None) | Err(_) = self.registries.capabilities.resolve(fb).await {
                    violations.push(format!(
                        "Step {} fallback capability `{}` is not registered",
                        step.id, fb
                    ));
                }
            }
        }

        let verdict = if violations.is_empty() {
            ConstitutionalVerdict::Allow
        } else if plan.required_authority == AuthorityLevel::A5 {
            ConstitutionalVerdict::Deny
        } else {
            ConstitutionalVerdict::Conditional
        };

        Ok(ConstraintCheck {
            passed: violations.is_empty(),
            violations,
            constitutional_verdict: verdict,
        })
    }

    // ----------------------------------------------------------------------
    // Supervision
    // ----------------------------------------------------------------------

    /// Register an execution for supervision. Called by the runtime when it
    /// begins executing a plan.
    pub fn register_execution(
        &self,
        execution_id: &str,
        plan: TaskPlan,
        deadline: Option<DateTime<Utc>>,
    ) {
        let now = Utc::now();
        self.executions.insert(
            execution_id.to_string(),
            ExecutionRecord {
                execution_id: execution_id.to_string(),
                plan,
                started_at: now,
                last_updated_at: now,
                completed_step_ids: vec![],
                failed_step_ids: vec![],
                errors: vec![],
                aborted: false,
                deadline,
            },
        );
    }

    /// Mark a step as completed.
    pub fn mark_step_completed(&self, execution_id: &str, step_id: Uuid) -> BrainResult<()> {
        let mut rec = self
            .executions
            .get_mut(execution_id)
            .ok_or_else(|| BrainError::Internal(format!("execution {execution_id} not found")))?;
        if !rec.completed_step_ids.contains(&step_id) {
            rec.completed_step_ids.push(step_id);
        }
        rec.last_updated_at = Utc::now();
        Ok(())
    }

    /// Mark a step as failed. If the step has a fallback capability, the
    /// Cortex emits a `brain.plan.replanned` event and records the failure;
    /// otherwise it records the error.
    pub async fn mark_step_failed(
        &self,
        execution_id: &str,
        step_id: Uuid,
        error: String,
    ) -> BrainResult<()> {
        let plan_clone;
        let has_fallback;
        {
            let mut rec = self
                .executions
                .get_mut(execution_id)
                .ok_or_else(|| BrainError::Internal(format!("execution {execution_id} not found")))?;
            if !rec.failed_step_ids.contains(&step_id) {
                rec.failed_step_ids.push(step_id);
            }
            rec.errors.push(error.clone());
            rec.last_updated_at = Utc::now();
            plan_clone = rec.plan.clone();
            has_fallback = rec
                .plan
                .steps
                .iter()
                .find(|s| s.id == step_id)
                .map(|s| s.retry_policy.fallback.is_some())
                .unwrap_or(false);
        }

        if has_fallback {
            // Dynamic replanning — emit event so the runtime picks up the
            // fallback capability for this step.
            self.plans_replanned.fetch_add(1, Ordering::Relaxed);
            let payload = serde_json::json!({
                "execution_id": execution_id,
                "step_id": step_id,
                "fallback_for": plan_clone.steps.iter().find(|s| s.id == step_id).map(|s| s.capability.clone()),
                "reason": error,
            });
            self.event_bus
                .publish(make_event(
                    EVT_PLAN_REPLANNED,
                    execution_id,
                    payload,
                    "cortex",
                ))
                .await?;
        }
        Ok(())
    }

    /// Mark an execution as aborted (e.g. caller cancelled, or supervision
    /// aborted).
    pub fn abort_execution(&self, execution_id: &str, reason: &str) -> BrainResult<()> {
        let mut rec = self
            .executions
            .get_mut(execution_id)
            .ok_or_else(|| BrainError::Internal(format!("execution {execution_id} not found")))?;
        rec.aborted = true;
        rec.errors.push(format!("aborted: {reason}"));
        rec.last_updated_at = Utc::now();
        Ok(())
    }

    /// Snapshot an execution's supervision state.
    #[instrument(skip(self), fields(execution_id = %execution_id))]
    pub async fn supervise(&self, execution_id: &str) -> BrainResult<SupervisionReport> {
        let rec = self
            .executions
            .get(execution_id)
            .ok_or_else(|| BrainError::Internal(format!("execution {execution_id} not found")))?
            .clone();

        let total = rec.plan.steps.len();
        let completed = rec.completed_step_ids.len();
        let now = Utc::now();

        let status = if rec.aborted {
            SupervisionStatus::Aborted
        } else if completed == total && total > 0 {
            SupervisionStatus::Completed
        } else if !rec.errors.is_empty()
            && rec.failed_step_ids.len() as f64 / total.max(1) as f64 > 0.5
        {
            SupervisionStatus::Failing
        } else if rec.deadline.map(|d| now > d).unwrap_or(false) {
            SupervisionStatus::Delayed
        } else {
            SupervisionStatus::OnTrack
        };

        let mut recommendations: Vec<String> = Vec::new();
        match status {
            SupervisionStatus::Failing => {
                recommendations.push(
                    "More than 50% of steps failed — consider aborting and replanning".into(),
                );
            }
            SupervisionStatus::Delayed => {
                recommendations.push(
                    "Deadline exceeded — escalate to a human reviewer or extend the deadline"
                        .into(),
                );
            }
            SupervisionStatus::Aborted => {
                recommendations.push("Execution aborted — emit compensating events".into());
            }
            SupervisionStatus::OnTrack if completed > 0 && completed < total => {
                recommendations.push(format!(
                    "On track: {}/{} steps complete — continue",
                    completed, total
                ));
            }
            SupervisionStatus::Completed => {
                recommendations.push("Execution completed — record feedback".into());
            }
            _ => {}
        }

        let report = SupervisionReport {
            execution_id: execution_id.to_string(),
            status,
            steps_completed: completed,
            steps_total: total,
            errors: rec.errors.clone(),
            recommendations,
        };

        // Publish supervision tick.
        let payload = serde_json::to_value(&report).unwrap_or(serde_json::Value::Null);
        let _ = self
            .event_bus
            .publish(make_event(
                EVT_EXECUTION_SUPERVISED,
                execution_id,
                payload,
                "cortex",
            ))
            .await;

        Ok(report)
    }

    // ----------------------------------------------------------------------
    // Observability
    // ----------------------------------------------------------------------

    pub fn metrics(&self) -> CortexMetrics {
        CortexMetrics {
            decisions_made: self.decisions_made.load(Ordering::Relaxed),
            decisions_rejected: self.decisions_rejected.load(Ordering::Relaxed),
            decisions_delegated: self.decisions_delegated.load(Ordering::Relaxed),
            plans_replanned: self.plans_replanned.load(Ordering::Relaxed),
            executions_in_flight: self.executions.len() as u64,
        }
    }

    // ----------------------------------------------------------------------
    // Internal helpers
    // ----------------------------------------------------------------------

    /// Assemble context for a decision by querying semantic + procedural
    /// memory with the goal as the semantic query. Always returns a JSON
    /// object (never null).
    #[instrument(skip(self, request))]
    async fn assemble_context(&self, request: &DecisionRequest) -> serde_json::Value {
        let query = MemoryQuery {
            memory_types: vec![
                MemoryType::Semantic,
                MemoryType::Procedural,
                MemoryType::Episodic,
                MemoryType::Trade,
            ],
            semantic: Some(request.goal.clone()),
            embedding: None,
            top_k: 5,
            min_importance: Some(0.3),
            filters: HashMap::new(),
        };

        let mem = self.memory.search(&query).await.unwrap_or_default();

        serde_json::json!({
            "request": request.context,
            "relevant_memories": mem.iter().map(|m| {
                serde_json::json!({
                    "id": m.id,
                    "type": format!("{:?}", m.memory_type),
                    "importance": m.importance,
                    "content": m.content,
                })
            }).collect::<Vec<_>>(),
            "assembled_at": Utc::now(),
        })
    }

    /// Propose the action to take for a request. Returns
    /// `(action, assigned_module, confidence)`.
    ///
    /// Selection logic:
    /// - If `request.context.delegated_agent` is set, delegate.
    /// - Else, attempt to select a capability. If found, Execute.
    /// - Else, escalate (no capability available).
    #[instrument(skip(self, request, context))]
    async fn propose_action(
        &self,
        request: &DecisionRequest,
        context: &serde_json::Value,
    ) -> BrainResult<(DecisionAction, Option<String>, f64)> {
        // 1. Explicit delegation?
        if let Some(agent_id) = context
            .get("delegated_agent")
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok())
        {
            return Ok((
                DecisionAction::Delegate {
                    agent_id,
                    task: request.goal.clone(),
                },
                None,
                0.7,
            ));
        }

        // 2. Capability selection.
        match self.select_capability(&request.goal).await {
            Ok(cap) => {
                let module_id = self
                    .registries
                    .capabilities
                    .resolve(&cap)
                    .await
                    .ok()
                    .flatten();
                let input = serde_json::json!({
                    "goal": request.goal,
                    "context": request.context,
                });
                let confidence = if module_id.is_some() { 0.85 } else { 0.5 };
                Ok((
                    DecisionAction::Execute {
                        capability: cap,
                        input,
                    },
                    module_id,
                    confidence,
                ))
            }
            Err(e) => {
                warn!(error = %e, "capability selection failed — escalating");
                Ok((
                    DecisionAction::Escalate {
                        reason: format!("No capability available for goal: {}", request.goal),
                    },
                    None,
                    0.3,
                ))
            }
        }
    }

    /// Publish the `brain.decision.made` event for a decision.
    async fn publish_decision_made(
        &self,
        request: &DecisionRequest,
        decision: &Decision,
    ) -> BrainResult<()> {
        let payload = serde_json::json!({
            "request": request,
            "decision": decision,
        });
        self.event_bus
            .publish(make_event(
                EVT_DECISION_MADE,
                &decision.decision_id.to_string(),
                payload,
                "cortex",
            ))
            .await
            .map_err(|e| {
                error!(error = %e, "failed to publish brain.decision.made");
                e
            })
    }

    /// Drop an execution from supervision tracking. Returns true if it
    /// existed.
    pub fn forget_execution(&self, execution_id: &str) -> bool {
        self.executions.remove(execution_id).is_some()
    }
}

// ============================================================================
// BrainModule impl — the Cortex is itself a BrainModule so it can be
// registered with the kernel / health manager.
// ============================================================================

impl ExecutiveCortex {
    /// Descriptor for the Cortex module.
    pub fn descriptor() -> ModuleDescriptor {
        ModuleDescriptor {
            id: "cortex".into(),
            name: "Executive Cortex".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            module_type: ModuleType::Manager,
            authority: AuthorityLevel::A4,
            description:
                "Global decision-maker. Plans tasks, selects capabilities, validates \
                 against the constitution, and supervises executions. Never executes work."
                    .into(),
            capabilities: vec![
                "cortex.decide".into(),
                "cortex.plan".into(),
                "cortex.select-capability".into(),
                "cortex.check-constraints".into(),
                "cortex.supervise".into(),
            ],
            subscriptions: vec![EVT_DECISION_REQUESTED.into()],
            dependencies: vec![
                "capability-registry".into(),
                "memory".into(),
                "agents".into(),
                "event-bus".into(),
            ],
        }
    }
}

#[async_trait]
impl BrainModule for ExecutiveCortex {
    fn descriptor(&self) -> &ModuleDescriptor {
        static DESC: once_cell::sync::OnceCell<ModuleDescriptor> = once_cell::sync::OnceCell::new();
        DESC.get_or_init(ExecutiveCortex::descriptor)
    }

    async fn initialize(&self) -> BrainResult<()> {
        info!("executive cortex initialized");
        Ok(())
    }

    async fn shutdown(&self) -> BrainResult<()> {
        info!(in_flight = self.executions.len(), "executive cortex shutting down");
        Ok(())
    }

    async fn health_check(&self) -> BrainResult<HealthCheck> {
        Ok(HealthCheck {
            status: HealthStatus::Healthy,
            latency_ms: 1.0,
            details: Some(serde_json::to_value(self.metrics()).unwrap_or(serde_json::Value::Null)),
            checked_at: Utc::now(),
        })
    }

    fn status(&self) -> ModuleStatus {
        ModuleStatus::Active
    }
}

// ============================================================================
// Event handler wiring — receives `brain.decision.requested` events and
// dispatches them to `ExecutiveCortex::decide`.
// ============================================================================

/// Event handler that bridges `brain.decision.requested` events into
/// [`ExecutiveCortex::decide`].
pub struct DecisionRequestHandler {
    pub cortex: Arc<ExecutiveCortex>,
}

#[async_trait]
impl sgtx_brain_core::EventHandler for DecisionRequestHandler {
    #[instrument(skip(self, event), fields(event_type = %event.event_type))]
    async fn handle(&self, event: &BrainEvent) -> BrainResult<()> {
        // Parse the request from the event payload.
        let request: DecisionRequest = match serde_json::from_value(event.payload.clone()) {
            Ok(r) => r,
            Err(e) => {
                warn!(error = %e, "decision request payload invalid — ignoring");
                return Err(BrainError::Serialization(format!(
                    "invalid DecisionRequest payload: {e}"
                )));
            }
        };

        // Priority scheduling: Critical/High decisions are dispatched
        // immediately; lower priorities are deferred briefly so the runtime
        // can batch them. Here we just dispatch — the runtime may wrap this
        // handler in a priority queue.
        match request.priority {
            TaskPriority::Critical | TaskPriority::High => {
                let _ = self.cortex.decide(request).await?;
            }
            TaskPriority::Normal => {
                let _ = self.cortex.decide(request).await?;
            }
            TaskPriority::Low => {
                // Yield once to let higher-priority work run.
                tokio::task::yield_now().await;
                let _ = self.cortex.decide(request).await?;
            }
        }
        Ok(())
    }
}

// ============================================================================
// Free helpers + small utilities
// ============================================================================

/// Construct a [`BrainEvent`] with sensible metadata.
pub fn make_event(
    event_type: impl Into<String>,
    aggregate_id: impl Into<String>,
    payload: serde_json::Value,
    source: impl Into<String>,
) -> BrainEvent {
    BrainEvent {
        id: Uuid::new_v4(),
        event_type: event_type.into(),
        aggregate_id: aggregate_id.into(),
        payload,
        metadata: EventMetadata {
            source: source.into(),
            correlation_id: None,
            causation_id: None,
            timestamp: Utc::now(),
            version: "1".into(),
            tenant_gtid: None,
        },
    }
}

/// Observability snapshot of Cortex activity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CortexMetrics {
    pub decisions_made: u64,
    pub decisions_rejected: u64,
    pub decisions_delegated: u64,
    pub plans_replanned: u64,
    pub executions_in_flight: u64,
}

/// Cycle detection over the plan's dependency graph (DFS).
fn has_cycle(steps: &[PlanStep], deps: &HashMap<Uuid, Vec<Uuid>>) -> bool {
    use std::collections::HashSet;
    let mut visited: HashSet<Uuid> = HashSet::new();
    let mut stack: HashSet<Uuid> = HashSet::new();

    fn dfs(
        node: Uuid,
        steps: &[PlanStep],
        deps: &HashMap<Uuid, Vec<Uuid>>,
        visited: &mut HashSet<Uuid>,
        stack: &mut HashSet<Uuid>,
    ) -> bool {
        if stack.contains(&node) {
            return true;
        }
        if visited.contains(&node) {
            return false;
        }
        visited.insert(node);
        stack.insert(node);
        if let Some(deps_for) = deps.get(&node) {
            for d in deps_for {
                if !steps.iter().any(|s| s.id == *d) {
                    continue; // dangling dep — skip
                }
                if dfs(*d, steps, deps, visited, stack) {
                    return true;
                }
            }
        }
        stack.remove(&node);
        false
    }

    for s in steps {
        if dfs(s.id, steps, deps, &mut visited, &mut stack) {
            return true;
        }
    }
    false
}

/// Final confidence blend: take the proposed confidence, scaled by a
/// constitutional multiplier (0..1).
fn final_confidence_inner(proposed: f64, multiplier: f64) -> f64 {
    proposed * multiplier
}

enum ActionKind {
    Delegate,
    Other,
}
fn final_action_check(a: &DecisionAction) -> ActionKind {
    match a {
        DecisionAction::Delegate { .. } => ActionKind::Delegate,
        _ => ActionKind::Other,
    }
}

/// Helper: derive the assigned agent. If the request explicitly nominated a
/// delegated agent and the action is `Delegate`, return it; otherwise `None`.
async fn assigned_agent_of(_request: &DecisionRequest, _agents: &Arc<dyn AgentRuntime>) -> Option<AgentId> {
    // The agent ID is encoded inside the Delegate variant of `action`, which
    // we don't have here; callers consuming the `brain.decision.made` event
    // read it from `decision.action` directly. This helper exists so the
    // top-level `Decision` struct's `assigned_agent` field can be populated
    // in a future refinement without changing the public API.
    None
}

/// Parse an authority level from a string label.
fn authority_from_str(s: &str) -> Option<AuthorityLevel> {
    match s.to_ascii_uppercase().as_str() {
        "A0" => Some(AuthorityLevel::A0),
        "A1" => Some(AuthorityLevel::A1),
        "A2" => Some(AuthorityLevel::A2),
        "A3" => Some(AuthorityLevel::A3),
        "A4" => Some(AuthorityLevel::A4),
        "A5" => Some(AuthorityLevel::A5),
        _ => None,
    }
}

/// Wrapper for deserializing an AuthorityLevel from a JSON value like
/// {"level": "A2"} or "A2".
#[derive(Deserialize)]
struct AuthoritySer(AuthorityLevel);

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use sgtx_brain_core::{AgentDescriptor, AgentStatus, EventHandler, ModuleId};
    use std::sync::atomic::AtomicUsize;

    // ---- Stubs for the dependencies ----

    struct StubEventBus {
        published: Arc<parking_lot::Mutex<Vec<BrainEvent>>>,
        sub_count: AtomicUsize,
    }
    impl StubEventBus {
        fn new() -> (Arc<Self>, Arc<parking_lot::Mutex<Vec<BrainEvent>>>) {
            let published = Arc::new(parking_lot::Mutex::new(Vec::new()));
            (
                Arc::new(Self {
                    published: published.clone(),
                    sub_count: AtomicUsize::new(0),
                }),
                published,
            )
        }
    }
    #[async_trait]
    impl EventBus for StubEventBus {
        async fn publish(&self, event: BrainEvent) -> BrainResult<()> {
            self.published.lock().push(event);
            Ok(())
        }
        async fn subscribe(
            &self,
            _event_type: &str,
            _handler: Arc<dyn sgtx_brain_core::EventHandler>,
        ) -> BrainResult<sgtx_brain_core::SubscriptionId> {
            self.sub_count.fetch_add(1, Ordering::SeqCst);
            Ok(Uuid::new_v4())
        }
        async fn unsubscribe(&self, _id: sgtx_brain_core::SubscriptionId) -> BrainResult<()> {
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

    struct StubCapabilityRegistry {
        caps: parking_lot::RwLock<HashMap<String, String>>,
    }
    impl StubCapabilityRegistry {
        fn new() -> Self {
            let mut caps = HashMap::new();
            caps.insert("compliance.precheck".into(), "compliance-mod".into());
            caps.insert("workflow.validate".into(), "workflow-mod".into());
            caps.insert("market.analyze".into(), "market-mod".into());
            Self {
                caps: parking_lot::RwLock::new(caps),
            }
        }
    }
    #[async_trait]
    impl CapabilityRegistry for StubCapabilityRegistry {
        async fn register_capability(&self, _name: &str, _module_id: &str) -> BrainResult<()> {
            Ok(())
        }
        async fn resolve(&self, capability: &str) -> BrainResult<Option<ModuleId>> {
            Ok(self.caps.read().get(capability).cloned())
        }
        async fn list_capabilities(&self) -> BrainResult<Vec<String>> {
            Ok(self.caps.read().keys().cloned().collect())
        }
        async fn list_by_module(&self, _module_id: &str) -> BrainResult<Vec<String>> {
            Ok(vec![])
        }
    }

    struct StubMemory;
    #[async_trait]
    impl MemoryStore for StubMemory {
        async fn store(&self, _memory: MemoryEntry) -> BrainResult<()> {
            Ok(())
        }
        async fn retrieve(&self, _id: &str) -> BrainResult<Option<MemoryEntry>> {
            Ok(None)
        }
        async fn search(&self, _query: &MemoryQuery) -> BrainResult<Vec<MemoryEntry>> {
            Ok(vec![])
        }
        async fn expire(&self, _before: DateTime<Utc>) -> BrainResult<usize> {
            Ok(0)
        }
        async fn consolidate(&self) -> BrainResult<usize> {
            Ok(0)
        }
    }

    struct StubAgentRuntime;
    #[async_trait]
    impl AgentRuntime for StubAgentRuntime {
        async fn spawn(&self, _descriptor: AgentDescriptor) -> BrainResult<AgentId> {
            Ok(Uuid::new_v4())
        }
        async fn terminate(&self, _id: AgentId) -> BrainResult<()> {
            Ok(())
        }
        async fn send_message(&self, _msg: sgtx_brain_core::AgentMessage) -> BrainResult<()> {
            Ok(())
        }
        async fn get_state(&self, id: AgentId) -> BrainResult<sgtx_brain_core::AgentState> {
            Ok(sgtx_brain_core::AgentState {
                id,
                status: AgentStatus::Idle,
                current_task: None,
                memory_ref: None,
                last_active: Utc::now(),
            })
        }
        async fn list_agents(&self) -> BrainResult<Vec<AgentDescriptor>> {
            Ok(vec![])
        }
    }

    fn build_cortex() -> (Arc<ExecutiveCortex>, Arc<parking_lot::Mutex<Vec<BrainEvent>>>) {
        let (bus, published) = StubEventBus::new();
        let registries = Registries::new(Arc::new(StubCapabilityRegistry::new()));
        let cortex = Arc::new(ExecutiveCortex::new(
            bus as Arc<dyn EventBus>,
            registries,
            Arc::new(StubMemory) as Arc<dyn MemoryStore>,
            Arc::new(StubAgentRuntime) as Arc<dyn AgentRuntime>,
        ));
        (cortex, published)
    }

    #[tokio::test]
    async fn a5_is_rejected() {
        let (cortex, published) = build_cortex();
        let req = DecisionRequest {
            goal: "do something autonomous".into(),
            context: serde_json::json!({}),
            authority: AuthorityLevel::A5,
            constraints: vec![],
            priority: TaskPriority::Critical,
            deadline: None,
        };
        let decision = cortex.decide(req).await.unwrap();
        assert!(matches!(decision.action, DecisionAction::Reject { .. }));
        assert_eq!(decision.confidence, 1.0);
        // Event published.
        let evs = published.lock();
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].event_type, EVT_DECISION_MADE);
    }

    #[tokio::test]
    async fn a4_without_human_in_loop_is_deferred() {
        let (cortex, _published) = build_cortex();
        let req = DecisionRequest {
            goal: "compliance.precheck a trade".into(),
            context: serde_json::json!({}),
            authority: AuthorityLevel::A4,
            constraints: vec![],
            priority: TaskPriority::High,
            deadline: None,
        };
        let decision = cortex.decide(req).await.unwrap();
        assert!(matches!(decision.action, DecisionAction::Defer { .. }));
    }

    #[tokio::test]
    async fn a4_with_human_in_loop_executes() {
        let (cortex, _published) = build_cortex();
        let req = DecisionRequest {
            goal: "compliance.precheck a trade".into(),
            context: serde_json::json!({ "human_in_loop": true }),
            authority: AuthorityLevel::A4,
            constraints: vec![],
            priority: TaskPriority::High,
            deadline: None,
        };
        let decision = cortex.decide(req).await.unwrap();
        assert!(matches!(decision.action, DecisionAction::Execute { .. }));
    }

    #[tokio::test]
    async fn plan_task_builds_steps() {
        let (cortex, _published) = build_cortex();
        let plan = cortex
            .plan_task("compliance check the trade", &[])
            .await
            .unwrap();
        assert!(!plan.steps.is_empty());
        // Last step is verification.
        assert_eq!(plan.steps.last().unwrap().capability, "workflow.validate");
    }

    #[tokio::test]
    async fn check_constraints_detects_missing_capability() {
        let (cortex, _published) = build_cortex();
        let plan = TaskPlan {
            plan_id: Uuid::new_v4(),
            goal: "test".into(),
            steps: vec![PlanStep {
                id: Uuid::new_v4(),
                description: "step1".into(),
                capability: "nonexistent.cap".into(),
                input: serde_json::json!({}),
                timeout_secs: 10,
                retry_policy: RetryPolicy::default(),
            }],
            dependencies: HashMap::new(),
            estimated_duration_secs: 10,
            required_capabilities: vec!["nonexistent.cap".into()],
            required_authority: AuthorityLevel::A2,
        };
        let check = cortex.check_constraints(&plan).await.unwrap();
        assert!(!check.passed);
        assert!(!check.violations.is_empty());
    }

    #[tokio::test]
    async fn select_capability_falls_back_to_workflow_validate() {
        let (cortex, _published) = build_cortex();
        let cap = cortex.select_capability("garbage goal").await.unwrap();
        assert_eq!(cap, "workflow.validate");
    }

    #[tokio::test]
    async fn supervise_reports_on_track_for_empty_plan() {
        let (cortex, _published) = build_cortex();
        let plan = TaskPlan {
            plan_id: Uuid::new_v4(),
            goal: "g".into(),
            steps: vec![],
            dependencies: HashMap::new(),
            estimated_duration_secs: 0,
            required_capabilities: vec![],
            required_authority: AuthorityLevel::A2,
        };
        cortex.register_execution("exec1", plan, None);
        let report = cortex.supervise("exec1").await.unwrap();
        assert_eq!(report.status, SupervisionStatus::OnTrack);
    }

    #[tokio::test]
    async fn supervise_reports_completed_after_all_steps() {
        let (cortex, _published) = build_cortex();
        let s1 = Uuid::new_v4();
        let s2 = Uuid::new_v4();
        let plan = TaskPlan {
            plan_id: Uuid::new_v4(),
            goal: "g".into(),
            steps: vec![
                PlanStep {
                    id: s1,
                    description: "s1".into(),
                    capability: "workflow.validate".into(),
                    input: serde_json::json!({}),
                    timeout_secs: 10,
                    retry_policy: RetryPolicy::default(),
                },
                PlanStep {
                    id: s2,
                    description: "s2".into(),
                    capability: "workflow.validate".into(),
                    input: serde_json::json!({}),
                    timeout_secs: 10,
                    retry_policy: RetryPolicy::default(),
                },
            ],
            dependencies: HashMap::new(),
            estimated_duration_secs: 20,
            required_capabilities: vec!["workflow.validate".into()],
            required_authority: AuthorityLevel::A2,
        };
        cortex.register_execution("exec2", plan, None);
        cortex.mark_step_completed("exec2", s1).unwrap();
        cortex.mark_step_completed("exec2", s2).unwrap();
        let report = cortex.supervise("exec2").await.unwrap();
        assert_eq!(report.status, SupervisionStatus::Completed);
        assert_eq!(report.steps_completed, 2);
    }

    #[tokio::test]
    async fn mark_step_failed_emits_replan_when_fallback_present() {
        let (cortex, published) = build_cortex();
        let s1 = Uuid::new_v4();
        let plan = TaskPlan {
            plan_id: Uuid::new_v4(),
            goal: "g".into(),
            steps: vec![PlanStep {
                id: s1,
                description: "s1".into(),
                capability: "compliance.precheck".into(),
                input: serde_json::json!({}),
                timeout_secs: 10,
                retry_policy: RetryPolicy {
                    max_attempts: 1,
                    backoff_ms: 10,
                    fallback: Some("workflow.validate".into()),
                },
            }],
            dependencies: HashMap::new(),
            estimated_duration_secs: 10,
            required_capabilities: vec!["compliance.precheck".into()],
            required_authority: AuthorityLevel::A2,
        };
        cortex.register_execution("exec3", plan, None);
        cortex
            .mark_step_failed("exec3", s1, "transient error".into())
            .await
            .unwrap();
        let evs = published.lock();
        assert!(
            evs.iter()
                .any(|e| e.event_type == EVT_PLAN_REPLANNED),
            "expected brain.plan.replanned event"
        );
    }

    #[tokio::test]
    async fn descriptor_static_descriptor_is_consistent() {
        let (cortex, _published) = build_cortex();
        let d1 = cortex.descriptor();
        let d2 = cortex.descriptor();
        assert_eq!(d1.id, d2.id);
        assert_eq!(d1.id, "cortex");
    }

    #[tokio::test]
    async fn brain_module_health_check_succeeds() {
        let (cortex, _published) = build_cortex();
        let hc = cortex.health_check().await.unwrap();
        assert_eq!(hc.status, HealthStatus::Healthy);
    }

    #[tokio::test]
    async fn event_handler_routes_request_to_decide() {
        let (cortex, published) = build_cortex();
        let handler = DecisionRequestHandler { cortex: cortex.clone() };
        let req = DecisionRequest {
            goal: "compliance.precheck".into(),
            context: serde_json::json!({}),
            authority: AuthorityLevel::A2,
            constraints: vec![],
            priority: TaskPriority::Normal,
            deadline: None,
        };
        let event = BrainEvent {
            id: Uuid::new_v4(),
            event_type: EVT_DECISION_REQUESTED.into(),
            aggregate_id: "agg".into(),
            payload: serde_json::to_value(&req).unwrap(),
            metadata: EventMetadata {
                source: "test".into(),
                correlation_id: None,
                causation_id: None,
                timestamp: Utc::now(),
                version: "1".into(),
                tenant_gtid: None,
            },
        };
        handler.handle(&event).await.unwrap();
        let evs = published.lock();
        assert!(evs.iter().any(|e| e.event_type == EVT_DECISION_MADE));
    }
}
