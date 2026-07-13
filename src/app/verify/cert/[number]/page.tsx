// SGTX Tier 2 — Public Certificate of Origin Verification Portal.
//
// Route: /verify/cert/[number]
//
// Server Component (no 'use client') — fetches the certificate by number
// directly from the DB and renders a branded public verification page:
//   - certificate type + number
//   - origin / destination countries
//   - commodity + HS code
//   - issuing authority
//   - issue date + expiry date
//   - status (ISSUED / VERIFIED / REJECTED / etc.)
//   - document hash (SHA-256 of the certificate text)
//   - QR code encoding the verification URL (for easy sharing)
//
// If the certificate doesn't exist, shows "Certificate not found".
//
// This route is intentionally PUBLIC — no auth required. The middleware
// whitelist already permits `/api/sgtx/certificates/public/*` and page
// routes are rate-limited but not authenticated.

import { db } from "@/lib/db";
import { generateQrDataUrl } from "@/lib/sgtx/util/qr";

// Always render dynamically — the certificate content is per-request.
export const dynamic = "force-dynamic";

// Public page — no indexing by search engines (certificates are sensitive
// even in their public projection).
export const metadata = {
  title: "SGTX — Certificate Verification",
  description: "Verify the authenticity of an SGTX-issued Certificate of Origin.",
  robots: { index: false, follow: false },
};

/** Color + label per certificate status (drives the status badge styling). */
function statusStyle(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case "VERIFIED":
      return { bg: "oklch(0.45 0.13 145)", text: "oklch(0.96 0.03 145)", label: "VERIFIED" };
    case "ISSUED":
      return { bg: "oklch(0.55 0.10 80)", text: "oklch(0.15 0.01 80)", label: "ISSUED" };
    case "PRESENTED":
      return { bg: "oklch(0.50 0.10 220)", text: "oklch(0.97 0.02 220)", label: "PRESENTED" };
    case "REJECTED":
    case "REVOKED":
      return { bg: "oklch(0.45 0.18 25)", text: "oklch(0.96 0.04 25)", label: status };
    case "EXPIRED":
      return { bg: "oklch(0.40 0.005 240)", text: "oklch(0.85 0.005 240)", label: "EXPIRED" };
    default:
      return { bg: "oklch(0.40 0.005 240)", text: "oklch(0.85 0.005 240)", label: status };
  }
}

/** Format an ISO date string as `YYYY-MM-DD` for display. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

/** Truncate a long hash for display while keeping the first/last 8 chars. */
function truncateHash(hash: string | null): string {
  if (!hash) return "—";
  if (hash.length <= 24) return hash;
  return `${hash.slice(0, 12)}…${hash.slice(-12)}`;
}

/**
 * Verification Portal page.
 *
 * Looks up the certificate by `certificateNumber` (the [number] dynamic
 * segment). Renders the "not found" state if no certificate exists with
 * that number.
 */
