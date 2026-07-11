import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const gulf = await db.globalMarketPrice.count({ where: { region: "GULF" } });
  const asia = await db.globalMarketPrice.count({ where: { region: "ASIA" } });
  const frozen = await db.globalMarketPrice.count({ where: { isFrozen: true } });
  const fresh = await db.globalMarketPrice.count({ where: { isFrozen: false } });
  return NextResponse.json({
    ok: true,
    gulf, asia, frozen, fresh,
    sources: {
      gulf: ["Riyadh Central Market", "Jeddah Port Market", "Dubai Al Aweer Market", "Jebel Ali Port", "Abu Dhabi Market", "Doha Wholesale Market", "Kuwait City Market", "Salalah Market"],
      asia: ["Tokyo Ota Market", "Osaka Central Market", "Seoul Garak Market", "Singapore Pasir Panjang", "Hong Kong Western Market", "Shanghai Jiangqiao Market"],
      frozenPackingTypes: ["BULK_IQF (1x10kg carton)", "RETAIL_IQF (1kg/500g/300g polybag)", "FOOD_SERVICE (2.5kg/5kg)", "INDUSTRIAL (25kg bulk)", "SPECIAL_PACKING (MAP/Vacuum)", "AFTER_DRY (dried)"],
    },
  });
}
