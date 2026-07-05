"use client";

// SGTX Premium UI Components — Skeleton Loading, Empty States, Trade Lifecycle Stepper
// High-end, unique design system components for the SGTX platform.

import { cn } from "@/lib/utils";
import { Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Circle, Dot } from "lucide-react";
import React from "react";

// ============================================================
// 1. SKELETON COMPONENTS — premium shimmer animation
// ============================================================

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted/60",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r",
        "before:from-transparent before:via-foreground/5 before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

// Command Center skeleton — matches the executive summary card layout
export function CommandCenterSkeleton() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      {/* Executive cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </Card>
        ))}
      </div>
      {/* Table skeleton */}
      <Card className="p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}

// Table skeleton — generic table loading state
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          {[...Array(cols)].map((_, j) => (
            <Skeleton key={j} className="h-4" style={{ width: `${100 / cols}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Card list skeleton — for inbox, disputes, etc.
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <Card key={i} className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// 2. EMPTY STATE COMPONENT — premium with icon + CTA
// ============================================================

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      <div className="relative mb-5">
        <div className="absolute inset-0 blur-2xl bg-gold/5 rounded-full" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/15 flex items-center justify-center">
          <Icon className="w-8 h-8 text-gold/40" />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-4">{description}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="flex items-center gap-2">
          {actionLabel && onAction && (
            <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button size="sm" variant="outline" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ============================================================
// 3. TRADE LIFECYCLE STEPPER — unique SGTX phase indicator
// ============================================================

export interface LifecyclePhase {
  id: number;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export function TradeLifecycleStepper({
  currentPhase,
  phases,
  className,
}: {
  currentPhase: number;
  phases: LifecyclePhase[];
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      {/* Desktop: horizontal stepper */}
      <div className="hidden sm:flex items-center justify-between gap-1">
        {phases.map((phase, idx) => {
          const isComplete = phase.id < currentPhase;
          const isCurrent = phase.id === currentPhase;
          const isUpcoming = phase.id > currentPhase;
          const Icon = phase.icon;
          return (
            <React.Fragment key={phase.id}>
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <motion.div
                  initial={false}
                  animate={{
                    scale: isCurrent ? 1.1 : 1,
                    backgroundColor: isComplete
                      ? "oklch(0.55 0.13 155 / 15%)"
                      : isCurrent
                        ? "oklch(0.62 0.13 75 / 15%)"
                        : "oklch(0.96 0.005 60)",
                    borderColor: isComplete
                      ? "oklch(0.55 0.13 155 / 30%)"
                      : isCurrent
                        ? "oklch(0.62 0.13 75 / 40%)"
                        : "oklch(0.90 0.006 60)",
                  }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "w-9 h-9 rounded-xl border flex items-center justify-center relative",
                  )}
                >
                  {isComplete ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Icon className={cn(
                      "w-4 h-4 transition-colors",
                      isCurrent ? "text-gold" : "text-muted-foreground/50",
                    )} />
                  )}
                  {isCurrent && (
                    <motion.div
                      layoutId="phase-glow"
                      className="absolute inset-0 rounded-xl blur-md bg-gold/10 -z-10"
                    />
                  )}
                </motion.div>
                <span className={cn(
                  "text-[0.6rem] font-medium whitespace-nowrap transition-colors",
                  isComplete ? "text-success/70" : isCurrent ? "text-gold" : "text-muted-foreground/40",
                )}>
                  {phase.shortLabel}
                </span>
              </div>
              {/* Connector line */}
              {idx < phases.length - 1 && (
                <div className="flex-1 h-px mx-1 relative">
                  <div className="absolute inset-0 bg-border/50" />
                  <motion.div
                    initial={false}
                    animate={{ width: isComplete ? "100%" : "0%" }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 bg-success/30"
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile: compact horizontal scroll */}
      <div className="sm:hidden flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {phases.map((phase) => {
          const isComplete = phase.id < currentPhase;
          const isCurrent = phase.id === currentPhase;
          const Icon = phase.icon;
          return (
            <div
              key={phase.id}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full flex-shrink-0 border transition-colors",
                isComplete
                  ? "border-success/20 bg-success/5"
                  : isCurrent
                    ? "border-gold/30 bg-gold/5"
                    : "border-border/50 bg-muted/30",
              )}
            >
              {isComplete ? (
                <Check className="w-3 h-3 text-success" />
              ) : (
                <Icon className={cn("w-3 h-3", isCurrent ? "text-gold" : "text-muted-foreground/50")} />
              )}
              <span className={cn(
                "text-[0.55rem] font-medium whitespace-nowrap",
                isComplete ? "text-success/70" : isCurrent ? "text-gold" : "text-muted-foreground/50",
              )}>
                {phase.shortLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 4. RESPONSIVE TABLE WRAPPER — prevents overflow on mobile
// ============================================================

export function ResponsiveTable({ children, minWidth = 640 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin">
      <div style={{ minWidth: `${minWidth}px` }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// 5. LOADING SPINNER — branded with gold accent
// ============================================================

export function SgtxLoader({ size = 24, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div className="relative" style={{ width: size, height: size }}>
        <Loader2 className="w-full h-full animate-spin text-gold/60" />
        <div className="absolute inset-0 blur-sm animate-pulse">
          <Loader2 className="w-full h-full text-gold/20" />
        </div>
      </div>
      {label && <p className="text-xs text-muted-foreground tracking-widest uppercase animate-pulse">{label}</p>}
    </div>
  );
}
