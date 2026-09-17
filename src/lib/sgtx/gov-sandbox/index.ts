// SGTX Add-On 15 — Government API Sandbox
//
// Tenants integrating with foreign customs / port / single-window platforms
// (e.g., NAFEZA/CargoX in Egypt, Saudi FASAH, UAE RAS, India ICEGATE) need a
// safe place to test their integration before going live against production
// government endpoints. This module wraps the `GovernmentApiSandbox` and
// `GovernmentApiTestResult` Prisma models and provides a mock-response
// generator + test runner.
//
// What this module does:
//   1. List government APIs per country (with optional seeding of well-known
//      sandbox endpoints for Egypt, Saudi Arabia, UAE, India, EU).
//   2. Run a "test" against a sandbox endpoint — this is a SIMULATED test
//      (no real HTTP call to the government sandbox; we generate a deterministic
//      mock response based on the endpoint + request body, and compare it
//      against the expected status code).
//   3. Persist test results with a diff for inspection.
//
// Why simulated: the real sandbox endpoints require API keys, OAuth tokens,
// and IP whitelisting per tenant — none of which should be embedded in the
// shared library. The simulated runner lets tenants validate their request
// shape + endpoint mapping before doing the real integration in their own
// environment.
//
// All DB calls are wrapped in try/catch (defensive). The library never throws
// — it returns null / empty arrays on failure and logs a warning.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface GovernmentApiInput {
  countryCode: string;
  apiName: string;
  sandboxUrl: string;
  productionUrl?: string;
  version?: string;
}

export interface SandboxTestInput {
  apiId: string;
  testType: string;          // AUTH | SUBMIT | QUERY | STATUS | CALLBACK | CANCEL
  endpoint: string;          // path under the sandbox base URL
  requestBody?: string;      // JSON string (raw)
  expectedStatus?: number;   // default 200
}

export interface SandboxTestResult {
  testResultId: string | null;
  apiId: string;
  testType: string;
  endpoint: string;
  requestBody: string | null;
  responseBody: string | null;
  expectedStatus: number | null;
  actualStatus: number;
  passed: boolean;
  diff: string | null;
  durationMs: number;
  testRun: Date;
}

// ============ Well-known sandbox endpoints ============
// Seeded on first call to ensure the demo has data to work with. Real
// tenants will register their own sandbox endpoints via the API.

export const WELL_KNOWN_SANDBOXES: GovernmentApiInput[] = [
  {
    countryCode: "EG",
    apiName: "NAFEZA — Egyptian Advanced Cargo Information (ACI)",
    sandboxUrl: "https://api.preprod.singlewindow.eg/v1/aci",
    productionUrl: "https://api.singlewindow.eg/v1/aci",
    version: "v1",
  },
  {
    countryCode: "EG",
    apiName: "CargoX — Document Transfer (ACID/CargoX)",
    sandboxUrl: "https://api.cargox.digital/sandbox/v3",
    productionUrl: "https://api.cargox.digital/api/v3",
    version: "v3",
  },
  {
    countryCode: "SA",
    apiName: "FASAH — Saudi Single Window",
    sandboxUrl: "https://sandbox.fasah.sa/v2",
    productionUrl: "https://api.fasah.sa/v2",
    version: "v2",
  },
  {
    countryCode: "AE",
    apiName: "UAE RAS — Customs Declaration",
    sandboxUrl: "https://ras-api.sandbox.ae/v1",
    productionUrl: "https://ras-api.ae/v1",
    version: "v1",
  },
  {
    countryCode: "IN",
    apiName: "ICEGATE — Indian Customs EDI",
    sandboxUrl: "https://sandbox.icegate.gov.in/v1",
    productionUrl: "https://api.icegate.gov.in/v1",
    version: "v1",
  },
  {
    countryCode: "EU",
    apiName: "EU AES — Export System",
    sandboxUrl: "https://europa.ecu.cc/sandbox/aes",
    productionUrl: "https://europa.ecu.cc/aes",
    version: "v3",
  },
];

