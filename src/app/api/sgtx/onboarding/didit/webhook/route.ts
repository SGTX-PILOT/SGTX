// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, processWebhookEvent } from "@/lib/sgtx/onboarding/didit";

// POST /api/sgtx/onboarding/didit/webhook
// Receives signed webhooks from Didit when KYB verification status changes.
// Verifies HMAC signature, then updates tenant KYB status.
export async function POST(req: NextRequest) {
  try {
    const body = await req.text(); // Raw body for signature verification
    const signature = req.headers.get("x-signature-v2") || "";
    const timestamp = req.headers.get("x-timestamp") || "";
    const secret = process.env.DIDIT_WEBHOOK_SECRET || "";

    // If webhook secret is not configured, skip verification (dev mode)
    if (secret) {
      const isValid = verifyWebhookSignature(body, signature, timestamp, secret);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(body);
    const result = await processWebhookEvent(event);

    return NextResponse.json({ ok: true, processed: result.processed, action: result.action });
  } catch (e: any) {
    // Always return 2xx within 5s (Didit requirement)
    return NextResponse.json({ ok: true, error: e.message }, { status: 200 });
  }
}
