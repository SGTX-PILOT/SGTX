// 8.3.1 — Release Authorisation Query (GET, stateless, idempotent)
// Rate-limited: 60 req/min per terminal, 30 req/min per IP (Part 8.3.1 Rate Limits).
import { NextRequest, NextResponse } from "next/server";
import { queryReleaseAuthorisation, checkReleaseRateLimit } from "@/lib/sgtx/release";

function getClientIp(req: NextRequest): string {
  // Trust the first non-empty hop in X-Forwarded-For (Caddy gateway in front).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[0];
  }
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  // Fallback — NextRequest.headers does not expose remote address directly.
  return "unknown";
}

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const container = req.nextUrl.searchParams.get("container");
  const request_id = req.nextUrl.searchParams.get("request_id");
  const terminal_id = req.nextUrl.searchParams.get("terminal_id");
  if (!ustn || !container) return NextResponse.json({ error: "ustn and container required" }, { status: 400 });

  // ── Rate limit (Part 8.3.1) ──────────────────────────────────
  // 60/min per terminal, 30/min per IP. Applied BEFORE any business logic.
  const ip = getClientIp(req);
  const rl = checkReleaseRateLimit({ terminalId: terminal_id || undefined, ip });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMIT_EXCEEDED",
        scope: rl.scope,
        limit: rl.limit,
        reset_in_ms: rl.resetInMs,
        message: `Rate limit exceeded (${rl.scope}). Retry in ${Math.ceil(rl.resetInMs / 1000)}s.`,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetInMs / 1000)),
          "Retry-After": String(Math.ceil(rl.resetInMs / 1000)),
        },
      }
    );
  }

  const result = await queryReleaseAuthorisation({
    ustn,
    containerNo: container,
    requestId: request_id || undefined,
    terminalId: terminal_id || undefined,
  });
  const statusCode =
    result.release_status === "ERROR" ? 404 :
    result.release_status === "HOLD" ? 403 :
    200;

  // Surface rate-limit headers on successful responses too.
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetInMs / 1000)),
  };
  return NextResponse.json(result, { status: statusCode, headers });
}