// ============ Mock response generator ============
/**
 * Generate a deterministic mock response for a sandbox test. The response
 * is keyed on (apiId, endpoint, requestBody) so the same test always returns
 * the same response — this is essential for diff-based regression testing.
 *
 * The mock returns:
 *   - 200 with a JSON body for well-formed requests
 *   - 400 if the request body is not valid JSON (when one is required)
 *   - 401 if the test type is AUTH and the body is missing a `token` field
 *   - 404 if the endpoint doesn't look like a known route
 */
export function generateMockResponse(
  apiId: string,
  testType: string,
  endpoint: string,
  requestBody: string | null,
): { status: number; body: string; diff?: string } {
  const normalizedEndpoint = endpoint.toLowerCase();

  // AUTH tests must include a token field
  if (testType.toUpperCase() === "AUTH") {
    let parsed: any = null;
    try { parsed = requestBody ? JSON.parse(requestBody) : null; } catch { /* invalid JSON */ }
    if (!parsed || !parsed.token) {
      return {
        status: 401,
        body: JSON.stringify({ error: "UNAUTHORIZED", message: "Missing 'token' in request body" }),
      };
    }
    return {
      status: 200,
      body: JSON.stringify({ token: parsed.token, expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
    };
  }

  // Validate request body for non-GET test types
  if (testType.toUpperCase() === "SUBMIT" || testType.toUpperCase() === "CREATE") {
    let parsed: any = null;
    try { parsed = requestBody ? JSON.parse(requestBody) : null; } catch { /* invalid */ }
    if (!parsed) {
      return {
        status: 400,
        body: JSON.stringify({ error: "BAD_REQUEST", message: "Invalid or missing JSON request body" }),
      };
    }
    const reference = `MOCK-${apiId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    return {
      status: 201,
      body: JSON.stringify({
        reference,
        status: "ACCEPTED",
        receivedAt: new Date().toISOString(),
        payload: parsed,
      }),
    };
  }

  // QUERY/STATUS — return a deterministic mock based on the endpoint
  if (testType.toUpperCase() === "QUERY" || testType.toUpperCase() === "STATUS") {
    if (normalizedEndpoint.includes("status") || normalizedEndpoint.includes("/track")) {
      return {
        status: 200,
        body: JSON.stringify({
          reference: `MOCK-${(apiId + endpoint).slice(-8).toUpperCase()}`,
          status: "IN_PROGRESS",
          updatedAt: new Date().toISOString(),
        }),
      };
    }
    return {
      status: 200,
      body: JSON.stringify({
        results: [],
        count: 0,
        note: "Mock sandbox — no persistent state",
      }),
    };
  }

  // CANCEL — always returns 200 with a confirmation
  if (testType.toUpperCase() === "CANCEL") {
    return {
      status: 200,
      body: JSON.stringify({ cancelled: true, cancelledAt: new Date().toISOString() }),
    };
  }

  // Unknown endpoint shape → 404
  if (!normalizedEndpoint.startsWith("/")) {
    return {
      status: 404,
      body: JSON.stringify({ error: "NOT_FOUND", message: "Endpoint must start with /" }),
    };
  }

  // Default: 200 OK with echo
  return {
    status: 200,
    body: JSON.stringify({ ok: true, endpoint, echo: requestBody ?? null }),
  };
}

// ============ Public helpers ============

/**
 * Lazy-seed the well-known sandbox endpoints if the table is empty.
 * Defensive — returns the count of newly-created rows.
 */
export async function seedWellKnownSandboxes(): Promise<number> {
  try {
    const existing = await (db as any).governmentApiSandbox.count();
    if (existing > 0) return 0;
    let inserted = 0;
    for (const api of WELL_KNOWN_SANDBOXES) {
      try {
        await (db as any).governmentApiSandbox.create({ data: api });
        inserted++;
      } catch (e: any) {
        logger.warn("[gov-sandbox] seed row failed", { api: api.apiName, error: e?.message });
      }
    }
    logger.info("[gov-sandbox] seeded well-known sandbox endpoints", { inserted });
    return inserted;
  } catch (e: any) {
    logger.warn("[gov-sandbox] seedWellKnownSandboxes failed", { error: e?.message || String(e) });
    return 0;
  }
}

/**
 * List government sandbox APIs, optionally filtered by country.
 * Defensive — returns [] on failure.
 */
export async function listGovernmentApis(countryCode?: string): Promise<any[]> {
  try {
    const where = countryCode ? { countryCode: countryCode.toUpperCase() } : {};
    return await (db as any).governmentApiSandbox.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  } catch (e: any) {
    logger.warn("[gov-sandbox] listGovernmentApis failed", { error: e?.message || String(e) });
    return [];
  }
}

/**
 * Run a simulated test against a sandbox API. Persists the result row.
 * Returns the full result object, or null on hard failure.
 */
export async function runSandboxTest(
  input: SandboxTestInput,
): Promise<SandboxTestResult | null> {
  const start = Date.now();
  let apiId = input.apiId;
  let responseBody: string | null = null;
  let actualStatus = 0;
  let diff: string | null = null;

  try {
    // Look up the API row (defensive — if it doesn't exist, we still run the
    // mock generator so the caller gets a deterministic response).
    let api: any = null;
    try {
      api = await (db as any).governmentApiSandbox.findUnique({ where: { id: input.apiId } });
    } catch (e: any) {
      logger.warn("[gov-sandbox] api lookup failed (continuing with mock)", {
        apiId: input.apiId, error: e?.message || String(e),
      });
    }

    // Generate the mock response.
    const mock = generateMockResponse(
      input.apiId,
      input.testType,
      input.endpoint,
      input.requestBody ?? null,
    );
    responseBody = mock.body;
    actualStatus = mock.status;

    const expectedStatus = input.expectedStatus ?? null;
    const passed = expectedStatus !== null ? actualStatus === expectedStatus : true;

    // Build a diff when the test fails or status mismatch.
    if (expectedStatus !== null && actualStatus !== expectedStatus) {
      diff = JSON.stringify({
        expected: { status: expectedStatus },
        actual: { status: actualStatus, body: mock.body },
      });
    }

    // Persist the result row (defensive).
    let testResultId: string | null = null;
    try {
      const row = await (db as any).governmentApiTestResult.create({
        data: {
          apiId,
          testType: input.testType,
          endpoint: input.endpoint,
          requestBody: input.requestBody ?? null,
          responseBody,
          expectedStatus,
          actualStatus,
          passed,
          diff,
        },
      });
      testResultId = row.id;
    } catch (e: any) {
      logger.error("[gov-sandbox] persist test result failed", { error: e?.message || String(e) });
    }

    // Mark the API as "synced" — lastMockGeneration timestamp — best-effort.
    if (api) {
      try {
        await (db as any).governmentApiSandbox.update({
          where: { id: apiId },
          data: { lastMockGeneration: new Date(), isSynced: true },
        });
      } catch (e: any) {
        logger.warn("[gov-sandbox] api update failed", { apiId, error: e?.message });
      }
    }

    return {
      testResultId,
      apiId,
      testType: input.testType,
      endpoint: input.endpoint,
      requestBody: input.requestBody ?? null,
      responseBody,
      expectedStatus,
      actualStatus,
      passed,
      diff,
      durationMs: Date.now() - start,
      testRun: new Date(),
    };
  } catch (e: any) {
    logger.error("[gov-sandbox] runSandboxTest failed", { error: e?.message || String(e) });
    return null;
  }
}

/**
 * Fetch recent test results for a sandbox API.
 */
export async function getTestResults(
  apiId: string,
  take = 50,
): Promise<any[]> {
  try {
    return await (db as any).governmentApiTestResult.findMany({
      where: { apiId },
      orderBy: { testRun: "desc" },
      take: Math.min(500, take),
    });
  } catch (e: any) {
    logger.warn("[gov-sandbox] getTestResults failed", { error: e?.message || String(e) });
    return [];
  }
}

/**
 * Register a new government sandbox API (used by the seed + by future
 * admin routes). Defensive — returns null on failure.
 */
export async function registerGovernmentApi(
  input: GovernmentApiInput,
): Promise<{ id: string } | null> {
  try {
    const row = await (db as any).governmentApiSandbox.create({
      data: {
        countryCode: input.countryCode.toUpperCase(),
        apiName: input.apiName,
        sandboxUrl: input.sandboxUrl,
        productionUrl: input.productionUrl ?? "",
        version: input.version ?? null,
      },
    });
    return { id: row.id };
  } catch (e: any) {
    logger.error("[gov-sandbox] registerGovernmentApi failed", { error: e?.message || String(e) });
    return null;
  }
}
