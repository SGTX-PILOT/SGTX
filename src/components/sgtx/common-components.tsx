// @ts-nocheck
"use client";

/**
 * SGTX Common Components (Blueprint Part 12A.8 – 12A.13)
 * ------------------------------------------------------------------
 *  • TaskCenterScreen           — 12A.10 unified task queue w/ escalation
 *  • NotificationCenterScreen   — 12A.11 multi-channel notification log
 *  • FocusMode                  — 12A.12 moon-icon focus mode toggle + banner
 *  • FeedbackFAB                — 12A.8 floating action button (Bug / Feature / Help)
 *  • HelpCenterModal            — 12A.13 self-service help center
 *  • AdaptiveExperienceToggle   — 12A.9 Guided / Expert / Auto mode toggle
 *
 * All components use the SGTX gold / sovereign theme, shadcn/ui primitives,
 * TanStack Query for server state, and Sonner for toasts.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, timeAgo, priorityColor } from "@/lib/sgtx/format";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bell,
  Moon,
  MessageSquare,
  HelpCircle,
  Plus,
  Send,
  Search,
  BookOpen,
  Mail,
  Smartphone,
  ShieldAlert,
  Crown,
  Zap,
  ChevronRight,
  ListChecks,
  Inbox,
  Filter,
  Volume2,
  Lightbulb,
  ExternalLink,
  Keyboard,
  PlayCircle,
  Bug,
  FileWarning,
  Loader2,
  Sparkles,
  Brain,
  User,
  Calendar,
} from "lucide-react";

// ============================================================
// Shared constants
// ============================================================

type Task = {
  id: string;
  tenantGtid: string;
  tradeId?: string | null;
  title: string;
  description?: string | null;
  priority: number;
  status: string; // OPEN | IN_PROGRESS | BLOCKED | DONE | ESCALATED
  dueDate?: string | null;
  assignedToGtid?: string | null;
  escalationLevel: number; // 0-4
  completedAt?: string | null;
  createdAt: string;
};

type Notification = {
  id: string;
  tenantGtid: string;
  channel: string; // IN_APP | EMAIL | SMS | WHATSAPP | PUSH
  category: string;
  title: string;
  message: string;
  deliveryStatus: string; // SENT | FAILED | DELIVERED | READ
  sentAt: string;
};

// 12A.10.4 Escalation ladder
const ESCALATION_LADDER = [
  { level: 0, label: "Normal",          color: "#10b981", icon: CheckCircle2, hint: "On track" },
  { level: 1, label: "Reminder",        color: "#60a5fa", icon: Bell,         hint: "Daily reminder sent" },
  { level: 2, label: "Supervisor",      color: "#fbbf24", icon: AlertTriangle, hint: "Supervisor notified" },
  { level: 3, label: "Governor freeze", color: "#f87171", icon: ShieldAlert,  hint: "Governor froze shipment" },
  { level: 4, label: "Compliance / SAR",color: "#a78bfa", icon: Crown,        hint: "Compliance team — SAR may be drafted" },
];

const TASK_GROUPS: { key: string; label: string; color: string; icon: typeof Inbox }[] = [
  { key: "OPEN",        label: "Open",        color: "#60a5fa", icon: Inbox },
  { key: "IN_PROGRESS", label: "In Progress", color: "#a78bfa", icon: Clock },
  { key: "BLOCKED",     label: "Blocked",     color: "#fbbf24", icon: AlertTriangle },
  { key: "DONE",        label: "Done",        color: "#10b981", icon: CheckCircle2 },
];

const NOTIF_CHANNELS: { key: string; label: string; icon: typeof Bell }[] = [
  { key: "IN_APP",   label: "In-App",   icon: Bell },
  { key: "EMAIL",    label: "Email",    icon: Mail },
  { key: "SMS",      label: "SMS",      icon: Smartphone },
  { key: "PUSH",     label: "Push",     icon: Send },
];

const DELIVERY_STATUSES = ["SENT", "DELIVERED", "READ", "FAILED"] as const;

function escalationMeta(level: number) {
  return ESCALATION_LADDER[Math.min(Math.max(level, 0), 4)];
}

// ============================================================
// 12A.10 — TASK CENTER
// ============================================================

export function TaskCenterScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>("ALL");

  const { data, isLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ["sgtx-tasks", tenantGtid],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/tasks?tenantGtid=${encodeURIComponent(tenantGtid)}`);
      if (!r.ok) return { tasks: [] };
      return r.json();
    },
    enabled: !!tenantGtid,
  });

  const tasks = (data?.tasks || []).filter((t) =>
    filter === "ALL" ? true : String(t.status) === filter
  );

  const grouped = TASK_GROUPS.map((g) => ({
    ...g,
    items: tasks.filter((t) => String(t.status) === g.key),
  }));

  const completeMut = useMutation({
    mutationFn: async (taskId: string) => {
      const r = await fetch("/api/sgtx/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", taskId }),
      });
      if (!r.ok) throw new Error("complete failed");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Task completed", { description: "Marked DONE and logged to Loom." });
      qc.invalidateQueries({ queryKey: ["sgtx-tasks", tenantGtid] });
    },
    onError: () => toast.error("Could not complete task"),
  });

  const escalateMut = useMutation({
    mutationFn: async (taskId: string) => {
      const r = await fetch("/api/sgtx/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "escalate", taskId }),
      });
      if (!r.ok) throw new Error("escalate failed");
      return r.json();
    },
    onSuccess: (d) => {
      const meta = escalationMeta(d?.task?.escalationLevel ?? 0);
      toast.warning(`Escalated → ${meta.label}`, { description: meta.hint });
      qc.invalidateQueries({ queryKey: ["sgtx-tasks", tenantGtid] });
    },
    onError: () => toast.error("Could not escalate task"),
  });

  const pendingCount = grouped.reduce(
    (n, g) => n + (g.key === "DONE" ? 0 : g.items.length),
    0
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 sm:p-5 border-gold/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-gold" />
              Task Center
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pendingCount} pending · Unified queue across trade · financing · compliance · dispute
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {TASK_GROUPS.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.label}
                  </SelectItem>
                ))}
                <SelectItem value="ESCALATED">Escalated</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="bg-gold-gradient text-sovereign h-8"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Create Task
            </Button>
          </div>
        </div>
      </Card>

      {/* Escalation legend */}
      <Card className="p-3 border-border/50">
        <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">
          Escalation ladder
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {ESCALATION_LADDER.map((e) => {
            const Icon = e.icon;
            return (
              <div key={e.level} className="flex items-center gap-1.5">
                <Icon className="w-3 h-3" style={{ color: e.color }} />
                <span className="text-[0.65rem] text-muted-foreground">
                  L{e.level} · {e.label}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Task groups */}
      {isLoading ? (
        <Card className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gold animate-spin" />
        </Card>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          🎉 No tasks in this view.
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) =>
            g.items.length === 0 ? null : (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-2">
                  <g.icon className="w-3.5 h-3.5" style={{ color: g.color }} />
                  <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: g.color }}>
                    {g.label}
                  </h3>
                  <Badge variant="outline" className="text-[0.6rem] h-4 px-1.5">
                    {g.items.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {g.items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onComplete={() => completeMut.mutate(t.id)}
                      onEscalate={() => escalateMut.mutate(t.id)}
                      completing={completeMut.isPending && completeMut.variables === t.id}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Create task modal */}
      <CreateTaskModal
        open={showCreate}
        onOpenChange={setShowCreate}
        tenantGtid={tenantGtid}
        onCreated={() => qc.invalidateQueries({ queryKey: ["sgtx-tasks", tenantGtid] })}
      />
    </div>
  );
}

function TaskCard({
  task,
  onComplete,
  onEscalate,
  completing,
}: {
  task: Task;
  onComplete: () => void;
  onEscalate: () => void;
  completing: boolean;
}) {
  const esc = escalationMeta(task.escalationLevel);
  const EscIcon = esc.icon;
  const overdue =
    task.dueDate && new Date(task.dueDate).getTime() < Date.now() && task.status !== "DONE";
  const isDone = task.status === "DONE";

  return (
    <Card
      className={cn(
        "p-4 relative overflow-hidden transition-all",
        isDone ? "opacity-60" : "hover:border-gold/40"
      )}
    >
      {/* Escalation left rail */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: esc.color }}
        aria-hidden
      />

      <div className="pl-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-semibold text-foreground", isDone && "line-through")}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-[0.7rem] text-muted-foreground mt-0.5 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          <Badge
            variant="outline"
            className="text-[0.55rem] font-bold uppercase flex-shrink-0"
            style={{ color: priorityColor(task.priority), borderColor: `${priorityColor(task.priority)}55` }}
          >
            P{task.priority}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground mb-3">
          {task.dueDate && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-red-400 font-semibold")}>
              <Calendar className="w-3 h-3" />
              {fmtDate(task.dueDate)}
              {overdue && " · OVERDUE"}
            </span>
          )}
          {task.assignedToGtid && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="font-mono">{task.assignedToGtid}</span>
            </span>
          )}
          {task.tradeId && (
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              <span className="font-mono truncate max-w-[120px]">{task.tradeId}</span>
            </span>
          )}
        </div>

        {/* Escalation badge */}
        <div
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] font-semibold mb-3"
          style={{ background: `${esc.color}22`, color: esc.color }}
          title={esc.hint}
        >
          <EscIcon className="w-3 h-3" />
          L{task.escalationLevel} · {esc.label}
        </div>

        <div className="flex items-center gap-2">
          {!isDone && (
            <Button
              size="sm"
              className="bg-gold-gradient text-sovereign h-7 text-xs"
              onClick={onComplete}
              disabled={completing}
            >
              {completing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              )}
              Complete
            </Button>
          )}
          {!isDone && task.escalationLevel < 4 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onEscalate}
            >
              <ShieldAlert className="w-3 h-3 mr-1" />
              Escalate
            </Button>
          )}
          {isDone && task.completedAt && (
            <span className="text-[0.65rem] text-emerald-500 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Done {timeAgo(task.completedAt)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function CreateTaskModal({
  open,
  onOpenChange,
  tenantGtid,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (_v: boolean) => void;
  tenantGtid: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("50");
  const [dueDate, setDueDate] = useState("");
  const [assignedToGtid, setAssignedToGtid] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("50");
    setDueDate("");
    setAssignedToGtid("");
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/sgtx/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantGtid,
          title: title.trim(),
          description: description.trim() || null,
          priority: Number(priority),
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          assignedToGtid: assignedToGtid.trim() || null,
        }),
      });
      if (!r.ok) throw new Error("create failed");
      toast.success("Task created", { description: "Added to the unified queue." });
      onCreated();
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Could not create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-gold" /> Create Task
          </DialogTitle>
          <DialogDescription>
            Create a task in the unified Task Center. The assignee will see it in their Smart Inbox.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-title" className="text-xs">Title *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sign contract for USTN SGTX-EG-..."
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc" className="text-xs">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done and why"
              className="text-sm min-h-[80px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Priority (0-100)</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 — Low</SelectItem>
                  <SelectItem value="30">30 — Informational</SelectItem>
                  <SelectItem value="50">50 — Normal</SelectItem>
                  <SelectItem value="75">75 — Important</SelectItem>
                  <SelectItem value="90">90 — High</SelectItem>
                  <SelectItem value="100">100 — Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due" className="text-xs">Due date</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-assignee" className="text-xs">Assignee GTID</Label>
            <Input
              id="task-assignee"
              value={assignedToGtid}
              onChange={(e) => setAssignedToGtid(e.target.value)}
              placeholder="SGTX-EG-TRD-002139-7F3A"
              className="h-9 text-sm font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="bg-gold-gradient text-sovereign"
            onClick={submit}
            disabled={submitting || !title.trim()}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 12A.11 — NOTIFICATION & ALERT CENTER
