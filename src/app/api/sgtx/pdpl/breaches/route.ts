// SGTX Platform — Part 18: Egyptian PDPL Compliance — List Breach Notifications
// GET /api/sgtx/pdpl/breaches → { breaches }
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const breaches = await db.dataBreachNotification.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ breaches });
  } catch (e: any) {
    console.error("[pdpl/breaches GET]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list breach notifications" },
      { status: 500 },
    );
  }
}
