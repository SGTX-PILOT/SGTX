// SGTX Brain OS — Per-Module Circuit Breaker
// =============================================================================
// Wraps every Brain module invocation in a circuit breaker that prevents
// cascading failures when a downstream dependency fails repeatedly.
//
// States:
//   closed     — requests flow normally; failures increment the failure counter.
//   open       — requests fail fast with `CircuitOpenError`; cooldown in effect.
//   half-open  — after cooldown elapses, one probe request is allowed. On
//                success the breaker closes; on failure it re-opens.
//
// Thresholds (per BRAIN-RESTORE spec):
//   * 5 consecutive failures → open
//   * 60s cooldown before half-open probe
//
// The breaker is keyed by module id so each module gets its own state.
// =============================================================================

import { logger } from "../observability/structured-logging";

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitOpenError extends Error {
  readonly moduleId: string;
  readonly state: CircuitState;
  constructor(moduleId: string, state: CircuitState) {
    super(`Circuit breaker OPEN for module "${moduleId}" (state=${state})`);
    this.name = "CircuitOpenError";
    this.moduleId = moduleId;
    this.state = state;
  }
}

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  successes: number;
  openedAt: number; // unix-ms when transitioned to open
  lastFailureAt: number | null;
  lastError: string | null;
  totalTrips: number; // how many times it has opened since reset
  probesInFlight: number;
}

interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  halfOpenMaxProbes?: number;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  cooldownMs: 60_000,
  halfOpenMaxProbes: 1,
};

class CircuitBreakerImpl {
  private readonly circuits = new Map<string, CircuitEntry>();
  private opts: Required<CircuitBreakerOptions> = { ...DEFAULTS };

  /** Allow callers (e.g. tests) to override thresholds globally. */
  configure(opts: CircuitBreakerOptions): void {
    this.opts = { ...this.opts, ...opts };
  }

  /** Return the current state for a module id (defaults to "closed"). */
  getState(moduleId: string): CircuitState {
    return this.circuits.get(moduleId)?.state ?? "closed";
  }

  /** Snapshot for dashboards / metrics. */
  snapshot(): Array<{
    moduleId: string;
    state: CircuitState;
    failures: number;
    successes: number;
    openedAt: number | null;
    lastError: string | null;
    totalTrips: number;
  }> {
    return Array.from(this.circuits.entries()).map(([moduleId, c]) => ({
      moduleId,
      state: c.state,
      failures: c.failures,
      successes: c.successes,
      openedAt: c.state === "open" ? c.openedAt : null,
      lastError: c.lastError,
      totalTrips: c.totalTrips,
    }));
  }

  /**
   * Execute `fn` under the breaker. Throws `CircuitOpenError` if the circuit
   * is open and the cooldown has not elapsed, or rethrows the underlying
   * error after recording a failure.
   */
  async execute<T>(moduleId: string, fn: () => Promise<T>): Promise<T> {
    const circuit = this.getOrCreate(moduleId);
    this.maybeHalfOpen(circuit);

    if (circuit.state === "open") {
      throw new CircuitOpenError(moduleId, circuit.state);
    }
    if (circuit.state === "half-open" && circuit.probesInFlight >= this.opts.halfOpenMaxProbes) {
      throw new CircuitOpenError(moduleId, circuit.state);
    }

    if (circuit.state === "half-open") circuit.probesInFlight++;

    try {
      const result = await fn();
      this.onSuccess(moduleId, circuit);
      return result;
    } catch (err) {
      this.onFailure(moduleId, circuit, err as Error);
      throw err;
    }
  }

  /** Manually trip the breaker (e.g. from an out-of-band health check). */
  trip(moduleId: string, reason = "manual"): void {
    const circuit = this.getOrCreate(moduleId);
    circuit.state = "open";
    circuit.openedAt = Date.now();
    circuit.totalTrips++;
    circuit.lastError = reason;
    logger.warn(
      `CircuitBreaker tripped for module "${moduleId}"`,
      { component: "circuit-breaker", moduleId, reason, totalTrips: circuit.totalTrips },
    );
  }

  /** Manually reset the breaker (e.g. after operator intervention). */
  reset(moduleId: string): void {
    this.circuits.delete(moduleId);
  }

  /** Reset every breaker — used in tests / dev restarts. */
  resetAll(): void {
    this.circuits.clear();
  }

  // -------------------------------------------------------------------
  private getOrCreate(moduleId: string): CircuitEntry {
    let c = this.circuits.get(moduleId);
    if (!c) {
      c = {
        state: "closed",
        failures: 0,
        successes: 0,
        openedAt: 0,
        lastFailureAt: null,
        lastError: null,
        totalTrips: 0,
        probesInFlight: 0,
      };
      this.circuits.set(moduleId, c);
    }
    return c;
  }

  private maybeHalfOpen(c: CircuitEntry): void {
    if (c.state === "open" && Date.now() - c.openedAt >= this.opts.cooldownMs) {
      c.state = "half-open";
      c.probesInFlight = 0;
    }
  }

  private onSuccess(moduleId: string, c: CircuitEntry): void {
    if (c.state === "half-open") {
      // Probe succeeded → close and reset counters.
      c.state = "closed";
      c.failures = 0;
      c.probesInFlight = 0;
      c.lastError = null;
      logger.info(`CircuitBreaker closed for module "${moduleId}" after successful probe`, {
        component: "circuit-breaker",
        moduleId,
      });
      return;
    }
    c.successes++;
    // Steady success erases one prior failure (debt repayment).
    if (c.failures > 0) c.failures--;
  }

  private onFailure(moduleId: string, c: CircuitEntry, err: Error): void {
    c.lastFailureAt = Date.now();
    c.lastError = err.message;
    c.probesInFlight = 0;

    if (c.state === "half-open") {
      // Probe failed → re-open for another cooldown window.
      c.state = "open";
      c.openedAt = Date.now();
      c.totalTrips++;
      logger.warn(
        `CircuitBreaker re-opened for module "${moduleId}" after failed probe`,
        { component: "circuit-breaker", moduleId, error: err.message },
      );
      return;
    }

    c.failures++;
    if (c.failures >= this.opts.failureThreshold) {
      c.state = "open";
      c.openedAt = Date.now();
      c.totalTrips++;
      logger.warn(
        `CircuitBreaker opened for module "${moduleId}" after ${c.failures} failures`,
        { component: "circuit-breaker", moduleId, failures: c.failures, error: err.message },
      );
    }
  }
}

/** Singleton circuit breaker for the Brain OS. */
export const circuitBreaker = new CircuitBreakerImpl();
export { CircuitBreakerImpl as CircuitBreaker };
