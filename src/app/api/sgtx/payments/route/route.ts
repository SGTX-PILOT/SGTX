// @ts-nocheck
import { NextResponse } from "next/server";
import { solveSettlementRoute, getRecommendedOption, formatAmount } from "@/lib/sgtx/payments/settlement-router";

// GET /api/sgtx/payments/route?from=US&to=EG&amount=100000&currency=USD&financing=1
// Solves the optimal settlement path for a trade corridor.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const amount = parseFloat(url.searchParams.get("amount") || "0");
  const currency = url.searchParams.get("currency") || "USD";
  const financing = url.searchParams.get("financing") === "1" || url.searchParams.get("financing") === "true";

  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: "Missing 'from' and 'to' country codes (ISO 3166-1 alpha-2)" },
      { status: 400 }
    );
  }

  const route = solveSettlementRoute(from, to, amount || 100000, currency, financing);
  if (!route) {
    return NextResponse.json(
      { ok: false, error: `Could not solve route — check '${from}' and '${to}' are in registry` },
      { status: 404 }
    );
  }

  const recommended = getRecommendedOption(route);

  return NextResponse.json({
    ok: true,
    route,
    recommended,
    formatted: {
      amount: formatAmount(amount, currency),
      corridor: `${route.sourceCountry.name} → ${route.destinationCountry.name}`,
    },
  });
}
