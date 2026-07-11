// Unified Pesticide Database Status (EU + Codex combined)
// GET /api/sgtx/pesticides/dual-source — shows both databases' status + combined coverage

import { NextResponse } from "next/server";
import { getPesticideDatabaseStats } from "@/lib/sgtx/compliance/multi-source-pesticides";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getPesticideDatabaseStats();
  return NextResponse.json({
    ok: true,
    ...stats,
    description: "SGTX Brain AI multi-source pesticide MRL system. Combines EU Pesticides Database (legally binding for EU) + Codex Alimentarius (international standard, WTO SPS recognized). The strictest MRL applies per WTO SPS Agreement Article 3.",
    sources: {
      eu: {
        name: "EU Pesticides Database",
        url: "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/",
        authority: "European Commission (DG SANTE)",
        scope: "EU member states (legally binding)",
        syncSchedule: "Daily at 07:00 UTC",
      },
      codex: {
        name: "Codex Alimentarius (FAO/WHO)",
        url: "https://www.fao.org/fao-who-codexalimentarius/codex-texts/dbs/pestres/",
        authority: "Codex Alimentarius Commission (FAO/WHO)",
        scope: "International (WTO SPS Agreement reference standard)",
        syncSchedule: "Daily at 08:00 UTC",
      },
    },
    rules: [
      "EU MRLs apply for EU destination (stricter, legally binding)",
      "Codex MRLs apply for non-EU destinations (international standard)",
      "When both exist, the STRICTER (lower) limit applies per WTO SPS Article 3",
      "If no specific MRL exists, EU default 0.01* mg/kg applies (Reg. EC 396/2005 Art. 18)",
    ],
  });
}
