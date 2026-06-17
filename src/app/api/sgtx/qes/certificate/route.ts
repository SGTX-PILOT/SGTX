import { NextRequest, NextResponse } from "next/server";
import { getQesCertificate } from "@/lib/sgtx/governor/constitutional-addons";

export async function GET(req: NextRequest) {
  const gtid = req.nextUrl.searchParams.get("gtid");
  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });
  const result = await getQesCertificate(gtid);
  return NextResponse.json(result);
}
