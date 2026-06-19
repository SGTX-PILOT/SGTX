import { NextResponse } from "next/server";

// GET /api/sgtx/openapi — OpenAPI 3.1 specification (blueprint Part 27)
export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "SGTX Platform API",
      version: "12.0.0",
      description: "Sovereign Governed Trade Execution — Non-custodial, AI-governed, sovereign trade execution engine.",
      contact: { name: "SGTX Platform", url: "https://sgtx.io" },
    },
    servers: [
      { url: "https://api.sgtx.io/v1", description: "Production" },
      { url: "http://localhost:3000/api/sgtx", description: "Development" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    paths: {
      "/health": {
        get: { summary: "Platform health check", tags: ["System"], responses: { "200": { description: "Healthy" }, "503": { description: "Unhealthy" } } },
      },
      "/metrics": {
        get: { summary: "Prometheus metrics", tags: ["System"], responses: { "200": { description: "Metrics in text/plain format" } } },
      },
      "/status": {
        get: { summary: "Public status page", tags: ["System"], responses: { "200": { description: "Status" } } },
      },
      "/trade-request": {
        post: { summary: "Create trade request (Phase 1)", tags: ["Trade"], responses: { "200": { description: "Trade created" }, "403": { description: "Governor DENY" } } },
        get: { summary: "List buyer's trades", tags: ["Trade"], responses: { "200": { description: "List" } } },
      },
      "/trade-request/draft": {
        post: { summary: "Autosave draft", tags: ["Trade"], responses: { "200": { description: "Saved" } } },
        get: { summary: "Recover draft", tags: ["Trade"], responses: { "200": { description: "Draft" } } },
      },
      "/quote/submit": {
        post: { summary: "Submit seller quote (Phase 2)", tags: ["Quote"], responses: { "200": { description: "Quote submitted" } } },
      },
      "/governor/decision": {
        post: { summary: "Governor decision", tags: ["Governance"], responses: { "200": { description: "Decision" } } },
      },
      "/governor/verify-loom": {
        get: { summary: "Verify Loom hash chain", tags: ["Governance"], responses: { "200": { description: "Verified" } } },
      },
      "/disputes/file": { post: { summary: "File dispute", tags: ["Dispute"] } },
      "/disputes/expert": { post: { summary: "Invite expert / post opinion", tags: ["Dispute"] }, get: { summary: "List experts", tags: ["Dispute"] } },
      "/disputes/prediction": { post: { summary: "Predict dispute outcome", tags: ["Dispute"] }, get: { summary: "Get prediction", tags: ["Dispute"] } },
      "/financing/request": { post: { summary: "Request financing", tags: ["Financing"] } },
      "/release/authorization": { get: { summary: "Container release authorisation", tags: ["Release"] } },
      "/distressed/declare": { post: { summary: "Declare distressed cargo", tags: ["Distressed"] } },
      "/distressed/listings": { get: { summary: "List distressed cargo", tags: ["Distressed"] } },
      "/barcodes/generate": { post: { summary: "Generate SSCC-18 barcodes", tags: ["Barcodes"] } },
      "/barcodes/scan": { post: { summary: "Record barcode scan", tags: ["Barcodes"] } },
      "/pdpl/consent": { get: { summary: "List consents", tags: ["PDPL"] }, post: { summary: "Set consent", tags: ["PDPL"] } },
      "/pdpl/dsr": { get: { summary: "List DSR requests", tags: ["PDPL"] }, post: { summary: "Submit DSR", tags: ["PDPL"] } },
      "/trade-memory/event": { post: { summary: "Capture trade memory event", tags: ["TradeMemory"] } },
      "/trade-memory/insight": { post: { summary: "Generate predictive insight", tags: ["TradeMemory"] } },
      "/incidents": { get: { summary: "List incidents", tags: ["Security"] }, post: { summary: "Create incident", tags: ["Security"] } },
      "/threats": { get: { summary: "List threats", tags: ["Security"] }, post: { summary: "Report threat", tags: ["Security"] } },
      "/sla": { get: { summary: "SLA metrics", tags: ["SLA"] }, post: { summary: "Record SLA metric", tags: ["SLA"] } },
      "/inbox": { get: { summary: "List inbox", tags: ["Inbox"] } },
      "/tasks": { get: { summary: "List tasks", tags: ["Tasks"] }, post: { summary: "Create task", tags: ["Tasks"] } },
      "/feedback": { get: { summary: "List feedback", tags: ["Feedback"] }, post: { summary: "Submit feedback", tags: ["Feedback"] } },
      "/multisig": { get: { summary: "List multisig requests", tags: ["Admin"] }, post: { summary: "Create multisig request", tags: ["Admin"] } },
      "/admin/metrics": { get: { summary: "Admin metrics dashboard", tags: ["Admin"] } },
    },
    tags: [
      { name: "System", description: "Health, metrics, status" },
      { name: "Trade", description: "Trade request & lifecycle" },
      { name: "Quote", description: "Seller quote submission" },
      { name: "Governance", description: "Governor & Loom" },
      { name: "Dispute", description: "Dispute management" },
      { name: "Financing", description: "Trade finance" },
      { name: "Release", description: "Container release authorisation" },
      { name: "Distressed", description: "Distressed cargo outreach" },
      { name: "Barcodes", description: "SSCC-18 & QR generation" },
      { name: "PDPL", description: "Egyptian PDPL compliance" },
      { name: "TradeMemory", description: "Trade memory & predictions" },
      { name: "Security", description: "Incidents & threats" },
      { name: "SLA", description: "SLA & uptime" },
      { name: "Inbox", description: "Smart Inbox" },
      { name: "Tasks", description: "Task Center" },
      { name: "Feedback", description: "Feedback tickets" },
      { name: "Admin", description: "Admin operations" },
    ],
  };
  return NextResponse.json(spec);
}
