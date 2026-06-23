import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/government/nodes — list government nodes
// Query params: country, authorityType, verificationStatus
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const country = sp.get("country");
  const authorityType = sp.get("authorityType");
  const verificationStatus = sp.get("verificationStatus");

  const where: any = {};
  if (country) where.countryCode = country.toUpperCase();
  if (authorityType) where.authorityType = authorityType.toUpperCase();
  if (verificationStatus) where.verificationStatus = verificationStatus.toUpperCase();

  const nodes = await db.governmentNode.findMany({
    where,
    orderBy: [{ countryCode: "asc" }, { authorityName: "asc" }],
  });

  return NextResponse.json({
    count: nodes.length,
    filters: { country, authorityType, verificationStatus },
    nodes: nodes.map((n) => ({
      ...n,
      nodePermissions: safeJson(n.nodePermissions),
    })),
  });
}

// POST /api/sgtx/government/nodes — register a government node
// Body: {
//   countryCode, authorityName, authorityType, authorityLevel,
//   nodeGtid?, nodePermissions?, verificationStatus?
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const required = ["countryCode", "authorityName", "authorityType"];
    const missing = required.filter((k) => !body[k]);
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }
    const validTypes = ["MINISTRY", "CUSTOMS", "PORT_AUTHORITY", "TRADE_AGENCY", "ECONOMIC_ZONE"];
    if (!validTypes.includes(body.authorityType)) {
      return NextResponse.json(
        { error: `authorityType must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const created = await db.governmentNode.create({
      data: {
        countryCode: String(body.countryCode).toUpperCase(),
        authorityName: String(body.authorityName),
        authorityType: body.authorityType,
        authorityLevel: body.authorityLevel || "NATIONAL",
        nodeGtid: body.nodeGtid || null,
        nodePermissions: body.nodePermissions
          ? typeof body.nodePermissions === "string"
            ? body.nodePermissions
            : JSON.stringify(body.nodePermissions)
          : null,
        verificationStatus: body.verificationStatus || "PENDING",
      },
    });

    const node = { ...created, nodePermissions: safeJson(created.nodePermissions) };
    return NextResponse.json({ ok: true, node }, { status: 201 });
  } catch (e: any) {
    console.error("[government/nodes POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function safeJson(raw: string | null | undefined): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
