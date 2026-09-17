// @ts-nocheck
// =============================================================================
// SGTX v17 §16 — Task Center (5-Level Escalation)
// -----------------------------------------------------------------------------
// Levels (v17 §16):
//   1: NORMAL      — assigned user (default)
//   2: REMINDER    — first reminder (1 day overdue)
//   3: SUPERVISOR  — supervisor engaged (3 days overdue)
//   4: GOVERNOR    — SGTX Governor engaged (5 days overdue / compliance risk)
//   5: COMPLIANCE  — compliance review board (7 days overdue / regulated trade)
//
// Storage:
//   • Task rows — the work items themselves
//   • Activity rows — audit trail of each escalation
//   • InboxItem — surfaced to the Governor/compliance team when escalated
// =============================================================================
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "ESCALATED" | "DONE" | "CANCELLED";
export type EscalationLevel = 1 | 2 | 3 | 4 | 5;

export interface TaskCreateInput {
  tenantGtid: string;
  title: string;
  description?: string;
  assigneeGtid?: string;
  priority?: TaskPriority;
  deadline?: string; // ISO date
  category?: string;
  tradeId?: string;
}

export interface TaskFilters {
  tenantGtid?: string;
  assignee?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  category?: string;
  escalationLevel?: EscalationLevel;
  limit?: number;
}

export const ESCALATION_LEVELS: Record<EscalationLevel, {
  name: string;
  description: string;
  thresholdDays: number;
  routedTo: string;
}> = {
  1: { name: "NORMAL",      description: "Assigned user handles within deadline.",         thresholdDays: 0, routedTo: "assignee"     },
  2: { name: "REMINDER",    description: "First reminder — task is overdue.",                thresholdDays: 1, routedTo: "assignee"     },
  3: { name: "SUPERVISOR",  description: "Supervisor engaged — 3 days overdue.",            thresholdDays: 3, routedTo: "supervisor"  },
  4: { name: "GOVERNOR",    description: "SGTX Governor engaged — 5 days overdue / risk.",   thresholdDays: 5, routedTo: "governor"    },
  5: { name: "COMPLIANCE",  description: "Compliance review board — 7 days / regulated.",   thresholdDays: 7, routedTo: "compliance"  },
};

const PRIORITY_SCORE: Record<TaskPriority, number> = {
  LOW: 30, NORMAL: 50, HIGH: 70, URGENT: 85, CRITICAL: 95,
};

// =============================================================================
// createTask
// =============================================================================
export async function createTask(input: TaskCreateInput): Promise<{ taskId: string; task: any }> {
  if (!input.tenantGtid || !input.title) throw new Error("tenantGtid and title required");
  const priorityScore = PRIORITY_SCORE[input.priority || "NORMAL"];
  const task = await db.task.create({
    data: {
      tenantGtid: input.tenantGtid,
      tradeId: input.tradeId || null,
      title: input.title,
      description: input.description || null,
      priority: priorityScore,
      status: "OPEN",
      dueDate: input.deadline ? new Date(input.deadline) : null,
      assignedToGtid: input.assigneeGtid || null,
      escalationLevel: 1,
    },
  });

  await db.activity.create({
    data: {
      tradeId: input.tradeId || null,
      actorGtid: input.tenantGtid,
      action: "TASK_CREATED",
      description: `Task created: ${input.title} (priority=${input.priority || "NORMAL"})`,
      type: "INFO",
      metadata: JSON.stringify({ taskId: task.id, assigneeGtid: input.assigneeGtid || null }),
    },
  }).catch((e: any) => logger.error("[task-center] activity create failed:", e?.message));

  return { taskId: task.id, task };
}

