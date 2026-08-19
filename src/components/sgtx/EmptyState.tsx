"use client";

import { type LucideIcon } from "lucide-react";

/**
 * SGTX EmptyState — reusable empty-state placeholder for panels that have
 * no data yet (no trades, no obligations, no events, etc.). Renders an icon
 * in a soft muted disc, a title, a description, and an optional CTA button.
 * Animation: fades in via the `animate-fade-in` utility from globals.css.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground/60" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
