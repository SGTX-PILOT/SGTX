import { NextResponse } from "next/server";
import { seedRiaData } from "@/lib/sgtx/ria";

export async function POST() {
  const result = await seedRiaData();
  return NextResponse.json({
    ok: true,
    message:
      "RIA seed complete: packing defaults, treatment requirements, MRLs, port rules, and ports.",
    ...result,
  });
}
