// @ts-nocheck
// =============================================================================
// SGTX v17 §16 — Help Center API backend
// -----------------------------------------------------------------------------
// Surfaces the same article list used by the HelpCenterModal UI (so the
// search field can be reused server-side for deep links) + creates support
// tickets (FeedbackTicket) and VoIP callback requests.
//
// Routes:
//   GET  /api/sgtx/help-center/articles?q=X
//   GET  /api/sgtx/help-center/articles/[id]
//   POST /api/sgtx/help-center/ticket
//   GET  /api/sgtx/help-center/ticket/[id]
//   POST /api/sgtx/help-center/callback
//
// Storage:
//   • FeedbackTicket (existing model — type, subject, description, priority,
//                     status, url, userAgent, resolvedAt)
//   • Article metadata: in-memory constant (mirrors HELP_ARTICLES in
//     src/components/sgtx/common-components.tsx so the UI search and the
//     API search return identical results).
// =============================================================================
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  duration: string;
  icon: string;
  description: string;
  body?: string;
}

// Mirror of HELP_ARTICLES in src/components/sgtx/common-components.tsx.
// The icon names are kept as strings (the UI maps them back to Lucide icons).
export const HELP_ARTICLES: HelpArticle[] = [
  { id: "art-quick-start",      title: "Quick Start Decision Tree",       category: "Getting Started",         duration: "10 min", icon: "Lightbulb",     description: "Find the right portal for your role in three clicks." },
  { id: "art-tab-index",        title: "Tab Index — Searchable",          category: "Getting Started",         duration: "—",      icon: "ListChecks",   description: "Searchable A–Z of every portal tab." },
  { id: "art-keyboard",         title: "Keyboard Shortcuts Reference",   category: "Getting Started",         duration: "—",      icon: "Keyboard",     description: "Global hotkeys: ⌘K · ⌘H · ⌘I · ⌘B." },
  { id: "art-first-trade",      title: "Your First Trade in 5 Minutes",   category: "Video Academy",           duration: "5:23",   icon: "PlayCircle",   description: "Walk-through of the trade request → contract lock → shipment flow." },
  { id: "art-create-trade",     title: "How to Create a Trade Request",   category: "Video Academy",           duration: "3:15",   icon: "PlayCircle",   description: "Submitting a complete trade request — every required field." },
  { id: "art-exw-lock",         title: "Locking EXW Price & Logistics",   category: "Video Academy",           duration: "4:45",   icon: "PlayCircle",   description: "How to lock EXW price + logistics provider in one click." },
  { id: "art-qc-app",           title: "Using the QC Inspection App",     category: "Video Academy",           duration: "3:30",   icon: "PlayCircle",   description: "Mobile app walkthrough for QC inspectors in the field." },
  { id: "art-financing-bids",   title: "How to Bid on Financing Requests", category: "Video Academy",          duration: "4:00",   icon: "PlayCircle",   description: "Bid on financing requests, including co-financing." },
  { id: "art-disputes",         title: "Filing a Dispute",                category: "Video Academy",           duration: "4:20",   icon: "PlayCircle",   description: "How to file a dispute, attach evidence, and follow it through arbitration." },
  { id: "art-buyer-guide",      title: "Buyer Guide",                     category: "Role Guides",             duration: "PDF",   icon: "BookOpen",     description: "Comprehensive buyer guide — operations, finance, compliance." },
  { id: "art-seller-guide",     title: "Seller Guide",                    category: "Role Guides",             duration: "PDF",   icon: "BookOpen",     description: "Comprehensive seller guide — quoting, contracting, logistics." },
  { id: "art-lsp-guide",        title: "Logistics Provider Guide",        category: "Role Guides",             duration: "PDF",   icon: "BookOpen",     description: "LSP onboarding, quotation, dispatch, POD." },
  { id: "art-financier-guide",  title: "Financier Guide",                 category: "Role Guides",             duration: "PDF",   icon: "BookOpen",     description: "Financier onboarding, bidding, settlement, collateral." },
  { id: "art-gov-guide",        title: "Government Official Guide",       category: "Role Guides",             duration: "PDF",   icon: "BookOpen",     description: "Government portal — USTN verification, monitoring, declassification." },
  { id: "art-nafeza",           title: "Nafeza Integration",              category: "Regulatory Compliance",    duration: "—",     icon: "ShieldAlert",  description: "Nafeza ACI single-window integration for Egypt." },
  { id: "art-cargox",           title: "CargoX ACI",                     category: "Regulatory Compliance",    duration: "—",     icon: "ShieldAlert",  description: "CargoX ACI document upload + cryptographic stamping." },
  { id: "art-egypt-law",        title: "Egyptian Customs Law 207/2020",  category: "Regulatory Compliance",    duration: "—",     icon: "FileWarning",  description: "Key provisions of Egyptian Customs Law 207/2020 relevant to SGTX." },
  { id: "art-multiship",        title: "Multi-Shipment Contracts",        category: "Trade Guides",             duration: "—",     icon: "BookOpen",     description: "Multi-shipment contract lifecycle — per-shipment lock + fee." },
  { id: "art-distressed",        title: "Distressed Cargo Workflow",      category: "Trade Guides",             duration: "—",     icon: "BookOpen",     description: "Distressed-cargo listing + accelerated outreach + privacy notice." },
  { id: "art-openapi",          title: "OpenAPI Reference",              category: "API & Integration",        duration: "—",     icon: "ExternalLink", description: "Machine-readable OpenAPI 3.1 spec for all SGTX endpoints." },
  { id: "art-webhooks",         title: "Webhook Guide",                  category: "API & Integration",        duration: "—",     icon: "ExternalLink", description: "How to register webhooks + verify signatures." },
  { id: "art-glossary",         title: "Glossary of Terms",              category: "Getting Started",          duration: "—",     icon: "BookOpen",     description: "GTID · USTN · EXW · FeeLock · TRI · Trust Passport · Governor." },
];

