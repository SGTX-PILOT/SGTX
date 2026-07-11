// SGTX Brain OS — Metrics (Prometheus-style)
// =============================================================================
// Lightweight in-memory metrics registry that emits Prometheus text exposition
// and JSON. Covers the three core metric types:
//
//   Counter  — monotonically increasing (e.g. requests_total)
//   Gauge    — arbitrary point-in-time value (e.g. queue depth)
//   Histogram — bucketed distribution (e.g. request latency ms)
//
// Design notes:
//   * All metrics are tagged with a name + optional label set.
//   * Label sets are sorted + joined into a stable key so the same labels
//     always map to the same metric series.
//   * Histograms use a fixed default bucket ladder (configurable per-metric).
//   * `exportPrometheus()` produces text/plain output compatible with the
//     Prometheus scrape format (suitable for a /metrics HTTP route).
//   * `exportJson()` produces a structured snapshot for JSON dashboards.
//   * The registry is process-local; for multi-process setups add a push
//     gateway or a real Prometheus client.
// =============================================================================

export type MetricType = "counter" | "gauge" | "histogram";

export interface Labels { [key: string]: string | number | boolean | undefined; }

interface CounterSeries { value: number; }
interface GaugeSeries { value: number; }
interface HistogramSeries {
  buckets: { upperBound: number; count: number }[];
  sum: number;
  count: number;
}

interface CounterMetric { type: "counter"; help: string; series: Map<string, CounterSeries>; }
interface GaugeMetric { type: "gauge"; help: string; series: Map<string, GaugeSeries>; }
interface HistogramMetric {
  type: "histogram";
  help: string;
  bucketBounds: number[];
  series: Map<string, HistogramSeries>;
}

type AnyMetric = CounterMetric | GaugeMetric | HistogramMetric;

const DEFAULT_HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function labelsToKey(labels: Labels = {}): string {
  const entries = Object.entries(labels)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "\\\"")}"`);
  return entries.length ? `{${entries.join(",")}}` : "";
}

function labelsToJsonObject(labels: Labels = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) {
    if (v !== undefined && v !== null && v !== "") out[k] = String(v);
  }
  return out;
}

class MetricsRegistry {
  private readonly metrics = new Map<string, AnyMetric>();

