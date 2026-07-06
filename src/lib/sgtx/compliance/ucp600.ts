/**
 * UCP 600 LC Pre-Validation Engine
 * =================================
 *
 * Pre-validates Letter of Credit documentary presentations against
 * ICC Publication 600 (Uniform Customs and Practice for Documentary Credits)
 * and ISBP 821 (International Standard Banking Practice).
 *
 * Banks reject ~70% of LC documents on first presentation. This engine
 * catches discrepancies BEFORE presentation so the beneficiary can cure them.
 *
 * This is a deterministic, self-contained rules engine — no external API calls.
 * Each rule returns zero or more Discrepancy objects with a human-readable
 * `message` written in the language a bank examiner would use in a refusal
 * notice (so beneficiaries see exactly what the bank will say).
 *
 * Design principle: CONSERVATIVE. When in doubt, emit a 'warning' rather than
 * a 'discrepant'. A 'discrepant' will cause the issuing bank to refuse the
 * presentation under Art. 16; a 'warning' is a pre-presentation advisory that
 * the beneficiary should double-check. False positives cost the beneficiary a
 * phone call; false negatives cost them a refusal and a 5-banking-day delay.
 *
 * References:
 *  - UCP 600 (ICC Publication 600, 2007 revision)
 *  - ISBP 821 (ICC Publication 821, 2019)
 *  - ICC Banking Commission Opinions
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LcDocumentType =
  | "commercial_invoice"
  | "bill_of_lading"
  | "air_waybill"
  | "insurance"
  | "certificate_of_origin"
  | "inspection_certificate"
  | "packing_list"
  | "other";

export interface LcDocument {
  type: LcDocumentType;
  /** Document reference (e.g. invoice number, B/L number) for traceability in refusal notices. */
  docId?: string;
  /** Entity that issued the document (carrier, beneficiary, insurer, chamber of commerce...). */
  issuedBy?: string;
  /** Party the document is made out to (applicant, to order, to bearer...). */
  issuedTo?: string;
  /** ISO-8601 issue date (YYYY-MM-DD). */
  date?: string;
  /** ISO 4217 currency code (e.g. USD, EUR). */
  currency?: string;
  /** Monetary amount covered by the document. */
  amount?: number;
  /** For transport documents: port/airport of loading/departure. */
  portOfLoading?: string;
  /** For transport documents: port/airport of discharge/destination. */
  portOfDischarge?: string;
  /** Number of originals presented (Art. 20 requires sole original OR full set). */
  originalCount?: number;
  /** Whether the document bears a signature (handwritten, stamped, or electronic). */
  signed?: boolean;
  /** Free-form structured data specific to the document type (e.g. carrier, coverage, shipmentTerms). */
  data: Record<string, any>;
}

export interface LcTerms {
  lcNumber: string;
  applicantName: string;
  applicantAddress?: string;
  beneficiaryName: string;
  beneficiaryAddress?: string;
  /** ISO 4217 currency the LC is issued in. */
  currency: string;
  /** LC amount (face value). */
  amount: number;
  portOfLoading?: string;
  portOfDischarge?: string;
  /** Latest acceptable shipment date (ISO-8601). */
  latestShipmentDate?: string;
  /** Expiry date of the LC (ISO-8601). */
  expiryDate?: string;
  /** Required documents for presentation (free-form, e.g. "Full set 3/3 clean on board B/L"). */
  requiredDocuments: string[];
  /** Incoterm 2020 (e.g. CIF, FOB, FCA). Determines insurance/CIP/CIF requirements. */
  incoterm?: string;
  partialShipmentAllowed?: boolean;
  transshipmentAllowed?: boolean;
}

export type DiscrepancySeverity = "discrepant" | "warning";

export interface Discrepancy {
  /** UCP 600 article reference, e.g. 'UCP600-14-a', 'UCP600-18-b'. */
  article: string;
  severity: DiscrepancySeverity;
  /** Field path that triggered the discrepancy, e.g. 'commercial_invoice.currency'. */
  field: string;
  /** Human-readable refusal-notice wording. This is what the bank presents to the beneficiary. */
  message: string;
  /** LC reference (lcNumber). */
  lcRef?: string;
  /** Document reference (docId) when the discrepancy is document-specific. */
  docRef?: string;
}

export interface LcValidationResult {
  lcNumber: string;
  /** true if zero discrepancies were emitted (a "clean presentation"). */
  cleanPresentation: boolean;
  discrepancies: Discrepancy[];
  /** Procedural notes from the examination (e.g. Art. 16 single-notice reminder, Art. 36 force majeure caveat). */
  examinationNotes: string[];
  /** ISO-8601 timestamp of examination. */
  examinedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Case-insensitive, whitespace-tolerant string equality. */
function norm(s: string | undefined | null): string {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "");
}

function isPresent(s: string | undefined | null): s is string {
  return !!s && s.toString().trim().length > 0;
}

