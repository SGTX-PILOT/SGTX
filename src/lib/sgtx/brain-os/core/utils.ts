// SGTX Brain OS — Utilities
// ID generation, crypto helpers, timing.

import { createHash, randomUUID } from "crypto";

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().replace(/-/g, "").substring(0, 12)}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function now(): string {
  return new Date().toISOString();
}

export function elapsedMs(start: number): number {
  return Date.now() - start;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 3) + "..." : s;
}

export function safeJsonParse<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { return null; }
}

export function estimateTokens(text: string): number {
  // Rough estimate: 4 chars ≈ 1 token
  return Math.ceil(text.length / 4);
}
