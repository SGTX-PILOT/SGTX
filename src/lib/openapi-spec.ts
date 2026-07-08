// SGTX OpenAPI 3.1 Specification — key API routes
// Exported as a TypeScript object. Served via /api/openapi.json

export const sgtxOpenApiSpec: Record<string, any> = {
  openapi: "3.1.0",
  info: {
    title: "SGTX — Sovereign Governed Trade Execution API",
    version: "2.0.0",
    description: "Non-custodial, AI-governed, sovereign trade execution engine. NOT a marketplace. All irreversible actions pass through the Governor (OPA + WasmEdge + Loom). Brain AI gates critical mutations (contract sign, milestone confirm, FeeLock freeze).",
    contact: { name: "SGTX Platform", url: "https://sgtx.io" },
    license: { name: "Proprietary" },
  },
  servers: [
    { url: "/", description: "Current instance" },
  ],
  tags: [
    { name: "Identity", description: "GTID resolve, USTN track" },
    { name: "Governor", description: "Constitutional governance, Loom chain, OPA policies" },
    { name: "Brain", description: "AI intelligence, market analysis, portal intelligence, readiness scoring" },
    { name: "Compliance", description: "EUDR, CBAM, sanctions, UCP 600, ICS2, US/China/GCC customs, certificates, force majeure, arbitration, FX controls" },
    { name: "Trade", description: "Trade request, contract signing, milestones, compliance gates" },
    { name: "Payment", description: "FeeLock, dynamic fee, settlement" },
    { name: "Portal", description: "Portal dashboards, provider quotes, customs clearance" },
    { name: "Health", description: "Health checks, metrics" },
  ],
  paths: {
    "/api/v1/gtid/resolve": {
      post: {
        tags: ["Identity"],
        summary: "Resolve a GTID to public tenant info",
        description: "Returns consented public info only: legal_name, type, jurisdiction, trust_score, kyb_tier, sanctions_cleared, lifecycle_state. No private data.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { gtid: { type: "string", example: "SGTX-EG-TRD-002139-7F3A" } }, required: ["gtid"] } } } },
        responses: {
          "200": { description: "Resolved (found) or not found (found:false)", content: { "application/json": { schema: { type: "object", properties: { found: { type: "boolean" }, gtid: { type: "string" }, legal_name: { type: "string" }, type: { type: "string" }, jurisdiction: { type: "string" }, trust_score: { type: "number" }, kyb_tier: { type: "number" }, sanctions_cleared: { type: "boolean" }, lifecycle_state: { type: "string" } } } } } },
          "400": { description: "Missing gtid" },
        },
      },
    },
    "/api/v1/ustn/track": {
      get: {
        tags: ["Identity"],
        summary: "Track a shipment by USTN",
        parameters: [{ name: "ustn", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "USTN status + milestones" } },
      },
    },
    "/api/sgtx/health/ready": {
      get: { tags: ["Health"], summary: "Readiness probe", responses: { "200": { description: "Platform ready" } } },
    },
    "/api/sgtx/brain/intelligence": {
      get: {
        tags: ["Brain"],
        summary: "Brain intelligence — multi-layer analysis",
        parameters: [{ name: "module", in: "query", schema: { type: "string", enum: ["eta", "risk", "demand", "psp", "sanctions", "document", "route", "fx", "settlement", "credit", "negotiation"] } }],
        responses: { "200": { description: "Intelligence result" } },
      },
    },
    "/api/sgtx/brain/market-analysis": {
      get: { tags: ["Brain"], summary: "Commodity price market analysis", responses: { "200": { description: "Market analysis" } } },
    },
    "/api/sgtx/brain/portal-intelligence": {
      get: {
        tags: ["Brain"],
        summary: "Per-portal intelligence feed (3 insights)",
        parameters: [
          { name: "portal", in: "query", required: true, schema: { type: "string", enum: ["buyer", "seller", "lsp", "shipping", "lab", "qc", "customs_broker", "bank", "private_financier", "government", "admin"] } },
          { name: "gtid", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "3 personalized insights" } },
      },
    },
    "/api/sgtx/contract/sign": {
      post: {
        tags: ["Trade", "Brain", "Compliance"],
        summary: "Sign a trade contract (Brain-gated)",
        description: "Pre-screened by autoCheckCompliance (sanctions + FM + EUDR + CBAM + FTA). DENY blocks signature. CONDITIONAL records conditions. Then Governor decides + QES signature + Loom entry.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { ustn: { type: "string" }, signerGtid: { type: "string" }, signerEmployeeId: { type: "string" } } } } } },
        responses: {
          "200": { description: "Contract signed", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, brainVerdict: { type: "string", enum: ["ALLOW", "CONDITIONAL", "DENY"] }, brainConditions: { type: "array" }, loomHash: { type: "string" } } } } },
          "422": { description: "Brain DENY — contract blocked" },
        },
      },
    },
    "/api/sgtx/milestone/confirm": {
      post: {
        tags: ["Trade", "Brain"],
        summary: "Confirm a milestone (Brain dispute risk assessment)",
        description: "After confirmation, Brain runs predictDisputeRisk. If probability exceeds 0.4, counterparty receives preventive Smart Inbox alert.",
        responses: { "200": { description: "Milestone confirmed + dispute risk assessment" } },
      },
    },
    "/api/sgtx/payment/fealock/freeze": {
      post: {
        tags: ["Payment", "Brain"],
        summary: "Freeze FeeLock (Brain dynamic fee)",
        description: "Fee calculated by calculateDynamicFee (commodity volatility + route risk + liquidity + perishable urgency). Constitutional bounds 0.1%-2.5%.",
        responses: { "200": { description: "FeeLock frozen with dynamic fee" } },
      },
    },
    "/api/sgtx/readiness/cron": {
      post: {
        tags: ["Brain"],
        summary: "Readiness scoring cron (AI-weighted)",
        description: "Calculates trade readiness for all tenants via calculateTradeReadinessScore (6 components: market alignment, compliance velocity, dispute frequency, payment reliability, sanctions clear, trade volume).",
        responses: { "200": { description: "Scoring results" } },
      },
    },
    "/api/sgtx/trade-request/compliance-check": {
      post: {
        tags: ["Trade", "Compliance"],
        summary: "Pre-submission compliance gate",
        description: "Runs autoCheckCompliance + EUDR + Force Majeure + sanctions. Returns overallVerdict + per-module results. DENY hard-blocks trade submission.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { hsCode: { type: "string" }, originCountry: { type: "string" }, destCountry: { type: "string" }, buyerName: { type: "string" }, sellerName: { type: "string" }, commodity: { type: "string" }, weightTonnes: { type: "number" } } } } } },
        responses: { "200": { description: "Compliance result with verdict" } },
      },
    },
    "/api/sgtx/customs/cbam": {
      post: {
        tags: ["Compliance"],
        summary: "CBAM (Carbon Border Adjustment Mechanism) calculation",
        description: "EU CBAM — definitive period from Jan 2026. Covers cement clinker (2523), ammonia (2814), hydrogen (2845), fertilisers (3102-3105), electricity (2716), iron/steel (72-73), aluminium (76).",
        responses: { "200": { description: "CBAM obligation" } },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: { type: "object" }, correlationId: { type: "string" } } },
        },
      },
      Success: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          data: { type: "object" },
        },
      },
    },
  },
  },
};
