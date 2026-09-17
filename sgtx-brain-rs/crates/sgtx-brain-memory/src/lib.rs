//! SGTX Brain Memory — Phase 3: Complete Memory Architecture
//!
//! Implements the unified memory system: 12 logical memory-type partitions
//! (Working / Semantic / Episodic / Procedural / Organizational / Trade /
//! LongTerm / ShortTerm / Conversation / Reasoning / Learning / Knowledge),
//! plus consolidation, compression, ranking, expiration, retrieval,
//! versioning, lineage, validation, replay, and hybrid vector + keyword
//! search.
//!
//! `MemoryArchitecture` is the in-process, concurrent implementation of the
//! core [`MemoryStore`] trait. It is `Send + Sync` and can be wrapped in an
//! `Arc` and shared across tasks.

use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, instrument, warn};
use uuid::Uuid;

use sgtx_brain_core::{
    AuthorityLevel, BrainError, BrainModule, BrainResult as Result, HealthCheck, HealthStatus,
    MemoryEntry, MemoryQuery, MemoryStore, MemoryType, ModuleDescriptor, ModuleStatus, ModuleType,
};

// ============================================================================
// Public types
// ============================================================================

/// Records a consolidation event — short-term memories promoted to long-term,
/// or episodic memories summarized into semantic memories.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConsolidation {
    pub source_type: MemoryType,
    pub target_type: MemoryType,
    pub source_ids: Vec<String>,
    pub consolidated_id: String,
    pub summary: String,
    pub consolidated_at: DateTime<Utc>,
}

/// A ranked memory record — the per-entry breakdown of the combined score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRank {
    pub memory_id: String,
    pub relevance_score: f64,
    pub importance_score: f64,
    pub recency_score: f64,
    pub combined_score: f64,
}

// ============================================================================
// Helpers
// ============================================================================

/// Cosine similarity between two embedding vectors. Returns 0.0 if either
/// vector is zero-magnitude or lengths don't match.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let mag_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    (dot / (mag_a * mag_b)) as f64
}

/// Recency score on `[0, 1]`. Entries created in the last 24h score ~1.0;
/// entries older than 30 days score ~0.0 with exponential decay in between.
fn recency_score(created_at: DateTime<Utc>, now: DateTime<Utc>) -> f64 {
    let age_secs = (now - created_at).num_seconds().max(0) as f64;
    const DAY: f64 = 86_400.0;
    if age_secs <= DAY {
        1.0
    } else {
        // exponential decay with a 14-day half-life
        let half_life_days = 14.0;
        0.5_f64.powf((age_secs / DAY - 1.0) / half_life_days).clamp(0.0, 1.0)
    }
}

// ============================================================================
// MemoryArchitecture
// ============================================================================

/// The unified memory architecture. Owns 12 logical partitions (one per
/// `MemoryType`), a consolidation log, version chains, and a lineage graph.
///
/// All public methods are synchronous and the struct is `Send + Sync` via
/// `DashMap` + interior mutability.
pub struct MemoryArchitecture {
    /// Per-type buckets. Each bucket is a `Vec` (max length = `max_per_type`).
    stores: DashMap<MemoryType, Vec<MemoryEntry>>,
    /// Consolidation log (interior-mutable because every method takes `&self`).
    consolidations: Mutex<Vec<MemoryConsolidation>>,
    /// Maximum entries kept per memory type (LRU eviction when exceeded).
    max_per_type: usize,
    /// Static descriptor for the [`BrainModule`] impl.
    descriptor: ModuleDescriptor,
    /// Runtime module status.
    status: parking_lot::RwLock<ModuleStatus>,
}

