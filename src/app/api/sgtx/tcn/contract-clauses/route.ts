import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * POST /api/sgtx/tcn/contract-clauses
 *
 * Body (per audit spec):
 *   { corridorCode, ustn, transportMode: "RORO" }
 *
 * Back-compat body (still accepted):
 *   { corridorCode, incoterm?, commodity? }
 *
 * Returns corridor-specific contract clauses for the given transport mode.
 * For RORO mode the clause set includes:
 *   - IMDG Code (dangerous goods)
 *   - TIR Convention (international road transit)
 *   - Hamburg Rules (carrier liability)
 *   - ISM Code (ship/port security — SOLAS Ch. XI-2)
 *   - ISPS Code, SOLAS, MARPOL (annex VI)
 *   - RoRo-specific loading/stowage/securement (IMO CSS Code)
 */
export async function POST(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    const { corridorCode, ustn, transportMode, incoterm, commodity } = body as {
      corridorCode?: string; ustn?: string; transportMode?: string; incoterm?: string; commodity?: string;
    };

    if (!corridorCode) return NextResponse.json({ error: "corridorCode required" }, { status: 400 });

    const corridor = await db.tradeCorridor.findUnique({ where: { corridorCode } });
    if (!corridor) return NextResponse.json({ error: "Corridor not found" }, { status: 404 });

    const passport = await db.tradeLanePassport.findFirst({ where: { corridorCode }, orderBy: { passportVersion: "desc" } });

    const originPorts: string[] = (() => { try { return JSON.parse(corridor.originPorts || "[]"); } catch { return []; } })();
    const destPorts: string[] = (() => { try { return JSON.parse(corridor.destinationPorts || "[]"); } catch { return []; } })();
    const certs: string[] = passport ? (() => { try { return JSON.parse(passport.requiredCertificates || "[]"); } catch { return []; } })() : [];
    const incoterms: string[] = passport ? (() => { try { return JSON.parse(passport.commonIncoterms || "[]"); } catch { return []; } })() : [];

    const mode = (transportMode || corridor.corridorType || "RORO").toUpperCase();
    const finalIncoterm = incoterm || (incoterms.length ? incoterms.join(", ") : "As agreed");

    // Base clauses (apply to all corridor types)
    const clauses: any[] = [
      { number: 1, title: "Trade Corridor", content: `This trade is executed under the ${corridor.corridorName} (${corridorCode}) corridor. Origin: ${corridor.originCountry}. Destination: ${corridor.destinationCountry}.` },
      { number: 2, title: "Port of Departure", content: originPorts.length ? originPorts.join(", ") : "As agreed" },
      { number: 3, title: "Port of Arrival", content: destPorts.length ? destPorts.join(", ") : "As agreed" },
      { number: 4, title: "Corridor Conditions", content: `Standard ${corridor.corridorType} terms. Transit guarantee: ${passport?.averageTransitDays || 7} days maximum.` },
      { number: 5, title: "Inspection", content: "Pre-shipment inspection per ISO 17025. Customs inspection upon arrival via Nafeza/CargoX pre-clearance." },
      { number: 6, title: "Documentation", content: certs.length ? certs.join(", ") : "Per corridor passport" },
      { number: 7, title: "Incoterm", content: finalIncoterm },
      { number: 8, title: "Commodity", content: commodity || "As specified in trade request" },
      { number: 9, title: "Transit Guarantee", content: `${passport?.averageTransitDays || 7} days maximum transit, ${passport?.insuranceAvailability || 95}% insurance availability` },
    ];

    // RoRo / maritime-specific clauses
    if (mode === "RORO" || mode === "FCL" || mode === "LCL") {
      clauses.push(
        { number: 10, title: "ISM Code (SOLAS Ch. XI-2)", content: "Ship and port facility security per International Ship and Port Facility Security Code. Carrier shall maintain valid ISSC. Port calls restricted to ISPS-compliant facilities." },
        { number: 11, title: "IMDG Code", content: "Dangerous goods packaged, marked, and documented per IMO IMDG Code (current edition). Shipper shall provide Multi-Modal Dangerous Goods Form. Container packing per IMDG 5.4.x." },
        { number: 12, title: "TIR Convention 1975", content: "Where road legs exist, transport under TIR carnet per Customs Convention on the International Transport of Goods under Cover of TIR Carnets (1975). Hold-harmless for TIR guarantee chain." },
        { number: 13, title: "Hamburg Rules / Carrier Liability", content: "Carrier liability per UN Convention on the Carriage of Goods by Sea (Hamburg Rules, 1978). Alternative: Hague-Visby where mandated by flag state. Limitation of liability per SDR 666.67 per package or 2 SDR per kg, whichever is greater." },
        { number: 14, title: "RoRo Loading & Securement", content: "Cargo stowage and securing per IMO Code of Safe Practice for Cargo Stowage and Securing (CSS Code). Roll-on/roll-off cargo shall be lashed, chocked, and shored per vessel's Cargo Securing Manual (SOLAS Ch. VI/5/5). Tow-vehicle driver competency per STCW." },
        { number: 15, title: "MARPOL Annex VI", content: "Vessel sulphur cap 0.50% m/m per MARPOL Annex VI. Carrier warrants fuel compliance and shall provide bunker delivery notes." },
      );
    }

    // Corridor-specific customs pre-clearance clause
    clauses.push({
      number: clauses.length + 1,
      title: "Customs Pre-Clearance",
      content: `Customs pre-clearance via ${corridor.originCountry === "EG" ? "Nafeza + CargoX (Egyptian ACI)" : "origin Single Window"} prior to vessel departure. Destination clearance via ${corridor.destinationCountry === "IT" || corridor.destinationCountry === "AE" || corridor.destinationCountry === "SA" ? "destination Single Window" : "national customs"} within ${Math.round((passport?.averageTransitDays || 7) * 0.5)} days of arrival.`,
    });

    return NextResponse.json({
      ok: true,
      ustn: ustn || null,
      corridorCode,
      transportMode: mode,
      clauses,
      totalClauses: clauses.length,
      passportVersion: passport?.passportVersion || null,
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