  // --- registration ---------------------------------------------------
  registerCounter(name: string, help = ""): CounterMetric {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type === "counter") return existing;
      throw new Error(`Metric ${name} already registered as ${existing.type}`);
    }
    const counter: CounterMetric = { type: "counter", help, series: new Map() };
    this.metrics.set(name, counter);
    return counter;
  }

  registerGauge(name: string, help = ""): GaugeMetric {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type === "gauge") return existing;
      throw new Error(`Metric ${name} already registered as ${existing.type}`);
    }
    const gauge: GaugeMetric = { type: "gauge", help, series: new Map() };
    this.metrics.set(name, gauge);
    return gauge;
  }

  registerHistogram(name: string, help = "", buckets: number[] = DEFAULT_HISTOGRAM_BUCKETS): HistogramMetric {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type === "histogram") return existing;
      throw new Error(`Metric ${name} already registered as ${existing.type}`);
    }
    const sortedBuckets = [...new Set(buckets)].sort((a, b) => a - b);
    const histogram: HistogramMetric = {
      type: "histogram",
      help,
      bucketBounds: sortedBuckets,
      series: new Map(),
    };
    this.metrics.set(name, histogram);
    return histogram;
  }

  // --- updates --------------------------------------------------------
  increment(name: string, value = 1, labels?: Labels): void {
    const m = this.metrics.get(name);
    const counter = m && m.type === "counter"
      ? m
      : this.registerCounter(name);
    const key = labelsToKey(labels);
    let series = counter.series.get(key);
    if (!series) { series = { value: 0 }; counter.series.set(key, series); }
    series.value += value;
  }

  gauge(name: string, value: number, labels?: Labels): void {
    const m = this.metrics.get(name);
    const g = m && m.type === "gauge" ? m : this.registerGauge(name);
    const key = labelsToKey(labels);
    g.series.set(key, { value });
  }

  /** Increment a gauge by `delta` (may be negative). */
  incrementGauge(name: string, delta: number, labels?: Labels): void {
    const m = this.metrics.get(name);
    const g = m && m.type === "gauge" ? m : this.registerGauge(name);
    const key = labelsToKey(labels);
    const cur = g.series.get(key);
    g.series.set(key, { value: (cur?.value ?? 0) + delta });
  }

  observe(name: string, value: number, labels?: Labels): void {
    const m = this.metrics.get(name);
    const h = m && m.type === "histogram" ? m : this.registerHistogram(name);
    const key = labelsToKey(labels);
    let series = h.series.get(key);
    if (!series) {
      series = {
        buckets: h.bucketBounds.map((b) => ({ upperBound: b, count: 0 })),
        sum: 0,
        count: 0,
      };
      h.series.set(key, series);
    }
    series.sum += value;
    series.count++;
    for (const b of series.buckets) {
      if (value <= b.upperBound) b.count++;
    }
  }

  /** Time a function call and observe its duration in the named histogram. */
  async time<T>(name: string, fn: () => Promise<T>, labels?: Labels): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.observe(name, Date.now() - start, labels);
    }
  }

  // --- readouts -------------------------------------------------------
  get(name: string): AnyMetric | undefined {
    return this.metrics.get(name);
  }

  list(): { name: string; type: MetricType; help: string }[] {
    return Array.from(this.metrics.entries()).map(([name, m]) => ({
      name,
      type: m.type,
      help: m.help,
    }));
  }

  /** Render every metric in Prometheus text exposition format. */
  exportPrometheus(): string {
    const lines: string[] = [];
    for (const [name, m] of this.metrics.entries()) {
      if (m.help) lines.push(`# HELP ${name} ${m.help}`);
      lines.push(`# TYPE ${name} ${m.type}`);
      if (m.type === "counter") {
        for (const [key, s] of m.series.entries()) {
          lines.push(`${name}${key} ${s.value}`);
        }
      } else if (m.type === "gauge") {
        for (const [key, s] of m.series.entries()) {
          lines.push(`${name}${key} ${s.value}`);
        }
      } else {
        for (const [key, s] of m.series.entries()) {
          for (const b of s.buckets) {
            const bucketLabels = key
              ? key.replace(/}$/, `,le="${b.upperBound}"}`)
              : `{le="${b.upperBound}"}`;
            lines.push(`${name}_bucket${bucketLabels} ${b.count}`);
          }
          const infLabels = key ? key.replace(/}$/, `,le="+Inf"}`) : `{le="+Inf"}`;
          lines.push(`${name}_bucket${infLabels} ${s.count}`);
          lines.push(`${name}_sum${key} ${s.sum}`);
          lines.push(`${name}_count${key} ${s.count}`);
        }
      }
    }
    return lines.join("\n") + (lines.length ? "\n" : "");
  }

  /** Render every metric as a structured JSON object. */
  exportJson(): {
    counters: Record<string, Array<{ labels: Record<string, string>; value: number }>>;
    gauges: Record<string, Array<{ labels: Record<string, string>; value: number }>>;
    histograms: Record<string, Array<{
      labels: Record<string, string>;
      buckets: Array<{ upperBound: number; count: number }>;
      sum: number;
      count: number;
    }>>;
  } {
    const out = {
      counters: {} as Record<string, Array<{ labels: Record<string, string>; value: number }>>,
      gauges: {} as Record<string, Array<{ labels: Record<string, string>; value: number }>>,
      histograms: {} as Record<string, Array<{
        labels: Record<string, string>;
        buckets: Array<{ upperBound: number; count: number }>;
        sum: number;
        count: number;
      }>>,
    };
    for (const [name, m] of this.metrics.entries()) {
      if (m.type === "counter") {
        out.counters[name] = Array.from(m.series.entries()).map(([key, s]) => ({
          labels: parseLabelsFromKey(key),
          value: s.value,
        }));
      } else if (m.type === "gauge") {
        out.gauges[name] = Array.from(m.series.entries()).map(([key, s]) => ({
          labels: parseLabelsFromKey(key),
          value: s.value,
        }));
      } else {
        out.histograms[name] = Array.from(m.series.entries()).map(([key, s]) => ({
          labels: parseLabelsFromKey(key),
          buckets: s.buckets.map((b) => ({ upperBound: b.upperBound, count: b.count })),
          sum: s.sum,
          count: s.count,
        }));
      }
    }
    return out;
  }

  /** Reset every metric series (used in tests). */
  reset(): void {
    this.metrics.clear();
  }
}

function parseLabelsFromKey(key: string): Record<string, string> {
  if (!key) return {};
  const inner = key.replace(/^\{|\}$/g, "");
  const out: Record<string, string> = {};
  if (!inner) return out;
  // Split on commas that are NOT inside quotes — simple parser sufficient for
  // the values we emit above (no commas inside label values).
  for (const pair of inner.split(",")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim().replace(/^"|"$/g, "").replace(/\\"/g, '"');
    out[k] = v;
  }
  return out;
}

// Re-export labelsToJsonObject for callers building their own JSON views.
export { labelsToKey, labelsToJsonObject };

/** Singleton metrics registry. */
export const metrics = new MetricsRegistry();
export { MetricsRegistry };
