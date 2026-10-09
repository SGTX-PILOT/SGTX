"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — Mobile Tab Bar (bottom navigation for <768px)
// §16.1.6.3: "On mobile, sidebar replaced by bottom tab bar with 4-5 most used tabs"
// ═══════════════════════════════════════════════════════════════════════════════

import { Inbox, Package, AlertTriangle, Bell, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MobileTabItem {
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function MobileTabBar({ items }: { items: MobileTabItem[] }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-14 border-t border-[rgba(56,189,248,0.15)] bg-[rgba(2,6,23,0.95)] backdrop-blur-xl" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.label} className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-slate-400 hover:text-white transition-colors" aria-label={item.label}>
            <div className="relative">
              <Icon className="w-4 h-4" />
              {item.badge && item.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[8px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">{item.badge}</span>
              )}
            </div>
            <span className="text-[9px] font-medium leading-none">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export const DEFAULT_MOBILE_TABS: MobileTabItem[] = [
  { label: "Inbox", icon: Inbox, badge: 5 },
  { label: "Shipments", icon: Package, badge: 7 },
  { label: "Alerts", icon: AlertTriangle, badge: 1 },
  { label: "Tasks", icon: CheckCircle2 },
  { label: "Bell", icon: Bell, badge: 12 },
];
