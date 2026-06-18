// 8.3.1 — Release Authorisation Query (GET, stateless, idempotent)
import { NextRequest, NextResponse } from "next/server";
import { queryReleaseAuthorisation } from "@/lib/sgtx/release";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const container = req.nextUrl.searchParams.get("container");
  const request_id = req.nextUrl.searchParams.get("request_id");
  const terminal_id = req.nextUrl.searchParams.get("terminal_id");
  if (!ustn || !container) return NextResponse.json({ error: "ustn and container required" }, { status: 400 });

  const result = await queryReleaseAuthorisation({ ustn, containerNo: container, requestId: request_id || undefined, terminalId: terminal_id || undefined });
  const statusCode = result.release_status === "ERROR" ? 404 : result.release_status === "HOLD" ? 403 : 200;
  return NextResponse.json(result, { status: statusCode });
}
