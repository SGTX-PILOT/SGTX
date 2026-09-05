// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT: Shared formatting helpers used by the cockpit route pages.
// ═══════════════════════════════════════════════════════════════════════════════

export function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function statusLabel(status: string): string {
  return (status || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtMoney(value: number | undefined, currency: string | undefined): string {
  if (value === undefined || value === null) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${cur} ${value.toLocaleString()}`;
  }
}
