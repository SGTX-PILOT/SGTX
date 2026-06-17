import { NextRequest, NextResponse } from "next/server";
import { autocompleteUstns, checkRateLimit } from "@/lib/sgtx/ustn";

// GET /api/sgtx/ustn/autocomplete?query=...&tenant=...  (Part 3.10 — trie-like search)
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query") || "";
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const rl = checkRateLimit(tenant);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded (100/min)", resetIn: rl.resetIn }, { status: 429 });
  const results = await autocompleteUstns(query, tenant);
  return NextResponse.json({ results, rateLimit: { remaining: rl.remaining, resetIn: rl.resetIn } });
}
