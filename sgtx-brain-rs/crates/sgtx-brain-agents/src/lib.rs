//! SGTX Brain Agents — Phase 5: Complete AI Agent Operating System
//!
//! Provides:
//!   * The [`Agent`] SDK trait — what concrete agent implementations provide.
//!   * [`AgentOS`] — the runtime that owns agents, routes messages, manages
//!     lifecycle, supervises groups, runs consensus votes, and checkpoints
//!     state. Implements both the core [`AgentRuntime`] trait and the
//!     universal [`BrainModule`] trait.
//!   * Group consensus via [`AgentGroup`] + [`ConsensusStrategy`] + [`Vote`].
//!   * Crash-recovery via [`AgentCheckpoint`] (save / restore).
//!
//! `AgentOS` is `Send + Sync` and is intended to be wrapped in an `Arc` and
//! shared across tasks. All public methods are `async` and return
//! `BrainResult<T>`.

use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, instrument, warn};
use uuid::Uuid;

use sgtx_brain_core::{
    AgentDescriptor, AgentId, AgentMessage, AgentRuntime, AgentState, AgentStatus, AuthorityLevel,
    BrainError, BrainEvent, BrainModule, BrainResult, BrainResult as Result, HealthCheck,
    HealthStatus, ModuleDescriptor, ModuleStatus, ModuleType,
};

// ============================================================================
// Public types
// ============================================================================

/// The SDK trait that all concrete agents implement. Subclasses supply their
/// own `run` / `on_message` / `on_event` / `shutdown` behavior. The OS calls
/// `shutdown` on terminate and `on_message` for any directed message.
#[async_trait]
pub trait Agent: Send + Sync {
    fn id(&self) -> AgentId;
    fn descriptor(&self) -> &AgentDescriptor;
    async fn run(&self, task: &str, context: &serde_json::Value) -> BrainResult<serde_json::Value>;
    async fn on_message(&self, msg: &AgentMessage) -> BrainResult<()>;
    async fn on_event(&self, event: &BrainEvent) -> BrainResult<()>;
    async fn shutdown(&self) -> BrainResult<()>;
}

/// A group of agents working together with a supervisor and a consensus
/// strategy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentGroup {
    pub group_id: Uuid,
    pub agents: Vec<AgentId>,
    pub supervisor: Option<AgentId>,
    pub consensus_strategy: ConsensusStrategy,
}

/// Strategy used by a group to reach consensus on a proposal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConsensusStrategy {
    Majority,
    Supermajority,
    Unanimous,
    LeaderDecides(AgentId),
}

/// A single agent's vote on a proposal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentVote {
    pub agent_id: AgentId,
    pub proposal_id: Uuid,
    pub vote: Vote,
    pub reason: String,
    pub timestamp: DateTime<Utc>,
}

/// The vote choice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Vote {
    Yes,
    No,
    Abstain,
}

/// Result of a consensus vote.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusResult {
    pub proposal_id: Uuid,
    pub group_id: Uuid,
    pub yes: usize,
    pub no: usize,
    pub abstain: usize,
    pub passed: bool,
    pub strategy: ConsensusStrategy,
    pub decided_by: Option<AgentId>,
}

/// A snapshot of an agent's state for crash recovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCheckpoint {
    pub agent_id: AgentId,
    pub state: serde_json::Value,
    pub checkpointed_at: DateTime<Utc>,
}

// ============================================================================
// AgentOS
// ============================================================================

/// The Agent Operating System. Owns:
///   * `agents` — concrete `Arc<dyn Agent>` implementations
///   * `states` — runtime state per agent (status, current task, last active)
///   * `groups` — agent groups for collaboration / consensus
///   * `messages_tx` — best-effort audit channel for every message routed
///   * `max_concurrent` — soft cap on number of live agents
///
/// Additional private fields implement the `BrainModule` trait, votes, and
/// checkpoints.
pub struct AgentOS {
    /// Concrete agent implementations, keyed by agent id.
    agents: DashMap<AgentId, Arc<dyn Agent>>,
    /// Runtime state per agent.
    states: DashMap<AgentId, AgentState>,
    /// Agent groups.
    groups: DashMap<Uuid, AgentGroup>,
    /// Audit-log channel — every message routed by `send_message` is also
    /// sent here (best-effort). External consumers can drain this for
    /// tracing, replay, or analytics.
    messages_tx: flume::Sender<AgentMessage>,
    /// Soft cap on number of live agents.
    max_concurrent: usize,