// ============================================================

export function NotificationCenterScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");

  const { data, isLoading } = useQuery<{ notifications: Notification[] }>({
    queryKey: ["sgtx-notifications", tenantGtid, channel],
    queryFn: async () => {
      const qs = new URLSearchParams({ tenantGtid });
      if (channel !== "ALL") qs.set("channel", channel);
      const r = await fetch(`/api/sgtx/notifications?${qs.toString()}`);
      if (!r.ok) return { notifications: [] };
      return r.json();
    },
    enabled: !!tenantGtid,
  });

  const notifications = (data?.notifications || []).filter((n) =>
    status === "ALL" ? true : n.deliveryStatus === status
  );

  const grouped = NOTIF_CHANNELS.map((c) => ({
    ...c,
    items: notifications.filter((n) => n.channel === c.key),
  }));

  // Notification preferences — persisted to localStorage (Part 12A.11.2)
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("sgtx-notif-prefs") || "{}");
    } catch {
      return {};
    }
  });
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = JSON.parse(localStorage.getItem("sgtx-notif-quiet") || "{}");
      // Defer setState to avoid cascading renders in effect body
      if (saved.start || saved.end) {
        setTimeout(() => {
          if (saved.start) setQuietStart(saved.start);
          if (saved.end) setQuietEnd(saved.end);
        }, 0);
      }
    }
  }, []);

  const togglePref = (key: string, val: boolean) => {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    localStorage.setItem("sgtx-notif-prefs", JSON.stringify(next));
    toast.success(`${key.replace(/_/g, " ")} ${val ? "enabled" : "disabled"}`);
  };

  const saveQuiet = () => {
    localStorage.setItem("sgtx-notif-quiet", JSON.stringify({ start: quietStart, end: quietEnd }));
    toast.success("Quiet hours saved", { description: `${quietStart} → ${quietEnd} (local time)` });
  };

  const testMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/sgtx/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantGtid,
          channel: channel === "ALL" ? "IN_APP" : channel,
          category: "GENERAL",
          title: "Test notification",
          message: "This is a test from the SGTX Notification Center.",
          deliveryStatus: "SENT",
        }),
      });
      if (!r.ok) throw new Error("test failed");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Test notification sent");
      qc.invalidateQueries({ queryKey: ["sgtx-notifications", tenantGtid] });
    },
    onError: () => toast.error("Could not send test notification"),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 sm:p-5 border-gold/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-gold" />
              Notification & Alert Center
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Multi-channel delivery log · IN_APP · EMAIL · SMS · PUSH
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All channels</SelectItem>
                {NOTIF_CHANNELS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {DELIVERY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
            >
              {testMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
              Test
            </Button>
          </div>
        </div>
      </Card>

      {/* Preferences */}
      <Card className="p-4 border-border/50">
        <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-3">
          Notification Preferences (Part 12A.11.2)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {NOTIF_CHANNELS.map((c) => {
            const Icon = c.icon;
            const enabled = prefs[c.key] !== false; // default ON
            return (
              <div key={c.key} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{c.label}</span>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => togglePref(c.key, v)}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border/30">
          <div className="flex flex-wrap items-center gap-3">
            <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Quiet hours</span>
            <Input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="h-8 w-[100px] text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="h-8 w-[100px] text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={saveQuiet}>
              Save
            </Button>
            <span className="text-[0.6rem] text-muted-foreground">
              During quiet hours, only priority ≥ 90 alerts are delivered.
            </span>
          </div>
        </div>
      </Card>

      {/* Channel groups */}
      {isLoading ? (
        <Card className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gold animate-spin" />
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No notifications match these filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {grouped.map((g) =>
            g.items.length === 0 ? null : (
              <Card key={g.key} className="p-3">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/40">
                  <g.icon className="w-3.5 h-3.5 text-gold" />
                  <h3 className="text-xs font-bold tracking-widest uppercase text-foreground">
                    {g.label}
                  </h3>
                  <Badge variant="outline" className="text-[0.6rem] h-4 px-1.5 ml-auto">
                    {g.items.length}
                  </Badge>
                </div>
                <ScrollArea className="max-h-72">
                  <div className="space-y-2 pr-2">
                    {g.items.map((n) => {
                      const statusColor =
                        n.deliveryStatus === "FAILED" ? "#f87171"
                        : n.deliveryStatus === "READ" ? "#10b981"
                        : n.deliveryStatus === "DELIVERED" ? "#34d399"
                        : "#fbbf24";
                      return (
                        <div
                          key={n.id}
                          className="p-2 rounded-lg bg-background/40 border border-border/40 hover:border-gold/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-foreground line-clamp-1">
                              {n.title}
                            </p>
                            <span
                              className="text-[0.55rem] font-bold uppercase px-1.5 py-0 rounded flex-shrink-0"
                              style={{ color: statusColor, background: `${statusColor}22` }}
                            >
                              {n.deliveryStatus}
                            </span>
                          </div>
                          <p className="text-[0.7rem] text-muted-foreground mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[0.6rem] text-muted-foreground">
                            <span className="px-1.5 py-0 rounded bg-muted/40">{n.category}</span>
                            <span>{timeAgo(n.sentAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 12A.12 — FOCUS MODE
// ============================================================

const FOCUS_DURATIONS = [
  { key: "1h",           label: "1 hour",      ms: 60 * 60 * 1000 },
  { key: "4h",           label: "4 hours",     ms: 4 * 60 * 60 * 1000 },
  { key: "8h",           label: "8 hours",     ms: 8 * 60 * 60 * 1000 },
  { key: "until-tomorrow", label: "Until tomorrow (08:00)", ms: 0 },
  { key: "custom",       label: "Custom…",     ms: 0 },
] as const;

type FocusState = {
  active: boolean;
  endsAt: number; // epoch ms
  durationKey: string;
};

const FOCUS_STORAGE_KEY = "sgtx-focus-mode";

function readFocus(): FocusState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FocusState;
    if (!parsed.active || parsed.endsAt < Date.now()) {
      localStorage.removeItem(FOCUS_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeFocus(state: FocusState | null) {
  if (typeof window === "undefined") return;
  if (!state || !state.active) {
    localStorage.removeItem(FOCUS_STORAGE_KEY);
  } else {
    localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(state));
  }
}

/** Hook that gives any component read-access to Focus Mode state. */
export function useFocusMode() {
  const [state, setState] = useState<FocusState | null>(null);

  useEffect(() => {
    // Defer initial setState to avoid cascading renders in effect body
    setTimeout(() => setState(readFocus()), 0);
    const onStorage = (e: StorageEvent) => {
      if (e.key === FOCUS_STORAGE_KEY) setState(readFocus());
    };
    window.addEventListener("storage", onStorage);
    const tick = setInterval(() => {
      const cur = readFocus();
      setState((prev) => {
        const sameActive = prev?.active === cur?.active;
        const sameEnd = prev?.endsAt === cur?.endsAt;
        return sameActive && sameEnd ? prev : cur;
      });
    }, 30_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(tick);
    };
  }, []);

  const activate = useCallback((durationKey: string, customMs?: number) => {
    const d = FOCUS_DURATIONS.find((x) => x.key === durationKey);
    if (!d) return;
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
    const next = { active: true, endsAt, durationKey: d.key };
    writeFocus(next);
    setState(next);
    toast.success("Focus Mode activated", {
      description: `Until ${fmtDateTime(endsAt)} — only priority ≥ 90 alerts shown.`,
    });
  }, []);

  const deactivate = useCallback(() => {
    writeFocus(null);
    setState(null);
    toast.info("Focus Mode ended");
  }, []);

  return { state, activate, deactivate };
}

/** Floating "Focus Mode active" banner shown at the top of the Smart Inbox. */
export function FocusModeBanner({ state, onExit }: { state: FocusState; onExit: () => void }) {
  const remaining = Math.max(0, state.endsAt - Date.now());
  const mins = Math.floor(remaining / 60_000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  const remainingLabel = hrs > 0 ? `${hrs}h ${rem}m` : `${mins}m`;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="m-3 p-3 rounded-xl bg-indigo-500/5 border border-indigo-400/30 flex items-center gap-3"
    >
      <Moon className="w-4 h-4 text-indigo-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">
          Focus Mode active until {fmtDateTime(state.endsAt)}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">
          {remainingLabel} remaining · only priority 90+ alerts will show
        </p>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onExit}>
        Exit Focus
      </Button>
    </motion.div>
  );
}

/** Compact button used in the topbar — moon icon that opens a duration picker. */
export function FocusModeButton() {
  const { state, activate, deactivate } = useFocusMode();
  const [open, setOpen] = useState(false);
  const [customH, setCustomH] = useState("2");

  const active = !!state?.active;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-9 w-9 text-muted-foreground relative",
          active && "bg-indigo-500/15 text-indigo-300"
        )}
        title={active ? "Focus Mode active — click to exit" : "Activate Focus Mode"}
        onClick={() => (active ? deactivate() : setOpen(true))}
      >
        <Moon className="w-4 h-4" />
        {active && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-300" /> Focus Mode
            </DialogTitle>
            <DialogDescription>
              Suppress all non-critical notifications. Only priority ≥ 90 alerts (contract
              signing deadlines, margin calls, dispute responses) will be delivered.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {FOCUS_DURATIONS.map((d) => (
              <Button
                key={d.key}
                variant="outline"
                className="h-12 text-xs flex flex-col gap-0.5 justify-center"
                onClick={() => {
                  if (d.key === "custom") {
                    const h = Number(customH) || 1;
                    activate("custom", h * 60 * 60 * 1000);
                  } else {
                    activate(d.key);
                  }
                  setOpen(false);
                }}
              >
                <span className="font-semibold">{d.label.split(" ")[0]}</span>
                <span className="text-[0.6rem] text-muted-foreground">
                  {d.label.includes(" ") ? d.label.split(" ").slice(1).join(" ") : ""}
                </span>
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs flex-shrink-0">Custom hours</Label>
            <Input
              type="number"
              min="1"
              max="24"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              className="h-8 text-sm w-24"
            />
            <Button
              size="sm"
              className="bg-gold-gradient text-sovereign h-8 ml-auto"
              onClick={() => {
                const h = Number(customH) || 1;
                activate("custom", h * 60 * 60 * 1000);
                setOpen(false);
              }}
            >
              Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// 12A.9 — ADAPTIVE EXPERIENCE TOGGLE (GUIDED / EXPERT)
// ============================================================

export type ExperienceMode = "GUIDED" | "EXPERT" | "AUTO";

const EXPERIENCE_KEY = "sgtx-experience-mode";

export function useExperienceMode(): [ExperienceMode, (_m: ExperienceMode) => void] {
  const [mode, setMode] = useState<ExperienceMode>("AUTO");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = (localStorage.getItem(EXPERIENCE_KEY) as ExperienceMode) || "AUTO";
    // Defer setState to avoid cascading renders in effect body
    setTimeout(() => setMode(stored), 0);
  }, []);

  const set = useCallback((m: ExperienceMode) => {
    setMode(m);
    if (typeof window !== "undefined") {
      localStorage.setItem(EXPERIENCE_KEY, m);
    }
  }, []);

  return [mode, set];
}

/** Toggle for the topbar — cycles Guided → Expert → Auto. */
export function AdaptiveExperienceToggle({ compact = true }: { compact?: boolean }) {
  const [mode, setMode] = useExperienceMode();
  const cycle = () => {
    const next: ExperienceMode =
      mode === "AUTO" ? "GUIDED" : mode === "GUIDED" ? "EXPERT" : "AUTO";
    setMode(next);
    const labels: Record<ExperienceMode, string> = {
      GUIDED: "Guided Mode — step-by-step tooltips & wizards",
      EXPERT: "Expert Mode — dense layouts, keyboard shortcuts, minimal confirmations",
      AUTO: "Auto — system suggests mode based on activity",
    };
    toast.success(`Switched to ${next} mode`, { description: labels[next] });
  };

  const Icon = mode === "EXPERT" ? Zap : mode === "GUIDED" ? Lightbulb : Brain;
  const color = mode === "EXPERT" ? "#fbbf24" : mode === "GUIDED" ? "#60a5fa" : "#a78bfa";

  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      className={cn(compact ? "h-9 w-9" : "h-8", "text-muted-foreground")}
      title={`Experience: ${mode} — click to cycle`}
      onClick={cycle}
    >
      <Icon className={compact ? "w-4 h-4" : "w-3.5 h-3.5 mr-1"} style={{ color }} />
      {!compact && <span className="text-xs" style={{ color }}>{mode}</span>}
    </Button>
  );
}

// ============================================================
// 12A.8 — FEEDBACK FLOATING ACTION BUTTON
// ============================================================

export function FeedbackFAB({ tenantGtid, portalId }: { tenantGtid?: string; portalId?: string }) {
  const [open, setOpen] = useState(false);
  const activeTenant = useAppStore((s) => s.activeTenantGtid) || tenantGtid || "SGTX-XX-ADM-000001-CORE";
  const activeUstn = useAppStore((s) => s.activeUstn);

  return (
    <>
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 w-12 h-12 rounded-full bg-card border border-gold/40 text-gold flex items-center justify-center shadow-lg hover:glow-gold transition-all"
        title="Feedback & Help (Part 12A.8)"
        aria-label="Open feedback and help"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gold-gradient animate-pulse" />
      </motion.button>

      <FeedbackModal
        open={open}
        onOpenChange={setOpen}
        tenantGtid={activeTenant}
        portalId={portalId || ""}
        ustn={activeUstn || ""}
      />
    </>
  );
}

function FeedbackModal({
  open,
  onOpenChange,
  tenantGtid,
  portalId,
  ustn,
}: {
  open: boolean;
  onOpenChange: (_v: boolean) => void;
  tenantGtid: string;
  portalId: string;
  ustn: string;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"BUG" | "FEATURE" | "HELP">("BUG");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [submitting, setSubmitting] = useState(false);

  // Auto-populated context (Part 12A.8.1)
  const ctx = useMemo(() => {
    if (typeof window === "undefined") return { url: "", ua: "" };
    return {
      url: window.location.href,
      ua: navigator.userAgent,
    };
  }, [open]);

  const reset = () => {
    setSubject("");
    setDescription("");
    setPriority("NORMAL");
  };

  const submit = async () => {
    if (subject.trim().length < 3) {
      toast.error("Please enter a subject (min 3 chars)");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Description must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/sgtx/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantGtid,
          type: tab,
          subject: subject.trim(),
          description: `${description.trim()}\n\n--- Auto-context ---\nURL: ${ctx.url}\nUser Agent: ${ctx.ua}\nPortal: ${portalId || "—"}\nActive USTN: ${ustn || "—"}`,
          priority,
          url: ctx.url,
          userAgent: ctx.ua,
        }),
      });
      if (!r.ok) throw new Error("submit failed");
      const d = await r.json();
      toast.success("Feedback submitted — thank you!", {
        description: `${tab} ticket #${d?.ticket?.id?.slice(-6) || "created"} · ${priority}`,
      });
      qc.invalidateQueries({ queryKey: ["sgtx-feedback", tenantGtid] });
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Could not submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gold" /> Feedback & Help
          </DialogTitle>
          <DialogDescription>
            One-click feedback routed to Platform Governance. Critical bugs raise a priority 95 inbox alert.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(val) => setTab(val as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="BUG" className="text-xs">
              <Bug className="w-3 h-3 mr-1" /> Bug
            </TabsTrigger>
            <TabsTrigger value="FEATURE" className="text-xs">
              <Lightbulb className="w-3 h-3 mr-1" /> Feature
            </TabsTrigger>
            <TabsTrigger value="HELP" className="text-xs">
              <HelpCircle className="w-3 h-3 mr-1" /> Help
            </TabsTrigger>
          </TabsList>

          <TabsContent value="BUG" className="mt-3">
            <p className="text-[0.65rem] text-muted-foreground mb-2">
              Report a platform error or unexpected behaviour. Severity CRITICAL triggers an immediate Smart Inbox alert to Platform Governance.
            </p>
          </TabsContent>
          <TabsContent value="FEATURE" className="mt-3">
            <p className="text-[0.65rem] text-muted-foreground mb-2">
              Suggest a new feature or improvement. AI (A1) categorises and adds to the weekly report.
            </p>
          </TabsContent>
          <TabsContent value="HELP" className="mt-3">
            <p className="text-[0.65rem] text-muted-foreground mb-2">
              Ask a question — first attempted by the Customer Care Chatbot, then escalated to a human support agent if needed.
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fb-subject" className="text-xs">Subject *</Label>
            <Input
              id="fb-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={
                tab === "BUG" ? "e.g. Contract signing button unresponsive"
                : tab === "FEATURE" ? "e.g. Bulk invoice export"
                : "e.g. How do I switch to Seller mode?"
              }
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-desc" className="text-xs">
              {tab === "HELP" ? "Question" : "Description"} * (min 10 chars)
            </Label>
            <Textarea
              id="fb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                tab === "BUG" ? "Steps to reproduce, expected vs actual behaviour"
                : tab === "FEATURE" ? "What problem does this solve? Business value?"
                : "What do you need help with?"
              }
              className="text-sm min-h-[100px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {tab === "BUG" ? "Severity" : tab === "FEATURE" ? "Priority" : "Urgent?"}
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tab === "BUG" ? (
                    <>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="NORMAL">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Critical</SelectItem>
                    </>
                  ) : tab === "FEATURE" ? (
                    <>
                      <SelectItem value="LOW">Nice to have</SelectItem>
                      <SelectItem value="NORMAL">Important</SelectItem>
                      <SelectItem value="HIGH">Critical</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="LOW">Not urgent</SelectItem>
                      <SelectItem value="HIGH">Urgent</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Auto-context</Label>
              <div className="text-[0.6rem] text-muted-foreground p-2 rounded bg-muted/30 border border-border/40 font-mono leading-snug">
                <div className="truncate" title={ctx.url}>URL: {ctx.url || "—"}</div>
                <div>Portal: {portalId || "—"}</div>
                <div className="truncate" title={ustn}>USTN: {ustn || "—"}</div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="bg-gold-gradient text-sovereign"
            onClick={submit}
            disabled={submitting || subject.trim().length < 3 || description.trim().length < 10}
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 12A.13 — HELP CENTER MODAL
// ============================================================

const HELP_ARTICLES = [
  { title: "Quick Start Decision Tree", category: "Getting Started", duration: "10 min", icon: Lightbulb },
  { title: "Tab Index — Searchable", category: "Getting Started", duration: "—", icon: ListChecks },
  { title: "Keyboard Shortcuts Reference", category: "Getting Started", duration: "—", icon: Keyboard },
  { title: "Your First Trade in 5 Minutes", category: "Video Academy", duration: "5:23", icon: PlayCircle },
  { title: "How to Create a Trade Request", category: "Video Academy", duration: "3:15", icon: PlayCircle },
  { title: "Locking EXW Price & Logistics", category: "Video Academy", duration: "4:45", icon: PlayCircle },
  { title: "Using the QC Inspection App", category: "Video Academy", duration: "3:30", icon: PlayCircle },
  { title: "How to Bid on Financing Requests", category: "Video Academy", duration: "4:00", icon: PlayCircle },
  { title: "Filing a Dispute", category: "Video Academy", duration: "4:20", icon: PlayCircle },
  { title: "Buyer Guide", category: "Role Guides", duration: "PDF", icon: BookOpen },
  { title: "Seller Guide", category: "Role Guides", duration: "PDF", icon: BookOpen },
  { title: "Logistics Provider Guide", category: "Role Guides", duration: "PDF", icon: BookOpen },
  { title: "Financier Guide", category: "Role Guides", duration: "PDF", icon: BookOpen },
  { title: "Government Official Guide", category: "Role Guides", duration: "PDF", icon: BookOpen },
  { title: "Nafeza Integration", category: "Regulatory Compliance", duration: "—", icon: ShieldAlert },
  { title: "CargoX ACI", category: "Regulatory Compliance", duration: "—", icon: ShieldAlert },
  { title: "Egyptian Customs Law 207/2020", category: "Regulatory Compliance", duration: "—", icon: FileWarning },
  { title: "Multi-Shipment Contracts", category: "Trade Guides", duration: "—", icon: BookOpen },
  { title: "Distressed Cargo Workflow", category: "Trade Guides", duration: "—", icon: BookOpen },
  { title: "OpenAPI Reference", category: "API & Integration", duration: "—", icon: ExternalLink },
  { title: "Webhook Guide", category: "API & Integration", duration: "—", icon: ExternalLink },
];

const QUICK_LINKS = [
  { label: "Quick Start Decision Tree", icon: Lightbulb, hint: "Find your portal in 3 clicks" },
  { label: "Tab Index", icon: ListChecks, hint: "Searchable A–Z of all portal tabs" },
  { label: "Keyboard Shortcuts", icon: Keyboard, hint: "⌘K · ⌘H · ⌘I · ⌘B" },
  { label: "Glossary of Terms", icon: BookOpen, hint: "GTID · USTN · EXW · FeeLock" },
];

export function HelpCenterModal({ open, onOpenChange }: { open: boolean; onOpenChange: (_v: boolean) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return HELP_ARTICLES;
    const q = search.toLowerCase();
    return HELP_ARTICLES.filter((a) =>
      a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    );
  }, [search]);

  const categories = useMemo(() => {
    const map = new Map<string, typeof HELP_ARTICLES>();
    filtered.forEach((a) => {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-gold" /> Help Center
          </DialogTitle>
          <DialogDescription>
            Self-service documentation, video academy, keyboard shortcuts and support escalation.
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help articles, guides, videos…"
            className="h-10 pl-9 text-sm"
          />
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                onClick={() => toast.info(`Opening: ${q.label}`, { description: q.hint })}
                className="p-2.5 rounded-lg border border-border/50 bg-background/40 hover:border-gold/40 hover:bg-gold/5 transition-colors text-left"
              >
                <Icon className="w-3.5 h-3.5 text-gold mb-1" />
                <p className="text-[0.7rem] font-semibold text-foreground leading-tight">{q.label}</p>
                <p className="text-[0.55rem] text-muted-foreground mt-0.5 line-clamp-1">{q.hint}</p>
              </button>
            );
          })}
        </div>

        {/* Articles / videos */}
        <ScrollArea className="flex-1 scroll-gold min-h-0">
          <div className="space-y-3 pr-2">
            {categories.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                No articles match &ldquo;{search}&rdquo;.
              </p>
            ) : (
              categories.map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1.5">
                    {cat}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {items.map((a) => {
                      const Icon = a.icon;
                      return (
                        <button
                          key={a.title}
                          onClick={() => toast.info(`Opening: ${a.title}`, { description: `${a.category} · ${a.duration}` })}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/40 text-left transition-colors group"
                        >
                          <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-gold flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground truncate">{a.title}</p>
                            <p className="text-[0.55rem] text-muted-foreground">{a.duration}</p>
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer: Contact Support */}
        <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-2">
          <p className="text-[0.6rem] text-muted-foreground">
            Can&apos;t find what you need? Escalate to a human agent via VoIP callback.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => {
              toast.success("Support ticket created", {
                description: "A human agent will respond within 4 hours. Reference: SGTX-HELP-" + Date.now().toString(36).toUpperCase(),
              });
              onOpenChange(false);
            }}
          >
            <Sparkles className="w-3 h-3 mr-1 text-gold" /> Contact Support
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ GTID Chat Screen (Part 12A — peer-to-peer secure messaging) ============
// 2-column layout: chat list (left) + message thread (right).
// Features: start new chat by GTID, send messages, AI summarize, archive, delete, restore.
// All messages are USTN-linked and GTID-anchored.
export function GtidChatScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ARCHIVED" | "DELETED">("ACTIVE");
  const [newChatGtid, setNewChatGtid] = useState("");
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  // Fetch chat list
  const { data: chatData, isLoading } = useQuery({
    queryKey: ["gtid-chats", tenantGtid, statusFilter],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/chat?tenantGtid=${tenantGtid}&status=${statusFilter}`);
      if (!r.ok) throw new Error("Failed to load chats");
      return r.json();
    },
  });

  // Fetch selected chat messages
  const { data: chatDetail, refetch: refetchChat } = useQuery({
    queryKey: ["gtid-chat-detail", selectedChat?.chatId],
    queryFn: async () => {
      if (!selectedChat) return null;
      const r = await fetch(`/api/sgtx/chat/${selectedChat.chatId}`);
      if (!r.ok) throw new Error("Failed to load chat");
      return r.json();
    },
    enabled: !!selectedChat,
  });

  const startNewChat = async () => {
    if (!newChatGtid.trim()) return;
    try {
      const r = await fetch("/api/sgtx/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant1Gtid: tenantGtid,
          participant2Gtid: newChatGtid.trim(),
          createdBy: tenantGtid,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("Chat started");
        setNewChatGtid("");
        qc.invalidateQueries({ queryKey: ["gtid-chats", tenantGtid, statusFilter] });
        setSelectedChat(d.chat);
      } else {
        toast.error(d.error || "Failed to start chat");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedChat) return;
    setSending(true);
    try {
      const r = await fetch(`/api/sgtx/chat/${selectedChat.chatId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderGtid: tenantGtid,
          senderName: "You",
          message: messageText.trim(),
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setMessageText("");
        refetchChat();
        qc.invalidateQueries({ queryKey: ["gtid-chats", tenantGtid, statusFilter] });
      } else {
        toast.error(d.error || "Failed to send");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const summarizeChat = async () => {
    if (!selectedChat) return;
    setSummarizing(true);
    try {
      const r = await fetch(`/api/sgtx/chat/${selectedChat.chatId}/summarize`, {
        method: "POST",
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("AI Summary generated", { description: d.summary?.slice(0, 100) + "..." });
        refetchChat();
      } else {
        toast.error(d.error || "Failed to summarize");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSummarizing(false);
    }
  };

  const archiveChat = async (chatId: string) => {
    try {
      await fetch(`/api/sgtx/chat/${chatId}/archive`, { method: "POST" });
      toast.success("Chat archived");
      if (selectedChat?.chatId === chatId) setSelectedChat(null);
      qc.invalidateQueries({ queryKey: ["gtid-chats", tenantGtid, statusFilter] });
    } catch { toast.error("Failed to archive"); }
  };

  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`/api/sgtx/chat/${chatId}/delete`, { method: "POST" });
      toast.success("Chat deleted");
      if (selectedChat?.chatId === chatId) setSelectedChat(null);
      qc.invalidateQueries({ queryKey: ["gtid-chats", tenantGtid, statusFilter] });
    } catch { toast.error("Failed to delete"); }
  };

  const restoreChat = async (chatId: string) => {
    try {
      await fetch(`/api/sgtx/chat/${chatId}/restore`, { method: "POST" });
      toast.success("Chat restored");
      qc.invalidateQueries({ queryKey: ["gtid-chats", tenantGtid, statusFilter] });
    } catch { toast.error("Failed to restore"); }
  };

  const chats: any[] = chatData?.chats || [];
  const messages: any[] = chatDetail?.chat?.messages || [];

  return (
    <div className="space-y-4">
      <SectionHeaderLite title="GTID Chat" subtitle="Peer-to-peer secure messaging · USTN-linked · AI summarization" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
        {/* Chat list — left panel */}
        <Card className="p-3 lg:col-span-1 flex flex-col">
          <div className="flex items-center gap-1 mb-2">
            {(["ACTIVE", "ARCHIVED", "DELETED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 px-2 py-1 rounded text-[0.6rem] font-medium transition-colors ${
                  statusFilter === s ? "bg-gold/15 text-gold border border-gold/30" : "text-muted-foreground hover:bg-muted/30"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1 mb-2">
            <Input
              value={newChatGtid}
              onChange={(e) => setNewChatGtid(e.target.value)}
              placeholder="Enter GTID to chat..."
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" className="h-8 px-2 bg-gold-gradient text-sovereign" onClick={startNewChat} disabled={!newChatGtid.trim()}>
              <Plus className="w-3 h-3" /> New
            </Button>
          </div>
          <ScrollArea className="flex-1 -mx-1 px-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No {statusFilter.toLowerCase()} chats
              </div>
            ) : (
              <div className="space-y-1">
                {chats.map((c: any) => {
                  const otherGtid = c.participant1Gtid === tenantGtid ? c.participant2Gtid : c.participant1Gtid;
                  const isSelected = selectedChat?.chatId === c.chatId;
                  return (
                    <button
                      key={c.chatId}
                      onClick={() => setSelectedChat(c)}
                      className={`w-full text-left p-2 rounded-lg border transition-colors ${
                        isSelected ? "bg-gold/10 border-gold/30" : "bg-background/40 border-border/40 hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <code className="text-[0.6rem] font-mono font-semibold truncate">{otherGtid}</code>
                        <span className={`text-[0.5rem] px-1 py-0.5 rounded ${
                          c.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-400" :
                          c.status === "ARCHIVED" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400"
                        }`}>{c.status}</span>
                      </div>
                      {c.ustn && <p className="text-[0.55rem] text-muted-foreground truncate mt-0.5">USTN: {c.ustn.slice(0, 24)}…</p>}
                      {c.aiSummary && <p className="text-[0.55rem] text-gold/70 italic truncate mt-0.5">🧠 {c.aiSummary.slice(0, 50)}…</p>}
                      <p className="text-[0.5rem] text-muted-foreground mt-0.5">
                        {c.lastMessageAt ? timeAgo(c.lastMessageAt) : "No messages yet"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Message thread — right panel */}
        <Card className="p-3 lg:col-span-2 flex flex-col">
          {!selectedChat ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Select a chat to view messages</p>
                <p className="text-[0.6rem] text-muted-foreground mt-1">Or start a new chat by entering a GTID</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between pb-2 border-b border-border/60 mb-2">
                <div>
                  <code className="text-xs font-mono font-semibold">
                    {selectedChat.participant1Gtid === tenantGtid ? selectedChat.participant2Gtid : selectedChat.participant1Gtid}
                  </code>
                  {selectedChat.ustn && <p className="text-[0.55rem] text-muted-foreground">USTN: {selectedChat.ustn}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-[0.6rem]" onClick={summarizeChat} disabled={summarizing}>
                    {summarizing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    AI Summarize
                  </Button>
                  {statusFilter === "ACTIVE" && (
                    <Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-amber-400" onClick={() => archiveChat(selectedChat.chatId)}>
                      Archive
                    </Button>
                  )}
                  {statusFilter === "ARCHIVED" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-emerald-400" onClick={() => restoreChat(selectedChat.chatId)}>
                        Restore
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-red-400" onClick={() => deleteChat(selectedChat.chatId)}>
                        Delete
                      </Button>
                    </>
                  )}
                  {statusFilter === "DELETED" && (
                    <Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-emerald-400" onClick={() => restoreChat(selectedChat.chatId)}>
                      Restore
                    </Button>
                  )}
                </div>
              </div>

              {/* AI Summary */}
              {chatDetail?.chat?.aiSummary && (
                <div className="p-2 rounded-lg bg-gold/5 border border-gold/20 mb-2">
                  <p className="text-[0.6rem] text-gold font-semibold flex items-center gap-1 mb-1">
                    <Sparkles className="w-3 h-3" /> AI Summary
                  </p>
                  <p className="text-[0.7rem] text-foreground/80">{chatDetail.chat.aiSummary}</p>
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 -mx-1 px-1">
                <div className="space-y-2 py-1">
                  {messages.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">No messages yet. Start the conversation below.</div>
                  ) : (
                    messages.map((m: any) => {
                      const isMe = m.senderGtid === tenantGtid;
                      return (
                        <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-lg p-2 ${isMe ? "bg-gold/15 border border-gold/30" : "bg-muted/30 border border-border/40"}`}>
                            {!isMe && <p className="text-[0.55rem] font-semibold text-muted-foreground mb-0.5">{m.senderName}</p>}
                            <p className="text-xs text-foreground/90 whitespace-pre-wrap">{m.message}</p>
                            <p className="text-[0.5rem] text-muted-foreground mt-0.5 text-right">{timeAgo(m.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>

              {/* Message input */}
              {statusFilter === "ACTIVE" && (
                <div className="flex gap-1 pt-2 border-t border-border/60 mt-2">
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message…"
                    className="text-xs min-h-[40px] max-h-[80px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <Button size="sm" className="bg-gold-gradient text-sovereign h-9 px-3" onClick={sendMessage} disabled={sending || !messageText.trim()}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============ Missing Items Modal (Part 4.10 — Trade Readiness) ============
// Auto-popup modal that shows BLOCKER and WARNING items preventing trade submission.
// Each item has a "Fix Now" button that navigates to the relevant tab.
export function MissingItemsModal({ items, onFix, onClose }: {
  items: { field: string; severity: "BLOCKER" | "WARNING"; message: string; fixTab?: string }[];
  onFix: (tab: string) => void;
  onClose: () => void;
}) {
  const blockers = items.filter((i) => i.severity === "BLOCKER");
  const warnings = items.filter((i) => i.severity === "WARNING");
  if (items.length === 0) return null;

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <div className="flex items-center gap-2 mb-3">
          <FileWarning className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-semibold">
            {blockers.length > 0 ? `${blockers.length} blocker(s) preventing submission` : `${warnings.length} warning(s)`}
          </h3>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {blockers.map((item, i) => (
            <div key={`b-${i}`} className="p-2 rounded-lg border border-red-500/30 bg-red-500/5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[0.5rem] px-1 py-0 text-red-400 border-red-500/40">BLOCKER</Badge>
                    <span className="text-xs font-medium">{item.field}</span>
                  </div>
                  <p className="text-[0.65rem] text-muted-foreground mt-0.5">{item.message}</p>
                </div>
                {item.fixTab && (
                  <Button size="sm" className="h-6 text-[0.6rem] bg-gold-gradient text-sovereign shrink-0" onClick={() => onFix(item.fixTab!)}>
                    Fix Now
                  </Button>
                )}
              </div>
            </div>
          ))}
          {warnings.map((item, i) => (
            <div key={`w-${i}`} className="p-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[0.5rem] px-1 py-0 text-amber-400 border-amber-500/40">WARNING</Badge>
                    <span className="text-xs font-medium">{item.field}</span>
                  </div>
                  <p className="text-[0.65rem] text-muted-foreground mt-0.5">{item.message}</p>
                </div>
                {item.fixTab && (
                  <Button size="sm" variant="outline" className="h-6 text-[0.6rem] shrink-0" onClick={() => onFix(item.fixTab!)}>
                    Fix Now
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>Dismiss</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper: lightweight section header for screens that don't have the full SectionHeader
function SectionHeaderLite({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
