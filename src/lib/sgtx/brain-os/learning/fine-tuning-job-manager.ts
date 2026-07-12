// SGTX Brain OS — Fine-Tuning Job Manager
// =============================================================================
// Tracks fine-tuning jobs that are run externally on GPU boxes. The Brain OS
// itself never runs training (no GPU in this sandbox) — it generates configs
// + datasets (via `fineTuningExporter`), records a `FineTuningJob` row in
// the DB, and lets external runners report back status/metrics via PATCH.
//
// Contract:
//   createJob({...})        → inserts a `pending` job, returns the row.
//   updateJobStatus(id, …)  → for external runners to report progress + metrics.
//   listJobs(filters)       → paginated list with status/framework filters.
//   getJob(id)              → single job by id.
//   getLatestCompletedJob(framework?) → most recent completed job (lineage tip).
//   getLineage()            → chain of completed jobs (model version lineage).
//
// Every async surface is wrapped in try/catch. DB errors are surfaced as
// thrown promises from the calling API route (which already catch + format).
// =============================================================================

import { db } from "@/lib/db";
import { logger } from "../observability/structured-logging";

/** Supported fine-tuning frameworks. */
export type FineTuningFramework = "unsloth" | "axolotl" | "llama-factory" | "trl";

/** Job status lifecycle. */
export type FineTuningJobStatus =
  | "pending"
  | "config-generated"
  | "submitted"
  | "running"
  | "completed"
  | "failed";

/** Training metrics reported by external runners. */
export interface FineTuningMetrics {
  loss?: number;
  evalLoss?: number;
  learningRate?: number;
  epoch?: number;
}

/** A fine-tuning job row (DB shape + parsed JSON metrics). */
export interface FineTuningJob {
  id: string;
  status: FineTuningJobStatus;
  framework: FineTuningFramework;
  baseModel: string;
  datasetExampleCount: number;
  configArtifactPath: string | null;
  datasetArtifactPath: string | null;
  modelVersion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metrics: FineTuningMetrics;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Filter options accepted by `listJobs()`. */
export interface JobListFilters {
  status?: FineTuningJobStatus;
  framework?: FineTuningFramework;
  limit?: number;
  offset?: number;
}

/** Paginated list result. */
export interface JobListPage {
  jobs: FineTuningJob[];
  total: number;
  limit: number;
  offset: number;
}

/** Cast helper — the legacy `db` singleton sometimes lacks the new model. */
function getClient(): {
  create: (args: unknown) => Promise<Record<string, unknown>>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  count: (args?: unknown) => Promise<number>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
} {
  return (db as unknown as {
    fineTuningJob: {
      create: (args: unknown) => Promise<Record<string, unknown>>;
      update: (args: unknown) => Promise<Record<string, unknown>>;
      findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
      count: (args?: unknown) => Promise<number>;
      findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    };
  }).fineTuningJob;
}

/** Convert a DB row to the `FineTuningJob` interface. */
function rowToJob(row: Record<string, unknown>): FineTuningJob {
  let metrics: FineTuningMetrics = {};
  const raw = row.metrics;
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as FineTuningMetrics;
      if (parsed && typeof parsed === "object") metrics = parsed;
    } catch {
      // Keep empty metrics.
    }
  }
  return {
    id: row.id as string,
    status: row.status as FineTuningJobStatus,
    framework: row.framework as FineTuningFramework,
    baseModel: row.baseModel as string,
    datasetExampleCount: row.datasetExampleCount as number,
    configArtifactPath: (row.configArtifactPath as string | null) ?? null,
    datasetArtifactPath: (row.datasetArtifactPath as string | null) ?? null,
    modelVersion: (row.modelVersion as string | null) ?? null,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    metrics,
    notes: (row.notes as string | null) ?? null,
    createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date().toISOString(),
  };
}

/** Best-effort Date → ISO string. */
function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

