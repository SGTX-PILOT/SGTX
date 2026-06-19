import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/disputes/expert — invite a third-party expert OR post expert opinion
// Body: { action: "invite" | "opinion", disputeId, expertType?, expertGtid?, expertName?, message?, opinionText? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, disputeId } = body;
    if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });

    const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: { trade: true } });
    if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

    if (action === "invite") {
      // ── Invite a third-party expert ────────────────────────────
      const { expertType, expertGtid, expertName, message, invitedByGtid } = body;
      if (!expertType || !expertName) {
        return NextResponse.json({ error: "expertType and expertName required for invite" }, { status: 400 });
      }

      // Generate secure one-time link (simulated signed token)
      const token = `${disputeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const secureLink = `https://sgtx.io/expert/${token}`;

      const expert = await db.disputeExpert.create({
        data: {
          disputeId,
          expertType, // QUALITY_ASSESSOR | LEGAL | INDUSTRY_SPECIALIST | MARINE_SURVEYOR
          expertGtid: expertGtid || null,
          expertName,
          invitedByGtid: invitedByGtid || dispute.filedByGtid,
          message: message || null,
          secureLink,
          status: "INVITED",
        },
      });

      // AI-generate plain-language invitation summary (A1)
      let aiSummary: string | null = null;
      try {
        const aiRes = await callAI({
          agent: "disputeRootCause",
          tenant: invitedByGtid || dispute.filedByGtid,
          prompt: `Generate a brief professional invitation message for a third-party ${expertType} expert named ${expertName} to review dispute ${dispute.id} about ${dispute.type}. The dispute involves ${dispute.description?.slice(0, 200)}. Keep it under 100 words, formal tone.`,
        });
        aiSummary = aiRes.content;
      } catch {}

      // Smart Inbox to expert (if they have a GTID)
      if (expertGtid) {
        await db.inboxItem.create({
          data: {
            tenantGtid: expertGtid,
            tradeId: dispute.tradeId,
            category: "GENERAL",
            priority: 80,
            title: `Expert Review Request: ${dispute.type} dispute`,
            description: `You've been invited as ${expertType} to review dispute ${dispute.id}. ${message || ""}`,
            ctaLabel: "Accept & Review",
          },
        });
      }

      return NextResponse.json({ ok: true, expertId: expert.id, secureLink, aiSummary });
    }

    if (action === "opinion") {
      // ── Post expert opinion ────────────────────────────────────
      const { expertId, opinionText, acceptedAt } = body;
      if (!expertId || !opinionText) {
        return NextResponse.json({ error: "expertId and opinionText required for opinion" }, { status: 400 });
      }

      const expert = await db.disputeExpert.findUnique({ where: { id: expertId } });
      if (!expert) return NextResponse.json({ error: "Expert record not found" }, { status: 404 });
      if (expert.status === "OPINION_POSTED") {
        return NextResponse.json({ error: "Opinion already posted" }, { status: 409 });
      }

      const updated = await db.disputeExpert.update({
        where: { id: expertId },
        data: {
          opinionText,
          status: "OPINION_POSTED",
          acceptedAt: acceptedAt ? new Date(acceptedAt) : new Date(),
          opinionPostedAt: new Date(),
        },
      });

      // Notify both dispute parties
      const counterpartyGtid = dispute.filedByGtid === dispute.trade?.buyerGtid ? dispute.trade?.sellerGtid : dispute.trade?.buyerGtid;
      const parties = [dispute.filedByGtid, counterpartyGtid].filter(Boolean) as string[];
      await Promise.all(parties.map(gtid =>
        db.inboxItem.create({
          data: {
            tenantGtid: gtid,
            tradeId: dispute.tradeId,
            category: "GENERAL",
            priority: 85,
            title: `Expert Opinion Posted: ${expert.expertType}`,
            description: `${expert.expertName} has posted their opinion on dispute ${dispute.id}. Review in the dispute mediation log.`,
            ctaLabel: "View Opinion",
          },
        })
      ));

      return NextResponse.json({ ok: true, expert: updated });
    }

    return NextResponse.json({ error: "Invalid action. Use 'invite' or 'opinion'." }, { status: 400 });
  } catch (e: any) {
    console.error("[disputes/expert] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/disputes/expert?disputeId=... — list experts for a dispute
export async function GET(req: NextRequest) {
  const disputeId = req.nextUrl.searchParams.get("disputeId");
  if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });
  const experts = await db.disputeExpert.findMany({ where: { disputeId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ experts });
}
