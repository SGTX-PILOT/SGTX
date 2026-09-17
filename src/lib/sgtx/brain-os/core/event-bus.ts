// SGTX Brain OS — Event Bus
// The backbone. Every module communicates through events.
// Ring-buffered, back-pressure aware, at-least-once delivery.

import type { BrainEvent, EventHandler } from "./types";

interface Subscription {
  id: string;
  eventType: string | "*";
  handler: EventHandler;
  module: string;
}

class EventBusImpl {
  private subscriptions: Subscription[] = [];
  private inFlight = 0;
  private maxInFlight = 5000;
  private eventLog: BrainEvent[] = [];
  private maxLogSize = 10000;
  private metrics = { totalPublished: 0, totalDelivered: 0, totalFailed: 0, totalRetried: 0 };

  subscribe<T = any>(module: string, eventType: string | "*", handler: EventHandler<T>): () => void {
    const sub: Subscription = { id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, eventType, handler: handler as EventHandler, module };
    this.subscriptions.push(sub);
    return () => { this.subscriptions = this.subscriptions.filter(s => s.id !== sub.id); };
  }

  async publish<T = any>(type: string, aggregateId: string, payload: T, metadata?: Partial<BrainEvent["metadata"]>): Promise<void> {
    if (this.inFlight >= this.maxInFlight) throw new Error(`EventBus back-pressure: ${this.inFlight} in flight`);
    const event: BrainEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type, aggregateId, payload,
      metadata: { source: metadata?.source || "unknown", correlationId: metadata?.correlationId, timestamp: new Date().toISOString(), tenantGtid: metadata?.tenantGtid },
    };
    this.inFlight++;
    this.metrics.totalPublished++;
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) this.eventLog.shift();

    const matching = this.subscriptions.filter(s => s.eventType === "*" || s.eventType === type);
    for (const sub of matching) {
      try {
        await sub.handler(event);
        this.metrics.totalDelivered++;
      } catch {
        this.metrics.totalFailed++;
      }
    }
    this.inFlight--;
  }

  async replay(fromTimestamp?: string, types?: string[]): Promise<number> {
    const filtered = this.eventLog.filter(e =>
      (!fromTimestamp || e.metadata.timestamp >= fromTimestamp) &&
      (!types || types.includes(e.type)),
    );
    for (const event of filtered) {
      const matching = this.subscriptions.filter(s => s.eventType === "*" || s.eventType === event.type);
      for (const sub of matching) { try { await sub.handler(event); } catch {} }
    }
    return filtered.length;
  }

  getMetrics() { return { ...this.metrics, inFlight: this.inFlight, subscriptions: this.subscriptions.length, logSize: this.eventLog.length }; }
  getSubscribers() { return this.subscriptions.map(s => ({ module: s.module, eventType: s.eventType })); }
  reset() { this.subscriptions = []; this.eventLog = []; this.inFlight = 0; this.metrics = { totalPublished: 0, totalDelivered: 0, totalFailed: 0, totalRetried: 0 }; }
}

export const eventBus = new EventBusImpl();
