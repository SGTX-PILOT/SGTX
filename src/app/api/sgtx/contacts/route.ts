import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAI } from "@/lib/sgtx/ai/orchestrator";

// GET /api/sgtx/contacts?owner=GTID — list saved contacts (Part 2.6)
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "owner required" }, { status: 400 });
  const contacts = await db.savedContact.findMany({ where: { ownerGtid: owner }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(contacts);
}

// POST /api/sgtx/contacts — add a contact (resolves GTID + generates AI Trust Portrait)
// Body: { ownerGtid, contactGtid }
export async function POST(req: NextRequest) {
  const { ownerGtid, contactGtid } = await req.json();
  if (!ownerGtid || !contactGtid) return NextResponse.json({ error: "ownerGtid + contactGtid required" }, { status: 400 });

  const contact = await db.tenant.findUnique({ where: { gtid: contactGtid } });
  if (!contact) return NextResponse.json({ error: "contact GTID not found" }, { status: 404 });

  // Count completed trades between the two
  const trades = await db.trade.findMany({
    where: { OR: [{ buyerGtid: ownerGtid, sellerGtid: contactGtid }, { buyerGtid: contactGtid, sellerGtid: ownerGtid }] },
  });
  const completed = trades.filter(t => t.status === "SETTLED" || t.status === "DELIVERED").length;

  // AI Trust Portrait (Part 2.6)
  const portrait = await runAI({
    agentName: "trust_portrait_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Trust Portrait AI. Generate a 2-sentence plain-language summary of the contact's public performance based on trades both parties completed. Never compare to other counterparties. Non-marketplace. Be factual.",
    userPrompt: `Contact: ${contact.legalName} (${contact.gtid}, ${contact.country}, type ${contact.type})\nTrust score: ${contact.trustScore}\nKYB tier: ${contact.kybTier}\nTotal trades together: ${trades.length}\nCompleted trades: ${completed}\n\nGenerate the trust portrait.`,
    fallbackKey: "chat",
    maxTokens: 100,
    temperature: 0.3,
  });

  const saved = await db.savedContact.create({
    data: {
      ownerGtid, contactGtid, contactName: contact.legalName, contactType: contact.type,
      relationship: "trader", trustPortrait: portrait.content, healthScore: contact.trustScore,
      totalTrades: trades.length, autoSaved: false,
    },
  });
  return NextResponse.json({ contact: saved, aiProvider: portrait.provider });
}