class FineTuningJobManagerImpl {
  /**
   * Create a new fine-tuning job. The job starts in `pending` status; the
   * caller updates it to `config-generated` once the artifacts (configs +
   * dataset) have been written to disk, and to `submitted`/`running` once
   * an external runner picks it up.
   */
  async createJob(params: {
    framework: FineTuningFramework;
    baseModel: string;
    exampleCount: number;
    configArtifact?: string;
    datasetArtifact?: string;
    notes?: string;
  }): Promise<FineTuningJob> {
    try {
      const client = getClient();
      const row = await client.create({
        data: {
          status: "pending",
          framework: params.framework,
          baseModel: params.baseModel,
          datasetExampleCount: params.exampleCount,
          configArtifactPath: params.configArtifact ?? null,
          datasetArtifactPath: params.datasetArtifact ?? null,
          metrics: "{}",
          notes: params.notes ?? null,
        },
      });
      logger.info("fine-tuning job created", {
        component: "fine-tuning-job-manager",
        jobId: row.id,
        framework: params.framework,
        baseModel: params.baseModel,
        exampleCount: params.exampleCount,
      });
      return rowToJob(row);
    } catch (err) {
      logger.error("fine-tuning job create failed", {
        component: "fine-tuning-job-manager",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Update a job's status and (optionally) metrics, notes, model version.
   * When transitioning to `running`, sets `startedAt`; when transitioning
   * to `completed` or `failed`, sets `completedAt`.
   */
  async updateJobStatus(
    id: string,
    update: {
      status?: FineTuningJobStatus;
      metrics?: FineTuningMetrics;
      notes?: string;
      modelVersion?: string;
    },
  ): Promise<FineTuningJob> {
    try {
      const client = getClient();
      // Read the existing row to merge metrics (the API only ever patches
      // individual metric fields, so we need to preserve prior values).
      const existing = await client.findUnique({ where: { id } });
      if (!existing) {
        throw new Error(`FineTuningJob not found: ${id}`);
      }
      const existingJob = rowToJob(existing);
      const mergedMetrics: FineTuningMetrics = {
        ...existingJob.metrics,
        ...(update.metrics ?? {}),
      };

      const data: Record<string, unknown> = {
        metrics: JSON.stringify(mergedMetrics),
      };
      if (update.status) data.status = update.status;
      if (update.notes !== undefined) data.notes = update.notes;
      if (update.modelVersion !== undefined) data.modelVersion = update.modelVersion;
      if (update.status === "running" && !existingJob.startedAt) {
        data.startedAt = new Date();
      }
      if ((update.status === "completed" || update.status === "failed") && !existingJob.completedAt) {
        data.completedAt = new Date();
      }

      const row = await client.update({ where: { id }, data });
      logger.info("fine-tuning job updated", {
        component: "fine-tuning-job-manager",
        jobId: id,
        status: update.status ?? existingJob.status,
      });
      return rowToJob(row);
    } catch (err) {
      logger.error("fine-tuning job update failed", {
        component: "fine-tuning-job-manager",
        jobId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /** Paginated list of jobs. */
  async listJobs(filters: JobListFilters = {}): Promise<JobListPage> {
    const limit = Math.min(Math.max(1, filters.limit ?? 50), 500);
    const offset = Math.max(0, filters.offset ?? 0);
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.framework) where.framework = filters.framework;
    try {
      const client = getClient();
      const [rows, total] = await Promise.all([
        client.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        client.count(where),
      ]);
      return {
        jobs: rows.map(rowToJob),
        total,
        limit,
        offset,
      };
    } catch (err) {
      logger.error("fine-tuning job list failed", {
        component: "fine-tuning-job-manager",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /** Get a single job by id. Returns null when not found. */
  async getJob(id: string): Promise<FineTuningJob | null> {
    try {
      const client = getClient();
      const row = await client.findUnique({ where: { id } });
      return row ? rowToJob(row) : null;
    } catch (err) {
      logger.error("fine-tuning job get failed", {
        component: "fine-tuning-job-manager",
        jobId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Return the most recent `completed` job, optionally filtered by framework.
   * Used by lineage tracking and the `/status` endpoint.
   */
  async getLatestCompletedJob(
    framework?: FineTuningFramework,
  ): Promise<FineTuningJob | null> {
    try {
      const client = getClient();
      const where: Record<string, unknown> = { status: "completed" };
      if (framework) where.framework = framework;
      const row = await client.findFirst({
        where,
        orderBy: { completedAt: "desc" },
      });
      return row ? rowToJob(row) : null;
    } catch (err) {
      logger.error("fine-tuning latest completed job failed", {
        component: "fine-tuning-job-manager",
        framework,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Return the full chain of completed jobs, oldest first, for model version
   * lineage. Useful for the dashboard to show "we've trained N models, here
   * is the history".
   */
  async getLineage(): Promise<FineTuningJob[]> {
    try {
      const client = getClient();
      const rows = await client.findMany({
        where: { status: "completed" },
        orderBy: { completedAt: "asc" },
      });
      return rows.map(rowToJob);
    } catch (err) {
      logger.error("fine-tuning lineage failed", {
        component: "fine-tuning-job-manager",
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}

/** Singleton job manager. */
export const fineTuningJobManager = new FineTuningJobManagerImpl();
