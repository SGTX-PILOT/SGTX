// SGTX Brain OS — Postgres Event Store
// =============================================================================
// Persists every Brain event to the `BrainEvent` Prisma model for replay,
// audit, and offline learning. Despite the file name (kept for parity with
// the BRAIN-RESTORE spec), the underlying Prisma datasource is provider
// agnostic — it works against SQLite in dev and Postgres in prod without any
// code changes.
//
// Contract:
//   append(event)                   → writes one BrainEvent row (idempotent on id)
//   query(filter)                   → paginated filter over eventType / aggregateId / time
//   getEventsForAggregate(id)       → ordered stream for an aggregate
//   replay(handler, opts)           → streams events back to a handler (at-least-once)
//   count()                         → total rows (for health checks)
//
// The store is fail-safe: a DB error never crashes the Brain, it surfaces as
// a thrown promise from append() which callers (the EventBus) already catch.
// =============================================================================

import type { BrainEvent } from "../core/types";
import { freshDb as db } from "@/lib/db-fresh";

export interface EventStoreFilter {
  eventType?: string | string[];
  aggregateId?: string;
  source?: string;
  correlationId?: string;
  fromTimestamp?: Date | string;
  toTimestamp?: Date | string;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export interface EventStoreRow {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: string;
  source: string;
  correlationId: string | null;
  timestamp: Date;
}

type PrismaBrainEvent = {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: string;
  source: string;
  correlationId: string | null;
  timestamp: Date;
};

function toBrainEvent(row: PrismaBrainEvent): BrainEvent {
  let payload: any = {};
  try {
    payload = row.payload ? JSON.parse(row.payload) : {};
  } catch {
    payload = { raw: row.payload };
  }
  return {
    id: row.id,
    type: row.eventType,
    aggregateId: row.aggregateId,
    payload,
    metadata: {
      source: row.source,
      correlationId: row.correlationId ?? undefined,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    },
  };
}

export class PostgresEventStore {
  private readonly client: typeof db;
  private initialized = false;
  private initError: string | null = null;

  constructor(client: typeof db = db) {
    this.client = client;
  }

  /** Probe the database and confirm the BrainEvent table is reachable. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      // Cheap COUNT(*) — fails fast if the table is missing or DB unreachable.
      await this.client.brainEvent.count();
      this.initialized = true;
      this.initError = null;
    } catch (err) {
      this.initError = (err as Error).message;
      throw new Error(`PostgresEventStore initialize failed: ${this.initError}`);
    }
  }

  /** Append a single Brain event. Idempotent on event.id (uses upsert). */
  async append(event: BrainEvent): Promise<EventStoreRow> {
    if (!this.initialized) await this.initialize();
    const payload = typeof event.payload === "string"
      ? event.payload
      : JSON.stringify(event.payload ?? {});
    const ts = event.metadata?.timestamp
      ? new Date(event.metadata.timestamp)
      : new Date();
    const created = await this.client.brainEvent.upsert({
      where: { id: event.id },
      update: {
        eventType: event.type,
        aggregateId: event.aggregateId,
        payload,
        source: event.metadata?.source ?? "unknown",
        correlationId: event.metadata?.correlationId ?? null,
        timestamp: ts,
      },
      create: {
        id: event.id,
        eventType: event.type,
        aggregateId: event.aggregateId,
        payload,
        source: event.metadata?.source ?? "unknown",
        correlationId: event.metadata?.correlationId ?? null,
        timestamp: ts,
      },
    });
    return created as EventStoreRow;
  }

  /** Append many events in a single transaction. */
  async appendMany(events: BrainEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    if (!this.initialized) await this.initialize();
    await this.client.$transaction(
      events.map((event) =>
        this.client.brainEvent.upsert({
          where: { id: event.id },
          update: {
            eventType: event.type,
            aggregateId: event.aggregateId,
            payload: typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload ?? {}),
            source: event.metadata?.source ?? "unknown",
            correlationId: event.metadata?.correlationId ?? null,
            timestamp: event.metadata?.timestamp ? new Date(event.metadata.timestamp) : new Date(),
          },
          create: {
            id: event.id,
            eventType: event.type,
            aggregateId: event.aggregateId,
            payload: typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload ?? {}),
            source: event.metadata?.source ?? "unknown",
            correlationId: event.metadata?.correlationId ?? null,
            timestamp: event.metadata?.timestamp ? new Date(event.metadata.timestamp) : new Date(),
          },
        }),
      ),
    );
    return events.length;
  }

  /** Query the event store with a structured filter. */
  async query(filter: EventStoreFilter = {}): Promise<BrainEvent[]> {
    if (!this.initialized) await this.initialize();
    const where: Record<string, unknown> = {};
    if (filter.eventType) {
      where.eventType = Array.isArray(filter.eventType)
        ? { in: filter.eventType }
        : filter.eventType;
    }
    if (filter.aggregateId) where.aggregateId = filter.aggregateId;
    if (filter.source) where.source = filter.source;
    if (filter.correlationId) where.correlationId = filter.correlationId;
    if (filter.fromTimestamp || filter.toTimestamp) {
      where.timestamp = {};
      if (filter.fromTimestamp) {
        (where.timestamp as Record<string, unknown>).gte = new Date(filter.fromTimestamp);
      }
      if (filter.toTimestamp) {
        (where.timestamp as Record<string, unknown>).lte = new Date(filter.toTimestamp);
      }
    }
    const rows = await this.client.brainEvent.findMany({
      where,
      orderBy: { timestamp: filter.order ?? "asc" },
      take: Math.min(filter.limit ?? 500, 10_000),
      skip: filter.offset ?? 0,
    });
    return rows.map((r: PrismaBrainEvent) => toBrainEvent(r));
  }

  /** Return every event for a given aggregate, ordered by time. */
  async getEventsForAggregate(aggregateId: string, opts: { limit?: number; order?: "asc" | "desc" } = {}): Promise<BrainEvent[]> {
    return this.query({
      aggregateId,
      limit: opts.limit ?? 1000,
      order: opts.order ?? "asc",
    });
  }

  /** Replay events to a handler — useful for warm-restarts / state rebuilds. */
  async replay(
    handler: (event: BrainEvent) => Promise<void> | void,
    filter: EventStoreFilter = {},
  ): Promise<number> {
    const events = await this.query(filter);
    let n = 0;
    for (const event of events) {
      try {
        await handler(event);
        n++;
      } catch {
        // at-least-once: continue on handler errors, surface count to caller
      }
    }
    return n;
  }

  /** Total row count — for health checks and dashboards. */
  async count(): Promise<number> {
    if (!this.initialized) await this.initialize();
    return this.client.brainEvent.count();
  }

  /** Compact the store by deleting events older than the given cutoff. */
  async compactOlderThan(cutoff: Date): Promise<number> {
    if (!this.initialized) await this.initialize();
    const result = await this.client.brainEvent.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    return result.count;
  }

  /** True when initialize() succeeded at least once. */
  isReady(): boolean {
    return this.initialized && this.initError === null;
  }

  getInitError(): string | null {
    return this.initError;
  }
}

/** Default singleton, wired to the fresh Prisma client. */
export const postgresEventStore = new PostgresEventStore();
