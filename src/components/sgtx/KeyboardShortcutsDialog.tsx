"use client";
// SGTX Keyboard Shortcuts Dialog — shows all available keyboard shortcuts
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface ShortcutGroup {
  group: string;
  shortcuts: { keys: string; action: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    group: "Global",
    shortcuts: [
      { keys: "⌘K / Ctrl+K", action: "Search / Command Palette" },
      { keys: "⌘I / Ctrl+I", action: "SGTX AI Assistant" },
      { keys: "F8", action: "Notifications" },
      { keys: "Alt+T", action: "Toggle theme (light/dark)" },
      { keys: "?", action: "Show this help" },
      { keys: "Esc", action: "Close dialog / overlay" },
    ],
  },
  {
    group: "Navigation",
    shortcuts: [
      { keys: "g then c", action: "Go to Command Center" },
      { keys: "g then n", action: "Go to New Trade Request" },
      { keys: "g then i", action: "Go to Smart Inbox" },
      { keys: "g then d", action: "Go to Documents" },
      { keys: "g then s", action: "Go to Shipments" },
      { keys: "g then a", action: "Go to Audit Trail" },
    ],
  },
  {
    group: "Trade Actions",
    shortcuts: [
      { keys: "n", action: "New Trade Request (from any tab)" },
      { keys: "q", action: "Quick Quote" },
      { keys: "s", action: "Sign Contract" },
      { keys: "f", action: "File Dispute" },
    ],
  },
  {
    group: "Portal",
    shortcuts: [
      { keys: "Ctrl+B", action: "Toggle sidebar" },
      { keys: "Ctrl+/", action: "Toggle focus mode" },
    ],
  },
];

export function KeyboardShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate SGTX faster. Press <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded border">?</kbd> anytime to open this help.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.group}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{group.group}</h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{s.action}</span>
                    <kbd className="px-2 py-0.5 text-xs bg-muted rounded border font-mono whitespace-nowrap">{s.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