// =============================================================================
// getTasks
// =============================================================================
export async function getTasks(filters: TaskFilters): Promise<{ tasks: any[]; count: number }> {
  const where: any = {};
  if (filters.tenantGtid) where.tenantGtid = filters.tenantGtid;
  if (filters.assignee) where.assignedToGtid = filters.assignee;
  if (filters.status) where.status = filters.status;
  if (filters.escalationLevel) where.escalationLevel = filters.escalationLevel;
  if (filters.category) where.description = { contains: filters.category };

  const limit = Math.min(filters.limit || 100, 500);
  const tasks = await db.task.findMany({
    where,
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: limit,
  });

  const enriched = tasks.map((t: any) => ({
    ...t,
    priorityLabel: inferPriorityLabel(t.priority),
    escalationLevelName: ESCALATION_LEVELS[t.escalationLevel as EscalationLevel]?.name || "UNKNOWN",
    nextEscalationAt: computeNextEscalation(t),
  }));

  if (filters.priority) {
    const filtered = enriched.filter((t: any) => t.priorityLabel === filters.priority);
    return { tasks: filtered, count: filtered.length };
  }
  return { tasks: enriched, count: enriched.length };
}

function inferPriorityLabel(score: number): TaskPriority {
  if (score >= 90) return "CRITICAL";
  if (score >= 80) return "URGENT";
  if (score >= 65) return "HIGH";
  if (score >= 40) return "NORMAL";
  return "LOW";
}

function computeNextEscalation(task: any): string | null {
  if (task.status === "DONE" || task.status === "CANCELLED") return null;
  if (!task.dueDate) return null;
  const current = task.escalationLevel || 1;
  if (current >= 5) return null;
  const next = (current + 1) as EscalationLevel;
  const dueMs = new Date(task.dueDate).getTime();
  const thresholdMs = ESCALATION_LEVELS[next].thresholdDays * 24 * 60 * 60 * 1000;
  return new Date(dueMs + thresholdMs).toISOString();
}

// =============================================================================
// escalateTask
// =============================================================================
export async function escalateTask(
  taskId: string,
  toLevel: EscalationLevel,
  reason: string,
  escalatedBy: string = "system",
): Promise<{
  escalated: boolean;
  fromLevel: EscalationLevel;
  toLevel: EscalationLevel;
  escalatedAt: string;
}> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("task not found");
  if (task.status === "DONE") throw new Error("cannot escalate a completed task");
  if (task.status === "CANCELLED") throw new Error("cannot escalate a cancelled task");

  const fromLevel = (task.escalationLevel || 1) as EscalationLevel;
  if (toLevel < 1 || toLevel > 5) throw new Error("toLevel must be 1..5");
  if (toLevel < fromLevel) throw new Error(`cannot de-escalate from ${fromLevel} to ${toLevel}`);

  await db.task.update({
    where: { id: taskId },
    data: {
      escalationLevel: toLevel,
      status: toLevel >= 3 ? "ESCALATED" : task.status === "ESCALATED" ? "OPEN" : task.status,
    },
  });

  const escalatedAt = new Date().toISOString();
  const levelMeta = ESCALATION_LEVELS[toLevel];

  await db.activity.create({
    data: {
      tradeId: task.tradeId,
      actorGtid: escalatedBy,
      action: "TASK_ESCALATED",
      description: `Task "${task.title}" escalated L${fromLevel} → L${toLevel} (${levelMeta.name}). Reason: ${reason}`,
      type: toLevel >= 4 ? "WARN" : "INFO",
      metadata: JSON.stringify({ taskId, fromLevel, toLevel, reason, escalatedAt }),
    },
  }).catch((e: any) => logger.error("[task-center] escalate activity failed:", e?.message));

  if (toLevel >= 3) {
    const routedTo = levelMeta.routedTo;
    await db.inboxItem.create({
      data: {
        tenantGtid: task.tenantGtid,
        tradeId: task.tradeId,
        category: "APPROVAL",
        priority: toLevel >= 4 ? 95 : 85,
        title: `Escalation L${toLevel} — ${task.title}`,
        description: `Task escalated to ${levelMeta.name} (${routedTo}). Reason: ${reason}.`,
        ctaLabel: "Review & Take Action",
      },
    }).catch((e: any) => logger.error("[task-center] escalate inbox failed:", e?.message));
  }

  return { escalated: true, fromLevel, toLevel, escalatedAt };
}

