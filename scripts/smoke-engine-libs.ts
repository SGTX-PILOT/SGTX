// Smoke test for CCL-009 engine libs — exercises the calculation engines
// end-to-end against Turso. Run with:
//   bun scripts/smoke-engine-libs.ts

import { calculateTradeCosts, persistObligations } from "@/lib/sgtx/trade-cost";
import { validatePaymentEvidence, matchPaymentToObligation } from "@/lib/sgtx/payment-evidence";
import { calculateReeferPower, persistReeferPowerTracking } from "@/lib/sgtx/reefer-power";
import { recordTradeEvent, verifyEventChain } from "@/lib/sgtx/trade-events";

async function main() {
  const USTN = `SMOKE-${Date.now()}`;
  console.log(`\n=== CCL-009 Smoke Test (USTN: ${USTN}) ===\n`);

  // 1. Trade Cost
  console.log("→ calculateTradeCosts ...");
  const breakdown = await calculateTradeCosts({
    ustn: USTN,
    origin: "EG",
    destination: "AE",
    hsCode: "080810",
    declaredValue: 50_000,
    incoterm: "CIF",
    transportMode: "OCEAN",
    currency: "USD",
    coldChain: true,
    containerCount: 2,
  });
  console.log(`  total: ${breakdown.currency} ${breakdown.totalCost.toFixed(2)} (${breakdown.obligations.length} obligations)`);
  console.log(`  by payer: BUYER=${breakdown.byPayer.BUYER.toFixed(2)}, SELLER=${breakdown.byPayer.SELLER.toFixed(2)}`);

  console.log("→ persistObligations ...");
  const persisted = await persistObligations(breakdown);
  console.log(`  persisted ${persisted.persisted}/${breakdown.obligations.length} rows`);

  // 2. Payment Evidence validation
  console.log("\n→ validatePaymentEvidence ...");
  const validation = validatePaymentEvidence({
    evidenceType: "MT103",
    evidenceHash: "sha256:abc123",
    payer: "BUYER",
    beneficiary: "SELLER",
    bankName: "CBE",
    amount: 50_000,
    currency: "USD",
    executionDate: new Date(),
    bankReference: "REF-001",
    source: "API",
  });
  console.log(`  valid=${validation.valid}, confidence=${validation.confidenceLevel}, result=${validation.matchResult}`);

  // 3. Match payment → obligation
  console.log("\n→ matchPaymentToObligation ...");
  if (persisted.ids.length > 0) {
    const match = matchPaymentToObligation(
      { amount: 50_000, currency: "USD", payer: "BUYER", beneficiary: "SELLER" },
      { amount: breakdown.obligations[0].amount, currency: "USD", payer: "BUYER", payee: "SGTX" },
    );
    console.log(`  result=${match.matchResult}, diff=${match.amountDifference.toFixed(2)}, issues=${match.issues.length}`);
  }

  // 4. Reefer power
  console.log("\n→ calculateReeferPower ...");
  const calc = calculateReeferPower({
    containerNumber: "TEST1234567",
    powerStartAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    powerEndAt: new Date(),
    applicableTariff: 35,
    monitoringCharge: 50,
  });
  console.log(`  days=${calc.chargeableDays}, hours=${calc.chargeableHours.toFixed(2)}, total=${calc.totalAmount.toFixed(2)}, status=${calc.status}`);

  console.log("→ persistReeferPowerTracking ...");
  const reefer = await persistReeferPowerTracking({
    ustn: USTN,
    containerNumber: "TEST1234567",
    calc,
    currency: "USD",
  });
  console.log(`  persisted: ${reefer ? reefer.id : "(null)"}`);

  // 5. Trade events (hash chain)
  console.log("\n→ recordTradeEvent (3 events) ...");
  for (const et of ["TRADE_REQUESTED", "SGTX_FEE_REQUIRED", "SGTX_FEE_PAID"]) {
    const ev = await recordTradeEvent({
      ustn: USTN,
      eventType: et,
      description: `smoke test ${et}`,
      source: "SYSTEM",
    });
    if (ev) {
      console.log(`  ✓ ${et} → hash=${ev.eventHash?.slice(0, 24)}..., prev=${ev.previousHash?.slice(0, 24) ?? "(null)"}...`);
    } else {
      console.log(`  ✗ ${et} failed`);
    }
  }

  console.log("\n→ verifyEventChain ...");
  const verification = await verifyEventChain(USTN);
  console.log(`  total=${verification.total}, verified=${verification.verified}, hash_mismatch=${verification.mismatchedHash}, prev_mismatch=${verification.mismatchedPrevious}`);

  console.log("\n=== Smoke Test Complete ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