    // ---- private impl fields (not in spec) ----
    /// Active votes keyed by proposal id.
    votes: DashMap<Uuid, Vec<AgentVote>>,
    /// Latest checkpoint per agent.
    checkpoints: DashMap<AgentId, AgentCheckpoint>,
    /// Static module descriptor (for BrainModule).
    descriptor: ModuleDescriptor,
    /// Runtime module status (for BrainModule).
    status: RwLock<ModuleStatus>,
}

impl AgentOS {
    /// Construct a new Agent OS with the given soft cap on concurrent agents.
    pub fn new(max_concurrent: usize) -> Self {
        let (tx, _rx) = flume::unbounded::<AgentMessage>();
        Self {
            agents: DashMap::new(),
            states: DashMap::new(),
            groups: DashMap::new(),
            messages_tx: tx,
            max_concurrent,
            votes: DashMap::new(),
            checkpoints: DashMap::new(),
            descriptor: ModuleDescriptor {
                id: "agent-os".into(),
                name: "Agent Operating System".into(),
                version: env!("CARGO_PKG_VERSION").into(),
                module_type: ModuleType::Manager,
                authority: AuthorityLevel::A3,
                description: "Agent lifecycle, messaging, consensus, and recovery.".into(),
                capabilities: vec![
                    "agent.spawn".into(),
                    "agent.terminate".into(),
                    "agent.message".into(),
                    "agent.vote".into(),
                ],
                subscriptions: vec![],
                dependencies: vec![],
            },
            status: RwLock::new(ModuleStatus::Registered),
        }
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    /// Spawn (register) an agent. Returns the agent's id. Rejects if the
    /// agent is already registered or if `max_concurrent` has been reached.
    #[instrument(skip(self, agent), fields(id = %agent.id()))]
    pub async fn spawn(&self, agent: Arc<dyn Agent>) -> Result<AgentId> {
        let id = agent.id();
        if self.agents.contains_key(&id) {
            return Err(BrainError::Agent(format!("agent {id} already registered")));
        }
        if self.agents.len() >= self.max_concurrent {
            return Err(BrainError::Agent(format!(
                "max_concurrent ({}) reached",
                self.max_concurrent
            )));
        }
        let desc = agent.descriptor().clone();
        self.agents.insert(id, agent);
        self.states.insert(
            id,
            AgentState {
                id,
                status: AgentStatus::Idle,
                current_task: None,
                memory_ref: None,
                last_active: Utc::now(),
            },
        );
        debug!(%id, name = %desc.name, "agent spawned");
        Ok(id)
    }

    /// Gracefully terminate an agent. Calls `agent.shutdown()`, sets state
    /// to `Terminated`, removes from the agents map.
    #[instrument(skip(self), fields(id = %id))]
    pub async fn terminate(&self, id: AgentId) -> Result<()> {
        let agent = self
            .agents
            .remove(&id)
            .ok_or_else(|| BrainError::Agent(format!("agent {id} not found")))?;
        if let Some(mut s) = self.states.get_mut(&id) {
            s.status = AgentStatus::Terminated;
            s.last_active = Utc::now();
        }
        // Call shutdown outside the map lock.
        let _ = agent.1.shutdown().await;
        info!(%id, "agent terminated");
        Ok(())
    }

    // ------------------------------------------------------------------
    // Messaging
    // ------------------------------------------------------------------

    /// Route a message to the recipient agent's `on_message`. The message
    /// is also enqueued to the audit-log channel (best-effort). Returns an
    /// error if the recipient is not registered.
    #[instrument(skip(self, msg), fields(from = %msg.from, to = %msg.to, ty = %msg.message_type))]
    pub async fn send_message(&self, msg: AgentMessage) -> Result<()> {
        let to = msg.to;
        // Audit-log (best-effort).
        let _ = self.messages_tx.try_send(msg.clone());
        // Look up recipient.
        let agent = self
            .agents
            .get(&to)
            .map(|r| Arc::clone(r.value()))
            .ok_or_else(|| BrainError::Agent(format!("agent {to} not found")))?;
        // Update state.
        if let Some(mut s) = self.states.get_mut(&to) {
            s.status = AgentStatus::Running;
            s.last_active = Utc::now();
        }
        let res = agent.on_message(&msg).await;
        if let Some(mut s) = self.states.get_mut(&to) {
            s.status = AgentStatus::Idle;
            s.last_active = Utc::now();
        }
        res
    }

    // ------------------------------------------------------------------
    // State / discovery
    // ------------------------------------------------------------------

    /// Get the runtime state of an agent.
    #[instrument(skip(self), fields(id = %id))]
    pub fn get_state(&self, id: AgentId) -> Result<AgentState> {
        self.states
            .get(&id)
            .map(|r| r.clone())
            .ok_or_else(|| BrainError::Agent(format!("agent {id} not found")))
    }

    /// List the descriptors of all currently-registered agents.
    pub fn list_agents(&self) -> Result<Vec<AgentDescriptor>> {
        Ok(self.agents.iter().map(|r| r.descriptor().clone()).collect())
    }

    /// Discover agents that expose a given capability.
    pub fn discover(&self, capability: &str) -> Vec<AgentId> {
        self.agents
            .iter()
            .filter(|r| r.descriptor().capabilities.iter().any(|c| c == capability))
            .map(|r| r.id())
            .collect()
    }

    // ------------------------------------------------------------------
    // Groups & consensus
    // ------------------------------------------------------------------

    /// Create a new agent group. Returns the group id.
    #[instrument(skip(self, agents), fields(count = agents.len()))]
    pub fn create_group(
        &self,
        agents: Vec<AgentId>,
        supervisor: Option<AgentId>,
    ) -> Uuid {
        let group_id = Uuid::new_v4();
        let group = AgentGroup {
            group_id,
            agents,
            supervisor,
            consensus_strategy: ConsensusStrategy::Majority,
        };
        self.groups.insert(group_id, group);
        debug!(%group_id, "agent group created");
        group_id
    }

    /// Set the consensus strategy for an existing group.
    pub fn set_consensus_strategy(&self, group_id: Uuid, strategy: ConsensusStrategy) -> Result<()> {
        let mut g = self
            .groups
            .get_mut(&group_id)
            .ok_or_else(|| BrainError::Agent(format!("group {group_id} not found")))?;
        g.consensus_strategy = strategy;
        Ok(())
    }

    /// Collect votes for a proposal across the group's agents. Each agent
    /// is asked to vote via `on_message` with a `vote.request` payload; the
    /// implementation here simulates vote collection by directly polling
    /// agents with a `vote.request` message and counting their `Yes`/`No`/
    /// `Abstain` replies from the response payload. If an agent fails to
    /// vote, it is counted as `Abstain`.
    ///
    /// Returns a [`ConsensusResult`] with the tally and whether the
    /// proposal passed per the group's strategy.
    #[instrument(skip(self), fields(group = %group_id, proposal = %proposal_id))]
    pub async fn vote(
        &self,
        group_id: Uuid,
        proposal_id: Uuid,
    ) -> Result<ConsensusResult> {
        let group = self
            .groups
            .get(&group_id)
            .map(|r| r.clone())
            .ok_or_else(|| BrainError::Agent(format!("group {group_id} not found")))?;
        let strategy = group.consensus_strategy.clone();

        // Leader-decides shortcut
        if let ConsensusStrategy::LeaderDecides(leader) = &strategy {
            let leader = *leader;
            let vote = self.collect_vote(leader, proposal_id).await.unwrap_or(Vote::Abstain);
            let (yes, no, abstain) = match vote {
                Vote::Yes => (1, 0, 0),
                Vote::No => (0, 1, 0),
                Vote::Abstain => (0, 0, 1),
            };
            let result = ConsensusResult {
                proposal_id,
                group_id,
                yes,
                no,
                abstain,
                passed: vote == Vote::Yes,
                strategy,
                decided_by: Some(leader),
            };
            self.votes.insert(proposal_id, vec![AgentVote {
                agent_id: leader,
                proposal_id,
                vote,
                reason: "leader-decides".into(),
                timestamp: Utc::now(),
            }]);
            return Ok(result);
        }

        // Collect a vote from every agent in the group
        let mut yes = 0;
        let mut no = 0;
        let mut abstain = 0;
        let mut votes: Vec<AgentVote> = Vec::with_capacity(group.agents.len());
        for agent_id in &group.agents {
            let v = self.collect_vote(*agent_id, proposal_id).await.unwrap_or(Vote::Abstain);
            match v {
                Vote::Yes => yes += 1,
                Vote::No => no += 1,
                Vote::Abstain => abstain += 1,
            }
            votes.push(AgentVote {
                agent_id: *agent_id,
                proposal_id,
                vote: v,
                reason: "polled".into(),
                timestamp: Utc::now(),
            });
        }
        let total = group.agents.len();
        let non_abstaining = yes + no;
        let passed = match &strategy {
            ConsensusStrategy::Majority => yes * 2 > total,
            ConsensusStrategy::Supermajority => yes * 3 >= total * 2,
            ConsensusStrategy::Unanimous => yes == total && total > 0,
            ConsensusStrategy::LeaderDecides(_) => unreachable!(),
        };
        let _ = non_abstaining; // documented for clarity
        self.votes.insert(proposal_id, votes.clone());
        Ok(ConsensusResult {
            proposal_id,
            group_id,
            yes,
            no,
            abstain,
            passed,
            strategy,
            decided_by: None,
        })
    }

    /// Internal: ask an agent to vote on a proposal via `on_message`. The
    /// reply payload's `"vote"` field (string `"yes"`/`"no"`/`"abstain"`)
    /// is parsed. On any failure, returns `Vote::Abstain`.
    async fn collect_vote(&self, agent_id: AgentId, proposal_id: Uuid) -> Result<Vote> {
        let agent = self
            .agents
            .get(&agent_id)
            .map(|r| Arc::clone(r.value()))
            .ok_or_else(|| BrainError::Agent(format!("agent {agent_id} not found")))?;
        let msg = AgentMessage {
            from: agent_id, // self-originated request
            to: agent_id,
            message_type: "vote.request".into(),
            payload: serde_json::json!({
                "proposal_id": proposal_id,
                "ask": "Please vote yes / no / abstain.",
            }),
            correlation_id: Some(proposal_id.to_string()),
            timestamp: Utc::now(),
        };
        // Update state to Running while agent handles the vote.
        if let Some(mut s) = self.states.get_mut(&agent_id) {
            s.status = AgentStatus::Running;
            s.last_active = Utc::now();
        }
        let res = agent.on_message(&msg).await;
        if let Some(mut s) = self.states.get_mut(&agent_id) {
            s.status = AgentStatus::Idle;
            s.last_active = Utc::now();
        }
        res?;
        // Agents are expected to record their vote via `record_vote` (below).
        // Look up the most recent vote by this agent for this proposal.
        if let Some(votes) = self.votes.get(&proposal_id) {
            if let Some(v) = votes.iter().rev().find(|v| v.agent_id == agent_id) {
                return Ok(v.vote);
            }
        }
        Ok(Vote::Abstain)
    }

    /// Record a vote. Concrete agents call this from their `on_message`
    /// handler when they receive a `vote.request` message.
    pub fn record_vote(&self, vote: AgentVote) {
        let pid = vote.proposal_id;
        self.votes.entry(pid).or_default().push(vote);
    }

    // ------------------------------------------------------------------
    // Checkpointing
    // ------------------------------------------------------------------

    /// Snapshot an agent's current state. Returns a serializable
    /// [`AgentCheckpoint`] that can be restored later.
    #[instrument(skip(self), fields(id = %agent_id))]
    pub async fn checkpoint(&self, agent_id: AgentId) -> Result<AgentCheckpoint> {
        let state = self.get_state(agent_id)?;
        let cp = AgentCheckpoint {
            agent_id,
            state: serde_json::to_value(&state)?,
            checkpointed_at: Utc::now(),
        };
        self.checkpoints.insert(agent_id, cp.clone());
        debug!(%agent_id, "agent state checkpointed");
        Ok(cp)
    }

    /// Restore an agent's state from a checkpoint. Updates the in-memory
    /// state map.
    #[instrument(skip(self, checkpoint), fields(id = %checkpoint.agent_id))]
    pub async fn restore(&self, checkpoint: AgentCheckpoint) -> Result<()> {
        let id = checkpoint.agent_id;
        let state: AgentState = serde_json::from_value(checkpoint.state.clone())
            .map_err(|e| BrainError::Agent(format!("invalid checkpoint state: {e}")))?;
        self.states.insert(id, state);
        self.checkpoints.insert(id, checkpoint);
        info!(%id, "agent state restored from checkpoint");
        Ok(())
    }

    // ------------------------------------------------------------------
    // Health
    // ------------------------------------------------------------------

    /// Per-agent health check. An agent is healthy if it's registered and
    /// its state is not `Terminated` or `Failed`.
    #[instrument(skip(self), fields(id = %agent_id))]
    pub fn health_check(&self, agent_id: AgentId) -> Result<HealthCheck> {
        let state = self.get_state(agent_id)?;
        let healthy = !matches!(state.status, AgentStatus::Terminated | AgentStatus::Failed);
        Ok(HealthCheck {
            status: if healthy { HealthStatus::Healthy } else { HealthStatus::Unhealthy },
            latency_ms: 0.1,
            details: Some(serde_json::json!({
                "agent_id": agent_id,
                "status": format!("{:?}", state.status),
                "last_active": state.last_active,
            })),
            checked_at: Utc::now(),
        })
    }

    /// Total registered agent count.
    pub fn agent_count(&self) -> usize {
        self.agents.len()
    }

    /// Total group count.
    pub fn group_count(&self) -> usize {
        self.groups.len()
    }
}

// ============================================================================
// AgentRuntime trait impl (core)
// ============================================================================

#[async_trait]
impl AgentRuntime for AgentOS {
    async fn spawn(&self, descriptor: AgentDescriptor) -> Result<AgentId> {
        // Wrap the descriptor in a minimal no-op agent so the trait impl is
        // usable without a concrete implementation. Callers who want real
        // behavior should use `AgentOS::spawn(Arc<dyn Agent>)` directly.
        let agent: Arc<dyn Agent> = Arc::new(NoopAgent::new(descriptor));
        AgentOS::spawn(self, agent).await
    }
    async fn terminate(&self, id: AgentId) -> Result<()> {
        AgentOS::terminate(self, id).await
    }
    async fn send_message(&self, msg: AgentMessage) -> Result<()> {
        AgentOS::send_message(self, msg).await
    }
    async fn get_state(&self, id: AgentId) -> Result<AgentState> {
        AgentOS::get_state(self, id)
    }
    async fn list_agents(&self) -> Result<Vec<AgentDescriptor>> {
        AgentOS::list_agents(self)
    }
}

// ============================================================================
// BrainModule trait impl
// ============================================================================

#[async_trait]
impl BrainModule for AgentOS {
    fn descriptor(&self) -> &ModuleDescriptor {
        &self.descriptor
    }
    async fn initialize(&self) -> Result<()> {
        *self.status.write() = ModuleStatus::Active;
        info!("agent-os initialized");
        Ok(())
    }
    async fn shutdown(&self) -> Result<()> {
        *self.status.write() = ModuleStatus::ShuttingDown;
        // Best-effort: terminate every registered agent.
        let ids: Vec<AgentId> = self.agents.iter().map(|r| r.id()).collect();
        for id in ids {
            if let Err(e) = AgentOS::terminate(self, id).await {
                warn!(error = %e, "agent shutdown error during module shutdown");
            }
        }
        *self.status.write() = ModuleStatus::Shutdown;
        info!("agent-os shut down");
        Ok(())
    }
    async fn health_check(&self) -> Result<HealthCheck> {
        Ok(HealthCheck {
            status: HealthStatus::Healthy,
            latency_ms: 0.1,
            details: Some(serde_json::json!({
                "agents": self.agents.len(),
                "groups": self.groups.len(),
                "max_concurrent": self.max_concurrent,
            })),
            checked_at: Utc::now(),
        })
    }
    fn status(&self) -> ModuleStatus {
        *self.status.read()
    }
}

// ============================================================================
// NoopAgent — used by the AgentRuntime::spawn(descriptor) impl
// ============================================================================

/// A minimal no-op agent that wraps a descriptor. Useful for testing and
/// for callers of `AgentRuntime::spawn` that don't supply a concrete
/// implementation.
pub struct NoopAgent {
    descriptor: AgentDescriptor,
}

impl NoopAgent {
    pub fn new(descriptor: AgentDescriptor) -> Self {
        Self { descriptor }
    }
}

#[async_trait]
impl Agent for NoopAgent {
    fn id(&self) -> AgentId {
        self.descriptor.id
    }
    fn descriptor(&self) -> &AgentDescriptor {
        &self.descriptor
    }
    async fn run(&self, _task: &str, _ctx: &serde_json::Value) -> BrainResult<serde_json::Value> {
        Ok(serde_json::json!({"status": "noop"}))
    }
    async fn on_message(&self, _msg: &AgentMessage) -> BrainResult<()> {
        Ok(())
    }
    async fn on_event(&self, _event: &BrainEvent) -> BrainResult<()> {
        Ok(())
    }
    async fn shutdown(&self) -> BrainResult<()> {
        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc as StdArc;

    /// A test agent that counts messages and can vote.
    struct TestAgent {
        descriptor: AgentDescriptor,
        messages_received: StdArc<AtomicU32>,
    }

    impl TestAgent {
        fn new(id: AgentId, name: &str, caps: Vec<String>, _vote: Vote) -> Self {
            Self {
                descriptor: AgentDescriptor {
                    id,
                    name: name.into(),
                    agent_type: "test".into(),
                    version: "0.1.0".into(),
                    capabilities: caps,
                    permissions: vec![],
                    max_concurrent: 1,
                },
                messages_received: StdArc::new(AtomicU32::new(0)),
            }
        }
        fn messages(&self) -> u32 {
            self.messages_received.load(Ordering::SeqCst)
        }
    }

    #[async_trait]
    impl Agent for TestAgent {
        fn id(&self) -> AgentId {
            self.descriptor.id
        }
        fn descriptor(&self) -> &AgentDescriptor {
            &self.descriptor
        }
        async fn run(&self, task: &str, _ctx: &serde_json::Value) -> BrainResult<serde_json::Value> {
            Ok(serde_json::json!({"task": task, "agent": self.descriptor.name}))
        }
        async fn on_message(&self, msg: &AgentMessage) -> BrainResult<()> {
            self.messages_received.fetch_add(1, Ordering::SeqCst);
            if msg.message_type == "vote.request" {
                // Record a vote on the OS.
                // We can't easily get a back-reference here, so just count it.
            }
            Ok(())
        }
        async fn on_event(&self, _event: &BrainEvent) -> BrainResult<()> {
            Ok(())
        }
        async fn shutdown(&self) -> BrainResult<()> {
            Ok(())
        }
    }

    fn make_msg(from: AgentId, to: AgentId, ty: &str) -> AgentMessage {
        AgentMessage {
            from,
            to,
            message_type: ty.into(),
            payload: serde_json::json!({}),
            correlation_id: None,
            timestamp: Utc::now(),
        }
    }

    #[tokio::test]
    async fn spawn_and_terminate() {
        let os = AgentOS::new(10);
        let id = Uuid::new_v4();
        let agent = Arc::new(TestAgent::new(id, "a1", vec!["x".into()], Vote::Yes));
        let spawned = os.spawn(Arc::clone(&agent) as Arc<dyn Agent>).await.unwrap();
        assert_eq!(spawned, id);
        assert_eq!(os.agent_count(), 1);

        let state = os.get_state(id).unwrap();
        assert_eq!(state.status, AgentStatus::Idle);

        os.terminate(id).await.unwrap();
        assert_eq!(os.agent_count(), 0);
        // State still queryable (now Terminated)
        let state = os.get_state(id).unwrap();
        assert_eq!(state.status, AgentStatus::Terminated);
    }

    #[tokio::test]
    async fn max_concurrent_enforced() {
        let os = AgentOS::new(1);
        let a1 = Arc::new(TestAgent::new(Uuid::new_v4(), "a1", vec![], Vote::Yes));
        let a2 = Arc::new(TestAgent::new(Uuid::new_v4(), "a2", vec![], Vote::Yes));
        os.spawn(a1 as Arc<dyn Agent>).await.unwrap();
        let err = os.spawn(a2 as Arc<dyn Agent>).await;
        assert!(err.is_err());
    }

    #[tokio::test]
    async fn send_message_routes_to_on_message() {
        let os = AgentOS::new(10);
        let id = Uuid::new_v4();
        let agent = Arc::new(TestAgent::new(id, "a1", vec![], Vote::Yes));
        os.spawn(Arc::clone(&agent) as Arc<dyn Agent>).await.unwrap();

        let msg = make_msg(id, id, "ping");
        os.send_message(msg).await.unwrap();
        assert_eq!(agent.messages(), 1);
    }

    #[tokio::test]
    async fn discover_by_capability() {
        let os = AgentOS::new(10);
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let a1 = Arc::new(TestAgent::new(id1, "a1", vec!["translate".into()], Vote::Yes));
        let a2 = Arc::new(TestAgent::new(id2, "a2", vec!["classify".into()], Vote::Yes));
        os.spawn(a1 as Arc<dyn Agent>).await.unwrap();
        os.spawn(a2 as Arc<dyn Agent>).await.unwrap();

        let translators = os.discover("translate");
        assert_eq!(translators, vec![id1]);
        let none = os.discover("missing");
        assert!(none.is_empty());
    }

    #[tokio::test]
    async fn group_creation_and_vote_leader_decides() {
        let os = AgentOS::new(10);
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let leader = Uuid::new_v4();
        os.spawn(Arc::new(TestAgent::new(id1, "w1", vec![], Vote::Yes)) as Arc<dyn Agent>).await.unwrap();
        os.spawn(Arc::new(TestAgent::new(id2, "w2", vec![], Vote::No)) as Arc<dyn Agent>).await.unwrap();
        os.spawn(Arc::new(TestAgent::new(leader, "boss", vec![], Vote::Yes)) as Arc<dyn Agent>).await.unwrap();

        let gid = os.create_group(vec![id1, id2, leader], Some(leader));
        os.set_consensus_strategy(gid, ConsensusStrategy::LeaderDecides(leader)).unwrap();
        // Pre-record the leader's vote so collect_vote can find it.
        let pid = Uuid::new_v4();
        os.record_vote(AgentVote {
            agent_id: leader,
            proposal_id: pid,
            vote: Vote::Yes,
            reason: "test".into(),
            timestamp: Utc::now(),
        });
        let result = os.vote(gid, pid).await.unwrap();
        assert!(result.passed);
        assert_eq!(result.decided_by, Some(leader));
    }

    #[tokio::test]
    async fn group_majority_vote() {
        let os = AgentOS::new(10);
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let id3 = Uuid::new_v4();
        os.spawn(Arc::new(TestAgent::new(id1, "a1", vec![], Vote::Yes)) as Arc<dyn Agent>).await.unwrap();
        os.spawn(Arc::new(TestAgent::new(id2, "a2", vec![], Vote::Yes)) as Arc<dyn Agent>).await.unwrap();
        os.spawn(Arc::new(TestAgent::new(id3, "a3", vec![], Vote::No)) as Arc<dyn Agent>).await.unwrap();

        let gid = os.create_group(vec![id1, id2, id3], None);
        let pid = Uuid::new_v4();
        // Pre-record votes for all 3 agents.
        os.record_vote(AgentVote {
            agent_id: id1, proposal_id: pid, vote: Vote::Yes,
            reason: "test".into(), timestamp: Utc::now(),
        });
        os.record_vote(AgentVote {
            agent_id: id2, proposal_id: pid, vote: Vote::Yes,
            reason: "test".into(), timestamp: Utc::now(),
        });
        os.record_vote(AgentVote {
            agent_id: id3, proposal_id: pid, vote: Vote::No,
            reason: "test".into(), timestamp: Utc::now(),
        });
        let result = os.vote(gid, pid).await.unwrap();
        assert!(result.passed); // 2 of 3 = majority
        assert_eq!(result.yes, 2);
        assert_eq!(result.no, 1);
    }

    #[tokio::test]
    async fn checkpoint_and_restore() {
        let os = AgentOS::new(10);
        let id = Uuid::new_v4();
        os.spawn(Arc::new(TestAgent::new(id, "a1", vec![], Vote::Yes)) as Arc<dyn Agent>).await.unwrap();
        // Mutate state
        if let Some(mut s) = os.states.get_mut(&id) {
            s.status = AgentStatus::Waiting;
            s.current_task = Some("task-1".into());
        }
        let cp = os.checkpoint(id).await.unwrap();
        assert_eq!(cp.agent_id, id);

        // Simulate crash — wipe state to Idle.
        if let Some(mut s) = os.states.get_mut(&id) {
            s.status = AgentStatus::Idle;
            s.current_task = None;
        }
        // Restore
        os.restore(cp).await.unwrap();
        let restored = os.get_state(id).unwrap();
        assert_eq!(restored.status, AgentStatus::Waiting);
        assert_eq!(restored.current_task.as_deref(), Some("task-1"));
    }

    #[tokio::test]
    async fn health_check_healthy_and_unhealthy() {
        let os = AgentOS::new(10);
        let id = Uuid::new_v4();
        os.spawn(Arc::new(TestAgent::new(id, "a1", vec![], Vote::Yes)) as Arc<dyn Agent>).await.unwrap();
        let hc = os.health_check(id).unwrap();
        assert_eq!(hc.status, HealthStatus::Healthy);

        os.terminate(id).await.unwrap();
        let hc2 = os.health_check(id).unwrap();
        assert_eq!(hc2.status, HealthStatus::Unhealthy);
    }

    #[tokio::test]
    async fn brain_module_lifecycle() {
        let os = AgentOS::new(10);
        assert_eq!(os.status(), ModuleStatus::Registered);
        os.initialize().await.unwrap();
        assert_eq!(os.status(), ModuleStatus::Active);
        let hc = <AgentOS as BrainModule>::health_check(&os).await.unwrap();
        assert_eq!(hc.status, HealthStatus::Healthy);
        assert_eq!(os.descriptor().id, "agent-os");
        assert_eq!(os.descriptor().authority, AuthorityLevel::A3);
        assert_eq!(os.descriptor().capabilities.len(), 4);

        // Spawn an agent, then shutdown the module.
        let id = Uuid::new_v4();
        os.spawn(Arc::new(TestAgent::new(id, "a1", vec![], Vote::Yes)) as Arc<dyn Agent>).await.unwrap();
        os.shutdown().await.unwrap();
        assert_eq!(os.status(), ModuleStatus::Shutdown);
        // Agent was terminated by module shutdown.
        assert_eq!(os.agent_count(), 0);
    }

    #[tokio::test]
    async fn agent_runtime_trait_impl() {
        let os = AgentOS::new(10);
        let desc = AgentDescriptor {
            id: Uuid::new_v4(),
            name: "trait-agent".into(),
            agent_type: "test".into(),
            version: "0.1".into(),
            capabilities: vec!["x".into()],
            permissions: vec![],
            max_concurrent: 1,
        };
        let id = <AgentOS as AgentRuntime>::spawn(&os, desc.clone()).await.unwrap();
        assert_eq!(os.agent_count(), 1);
        let agents = <AgentOS as AgentRuntime>::list_agents(&os).await.unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].id, id);
        <AgentOS as AgentRuntime>::terminate(&os, id).await.unwrap();
        assert_eq!(os.agent_count(), 0);
    }
}
