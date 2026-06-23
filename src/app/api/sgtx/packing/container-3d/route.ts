// 5.7 — 3D Container Viewer + Capacity Heatmap + STL Export
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildContainer3DData, generateCapacityHeatmap, exportStl } from "@/lib/sgtx/packing";

export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId");
  const ustn = req.nextUrl.searchParams.get("ustn");
  const heatmap = req.nextUrl.searchParams.get("heatmap") === "true";
  const stl = req.nextUrl.searchParams.get("stl") === "true";
  if (!planId && !ustn) return NextResponse.json({ error: "planId or ustn required" }, { status: 400 });

  const where: any = {};
  if (planId) where.id = planId;
  if (ustn) where.ustn = ustn;
  const plan = await db.packingPlan.findFirst({ where, include: { pallets: true } });
  if (!plan) return NextResponse.json({ error: "Packing plan not found" }, { status: 404 });

  const container3D = buildContainer3DData(plan);

  if (stl) {
    const stlContent = exportStl(container3D);
    return new NextResponse(stlContent, { headers: { "Content-Type": "application/sla", "Content-Disposition": `attachment; filename="container-${plan.planId}.stl"` } });
  }

  const result: any = { container3D };
  if (heatmap) {
    result.heatmap = generateCapacityHeatmap(plan.commodityHs || "0805.10", "EG-DE");
  }
  return NextResponse.json(result);
}
