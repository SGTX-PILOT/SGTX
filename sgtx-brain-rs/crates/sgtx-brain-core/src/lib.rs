// SGTX Brain Core — The foundation crate
// Every other crate depends on this. Contains shared types, traits, and errors.

pub mod error;
pub mod traits;
pub mod types;

pub use error::{BrainError, BrainResult};
pub use traits::*;
pub use types::*;

// Re-export commonly used crates
pub use async_trait;
pub use chrono;
pub use serde;
pub use serde_json;
pub use uuid;