/**
 * Normalize a party name for fuzzy comparison by stripping common legal
 * suffixes (LLC, Ltd, JSC, PJSC, OJSC, Inc, Corp, GmbH, SA, AG, ...).
 * This is the same heuristic screening vendors apply before fuzzy matching.
 */
function normalizeEntityName(name: string): string {
  const SUFFIXES = [
    "public joint stock company",
    "joint stock company",
    "open joint stock company",
    "limited liability company",
    "public limited company",
    "joint-stock company",
    "company limited",
    "incorporated",
    "corporation",
    "limited",
    "holdings",
    "holding",
    "group",
    "jsc",
    "pjsc",
    "ojsc",
    "llc",
    "ltd",
    "inc",
    "corp",
    "co",
    "gmbh",
    "ag",
    "sa",
    "plc",
  ];
  let n = norm(name);
  // Repeatedly strip suffixes (they may appear in any order).
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      const re = new RegExp(`\\b${suf}\\b`, "g");
      const next = n.replace(re, " ").replace(/\s+/g, " ").trim();
      if (next !== n) {
        n = next;
        changed = true;
      }
    }
  }
  return n.trim();
}

/** Levenshtein edit distance, case-insensitive. */
function levenshtein(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const m = x.length;
  const n = y.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Similarity ratio in [0,1] based on Levenshtein distance. */
function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Returns true when `name` plausibly refers to `expected` (exact, normalized, or fuzzy >= 0.88). */
function nameMatches(name: string | undefined, expected: string | undefined): boolean {
  if (!isPresent(name) || !isPresent(expected)) return false;
  if (norm(name) === norm(expected)) return true;
  if (normalizeEntityName(name) === normalizeEntityName(expected)) return true;
  // "Contains" check (e.g. issuedBy = "Sberbank of Russia, Moscow Branch" vs "Sberbank of Russia").
  if (norm(name).includes(normalizeEntityName(expected))) return true;
  if (normalizeEntityName(expected).includes(normalizeEntityName(name))) return true;
  return similarity(normalizeEntityName(name), normalizeEntityName(expected)) >= 0.88;
}

/** Parse an ISO-8601 date string into a Date, or null if unparseable. */
function parseDate(s: string | undefined): Date | null {
  if (!isPresent(s)) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Returns true if the date falls on a Saturday or Sunday (weekend — non-banking day for Art. 29). */
function isWeekend(d: Date): boolean {
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation rules — each: (terms, documents) => Discrepancy[]
// ─────────────────────────────────────────────────────────────────────────────

type LcRule = (terms: LcTerms, documents: LcDocument[]) => Discrepancy[];

/**
 * Art. 14(a) — Standard for Examination.
 * Documents must be consistent with the LC terms; data need not be identical
 * but must not conflict with LC, other documents, or each other.
 */
const rule_14a_dataConsistency: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  for (const doc of docs) {
    // Currency cross-check (only when both LC and doc specify currency).
    if (isPresent(doc.currency) && isPresent(terms.currency)) {
      if (norm(doc.currency) !== norm(terms.currency)) {
        out.push({
          article: "UCP600-14-a",
          severity: "discrepant",
          field: `${doc.type}.currency`,
          message: `${doc.type} shows currency "${doc.currency}" which conflicts with the LC currency "${terms.currency}". Data in documents must not conflict with the credit (UCP 600 Art. 14(a)).`,
          lcRef: terms.lcNumber,
          docRef: doc.docId,
        });
      }
    }
    // Port of loading cross-check.
    if (isPresent(doc.portOfLoading) && isPresent(terms.portOfLoading)) {
      if (norm(doc.portOfLoading) !== norm(terms.portOfLoading)) {
        out.push({
          article: "UCP600-14-a",
          severity: "discrepant",
          field: `${doc.type}.portOfLoading`,
          message: `${doc.type} shows port of loading "${doc.portOfLoading}" which conflicts with the LC port of loading "${terms.portOfLoading}" (UCP 600 Art. 14(a)).`,
          lcRef: terms.lcNumber,
          docRef: doc.docId,
        });
      }
    }
    // Port of discharge cross-check.
    if (isPresent(doc.portOfDischarge) && isPresent(terms.portOfDischarge)) {
      if (norm(doc.portOfDischarge) !== norm(terms.portOfDischarge)) {
        out.push({
          article: "UCP600-14-a",
          severity: "discrepant",
          field: `${doc.type}.portOfDischarge`,
          message: `${doc.type} shows port of discharge "${doc.portOfDischarge}" which conflicts with the LC port of discharge "${terms.portOfDischarge}" (UCP 600 Art. 14(a)).`,
          lcRef: terms.lcNumber,
          docRef: doc.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 14(d) — Address & contact details.
 * The address in documents must match the applicant/beneficiary address in the
 * LC. Contact details (tel, fax, email, mobile) are considered part of the
 * address but are NOT required to match. We emit a *warning* (not discrepant)
 * when an address is provided on both sides and the normalized strings are
 * entirely different (we cannot reliably tell "different formatting" from
 * "different address" without geocoding, so we stay conservative).
 */
const rule_14d_addressMatching: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  for (const doc of docs) {
    const docAddress: string | undefined = doc.data?.address ?? doc.data?.applicantAddress ?? doc.data?.beneficiaryAddress;
    // Commercial invoice should reference both applicant and beneficiary.
    if (doc.type === "commercial_invoice") {
      // Applicant name on invoice.
      if (isPresent(doc.issuedTo) && isPresent(terms.applicantName)) {
        if (!nameMatches(doc.issuedTo, terms.applicantName)) {
          out.push({
            article: "UCP600-14-d",
            severity: "discrepant",
            field: "commercial_invoice.issuedTo",
            message: `Commercial invoice is made out to "${doc.issuedTo}" which does not match the LC applicant "${terms.applicantName}". The invoice must be made out in the name of the applicant (UCP 600 Art. 18(a)(ii)).`,
            lcRef: terms.lcNumber,
            docRef: doc.docId,
          });
        }
      }
      // Beneficiary name on invoice.
      if (isPresent(doc.issuedBy) && isPresent(terms.beneficiaryName)) {
        if (!nameMatches(doc.issuedBy, terms.beneficiaryName)) {
          out.push({
            article: "UCP600-14-d",
            severity: "discrepant",
            field: "commercial_invoice.issuedBy",
            message: `Commercial invoice appears to be issued by "${doc.issuedBy}" which does not match the LC beneficiary "${terms.beneficiaryName}". The invoice must appear to be issued by the beneficiary (UCP 600 Art. 18(a)(i)).`,
            lcRef: terms.lcNumber,
            docRef: doc.docId,
          });
        }
      }
    }
    // Address conflict check (warning-only — see ISBP 821 paragraph K10–K13).
    if (isPresent(docAddress) && isPresent(terms.applicantAddress)) {
      const sim = similarity(norm(docAddress), norm(terms.applicantAddress));
      // If similarity is very low (< 0.30) the addresses are likely different — warn.
      if (sim < 0.3) {
        out.push({
          article: "UCP600-14-d",
          severity: "warning",
          field: `${doc.type}.address`,
          message: `${doc.type} shows an applicant/beneficiary address that appears materially different from the LC address. Verify the address does not conflict with the LC; contact details (tel/fax/email) need not match but the address itself must not conflict (UCP 600 Art. 14(d), ISBP 821 K10).`,
          lcRef: terms.lcNumber,
          docRef: doc.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 14(e) — Non-documentary conditions disregarded.
 * If the LC contains a condition that does not specify a document to be
 * presented to evidence compliance, banks will disregard it. We scan the
 * `requiredDocuments` strings for typical non-documentary phrasing and emit
 * advisory warnings (these are NOT discrepancies — they are reminders that the
 * condition will not be examined).
 */
const rule_14e_nonDocumentaryConditions: LcRule = (terms, _docs) => {
  const out: Discrepancy[] = [];
  const NON_DOC_PATTERNS = [
    /\bgoods\s+must\s+be\s+(of|manufactured|produced|shipped)\b/i,
    /\bshipment\s+must\s+(be|arrive|reach)\b/i,
    /\bpayment\s+must\s+be\s+made\s+within\b/i,
    /\bquality\s+must\s+(meet|exceed|conform)\b/i,
    /\bno\s+transshipment\b/i,
    /\bpartial\s+shipment\s+(prohibited|not\s+allowed)\b/i,
  ];
  for (const req of terms.requiredDocuments || []) {
    for (const pat of NON_DOC_PATTERNS) {
      if (pat.test(req)) {
        out.push({
          article: "UCP600-14-e",
          severity: "warning",
          field: "requiredDocuments",
          message: `LC condition "${req}" appears to be a non-documentary condition (it does not require a document to evidence compliance). Banks will disregard this condition when examining the presentation (UCP 600 Art. 14(e)). Consider re-drafting as a documentary condition.`,
          lcRef: terms.lcNumber,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 14(f) — Issuer requirements for transport, insurance, certificate of origin.
 * If the LC requires a transport document, an insurance document, or a
 * certificate of origin, the document must appear on its face to be:
 *   (i) issued by the named entity (where the LC names the issuer), AND
 *   (ii) signed, AND
 *   (iii) dated.
 */
const rule_14f_issuerRequirements: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  const inScope = docs.filter(
    (d) =>
      d.type === "bill_of_lading" ||
      d.type === "air_waybill" ||
      d.type === "insurance" ||
      d.type === "certificate_of_origin",
  );
  for (const doc of inScope) {
    // Signed?
    if (doc.signed !== true) {
      out.push({
        article: "UCP600-14-f",
        severity: "discrepant",
        field: `${doc.type}.signed`,
        message: `${doc.type} does not appear to be signed. Where the LC requires a transport document, insurance document, or certificate of origin, it must appear on its face to be signed (UCP 600 Art. 14(f)(ii)).`,
        lcRef: terms.lcNumber,
        docRef: doc.docId,
      });
    }
    // Dated?
    if (!isPresent(doc.date)) {
      out.push({
        article: "UCP600-14-f",
        severity: "discrepant",
        field: `${doc.type}.date`,
        message: `${doc.type} does not bear an issuance date. Where the LC requires a transport document, insurance document, or certificate of origin, it must appear on its face to be dated (UCP 600 Art. 14(f)(iii)).`,
        lcRef: terms.lcNumber,
        docRef: doc.docId,
      });
    }
    // Issued by named entity (where the LC names the issuer via data.issuerName)?
    const namedIssuer = doc.data?.lcRequiredIssuer;
    if (isPresent(namedIssuer) && isPresent(doc.issuedBy)) {
      if (!nameMatches(doc.issuedBy, namedIssuer)) {
        out.push({
          article: "UCP600-14-f",
          severity: "discrepant",
          field: `${doc.type}.issuedBy`,
          message: `${doc.type} appears to be issued by "${doc.issuedBy}" but the LC requires issuance by "${namedIssuer}". Where the LC requires a document to be issued by a named issuer, it must appear on its face to be so issued (UCP 600 Art. 14(f)(i)).`,
          lcRef: terms.lcNumber,
          docRef: doc.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 16 — Discrepant Documents & Single Notice.
 * Procedural rule: the issuing bank has a maximum of five banking days
 * following presentation to examine, and must give a SINGLE notice of ALL
 * discrepancies. We cannot enforce the 5-day timer pre-presentation, but we
 * emit an examination note reminding the presenter of the rule, and we flag
 * any document whose date is in the future (which would start the clock
 * incorrectly) as a warning.
 */
const rule_16_singleNotice: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  const now = new Date();
  for (const doc of docs) {
    const d = parseDate(doc.date);
    if (d && d.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      // >1 day in the future — likely an error.
      out.push({
        article: "UCP600-16",
        severity: "warning",
        field: `${doc.type}.date`,
        message: `${doc.type} is dated ${doc.date}, which is in the future. A post-dated document may affect the 5-banking-day examination window under UCP 600 Art. 16(b) and could be treated as discrepant by the issuing bank.`,
        lcRef: terms.lcNumber,
        docRef: doc.docId,
      });
    }
  }
  return out;
};

/**
 * Art. 17 — Original Documents.
 * A document is "original" if it appears to be: (a) handwritten, (b) stamped
 * "original", or (c) electronically issued with an electronic signature. We
 * rely on `originalCount` and `data.isOriginal` / `data.markedOriginal` /
 * `data.electronicSignature` flags. For transport documents and insurance,
 * originals are mandatory.
 */
const rule_17_originals: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  for (const doc of docs) {
    const looksOriginal =
      (doc.originalCount && doc.originalCount > 0) ||
      doc.data?.isOriginal === true ||
      doc.data?.markedOriginal === true ||
      doc.data?.electronicSignature === true ||
      doc.data?.handwritten === true;
    // For insurance and certificates, originals are required.
    if (doc.type === "insurance" || doc.type === "certificate_of_origin" || doc.type === "inspection_certificate") {
      if (!looksOriginal) {
        out.push({
          article: "UCP600-17",
          severity: "discrepant",
          field: `${doc.type}.original`,
          message: `${doc.type} does not appear to be an original. At least one original is required (UCP 600 Art. 17). A document is original if it is handwritten, bears a stamped "original" marking, or is electronically issued and signed with an electronic signature.`,
          lcRef: terms.lcNumber,
          docRef: doc.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 18 — Commercial Invoice.
 * (a)(i) Must appear to be issued by the beneficiary.
 * (a)(ii) Must be made out in the name of the applicant.
 * (a)(iii) Must be in the same currency as the LC.
 * (b) The invoice amount must not exceed the LC amount.
 */
const rule_18_commercialInvoice: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  const invoices = docs.filter((d) => d.type === "commercial_invoice");
  if (invoices.length === 0) {
    // The LC requires a commercial invoice by default (Art. 18 applies whenever
    // a credit is available). Missing invoice = discrepant.
    out.push({
      article: "UCP600-18",
      severity: "discrepant",
      field: "commercial_invoice",
      message: `No commercial invoice was presented. A commercial invoice is a required document under UCP 600 Art. 18.`,
      lcRef: terms.lcNumber,
    });
    return out;
  }
  for (const inv of invoices) {
    // (a)(i) Issued by beneficiary.
    if (isPresent(inv.issuedBy) && isPresent(terms.beneficiaryName)) {
      if (!nameMatches(inv.issuedBy, terms.beneficiaryName)) {
        out.push({
          article: "UCP600-18-a-i",
          severity: "discrepant",
          field: "commercial_invoice.issuedBy",
          message: `Commercial invoice appears to be issued by "${inv.issuedBy}" but the LC beneficiary is "${terms.beneficiaryName}". The invoice must appear to be issued by the beneficiary (UCP 600 Art. 18(a)(i)).`,
          lcRef: terms.lcNumber,
          docRef: inv.docId,
        });
      }
    }
    // (a)(ii) Made out in name of applicant.
    if (isPresent(inv.issuedTo) && isPresent(terms.applicantName)) {
      if (!nameMatches(inv.issuedTo, terms.applicantName)) {
        out.push({
          article: "UCP600-18-a-ii",
          severity: "discrepant",
          field: "commercial_invoice.issuedTo",
          message: `Commercial invoice is made out to "${inv.issuedTo}" but the LC applicant is "${terms.applicantName}". The invoice must be made out in the name of the applicant (UCP 600 Art. 18(a)(ii)).`,
          lcRef: terms.lcNumber,
          docRef: inv.docId,
        });
      }
    }
    // (a)(iii) Same currency.
    if (isPresent(inv.currency) && isPresent(terms.currency)) {
      if (norm(inv.currency) !== norm(terms.currency)) {
        out.push({
          article: "UCP600-18-a-iii",
          severity: "discrepant",
          field: "commercial_invoice.currency",
          message: `Commercial invoice is denominated in "${inv.currency}" but the LC currency is "${terms.currency}". The invoice must be in the same currency as the credit (UCP 600 Art. 18(a)(iii)).`,
          lcRef: terms.lcNumber,
          docRef: inv.docId,
        });
      }
    }
    // (b) Amount must not exceed LC amount.
    if (typeof inv.amount === "number" && typeof terms.amount === "number") {
      if (inv.amount > terms.amount + 0.001) {
        out.push({
          article: "UCP600-18-b",
          severity: "discrepant",
          field: "commercial_invoice.amount",
          message: `Commercial invoice amount ${inv.amount} ${inv.currency || terms.currency} exceeds the LC amount ${terms.amount} ${terms.currency}. The invoice amount must not exceed the amount permitted by the credit (UCP 600 Art. 18(b)).`,
          lcRef: terms.lcNumber,
          docRef: inv.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 20 — Bill of Lading (marine/ocean).
 * (a)(i)  Must indicate the name of the carrier and be identified as such.
 * (a)(ii) Must be signed by the carrier, master, or named agent.
 * (a)(iii) Must indicate the port of loading AND port of discharge.
 * (a)(iv) Must be the sole original OR a full set of originals.
 * Plus ISBP: must contain shipment terms (Incoterm).
 */
const rule_20_billOfLading: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  const bls = docs.filter((d) => d.type === "bill_of_lading");
  for (const bl of bls) {
    // (a)(i) Carrier name indicated.
    const carrier = bl.data?.carrier ?? bl.issuedBy;
    if (!isPresent(carrier)) {
      out.push({
        article: "UCP600-20-a-i",
        severity: "discrepant",
        field: "bill_of_lading.carrier",
        message: `Bill of lading does not indicate the name of the carrier. A marine bill of lading must indicate the name of the carrier and be identified as such (UCP 600 Art. 20(a)(i)).`,
        lcRef: terms.lcNumber,
        docRef: bl.docId,
      });
    }
    // (a)(ii) Signed.
    if (bl.signed !== true) {
      out.push({
        article: "UCP600-20-a-ii",
        severity: "discrepant",
        field: "bill_of_lading.signed",
        message: `Bill of lading does not appear to be signed by the carrier, master, or a named agent. A marine bill of lading must be signed (UCP 600 Art. 20(a)(ii)).`,
        lcRef: terms.lcNumber,
        docRef: bl.docId,
      });
    }
    // (a)(iii) Port of loading + discharge indicated.
    if (!isPresent(bl.portOfLoading)) {
      out.push({
        article: "UCP600-20-a-iii",
        severity: "discrepant",
        field: "bill_of_lading.portOfLoading",
        message: `Bill of lading does not indicate the port of loading. A marine bill of lading must indicate the port of loading and the port of discharge (UCP 600 Art. 20(a)(iii)).`,
        lcRef: terms.lcNumber,
        docRef: bl.docId,
      });
    }
    if (!isPresent(bl.portOfDischarge)) {
      out.push({
        article: "UCP600-20-a-iii",
        severity: "discrepant",
        field: "bill_of_lading.portOfDischarge",
        message: `Bill of lading does not indicate the port of discharge. A marine bill of lading must indicate the port of loading and the port of discharge (UCP 600 Art. 20(a)(iii)).`,
        lcRef: terms.lcNumber,
        docRef: bl.docId,
      });
    }
    // (a)(iv) Sole original or full set.
    if (typeof bl.originalCount !== "number" || bl.originalCount < 1) {
      out.push({
        article: "UCP600-20-a-iv",
        severity: "discrepant",
        field: "bill_of_lading.originalCount",
        message: `Bill of lading does not indicate the number of originals presented. A marine bill of lading must be the sole original or indicate the full set of originals (UCP 600 Art. 20(a)(iv)).`,
        lcRef: terms.lcNumber,
        docRef: bl.docId,
      });
    }
    // ISBP — shipment terms (Incoterm) present.
    const shipmentTerms = bl.data?.shipmentTerms ?? bl.data?.incoterm;
    if (!isPresent(shipmentTerms) && isPresent(terms.incoterm)) {
      out.push({
        article: "UCP600-20",
        severity: "warning",
        field: "bill_of_lading.shipmentTerms",
        message: `Bill of lading does not state the shipment terms (Incoterm). The LC indicates Incoterm "${terms.incoterm}" — confirm the B/L or a companion document references it (ISBP 821, E6).`,
        lcRef: terms.lcNumber,
        docRef: bl.docId,
      });
    }
    // Latest shipment date check.
    if (isPresent(terms.latestShipmentDate) && isPresent(bl.date)) {
      const shipDate = parseDate(bl.date);
      const latest = parseDate(terms.latestShipmentDate);
      if (shipDate && latest && shipDate.getTime() > latest.getTime() + 24 * 60 * 60 * 1000) {
        out.push({
          article: "UCP600-20",
          severity: "discrepant",
          field: "bill_of_lading.date",
          message: `Bill of lading on-board date ${bl.date} is later than the LC latest shipment date ${terms.latestShipmentDate}. Shipment after the latest shipment date is a discrepancy (UCP 600 Art. 14(i)).`,
          lcRef: terms.lcNumber,
          docRef: bl.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 23 — Air Transport Document (Air Waybill).
 * (a)(i)  Must indicate the name of the carrier.
 * (a)(ii) Must be signed by the carrier or a named agent.
 * (a)(iii) Must indicate the airport of departure AND airport of destination.
 */
const rule_23_airWaybill: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  const awbs = docs.filter((d) => d.type === "air_waybill");
  for (const awb of awbs) {
    const carrier = awb.data?.carrier ?? awb.issuedBy;
    if (!isPresent(carrier)) {
      out.push({
        article: "UCP600-23-a-i",
        severity: "discrepant",
        field: "air_waybill.carrier",
        message: `Air waybill does not indicate the name of the carrier. An air transport document must indicate the name of the carrier and be identified as such (UCP 600 Art. 23(a)(i)).`,
        lcRef: terms.lcNumber,
        docRef: awb.docId,
      });
    }
    if (awb.signed !== true) {
      out.push({
        article: "UCP600-23-a-ii",
        severity: "discrepant",
        field: "air_waybill.signed",
        message: `Air waybill does not appear to be signed by the carrier or a named agent. An air transport document must be signed (UCP 600 Art. 23(a)(ii)).`,
        lcRef: terms.lcNumber,
        docRef: awb.docId,
      });
    }
    if (!isPresent(awb.portOfLoading)) {
      out.push({
        article: "UCP600-23-a-iii",
        severity: "discrepant",
        field: "air_waybill.portOfLoading",
        message: `Air waybill does not indicate the airport of departure. An air transport document must indicate the airport of departure and the airport of destination (UCP 600 Art. 23(a)(iii)).`,
        lcRef: terms.lcNumber,
        docRef: awb.docId,
      });
    }
    if (!isPresent(awb.portOfDischarge)) {
      out.push({
        article: "UCP600-23-a-iii",
        severity: "discrepant",
        field: "air_waybill.portOfDischarge",
        message: `Air waybill does not indicate the airport of destination. An air transport document must indicate the airport of departure and the airport of destination (UCP 600 Art. 23(a)(iii)).`,
        lcRef: terms.lcNumber,
        docRef: awb.docId,
      });
    }
    if (isPresent(terms.latestShipmentDate) && isPresent(awb.date)) {
      const shipDate = parseDate(awb.date);
      const latest = parseDate(terms.latestShipmentDate);
      if (shipDate && latest && shipDate.getTime() > latest.getTime() + 24 * 60 * 60 * 1000) {
        out.push({
          article: "UCP600-23",
          severity: "discrepant",
          field: "air_waybill.date",
          message: `Air waybill issuance date ${awb.date} is later than the LC latest shipment date ${terms.latestShipmentDate}. For air transport, the date of issuance is the date of shipment unless the AWB bears a specific flight date notation (UCP 600 Art. 23(a)(iii) & Art. 14(i)).`,
          lcRef: terms.lcNumber,
          docRef: awb.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 28 — Insurance Document.
 * (a) Must be signed.
 * (b) Currency must be the same as the LC.
 * (c) Must cover at least 110% of the CIF or CIP value of the goods.
 * (d) Must cover, as a minimum, the risks defined in the LC; absent such
 *     definition, the Institute Cargo Clauses (A) "all risks" minimum applies.
 */
const rule_28_insurance: LcRule = (terms, docs) => {
  const out: Discrepancy[] = [];
  const ins = docs.filter((d) => d.type === "insurance");
  for (const policy of ins) {
    // (a) Signed.
    if (policy.signed !== true) {
      out.push({
        article: "UCP600-28-a",
        severity: "discrepant",
        field: "insurance.signed",
        message: `Insurance document does not appear to be signed. An insurance document must be signed by the insurer, underwriter, or their agent (UCP 600 Art. 28(a)).`,
        lcRef: terms.lcNumber,
        docRef: policy.docId,
      });
    }
    // (b) Same currency.
    if (isPresent(policy.currency) && isPresent(terms.currency)) {
      if (norm(policy.currency) !== norm(terms.currency)) {
        out.push({
          article: "UCP600-28-b",
          severity: "discrepant",
          field: "insurance.currency",
          message: `Insurance document is denominated in "${policy.currency}" but the LC currency is "${terms.currency}". An insurance document must be in the same currency as the credit (UCP 600 Art. 28(b)).`,
          lcRef: terms.lcNumber,
          docRef: policy.docId,
        });
      }
    }
    // (c) Cover >= 110% of CIF/CIP value. We use the LC amount as a proxy for
    //     CIF/CIP value when the document does not carry its own insured value.
    if (typeof policy.amount === "number" && typeof terms.amount === "number" && terms.amount > 0) {
      const required = terms.amount * 1.1;
      if (policy.amount < required - 0.01) {
        out.push({
          article: "UCP600-28-c",
          severity: "discrepant",
          field: "insurance.amount",
          message: `Insurance cover ${policy.amount} ${policy.currency || terms.currency} is less than 110% of the LC amount (${required.toFixed(2)} ${terms.currency}). Insurance must cover at least 110% of the CIF or CIP value of the goods (UCP 600 Art. 28(c)).`,
          lcRef: terms.lcNumber,
          docRef: policy.docId,
        });
      }
    } else if (typeof policy.amount !== "number" && typeof terms.amount === "number") {
      // No insured value on the document — warn (cannot verify 110%).
      out.push({
        article: "UCP600-28-c",
        severity: "warning",
        field: "insurance.amount",
        message: `Insurance document does not state the insured value. Banks cannot verify that cover is at least 110% of the CIF/CIP value (UCP 600 Art. 28(c)). Confirm the insured amount is at least ${(terms.amount * 1.1).toFixed(2)} ${terms.currency}.`,
        lcRef: terms.lcNumber,
        docRef: policy.docId,
      });
    }
    // (d) Coverage "all risks" minimum (when LC is silent on coverage).
    const coverage = policy.data?.coverage ?? policy.data?.clauses;
    if (isPresent(coverage)) {
      const c = norm(coverage);
      const allRisks = c.includes("all risks") || c.includes("icc a") || c.includes("institute cargo clauses (a)") || c.includes("clauses a");
      const lcCoverageSpecified = (terms.requiredDocuments || []).some((r) => /cover|insurance|risk|clause/i.test(r));
      if (!allRisks && !lcCoverageSpecified) {
        out.push({
          article: "UCP600-28-d",
          severity: "warning",
          field: "insurance.coverage",
          message: `Insurance document shows coverage "${coverage}". When the LC does not specify the risks to be covered, insurance must cover at least the Institute Cargo Clauses (A) — "all risks" (UCP 600 Art. 28(d)). Confirm coverage meets this minimum.`,
          lcRef: terms.lcNumber,
          docRef: policy.docId,
        });
      }
    }
  }
  return out;
};

/**
 * Art. 29 — Extension of Expiry Date.
 * If the expiry date falls on a day on which the bank is closed (weekend or
 * bank holiday), the expiry is extended to the FIRST following banking day.
 * We emit an advisory note when the LC expiry is on a weekend (we cannot know
 * local bank holidays without a calendar feed).
 */
const rule_29_extension: LcRule = (terms, _docs) => {
  const out: Discrepancy[] = [];
  const exp = parseDate(terms.expiryDate);
  if (exp && isWeekend(exp)) {
    const dayName = exp.toLocaleDateString("en-GB", { weekday: "long" });
    out.push({
      article: "UCP600-29",
      severity: "warning",
      field: "expiryDate",
      message: `LC expiry date ${terms.expiryDate} falls on a ${dayName} (non-banking day). Under UCP 600 Art. 29(a), the expiry is extended to the first following banking day. Confirm with the nominated bank whether presentation must be made before the extended expiry.`,
      lcRef: terms.lcNumber,
    });
  }
  return out;
};

/**
 * Art. 36 — Force Majeure.
 * A bank is not liable for consequences arising from interruption of its
 * business by force majeure (strikes, lockouts, riots, natural disasters,
 * war, terrorism, cyber-attacks, pandemics...). This is informational — we
 * emit an examination note (no discrepancy).
 */
const rule_36_forceMajeure: LcRule = (_terms, _docs) => {
  // Emits no discrepancies; contributes an examination note via the engine.
  return [];
};

// ─────────────────────────────────────────────────────────────────────────────
// Rule registry
// ─────────────────────────────────────────────────────────────────────────────

interface RuleEntry {
  article: string;
  description: string;
  rule: LcRule;
}

const RULES: RuleEntry[] = [
  { article: "UCP600-14-a", description: "Standard for examination — data consistency", rule: rule_14a_dataConsistency },
  { article: "UCP600-14-d", description: "Address & contact details matching", rule: rule_14d_addressMatching },
  { article: "UCP600-14-e", description: "Non-documentary conditions disregarded", rule: rule_14e_nonDocumentaryConditions },
  { article: "UCP600-14-f", description: "Issuer requirements for transport / insurance / COO", rule: rule_14f_issuerRequirements },
  { article: "UCP600-16", description: "Discrepant documents — single notice & 5-banking-day window", rule: rule_16_singleNotice },
  { article: "UCP600-17", description: "Original documents", rule: rule_17_originals },
  { article: "UCP600-18", description: "Commercial invoice requirements", rule: rule_18_commercialInvoice },
  { article: "UCP600-20", description: "Bill of lading (marine) requirements", rule: rule_20_billOfLading },
  { article: "UCP600-23", description: "Air transport document requirements", rule: rule_23_airWaybill },
  { article: "UCP600-28", description: "Insurance document requirements", rule: rule_28_insurance },
  { article: "UCP600-29", description: "Extension of expiry date (bank holidays)", rule: rule_29_extension },
  { article: "UCP600-36", description: "Force majeure — bank not liable for interruption", rule: rule_36_forceMajeure },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a documentary presentation against UCP 600.
 *
 * @param terms     The LC terms as issued (applicant, beneficiary, amounts, dates, required documents...).
 * @param documents The documents the beneficiary intends to present.
 * @returns         A structured examination result with discrepancies (with refusal-notice wording)
 *                  and procedural examination notes.
 */
export function validateLcDocuments(terms: LcTerms, documents: LcDocument[]): LcValidationResult {
  const discrepancies: Discrepancy[] = [];
  const examinationNotes: string[] = [];

  // Run every registered rule.
  for (const entry of RULES) {
    try {
      const found = entry.rule(terms, documents);
      for (const d of found) {
        // Ensure article & lcRef are populated.
        if (!d.article) d.article = entry.article;
        if (!d.lcRef) d.lcRef = terms.lcNumber;
        discrepancies.push(d);
      }
    } catch (e) {
      // A rule failure must never abort the whole examination — record a note.
      examinationNotes.push(
        `[${entry.article}] Internal rule evaluation error: ${e instanceof Error ? e.message : String(e)}. Rule skipped; manual examination required.`,
      );
    }
  }

  // Procedural notes (Art. 16 single-notice reminder).
  examinationNotes.push(
    "UCP 600 Art. 16(b): The issuing bank has a maximum of five banking days following the date of presentation to determine if the presentation is complying. This pre-validation does not start the clock — the clock starts on actual presentation to the nominated/issuing bank.",
  );
  examinationNotes.push(
    "UCP 600 Art. 16(c): If the bank refuses a presentation, it must give a SINGLE notice to the presenter stating ALL discrepancies. Each discrepancy listed above would appear on that refusal notice.",
  );
  examinationNotes.push(
    "UCP 600 Art. 36: The bank is not liable for any consequences arising from interruption of its business by force majeure (strikes, riots, natural disasters, war, cyber-attacks, pandemics, etc.). During such interruptions, presentation and examination windows may be affected.",
  );
  examinationNotes.push(
    "ISBP 821: This pre-validation reflects International Standard Banking Practice (ICC Publication 821). Where UCP 600 is silent, ISBP 821 applies. Beneficiary should consult ISBP 821 for documentary construction details (e.g. how to indicate 'on board' notation, how to correct documents).",
  );

  // Sort: discrepant first, then warnings. Stable within each tier (rule order preserved).
  const tier = (s: DiscrepancySeverity) => (s === "discrepant" ? 0 : 1);
  discrepancies.sort((a, b) => tier(a.severity) - tier(b.severity));

  const cleanPresentation = discrepancies.length === 0;

  return {
    lcNumber: terms.lcNumber,
    cleanPresentation,
    discrepancies,
    examinationNotes,
    examinedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (Optional) Convenience exports for callers that want the rule list.
// ─────────────────────────────────────────────────────────────────────────────

export const UCP600_RULES: ReadonlyArray<{ article: string; description: string }> = RULES.map((r) => ({
  article: r.article,
  description: r.description,
}));

export { normalizeEntityName, similarity, levenshtein, nameMatches };
