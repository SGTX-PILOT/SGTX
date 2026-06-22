import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createClarificationRequest, respondToClarification } from "@/lib/sgtx/providers";

// POST /api/sgtx/providers/clarify — Create or respond to clarification (Part 9.6)
export async function POST(req: NextRequest) {
  try {
    const { action, quotationId, requestedByGtid, questions, requestId, answers } = await req.json();
    if (action === "create") {
      if (!quotationId || !requestedByGtid || !questions) return NextResponse.json({ error: "quotationId, requestedByGtid, questions required" }, { status: 400 });
      const result = await createClarificationRequest(quotationId, requestedByGtid, questions);
      await db.inboxItem.create({ data: { tenantGtid: "SGTX-EG-LSP-000120-4C7D", category: "GENERAL", priority: 60, title: "Clarification Request", description: `Questions about quotation ${quotationId}` } });
      return NextResponse.json({ ok: true, clarification: result });
    }
    if (action === "respond") {
      if (!requestId || !answers) return NextResponse.json({ error: "requestId, answers required" }, { status: 400 });
      const result = await respondToClarification(requestId, answers);
      return NextResponse.json({ ok: true, clarification: result });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