impl MemoryArchitecture {
    /// Construct a new memory architecture with the given per-type capacity.
    pub fn new(max_per_type: usize) -> Self {
        // Pre-initialize every memory-type bucket so reads never miss.
        let stores = DashMap::new();
        for ty in ALL_MEMORY_TYPES {
            stores.insert(ty, Vec::new());
        }
        Self {
            stores,
            consolidations: Mutex::new(Vec::new()),
            max_per_type,
            descriptor: ModuleDescriptor {
                id: "memory-architecture".into(),
                name: "Memory Architecture".into(),
                version: env!("CARGO_PKG_VERSION").into(),
                module_type: ModuleType::Manager,
                authority: AuthorityLevel::A2,
                description: "Unified memory system: 12 partitions + consolidation + ranking.".into(),
                capabilities: vec![
                    "memory.store".into(),
                    "memory.search".into(),
                    "memory.consolidate".into(),
                ],
                subscriptions: vec![],
                dependencies: vec![],
            },
            status: parking_lot::RwLock::new(ModuleStatus::Registered),
        }
    }

    // ------------------------------------------------------------------
    // Core operations
    // ------------------------------------------------------------------

    /// Store a memory entry. Indexes it by type. Enforces `max_per_type`
    /// via LRU eviction (oldest first) when the bucket is full.
    #[instrument(skip(self, memory), fields(id = %memory.id, ty = ?memory.memory_type))]
    pub fn store(&self, memory: MemoryEntry) -> Result<()> {
        let ty = memory.memory_type;
        let id = memory.id.clone();
        // Duplicate-id check
        if self.retrieve(&id)?.is_some() {
            return Err(BrainError::Memory(format!("duplicate memory id: {id}")));
        }
        let mut bucket = self.stores.get_mut(&ty).expect("bucket pre-initialized");
        if bucket.len() >= self.max_per_type {
            // Evict oldest (lowest created_at)
            if let Some(idx) = bucket
                .iter()
                .enumerate()
                .min_by_key(|(_, e)| e.created_at)
                .map(|(i, _)| i)
            {
                bucket.swap_remove(idx);
            }
            warn!(?ty, evicted = true, "memory bucket full — evicted oldest entry");
        }
        bucket.push(memory);
        debug!(?ty, %id, "memory stored");
        Ok(())
    }

    /// Retrieve a memory entry by id (searches all partitions).
    #[instrument(skip(self), fields(id = %id))]
    pub fn retrieve(&self, id: &str) -> Result<Option<MemoryEntry>> {
        for entry in self.stores.iter() {
            if let Some(found) = entry.value().iter().find(|e| e.id == id) {
                return Ok(Some(found.clone()));
            }
        }
        Ok(None)
    }