export const QUICK_LINKS = [
  { label: "Quick Start Decision Tree", icon: "Lightbulb",   hint: "Find your portal in 3 clicks" },
  { label: "Tab Index",                 icon: "ListChecks", hint: "Searchable A–Z of all portal tabs" },
  { label: "Video Academy",             icon: "PlayCircle", hint: "12 walkthroughs · 41 min total" },
  { label: "Role Guides",               icon: "Users",      hint: "5 PDFs · buyer · seller · LSP · PFI · GOV" },
  { label: "API & Integration",         icon: "Code2",      hint: "OpenAPI 3.1 + Webhooks" },
  { label: "Keyboard Shortcuts",        icon: "Keyboard",   hint: "⌘K · ⌘H · ⌘I · ⌘B" },
  { label: "Glossary of Terms",         icon: "BookOpen",   hint: "GTID · USTN · EXW · FeeLock" },
];

// =============================================================================
// searchArticles
// =============================================================================
export function searchArticles(query: string = "", category?: string): {
  articles: HelpArticle[];
  categories: string[];
} {
  const q = query.toLowerCase().trim();
  let filtered = HELP_ARTICLES;
  if (category) filtered = filtered.filter((a) => a.category === category);
  if (q) {
    filtered = filtered.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    );
  }
  const categories = Array.from(new Set(filtered.map((a) => a.category)));
  return { articles: filtered, categories };
}

export function getArticleById(id: string): HelpArticle | null {
  return HELP_ARTICLES.find((a) => a.id === id) || null;
}

// =============================================================================
// createSupportTicket
// =============================================================================
export async function createSupportTicket(input: {
  tenantGtid: string;
  subject: string;
  description: string;
  priority?: string;
  url?: string;
  userAgent?: string;
}): Promise<{ ticketId: string; ticket: any }> {
  if (!input.tenantGtid || !input.subject || !input.description) {
    throw new Error("tenantGtid, subject, description required");
  }
  const ticket = await db.feedbackTicket.create({
    data: {
      tenantGtid: input.tenantGtid,
      type: "SUPPORT",
      subject: input.subject,
      description: input.description,
      priority: input.priority || "NORMAL",
      status: "OPEN",
      url: input.url || null,
      userAgent: input.userAgent || null,
    },
  });
  return { ticketId: ticket.id, ticket };
}

// =============================================================================
// getSupportTicket
// =============================================================================
export async function getSupportTicket(ticketId: string): Promise<any | null> {
  const ticket = await db.feedbackTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return null;
  return ticket;
}

// =============================================================================
// listSupportTickets
// =============================================================================
export async function listSupportTickets(tenantGtid: string, limit: number = 50): Promise<{
  tickets: any[]; count: number;
}> {
  const tickets = await db.feedbackTicket.findMany({
    where: { tenantGtid },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });
  return { tickets, count: tickets.length };
}

// =============================================================================
// requestVoipCallback — create a high-priority FeedbackTicket with type=VOIP_CALLBACK
// =============================================================================
export async function requestVoipCallback(input: {
  tenantGtid: string;
  phone: string;
  preferredTime?: string;
  topic?: string;
}): Promise<{ ticketId: string; reference: string }> {
  if (!input.tenantGtid || !input.phone) throw new Error("tenantGtid and phone required");
  const reference = `SGTX-HELP-${Date.now().toString(36).toUpperCase()}`;
  const ticket = await db.feedbackTicket.create({
    data: {
      tenantGtid: input.tenantGtid,
      type: "VOIP_CALLBACK",
      subject: `VoIP callback request: ${input.topic || "general"}`,
      description: `Phone: ${input.phone}. Preferred time: ${input.preferredTime || "ASAP"}. Reference: ${reference}.`,
      priority: "HIGH",
      status: "OPEN",
    },
  });
  return { ticketId: ticket.id, reference };
}