export default async function CertificateVerificationPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number: rawNumber } = await params;
  const certificateNumber = decodeURIComponent(rawNumber);

  let cert: Awaited<ReturnType<typeof db.certificateOfOrigin.findUnique>> = null;
  try {
    cert = await db.certificateOfOrigin.findUnique({
      where: { certificateNumber },
    });
  } catch {
    // If the DB is unreachable, treat as "not found" rather than crash the page.
    cert = null;
  }

  if (!cert) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 20%, oklch(0.75 0.13 75 / 0.10) 0%, transparent 70%)",
          }}
        />
        <div className="relative w-full max-w-md space-y-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="font-display text-lg font-bold tracking-[0.18em] text-gold-gradient">
              SGTX
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold text-foreground">
            Certificate not found
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            No SGTX-issued Certificate of Origin matches the number
            {" "}<code className="font-mono text-primary">{certificateNumber}</code>.
          </p>
          <p className="text-xs text-muted-foreground/70">
            If you scanned a QR code, the certificate may have expired or been
            revoked. Contact the issuing authority or SGTX support for help.
          </p>
        </div>
      </div>
    );
  }

  // Generate the QR code (server-side) encoding the verification URL.
  const verificationUrl =
    cert.verificationUrl || `/verify/cert/${encodeURIComponent(certificateNumber)}`;
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await generateQrDataUrl(verificationUrl, 240);
  } catch {
    qrDataUrl = null;
  }

  const style = statusStyle(cert.status);
  const hashShort = truncateHash(cert.documentHash);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {/* Subtle gold radial wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 20%, oklch(0.75 0.13 75 / 0.10) 0%, transparent 70%)",
        }}
      />

      <main className="relative max-w-3xl mx-auto px-4 py-10 sm:py-16">
        {/* SGTX wordmark */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="font-display text-lg font-bold tracking-[0.18em] text-gold-gradient">
            SGTX
          </span>
          <span className="text-xs text-muted-foreground tracking-[0.18em]">
            CERTIFICATE VERIFICATION
          </span>
        </div>

        {/* Header card */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Certificate Type
              </div>
              <div className="font-display text-3xl font-bold text-foreground mt-1">
                {cert.certificateType}
              </div>
              <div className="text-sm text-muted-foreground mt-2 font-mono">
                {cert.certificateNumber}
              </div>
            </div>
            <div
              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold tracking-wider"
              style={{ backgroundColor: style.bg, color: style.text }}
            >
              {style.label}
            </div>
          </div>

          {cert.qizAnnotated && (
            <div className="mt-4 inline-flex items-center px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-medium border border-amber-500/30">
              QIZ-ANNOTATED · US-Egypt Qualifying Industrial Zone
            </div>
          )}
        </div>

        {/* Detail grid */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailCard label="Origin Country" value={cert.originCountry} />
          <DetailCard label="Destination Country" value={cert.destinationCountry} />
          <DetailCard label="Commodity" value={cert.commodity} />
          <DetailCard label="HS Code" value={cert.commodityHs || "—"} mono />
          <DetailCard label="Issuing Authority" value={cert.issuingAuthority} />
          <DetailCard
            label="Validity"
            value={`${formatDate(cert.issueDate.toISOString())} → ${formatDate(
              cert.expiryDate ? cert.expiryDate.toISOString() : null,
            )}`}
          />
          {cert.verifiedBy && (
            <DetailCard
              label="Verified By"
              value={`${cert.verifiedBy} · ${formatDate(
                cert.verifiedAt ? cert.verifiedAt.toISOString() : null,
              )}`}
            />
          )}
        </div>

        {/* Document hash + QR */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-stretch">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Document Integrity Hash
            </div>
            <div className="mt-2 font-mono text-xs text-foreground break-all">
              {hashShort}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
              SHA-256 fingerprint of the canonical certificate text. Re-compute
              the hash on the presented document and compare to confirm the
              certificate has not been altered.
            </p>
            {cert.documentHash && (
              <details className="mt-3">
                <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                  Show full hash
                </summary>
                <div className="mt-2 font-mono text-[10px] text-muted-foreground break-all">
                  {cert.documentHash}
                </div>
              </details>
            )}
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 p-5 flex flex-col items-center justify-center">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Verify / Share
            </div>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${verificationUrl}`}
                width={180}
                height={180}
                className="rounded-lg bg-white p-2"
              />
            ) : (
              <div className="w-[180px] h-[180px] rounded-lg bg-muted/30 flex items-center justify-center text-[11px] text-muted-foreground">
                QR unavailable
              </div>
            )}
            <div className="mt-3 text-[10px] text-muted-foreground font-mono text-center break-all">
              {verificationUrl}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-10 text-center text-[11px] text-muted-foreground/70">
          Sovereign Governed Trade Execution · This page is a public verification
          projection of an SGTX-issued Certificate of Origin. Sensitive trade
          data (invoice value, party identities, tradeId) is intentionally
          omitted. For full details, contact the issuing authority.
        </p>
      </main>
    </div>
  );
}

/** Small presentational card for a single key/value pair. */
function DetailCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-2 text-sm text-foreground ${mono ? "font-mono" : "font-medium"}`}
      >
        {value || "—"}
      </div>
    </div>
  );
}
