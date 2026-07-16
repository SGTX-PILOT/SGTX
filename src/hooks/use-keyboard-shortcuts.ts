"use client";

// SGTX useKeyboardShortcuts hook (Blueprint Part 12F — keyboard shortcuts)
// Registers global keyboard shortcuts on the SGTX portal shell.
//
// Shortcuts:
//   Ctrl/Cmd+K         → open global search / command palette
//   Ctrl/Cmd+Shift+M   → dual-mode toggle (if trader portal)
//   Ctrl/Cmd+I         → open AI Assistant
//   Ctrl/Cmd+D         → Company Admin tab
//   Ctrl/Cmd+H         → Help Center
//   Ctrl/Cmd+Enter     → submit current form (click primary submit button)
//   Esc                → close modal (handled by individual modals; this hook also calls onCloseModal if provided)
//   Ctrl/Cmd+?         → show keyboard shortcuts help
//   Ctrl/Cmd+B         → toggle sidebar
//   Ctrl/Cmd+,         → open portal settings
//   Ctrl/Cmd+/         → toggle focus mode
//   F8                 → open Smart Inbox (notifications)
//   Alt+T              → toggle theme (light/dark)
//   g then c/n/i/d/s/a → go-to-tab sequence (Command Center / New Trade / Inbox / Documents / Shipments / Audit)
//   n                  → new trade request (buyer portal)
//   q                  → quick quote (seller portal)
//   s                  → sign contract (active trade)
//   f                  → file dispute

import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  onSearch?: () => void;
  onDualModeToggle?: () => void;
  onOpenAssistant?: () => void;
  onCompanyAdmin?: () => void;
  onHelp?: () => void;
  onSubmitForm?: () => void;
  onCloseModal?: () => void;
  onShowShortcuts?: () => void;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
  onFocusSearch?: () => void;
  // FIX-UI-A11Y — newly-wired shortcuts advertised in KeyboardShortcutsDialog
  onOpenInbox?: () => void;
  onToggleTheme?: () => void;
  onToggleFocusMode?: () => void;
  onGoCommand?: () => void;
  onGoNewTrade?: () => void;
  onGoInbox?: () => void;
  onGoDocuments?: () => void;
  onGoShipments?: () => void;
  onGoAudit?: () => void;
  onNewTrade?: () => void;
  onQuickQuote?: () => void;
  onSignContract?: () => void;
  onFileDispute?: () => void;
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
}

function matchesModifier(e: KeyboardEvent | React.KeyboardEvent, requireShift = false): boolean {
  const cmd = isMac() ? e.metaKey : e.ctrlKey;
  if (requireShift && !e.shiftKey) return false;
  if (!requireShift && e.shiftKey) return false; // shift must not be present unless required
  return cmd;
}

/**
 * useKeyboardShortcuts — registers global keyboard shortcuts.
 * Pass handlers for the shortcuts you want to support.
 * Handlers are kept in a ref so the listener is registered only once.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Persistent ref so we can read the latest handlers without re-binding the listener.
  const handlersRef = useRef(handlers);
  // g-prefix buffer — when `g` is pressed we open a 500ms window for the next key.
  const gBufferRef = useRef<{ expiry: number } | null>(null);

  // Keep the ref in sync with the latest handlers without re-binding the listener.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      const h = handlersRef.current;

      // Cmd/Ctrl+K — always available (even in inputs)
      if (matchesModifier(e) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        h.onSearch?.();
        return;
      }

      // Cmd/Ctrl+Shift+M — dual-mode toggle
      if (matchesModifier(e, true) && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        h.onDualModeToggle?.();
        return;
      }

      // Cmd/Ctrl+I — open AI Assistant
      if (matchesModifier(e) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        h.onOpenAssistant?.();
        return;
      }

      // Cmd/Ctrl+D — Company Admin tab
      if (matchesModifier(e) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        h.onCompanyAdmin?.();
        return;
      }

      // Cmd/Ctrl+H — Help Center
      if (matchesModifier(e) && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        h.onHelp?.();
        return;
      }

      // Cmd/Ctrl+Enter — submit current form
      if (matchesModifier(e) && e.key === "Enter") {
        e.preventDefault();
        // Try clicking the primary submit button in the active form
        const activeForm = (document.activeElement as HTMLElement)?.closest("form");
        if (activeForm) {
          const btn = activeForm.querySelector('button[type="submit"], button[data-submit="primary"]') as HTMLButtonElement | null;
          if (btn && !btn.disabled) {
            btn.click();
            return;
          }
        }
        h.onSubmitForm?.();
        return;
      }

      // Cmd/Ctrl+? — show keyboard shortcuts help (Shift + /)
      if (matchesModifier(e, true) && e.key === "?") {
        e.preventDefault();
        h.onShowShortcuts?.();
        return;
      }

      // Cmd/Ctrl+B — toggle sidebar
      if (matchesModifier(e) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        h.onToggleSidebar?.();
        return;
      }

      // Cmd/Ctrl+, — open settings
      if (matchesModifier(e) && e.key === ",") {
        e.preventDefault();
        h.onOpenSettings?.();
        return;
      }

      // Cmd/Ctrl+/ — toggle focus mode
      if (matchesModifier(e) && e.key === "/") {
        e.preventDefault();
        h.onToggleFocusMode?.();
        return;
      }

      // F8 — open Smart Inbox (Notifications)
      if (e.key === "F8") {
        e.preventDefault();
        h.onOpenInbox?.();
        return;
      }

      // Alt+T — toggle theme (light/dark)
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        h.onToggleTheme?.();
        return;
      }

      // Esc — close modal (only when not in editable field, or always)
      if (e.key === "Escape") {
        h.onCloseModal?.();
        return;
      }

      // "/" — focus search bar (only when not in an editable field)
      if (e.key === "/" && !isEditable) {
        e.preventDefault();
        h.onFocusSearch?.();
        return;
      }

      // ——— g then c/n/i/d/s/a — two-key sequence navigation ———
      // Skip when the user is typing in an input/textarea/contenteditable.
      if (!isEditable) {
        if (e.key === "g" || e.key === "G") {
          gBufferRef.current = { expiry: Date.now() + 500 };
          return;
        }
        if (gBufferRef.current && Date.now() < gBufferRef.current.expiry) {
          const next = e.key.toLowerCase();
          gBufferRef.current = null;
          const route: Record<string, () => void | undefined> = {
            c: h.onGoCommand ?? noop,
            n: h.onGoNewTrade ?? noop,
            i: h.onGoInbox ?? noop,
            d: h.onGoDocuments ?? noop,
            s: h.onGoShipments ?? noop,
            a: h.onGoAudit ?? noop,
          };
          const fn = route[next];
          if (fn) {
            e.preventDefault();
            fn();
            return;
          }
          // Unrecognised second key falls through to the single-key handlers below.
        } else {
          gBufferRef.current = null;
        }

        // ——— Single-key trade actions (only outside editable fields) ———
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          h.onNewTrade?.();
          return;
        }
        if (e.key === "q" || e.key === "Q") {
          e.preventDefault();
          h.onQuickQuote?.();
          return;
        }
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          h.onSignContract?.();
          return;
        }
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          h.onFileDispute?.();
          return;
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function noop() { /* no-op placeholder for sequence routing */ }
