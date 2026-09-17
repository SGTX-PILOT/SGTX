// @ts-nocheck
// =============================================================================
// SGTX v17 §16 — Focus Mode API backend
// -----------------------------------------------------------------------------
// The Focus Mode UI (FocusModeButton in src/components/sgtx/common-components.tsx)
// stores state in localStorage today; this backend mirrors the same shape and
// persists it server-side in ConfigurationHistory so other tabs / devices
// honour the same window (and so the Governor can suppress non-critical
// notifications during the focus window).
//
// State shape (matches the UI's FocusState type):
//   { active: boolean, endsAt: number (epoch ms), durationKey: string,
//     startedAt?: number, thresholdPriority?: number, tenantGtid: string }
//
// Storage: ConfigurationHistory (configKey = `focus_mode:{tenantGtid}`)
// =============================================================================
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const FOCUS_DURATIONS = [
  { key: "1h",            label: "1 hour",                  ms: 60 * 60 * 1000 },
  { key: "4h",            label: "4 hours",                 ms: 4 * 60 * 60 * 1000 },
  { key: "8h",            label: "8 hours",                 ms: 8 * 60 * 60 * 1000 },
  { key: "until-tomorrow", label: "Until tomorrow (08:00)", ms: 0 },
  { key: "custom",        label: "Custom…",                 ms: 0 },
];

export interface FocusModeState {
  active: boolean;
  endsAt: number; // epoch ms
  durationKey: string;
  startedAt?: number;
  thresholdPriority?: number; // default 90 (only CRITICAL)
  tenantGtid: string;
}

// =============================================================================
// getFocusMode — read state for a tenant
// =============================================================================
export async function getFocusMode(tenantGtid: string): Promise<FocusModeState | null> {
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `focus_mode:${tenantGtid}` },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  if (!row?.newValue) return null;
  try {
    const parsed = JSON.parse(row.newValue) as FocusModeState;
    // If expired, treat as inactive.
    if (parsed.active && parsed.endsAt < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// =============================================================================
// activateFocusMode — start a focus window
// =============================================================================
export async function activateFocusMode(
  tenantGtid: string,
  durationKey: string,
  customMs?: number,
  thresholdPriority: number = 90,
  activatedBy: string = "system",
): Promise<FocusModeState> {
  const d = FOCUS_DURATIONS.find((x) => x.key === durationKey);
  if (!d) throw new Error(`invalid durationKey: ${durationKey}`);
  let endsAt = 0;
  if (d.key === "until-tomorrow") {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(8, 0, 0, 0);
    endsAt = t.getTime();
  } else if (d.key === "custom") {
    endsAt = Date.now() + (customMs || 60 * 60 * 1000);
  } else {
    endsAt = Date.now() + d.ms;
  }
  const state: FocusModeState = {
    active: true,
    endsAt,
    durationKey: d.key,
    startedAt: Date.now(),
    thresholdPriority,
    tenantGtid,
  };
  await persistFocusMode(state, activatedBy);
  return state;
}

// =============================================================================
// deactivateFocusMode — end the focus window
// =============================================================================
export async function deactivateFocusMode(
  tenantGtid: string,
  deactivatedBy: string = "system",
): Promise<{ ok: boolean }> {
  const current = await getFocusMode(tenantGtid);
  if (!current) return { ok: false };
  const newState: FocusModeState = { ...current, active: false };
  await persistFocusMode(newState, deactivatedBy);
  return { ok: true };
}

async function persistFocusMode(state: FocusModeState, changedBy: string): Promise<void> {
  const existing = await db.configurationHistory.findFirst({
    where: { configKey: `focus_mode:${state.tenantGtid}` },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  await db.configurationHistory.create({
    data: {
      configKey: `focus_mode:${state.tenantGtid}`,
      oldValue: existing?.newValue || null,
      newValue: JSON.stringify(state),
      changedByGtid: changedBy,
      changeReason: state.active
        ? `Focus Mode activated (until ${new Date(state.endsAt).toISOString()})`
        : "Focus Mode deactivated",
      version: (existing?.version || 0) + 1,
    },
  }).catch((e: any) => logger.error("[focus-mode] persist failed:", e?.message));
}

// =============================================================================
// isFocusModeActive — quick check
// =============================================================================
export async function isFocusModeActive(tenantGtid: string): Promise<boolean> {
  const s = await getFocusMode(tenantGtid);
  return !!s?.active;
}