// =============================================================================
// completeTask
// =============================================================================
export async function completeTask(
  taskId: string,
  completionNote: string,
  completedBy: string = "system",
): Promise<{ completed: boolean; completedAt: string }> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("task not found");
  if (task.status === "DONE") throw new Error("task already completed");
  if (task.status === "CANCELLED") throw new Error("cannot complete a cancelled task");

  await db.task.update({
    where: { id: taskId },
    data: { status: "DONE", completedAt: new Date() },
  });

  const completedAt = new Date().toISOString();
  await db.activity.create({
    data: {
      tradeId: task.tradeId,
      actorGtid: completedBy,
      action: "TASK_COMPLETED",
      description: `Task "${task.title}" completed. Note: ${completionNote}`,
      type: "INFO",
      metadata: JSON.stringify({ taskId, completionNote, completedAt }),
    },
  }).catch((e: any) => logger.error("[task-center] complete activity failed:", e?.message));

  return { completed: true, completedAt };
}

// =============================================================================
// getTaskEscalationStatus
// =============================================================================
export async function getTaskEscalationStatus(taskId: string): Promise<{
  taskId: string;
  currentLevel: EscalationLevel;
  currentLevelName: string;
  nextEscalationAt: string | null;
  history: any[];
}> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("task not found");

  const currentLevel = (task.escalationLevel || 1) as EscalationLevel;
  const historyRows = await db.activity.findMany({
    where: {
      OR: [
        { action: "TASK_ESCALATED", metadata: { contains: taskId } },
        { action: "TASK_COMPLETED",  metadata: { contains: taskId } },
        { action: "TASK_CREATED",    metadata: { contains: taskId } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  }).catch(() => []);

  const history = historyRows.map((a: any) => ({
    id: a.id,
    action: a.action,
    description: a.description,
    actorGtid: a.actorGtid,
    type: a.type,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    taskId,
    currentLevel,
    currentLevelName: ESCALATION_LEVELS[currentLevel]?.name || "UNKNOWN",
    nextEscalationAt: computeNextEscalation(task),
    history,
  };
}

// =============================================================================
// getTask — single task retrieval
// =============================================================================
export async function getTask(taskId: string): Promise<any | null> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  return {
    ...task,
    priorityLabel: inferPriorityLabel(task.priority),
    escalationLevelName: ESCALATION_LEVELS[task.escalationLevel as EscalationLevel]?.name || "UNKNOWN",
    nextEscalationAt: computeNextEscalation(task),
  };
}

// =============================================================================
// Cron hook — auto-escalate based on deadline thresholds (idempotent)
// =============================================================================
export async function autoEscalateOverdue(): Promise<{ checked: number; escalated: number }> {
  const now = new Date();
  const openTasks = await db.task.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] },
      dueDate: { not: null, lt: now },
      escalationLevel: { lt: 5 },
    },
    take: 500,
  }).catch(() => []);

  let escalated = 0;
  for (const t of openTasks) {
    const dueMs = new Date(t.dueDate!).getTime();
    const overdueDays = Math.floor((Date.now() - dueMs) / (24 * 60 * 60 * 1000));
    let targetLevel: EscalationLevel = t.escalationLevel as EscalationLevel;
    for (const lvl of [5, 4, 3, 2] as EscalationLevel[]) {
      if (overdueDays >= ESCALATION_LEVELS[lvl].thresholdDays) {
        targetLevel = lvl;
        break;
      }
    }
    if (targetLevel > (t.escalationLevel || 1)) {
      try {
        await escalateTask(
          t.id,
          targetLevel,
          `Auto-escalation: ${overdueDays} days overdue (threshold ${ESCALATION_LEVELS[targetLevel].thresholdDays}d).`,
          "system:cron",
        );
        escalated++;
      } catch (e: any) {
        logger.error(`[task-center] auto-escalate ${t.id} failed:`, e?.message);
      }
    }
  }
  return { checked: openTasks.length, escalated };
}
