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

import { useEffect } from "react";

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
  // Use a ref-like effect that re-binds on every render but only adds one listener.
  // We use a stable wrapper that reads from the latest handlers via closure.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      // Cmd/Ctrl+K — always available (even in inputs)
      if (matchesModifier(e) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // Cmd/Ctrl+Shift+M — dual-mode toggle
      if (matchesModifier(e, true) && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        handlers.onDualModeToggle?.();
        return;
      }

      // Cmd/Ctrl+I — open AI Assistant
      if (matchesModifier(e) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        handlers.onOpenAssistant?.();
        return;
      }

      // Cmd/Ctrl+D — Company Admin tab
      if (matchesModifier(e) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        handlers.onCompanyAdmin?.();
        return;
      }

      // Cmd/Ctrl+H — Help Center
      if (matchesModifier(e) && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        handlers.onHelp?.();
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
        handlers.onSubmitForm?.();
        return;
      }

      // Cmd/Ctrl+? — show keyboard shortcuts help (Shift + /)
      if (matchesModifier(e, true) && e.key === "?") {
        e.preventDefault();
        handlers.onShowShortcuts?.();
        return;
      }

      // Cmd/Ctrl+B — toggle sidebar
      if (matchesModifier(e) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        handlers.onToggleSidebar?.();
        return;
      }

      // Cmd/Ctrl+, — open settings
      if (matchesModifier(e) && e.key === ",") {
        e.preventDefault();
        handlers.onOpenSettings?.();
        return;
      }

      // Esc — close modal (only when not in editable field, or always)
      if (e.key === "Escape") {
        handlers.onCloseModal?.();
        return;
      }

      // "/" — focus search bar (only when not in an editable field)
      if (e.key === "/" && !isEditable) {
        e.preventDefault();
        handlers.onFocusSearch?.();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    handlers.onSearch,
    handlers.onDualModeToggle,
    handlers.onOpenAssistant,
    handlers.onCompanyAdmin,
    handlers.onHelp,
    handlers.onSubmitForm,
    handlers.onCloseModal,
    handlers.onShowShortcuts,
    handlers.onToggleSidebar,
    handlers.onOpenSettings,
    handlers.onFocusSearch,
  ]);
}