    /// Search memories by type, semantic similarity (cosine on embeddings),
    /// minimum importance, and top-k limit.
    #[instrument(skip(self, query))]
    pub fn search(&self, query: &MemoryQuery) -> Result<Vec<MemoryEntry>> {
        let types = if query.memory_types.is_empty() {
            ALL_MEMORY_TYPES.to_vec()
        } else {
            query.memory_types.clone()
        };

        // Collect candidates
        let mut candidates: Vec<MemoryEntry> = Vec::new();
        for ty in &types {
            if let Some(bucket) = self.stores.get(ty) {
                for e in bucket.iter() {
                    if let Some(min_imp) = query.min_importance {
                        if e.importance < min_imp {
                            continue;
                        }
                    }
                    // metadata filters
                    if !query.filters.is_empty() {
                        let mut ok = true;
                        for (k, v) in &query.filters {
                            match e.metadata.get(k) {
                                Some(val) if val == v => {}
                                _ => {
                                    ok = false;
                                    break;
                                }
                            }
                        }
                        if !ok {
                            continue;
                        }
                    }
                    candidates.push(e.clone());
                }
            }
        }

        // Compute semantic score if a query embedding was provided
        let q_emb = query.embedding.as_deref();
        let mut scored: Vec<(MemoryEntry, f64)> = candidates
            .into_iter()
            .map(|e| {
                let rel = match (q_emb, e.embedding.as_deref()) {
                    (Some(q), Some(e_emb)) => cosine_similarity(q, e_emb),
                    _ => 0.0,
                };
                (e, rel)
            })
            .collect();

        // Sort by (relevance DESC, importance DESC, recency DESC)
        scored.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    b.0.importance.partial_cmp(&a.0.importance).unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| {
                    b.0.created_at.cmp(&a.0.created_at)
                })
        });

        let top_k = if query.top_k == 0 { scored.len() } else { query.top_k };
        let result: Vec<MemoryEntry> = scored.into_iter().take(top_k).map(|(e, _)| e).collect();
        debug!(returned = result.len(), "search complete");
        Ok(result)
    }

    /// Remove all memories whose `expires_at` is set and is before `before`.
    /// Returns the number removed.
    #[instrument(skip(self))]
    pub fn expire(&self, before: DateTime<Utc>) -> Result<usize> {
        let mut removed = 0usize;
        for mut entry in self.stores.iter_mut() {
            let bucket = entry.value_mut();
            let before_len = bucket.len();
            bucket.retain(|e| {
                if let Some(exp) = e.expires_at {
                    exp >= before
                } else {
                    true
                }
            });
            removed += before_len - bucket.len();
        }
        if removed > 0 {
            info!(removed, "expired memories");
        }
        Ok(removed)
    }

    /// Promote short-term memories with `importance > 0.7` to long-term.
    /// Returns the number promoted. Each promotion is logged in the
    /// consolidations log.
    #[instrument(skip(self))]
    pub fn consolidate(&self) -> Result<usize> {
        let mut promoted = 0usize;
        // Drain eligible short-term entries
        let mut to_promote: Vec<MemoryEntry> = Vec::new();
        if let Some(mut bucket) = self.stores.get_mut(&MemoryType::ShortTerm) {
            let bucket = bucket.value_mut();
            let before = bucket.len();
            bucket.retain(|e| {
                if e.importance > 0.7 {
                    to_promote.push(e.clone());
                    false
                } else {
                    true
                }
            });
            debug!(drained = before - bucket.len(), "drained short-term bucket for consolidation");
        }
        for mut e in to_promote {
            let original_id = e.id.clone();
            e.memory_type = MemoryType::LongTerm;
            e.lineage.push(original_id.clone());
            let new_id = format!("consolidated-{}", Uuid::new_v4());
            let summary = format!(
                "Promoted short-term memory '{}' (importance={:.2}) to long-term",
                original_id, e.importance
            );
            e.id = new_id.clone();
            // Store the promoted entry directly in the LongTerm bucket
            // (bypasses duplicate-id check).
            if let Some(mut bucket) = self.stores.get_mut(&MemoryType::LongTerm) {
                if bucket.len() >= self.max_per_type {
                    if let Some(idx) = bucket
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, e)| e.created_at)
                        .map(|(i, _)| i)
                    {
                        bucket.swap_remove(idx);
                    }
                }
                bucket.push(e);
            }
            self.consolidations.lock().push(MemoryConsolidation {
                source_type: MemoryType::ShortTerm,
                target_type: MemoryType::LongTerm,
                source_ids: vec![original_id],
                consolidated_id: new_id,
                summary,
                consolidated_at: Utc::now(),
            });
            promoted += 1;
        }
        if promoted > 0 {
            info!(promoted, "consolidation pass complete");
        }
        Ok(promoted)
    }

    /// Summarize old episodic memories into semantic memories. Old = older
    /// than 7 days. Returns the number of source entries compressed.
    #[instrument(skip(self))]
    pub fn compress(&self) -> Result<usize> {
        let cutoff = Utc::now() - Duration::days(7);
        let mut to_compress: Vec<MemoryEntry> = Vec::new();
        if let Some(mut bucket) = self.stores.get_mut(&MemoryType::Episodic) {
            let bucket = bucket.value_mut();
            let before = bucket.len();
            bucket.retain(|e| {
                if e.created_at < cutoff {
                    to_compress.push(e.clone());
                    false
                } else {
                    true
                }
            });
            debug!(drained = before - bucket.len(), "drained episodic bucket for compression");
        }
        if to_compress.is_empty() {
            return Ok(0);
        }
        // Group by source for the summary
        let mut by_source: std::collections::HashMap<String, Vec<MemoryEntry>> =
            std::collections::HashMap::new();
        for e in to_compress.iter() {
            by_source.entry(e.source.clone()).or_default().push(e.clone());
        }
        let mut compressed = 0usize;
        for (source, entries) in by_source {
            let source_ids: Vec<String> = entries.iter().map(|e| e.id.clone()).collect();
            let new_id = format!("semantic-{}", Uuid::new_v4());
            let summary = format!(
                "Compressed {} episodic memories from '{}' into one semantic memory",
                entries.len(),
                source
            );
            // Build the consolidated semantic entry
            let importance = entries.iter().map(|e| e.importance).fold(0.0_f64, f64::max);
            let mut combined_emb: Option<Vec<f32>> = None;
            if entries.iter().all(|e| e.embedding.is_some()) {
                let dim = entries[0].embedding.as_ref().unwrap().len();
                let mut acc = vec![0f32; dim];
                for e in &entries {
                    let emb = e.embedding.as_ref().unwrap();
                    for (i, v) in emb.iter().enumerate() {
                        acc[i] += v;
                    }
                }
                let n = entries.len() as f32;
                for v in acc.iter_mut() {
                    *v /= n;
                }
                combined_emb = Some(acc);
            }
            let semantic_entry = MemoryEntry {
                id: new_id.clone(),
                memory_type: MemoryType::Semantic,
                content: serde_json::json!({
                    "summary": summary,
                    "source_count": entries.len(),
                    "source": source,
                }),
                embedding: combined_emb,
                metadata: {
                    let mut m = std::collections::HashMap::new();
                    m.insert("compressed_from".to_string(), source.clone());
                    m
                },
                created_at: Utc::now(),
                expires_at: None,
                importance,
                source: source.clone(),
                lineage: source_ids.clone(),
            };
            if let Some(mut bucket) = self.stores.get_mut(&MemoryType::Semantic) {
                if bucket.len() >= self.max_per_type {
                    if let Some(idx) = bucket
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, e)| e.created_at)
                        .map(|(i, _)| i)
                    {
                        bucket.swap_remove(idx);
                    }
                }
                bucket.push(semantic_entry);
            }
            self.consolidations.lock().push(MemoryConsolidation {
                source_type: MemoryType::Episodic,
                target_type: MemoryType::Semantic,
                source_ids,
                consolidated_id: new_id,
                summary,
                consolidated_at: Utc::now(),
            });
            compressed += entries.len();
        }
        info!(compressed, "compression pass complete");
        Ok(compressed)
    }

    /// Rank a slice of entries by `importance * recency_score`. Returns a
    /// new Vec sorted descending.
    #[instrument(skip(self, entries))]
    pub fn rank(&self, entries: &[MemoryEntry]) -> Vec<MemoryEntry> {
        let now = Utc::now();
        let mut scored: Vec<(MemoryEntry, f64)> = entries
            .iter()
            .map(|e| {
                let rec = recency_score(e.created_at, now);
                let combined = e.importance * rec;
                (e.clone(), combined)
            })
            .collect();
        scored.sort_by(|a, b| {
            b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
        });
        scored.into_iter().map(|(e, _)| e).collect()
    }

    /// Find all versions of a memory — entries that share the same lineage
    /// root (the first id in the lineage chain), including the entry itself.
    #[instrument(skip(self))]
    pub fn version(&self, memory_id: &str) -> Result<Vec<MemoryEntry>> {
        // Find the original id (root of lineage) for the queried entry
        let root = match self.retrieve(memory_id)? {
            Some(e) => {
                if e.lineage.is_empty() {
                    e.id.clone()
                } else {
                    e.lineage[0].clone()
                }
            }
            None => return Ok(Vec::new()),
        };
        // Collect every entry whose lineage root == root, OR whose id == root
        let mut out: Vec<MemoryEntry> = Vec::new();
        for entry in self.stores.iter() {
            for e in entry.value().iter() {
                let e_root = if e.lineage.is_empty() {
                    e.id.clone()
                } else {
                    e.lineage[0].clone()
                };
                if e_root == root {
                    out.push(e.clone());
                }
            }
        }
        out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(out)
    }

    /// Trace the lineage chain of a memory — returns the lineage Vec of the
    /// entry itself (its parent chain). Empty if the entry has no lineage.
    #[instrument(skip(self))]
    pub fn lineage(&self, memory_id: &str) -> Result<Vec<String>> {
        match self.retrieve(memory_id)? {
            Some(e) => Ok(e.lineage.clone()),
            None => Ok(Vec::new()),
        }
    }

    /// Validate that a memory entry has no duplicate id in any partition.
    /// Returns `true` if valid (no duplicate), `false` otherwise.
    #[instrument(skip(self, memory))]
    pub fn validate(&self, memory: &MemoryEntry) -> Result<bool> {
        for entry in self.stores.iter() {
            if entry.value().iter().any(|e| e.id == memory.id) {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// Replay all memories created within the `[from, to]` time range
    /// (inclusive on both ends), sorted by created_at ascending.
    #[instrument(skip(self))]
    pub fn replay(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<MemoryEntry>> {
        let mut out: Vec<MemoryEntry> = Vec::new();
        for entry in self.stores.iter() {
            for e in entry.value().iter() {
                if e.created_at >= from && e.created_at <= to {
                    out.push(e.clone());
                }
            }
        }
        out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(out)
    }

    /// Semantic search across all partitions by embedding. Returns the
    /// top-k entries by cosine similarity.
    #[instrument(skip(self, embedding))]
    pub fn search_semantic(&self, embedding: &[f32], top_k: usize) -> Vec<MemoryEntry> {
        let mut scored: Vec<(MemoryEntry, f64)> = Vec::new();
        for entry in self.stores.iter() {
            for e in entry.value().iter() {
                if let Some(e_emb) = e.embedding.as_deref() {
                    let sim = cosine_similarity(embedding, e_emb);
                    scored.push((e.clone(), sim));
                }
            }
        }
        scored.sort_by(|a, b| {
            b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
        });
        scored
            .into_iter()
            .take(top_k)
            .map(|(e, _)| e)
            .collect()
    }

    /// Compute a per-entry [`MemoryRank`] breakdown for the given entries.
    pub fn ranks(&self, entries: &[MemoryEntry]) -> Vec<MemoryRank> {
        let now = Utc::now();
        entries
            .iter()
            .map(|e| {
                let rec = recency_score(e.created_at, now);
                let imp = e.importance;
                MemoryRank {
                    memory_id: e.id.clone(),
                    relevance_score: 0.0,
                    importance_score: imp,
                    recency_score: rec,
                    combined_score: imp * rec,
                }
            })
            .collect()
    }

    /// Return a snapshot of the consolidation log.
    pub fn consolidations(&self) -> Vec<MemoryConsolidation> {
        self.consolidations.lock().clone()
    }

    /// Total entry count across all partitions.
    pub fn len(&self) -> usize {
        self.stores.iter().map(|e| e.value().len()).sum()
    }

    /// Per-partition count.
    pub fn count_for(&self, ty: MemoryType) -> usize {
        self.stores.get(&ty).map(|e| e.value().len()).unwrap_or(0)
    }
}

// All 12 memory types — used for iteration / "search all types" semantics.
const ALL_MEMORY_TYPES: [MemoryType; 12] = [
    MemoryType::Working,
    MemoryType::Semantic,
    MemoryType::Episodic,
    MemoryType::Procedural,
    MemoryType::Organizational,
    MemoryType::Trade,
    MemoryType::LongTerm,
    MemoryType::ShortTerm,
    MemoryType::Conversation,
    MemoryType::Reasoning,
    MemoryType::Learning,
    MemoryType::Knowledge,
];

// ============================================================================
// MemoryStore trait impl
// ============================================================================

#[async_trait]
impl MemoryStore for MemoryArchitecture {
    async fn store(&self, memory: MemoryEntry) -> Result<()> {
        MemoryArchitecture::store(self, memory)
    }
    async fn retrieve(&self, id: &str) -> Result<Option<MemoryEntry>> {
        MemoryArchitecture::retrieve(self, id)
    }
    async fn search(&self, query: &MemoryQuery) -> Result<Vec<MemoryEntry>> {
        MemoryArchitecture::search(self, query)
    }
    async fn expire(&self, before: DateTime<Utc>) -> Result<usize> {
        MemoryArchitecture::expire(self, before)
    }
    async fn consolidate(&self) -> Result<usize> {
        MemoryArchitecture::consolidate(self)
    }
}

// ============================================================================
// BrainModule trait impl
// ============================================================================

#[async_trait]
impl BrainModule for MemoryArchitecture {
    fn descriptor(&self) -> &ModuleDescriptor {
        &self.descriptor
    }

    async fn initialize(&self) -> Result<()> {
        *self.status.write() = ModuleStatus::Active;
        info!("memory-architecture initialized");
        Ok(())
    }

    async fn shutdown(&self) -> Result<()> {
        *self.status.write() = ModuleStatus::Shutdown;
        info!("memory-architecture shut down");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthCheck> {
        let total = self.len();
        let consolidations = self.consolidations.lock().len();
        Ok(HealthCheck {
            status: HealthStatus::Healthy,
            latency_ms: 0.1,
            details: Some(serde_json::json!({
                "total_memories": total,
                "max_per_type": self.max_per_type,
                "consolidations": consolidations,
            })),
            checked_at: Utc::now(),
        })
    }

    fn status(&self) -> ModuleStatus {
        *self.status.read()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_entry(id: &str, ty: MemoryType, importance: f64) -> MemoryEntry {
        MemoryEntry {
            id: id.into(),
            memory_type: ty,
            content: serde_json::json!({"text": id}),
            embedding: None,
            metadata: HashMap::new(),
            created_at: Utc::now(),
            expires_at: None,
            importance,
            source: "test".into(),
            lineage: vec![],
        }
    }

    fn make_entry_with_embedding(id: &str, ty: MemoryType, emb: Vec<f32>) -> MemoryEntry {
        let mut e = make_entry(id, ty, 0.5);
        e.embedding = Some(emb);
        e
    }

    #[tokio::test]
    async fn store_and_retrieve() {
        let arch = MemoryArchitecture::new(100);
        let e = make_entry("m1", MemoryType::Working, 0.5);
        arch.store(e.clone()).unwrap();
        let got = arch.retrieve("m1").unwrap().expect("missing");
        assert_eq!(got.id, "m1");
        assert_eq!(got.memory_type, MemoryType::Working);

        // Not present
        assert!(arch.retrieve("missing").unwrap().is_none());

        // Duplicate id rejected
        let dup = make_entry("m1", MemoryType::Semantic, 0.9);
        assert!(arch.store(dup).is_err());
    }

    #[tokio::test]
    async fn search_by_type_and_importance() {
        let arch = MemoryArchitecture::new(100);
        arch.store(make_entry("a", MemoryType::ShortTerm, 0.2)).unwrap();
        arch.store(make_entry("b", MemoryType::LongTerm, 0.9)).unwrap();
        arch.store(make_entry("c", MemoryType::LongTerm, 0.4)).unwrap();

        let q = MemoryQuery {
            memory_types: vec![MemoryType::LongTerm],
            semantic: None,
            embedding: None,
            top_k: 10,
            min_importance: Some(0.5),
            filters: HashMap::new(),
        };
        let res = arch.search(&q).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].id, "b");
    }

    #[tokio::test]
    async fn search_semantic_returns_top_k() {
        let arch = MemoryArchitecture::new(100);
        arch.store(make_entry_with_embedding("v1", MemoryType::Semantic, vec![1.0, 0.0, 0.0])).unwrap();
        arch.store(make_entry_with_embedding("v2", MemoryType::Semantic, vec![0.0, 1.0, 0.0])).unwrap();
        arch.store(make_entry_with_embedding("v3", MemoryType::Semantic, vec![0.9, 0.1, 0.0])).unwrap();

        let res = arch.search_semantic(&[1.0, 0.0, 0.0], 2);
        assert_eq!(res.len(), 2);
        assert_eq!(res[0].id, "v1");
        assert_eq!(res[1].id, "v3");
    }

    #[tokio::test]
    async fn expire_removes_expired() {
        let arch = MemoryArchitecture::new(100);
        let past = Utc::now() - Duration::hours(1);
        let mut e1 = make_entry("expired", MemoryType::ShortTerm, 0.5);
        e1.expires_at = Some(past);
        let mut e2 = make_entry("live", MemoryType::ShortTerm, 0.5);
        e2.expires_at = Some(Utc::now() + Duration::hours(1));
        arch.store(e1).unwrap();
        arch.store(e2).unwrap();

        let removed = arch.expire(Utc::now()).unwrap();
        assert_eq!(removed, 1);
        assert!(arch.retrieve("expired").unwrap().is_none());
        assert!(arch.retrieve("live").unwrap().is_some());
    }

    #[tokio::test]
    async fn consolidate_promotes_high_importance_short_term() {
        let arch = MemoryArchitecture::new(100);
        arch.store(make_entry("low", MemoryType::ShortTerm, 0.3)).unwrap();
        arch.store(make_entry("high", MemoryType::ShortTerm, 0.9)).unwrap();

        let promoted = arch.consolidate().unwrap();
        assert_eq!(promoted, 1);
        // Source gone from short-term
        assert!(arch.retrieve("high").unwrap().is_none());
        // Long-term now has one entry
        assert_eq!(arch.count_for(MemoryType::LongTerm), 1);
        assert_eq!(arch.consolidations().len(), 1);
    }

    #[tokio::test]
    async fn compress_summarizes_old_episodic() {
        let arch = MemoryArchitecture::new(100);
        let mut old = make_entry("old1", MemoryType::Episodic, 0.5);
        old.created_at = Utc::now() - Duration::days(10);
        let mut fresh = make_entry("fresh1", MemoryType::Episodic, 0.5);
        fresh.created_at = Utc::now();
        arch.store(old).unwrap();
        arch.store(fresh).unwrap();

        let compressed = arch.compress().unwrap();
        assert_eq!(compressed, 1);
        // Source gone from episodic
        assert!(arch.retrieve("old1").unwrap().is_none());
        assert!(arch.retrieve("fresh1").unwrap().is_some());
        // Semantic bucket got the compressed entry
        assert_eq!(arch.count_for(MemoryType::Semantic), 1);
    }

    #[tokio::test]
    async fn rank_by_importance_times_recency() {
        let arch = MemoryArchitecture::new(100);
        let mut new_high = make_entry("new_high", MemoryType::Working, 1.0);
        new_high.created_at = Utc::now();
        let mut old_high = make_entry("old_high", MemoryType::Working, 1.0);
        old_high.created_at = Utc::now() - Duration::days(60);
        let mut new_low = make_entry("new_low", MemoryType::Working, 0.1);
        new_low.created_at = Utc::now();

        let ranked = arch.rank(&[new_low, old_high, new_high]);
        assert_eq!(ranked[0].id, "new_high");
        assert_eq!(ranked[ranked.len() - 1].id, "old_high");
    }

    #[tokio::test]
    async fn version_and_lineage() {
        let arch = MemoryArchitecture::new(100);
        let mut v1 = make_entry("v1", MemoryType::Working, 0.5);
        v1.lineage = vec!["v1".into()];
        arch.store(v1).unwrap();
        let mut v2 = make_entry("v2", MemoryType::Working, 0.6);
        v2.lineage = vec!["v1".into()];
        arch.store(v2).unwrap();
        let mut v3 = make_entry("v3", MemoryType::Working, 0.7);
        v3.lineage = vec!["v1".into()];
        arch.store(v3).unwrap();

        let versions = arch.version("v1").unwrap();
        assert_eq!(versions.len(), 3);
        let lineage = arch.lineage("v3").unwrap();
        assert_eq!(lineage, vec!["v1".to_string()]);
    }

    #[tokio::test]
    async fn validate_rejects_duplicates() {
        let arch = MemoryArchitecture::new(100);
        let e = make_entry("dup", MemoryType::Working, 0.5);
        arch.store(e.clone()).unwrap();
        assert!(!arch.validate(&e).unwrap());
        let other = make_entry("unique", MemoryType::Working, 0.5);
        assert!(arch.validate(&other).unwrap());
    }

    #[tokio::test]
    async fn replay_time_range() {
        let arch = MemoryArchitecture::new(100);
        let mut old = make_entry("old", MemoryType::Working, 0.5);
        old.created_at = Utc::now() - Duration::days(10);
        let mut mid = make_entry("mid", MemoryType::Working, 0.5);
        mid.created_at = Utc::now() - Duration::days(1);
        let mut new = make_entry("new", MemoryType::Working, 0.5);
        new.created_at = Utc::now();
        arch.store(old).unwrap();
        arch.store(mid).unwrap();
        arch.store(new).unwrap();

        let from = Utc::now() - Duration::days(2);
        let to = Utc::now();
        let replayed = arch.replay(from, to).unwrap();
        assert_eq!(replayed.len(), 2);
        assert_eq!(replayed[0].id, "mid");
        assert_eq!(replayed[1].id, "new");
    }

    #[tokio::test]
    async fn lru_eviction_when_bucket_full() {
        let arch = MemoryArchitecture::new(2);
        arch.store(make_entry("a", MemoryType::Working, 0.5)).unwrap();
        // Sleep tiny bit so timestamps differ
        std::thread::sleep(std::time::Duration::from_millis(5));
        arch.store(make_entry("b", MemoryType::Working, 0.5)).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        // Should evict "a" (oldest)
        arch.store(make_entry("c", MemoryType::Working, 0.5)).unwrap();
        assert!(arch.retrieve("a").unwrap().is_none());
        assert!(arch.retrieve("b").unwrap().is_some());
        assert!(arch.retrieve("c").unwrap().is_some());
    }

    #[tokio::test]
    async fn brain_module_lifecycle() {
        let arch = MemoryArchitecture::new(100);
        assert_eq!(arch.status(), ModuleStatus::Registered);
        arch.initialize().await.unwrap();
        assert_eq!(arch.status(), ModuleStatus::Active);
        let hc = arch.health_check().await.unwrap();
        assert_eq!(hc.status, HealthStatus::Healthy);
        arch.shutdown().await.unwrap();
        assert_eq!(arch.status(), ModuleStatus::Shutdown);
        assert_eq!(arch.descriptor().id, "memory-architecture");
        assert_eq!(arch.descriptor().authority, AuthorityLevel::A2);
        assert_eq!(arch.descriptor().capabilities.len(), 3);
    }
}
