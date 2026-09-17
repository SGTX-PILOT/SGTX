// SGTX Brain Core — Error Types

use thiserror::Error;

#[derive(Debug, Error)]
pub enum BrainError {
    #[error("Module not found: {0}")]
    ModuleNotFound(String),

    #[error("Module already registered: {0}")]
    ModuleAlreadyRegistered(String),

    #[error("Module initialization failed: {0}")]
    ModuleInitFailed(String),

    #[error("Capability not found: {0}")]
    CapabilityNotFound(String),

    #[error("Constitutional violation: {0}")]
    ConstitutionalViolation(String),

    #[error("Authority level {0} not permitted for this action")]
    AuthorityDenied(String),

    #[error("A5 FORBIDDEN: autonomous execution blocked")]
    A5Forbidden,

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Event bus error: {0}")]
    EventBus(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Agent error: {0}")]
    Agent(String),

    #[error("Memory error: {0}")]
    Memory(String),

    #[error("Knowledge graph error: {0}")]
    KnowledgeGraph(String),

    #[error("Health check failed: {0}")]
    HealthCheck(String),

    #[error("Task scheduling error: {0}")]
    TaskScheduling(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<serde_json::Error> for BrainError {
    fn from(e: serde_json::Error) -> Self {
        BrainError::Serialization(e.to_string())
    }
}

impl From<tokio::task::JoinError> for BrainError {
    fn from(e: tokio::task::JoinError) -> Self {
        BrainError::Internal(e.to_string())
    }
}

impl From<anyhow::Error> for BrainError {
    fn from(e: anyhow::Error) -> Self {
        BrainError::Internal(e.to_string())
    }
}

pub type BrainResult<T> = Result<T, BrainError>;
