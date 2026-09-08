// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §16.8.12 — Mobile Companion Apps · Offline Sync Specification
// ═══════════════════════════════════════════════════════════════════════════════
//
// All three mobile companion apps (LSP Driver, QC Inspector, CBR Document
// Receipt) follow the same offline-first sync specification. This file
// exports the canonical spec so all three apps + the backend sync endpoints
// reference a single source of truth.
//
// Conflict resolution policy: SERVER-WINS (with user notification)
//   When a queued action is synced and the server detects that the local
//   state on the device no longer matches the server's state (e.g. the
//   shipment status was updated by another user while the driver was
//   offline), the server-side state wins. The user's queued action is
//   rejected (returned in the `conflicts` array with a reason) and the
//   device receives a notification explaining what happened.
//
//   This policy is the simplest of the three common policies (server-wins,
//   client-wins, merge) and is chosen because:
//     - Field operations often have stale data (drivers may be offline for
//       12+ hours).
//     - The server has the full multi-user view (control tower updates,
//       customer changes, customs status, etc.).
//     - Mobile users explicitly trust the platform's authoritative state.
//
//   For the cases where a client action MUST override (e.g. a milestone
//   confirmation with a GPS + photo + biometric signature taken offline),
//   the action carries a `signature` field (HMAC-SHA256 over the action
//   payload + device's private key). The server validates the signature
//   before applying. A validly-signed action always wins over a stale
//   server state.
//
// Queue limits:
//   - Max queue size: 500 actions (FIFO eviction when exceeded)
//   - Max offline duration: 7 days (actions older than 7d are auto-stale)
//
// Retry strategy (when sync fails due to network / server error):
//   Exponential backoff: 1s, 2s, 4s, 8s, 16s, 60s (max)
//   After 5 failed retries, the queue is paused and the user is notified.
//
// Required fields per queued action:
//   - actionType: string (e.g. "confirm_milestone", "submit_inspection")
//   - timestamp: ISO 8601 (when the action was originally performed)
//   - location: { lat: number, lng: number, accuracy?: number }
//   - device_id: string (device's UUID — registered at app install)
//   - signature: string (HMAC-SHA256 over (actionType + timestamp + location + device_id + payload_hash))
//   - payload: object (the action-specific body)
//   - payloadHash: string (SHA-256 of the canonical-JSON payload)
//
// The signature is computed by the device's Secure Enclave (iOS) /
// StrongBox (Android) using a per-device private key registered with the
// platform during app onboarding. The platform verifies signatures
// against the device's registered public key.
// ═══════════════════════════════════════════════════════════════════════════════

import crypto from "crypto";

export type ConflictResolution = "server_wins" | "client_wins_signed" | "merge";

export interface SyncRetryPolicy {
  backoffSeconds: number[];
  maxRetries: number;
  pauseAfterFailures: number;
}

export interface QueuedAction {
  actionType: string;
  timestamp: string; // ISO 8601
  location: { lat: number; lng: number; accuracy?: number };
  device_id: string;
  signature: string; // HMAC-SHA256 hex
  payload: Record<string, unknown>;
  payloadHash: string; // SHA-256 hex of canonical JSON payload
  queuedAt?: string; // when the device added it to the queue
  attempts?: number; // number of sync attempts so far
}

export interface SyncConflict {
  action: QueuedAction;
  reason: string;
  serverState: Record<string, unknown>;
}

export interface SyncResult {
  synced: number;
  conflicts: SyncConflict[];
  stale: number; // actions older than MAX_OFFLINE_DURATION_DAYS
  remaining: number; // actions left in queue
  serverTimestamp: string;
}

export const OFFLINE_SYNC_SPEC = {
  version: "1.0.0",
  specId: "sgtx-mobile-offline-sync-v1",
  conflictResolution: "server_wins" as ConflictResolution,
  queueMaxSize: 500,
  maxOfflineDurationDays: 7,
  retry: {
    backoffSeconds: [1, 2, 4, 8, 16, 60],
    maxRetries: 5,
    pauseAfterFailures: 5,
  } as SyncRetryPolicy,
  requiredActionFields: [
    "actionType",
    "timestamp",
    "location",
    "device_id",
    "signature",
    "payload",
    "payloadHash",
  ] as const,
  signatureAlgorithm: "HMAC-SHA256",
  payloadHashAlgorithm: "SHA-256",
  notes: [
    "Conflict resolution: server-wins (with user notification).",
    "Validly-signed client actions (HMAC-SHA256 over payload + device's private key) override stale server state.",
    "Queue is FIFO — oldest action syncs first; eviction kicks in at 500 actions.",
    "Actions older than 7 days are auto-stale and reported as `stale` in the sync result.",
    "After 5 failed retries the queue is paused and the user is notified.",
  ],
} as const;

/**
 * Validate a queued action against the spec — checks all required fields
 * are present + payload hash matches the canonical JSON of the payload.
 * Used by the mobile sync endpoints before applying the action.
 */
export function validateQueuedAction(action: Partial<QueuedAction>): {
  valid: boolean;
  missing: string[];
  payloadHashMatch: boolean;
} {
  const missing: string[] = [];
  for (const field of OFFLINE_SYNC_SPEC.requiredActionFields) {
    if (
      action[field as keyof QueuedAction] === undefined ||
      action[field as keyof QueuedAction] === null
    ) {
      missing.push(field);
    }
  }
  let payloadHashMatch = true;
  if (action.payload && action.payloadHash) {
    // Best-effort: compare provided hash with a fresh SHA-256 of the canonical JSON.
    try {
      const canonical = JSON.stringify(
        action.payload,
        Object.keys(action.payload).sort(),
      );
      const recomputed = crypto.createHash("sha256").update(canonical).digest("hex");
      payloadHashMatch = recomputed === action.payloadHash;
    } catch {
      payloadHashMatch = false;
    }
  } else {
    payloadHashMatch = false;
  }
  return { valid: missing.length === 0 && payloadHashMatch, missing, payloadHashMatch };
}

/**
 * Compute the queue expiry status for a given action timestamp.
 * Actions older than MAX_OFFLINE_DURATION_DAYS are considered stale.
 */
export function isActionStale(timestamp: string, asOf: Date = new Date()): boolean {
  const ts = new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return true;
  const ageMs = asOf.getTime() - ts;
  const maxMs = OFFLINE_SYNC_SPEC.maxOfflineDurationDays * 24 * 60 * 60 * 1000;
  return ageMs > maxMs;
}

/**
 * Compute the next retry delay (seconds) given the number of attempts so far.
 * Returns null when maxRetries has been exceeded.
 */
export function nextRetryDelay(attemptsSoFar: number): number | null {
  if (attemptsSoFar >= OFFLINE_SYNC_SPEC.retry.maxRetries) return null;
  const idx = Math.min(attemptsSoFar, OFFLINE_SYNC_SPEC.retry.backoffSeconds.length - 1);
  return OFFLINE_SYNC_SPEC.retry.backoffSeconds[idx];
}
