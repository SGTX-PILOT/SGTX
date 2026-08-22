// @ts-nocheck
// §1 Payments — list (GET) + initiate (POST)
// GET  /api/sgtx/finance/payments?ustn=X&payerGtid=Y&payeeGtid=Z&paymentMethod=W&status=V&reconciliationStatus=U
// POST /api/sgtx/finance/payments  body: PaymentInput  → initiatePayment (returns duplicate flag)
import { NextResponse } from "next/server";
import {
  listPayments,
  initiatePayment,
} from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const payerGtid = url.searchParams.get("payerGtid") || undefined;
    const payeeGtid = url.searchParams.get("payeeGtid") || undefined;
    const paymentMethod = url.searchParams.get("paymentMethod") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const reconciliationStatus =
      url.searchParams.get("reconciliationStatus") || undefined;
    if (ustn) filters.ustn = ustn;
    if (payerGtid) filters.payerGtid = payerGtid;
    if (payeeGtid) filters.payeeGtid = payeeGtid;
    if (paymentMethod) filters.paymentMethod = paymentMethod;
    if (status) filters.status = status;
    if (reconciliationStatus) filters.reconciliationStatus = reconciliationStatus;
    const payments = await listPayments(filters);
    return NextResponse.json({ payments });
  } catch (err: any) {
    logger.error("[api/finance/payments] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.payerGtid || !body.payeeGtid) {
      return NextResponse.json(
        { error: "payerGtid and payeeGtid are required" },
        { status: 400 },
      );
    }
    if (!body.paymentMethod) {
      return NextResponse.json(
        { error: "paymentMethod is required" },
        { status: 400 },
      );
    }
    if (!(Number(body.amountUsd) > 0)) {
      return NextResponse.json(
        { error: "amountUsd must be positive" },
        { status: 400 },
      );
    }
    const result = await initiatePayment(body);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "initiatePayment failed" },
        { status: 400 },
      );
    }
    // Returns duplicate flag if detected (§10 idempotency).
    return NextResponse.json({
      payment: result.payment,
      duplicate: result.duplicate === true,
    });
  } catch (err: any) {
    logger.error("[api/finance/payments] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
