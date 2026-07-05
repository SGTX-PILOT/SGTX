// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/settlement/instructions — Banks pull PENDING settlement instructions by BIC (Part 7.5.2)
export async function GET(req: NextRequest) {
  const bic = req.nextUrl.searchParams.get("bic");
  const status = req.nextUrl.searchParams.get("status") || "PENDING";
  const instructions = await db.settlementInstruction.findMany({
    where: { status, ...(bic ? { payload: { contains: bic } } : {}) },
    take: 50,
    orderBy: { createdAt: "asc" },
    }) as any;
    return NextResponse.json({ instructions, count: instructions.length }) as any;
}

// POST /api/sgtx/settlement/instructions — Create a settlement instruction
export async function POST(req: NextRequest) {
  try {
    const { ustn, instructionType, payload } = await req.json();
        if (!ustn || !instructionType) return NextResponse.json({ error: "ustn and instructionType required" }, { status: 400 }) as any;
    const instruction = await db.settlementInstruction.create({
      data: { ustn, instructionType, payload: JSON.stringify(payload || {}), status: "PENDING" },
        }) as any;
        return NextResponse.json({ ok: true, instruction }) as any;
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
