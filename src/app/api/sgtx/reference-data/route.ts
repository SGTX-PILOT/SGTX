// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const dataset = req.nextUrl.searchParams.get("dataset");
  const query = req.nextUrl.searchParams.get("q");
  try {
    const rd = await import("@/lib/sgtx/reference-data");
    if (dataset === "countries") {
      if (query) { const c = rd.getCountry(query); return NextResponse.json({ ok: true, country: c }); }
      return NextResponse.json({ ok: true, countries: rd.listAllCountries(), count: rd.COUNTRIES.length });
    }
    if (dataset === "currencies") {
      if (query) { const c = rd.getCurrency(query); return NextResponse.json({ ok: true, currency: c }); }
      return NextResponse.json({ ok: true, currencies: rd.listAllCurrencies(), count: rd.CURRENCIES.length });
    }
    if (dataset === "ports") {
      if (query) { const p = rd.getPort(query); return NextResponse.json({ ok: true, port: p }); }
      return NextResponse.json({ ok: true, ports: rd.listAllPorts(), count: rd.PORTS.length });
    }
    if (dataset === "incoterms") {
      if (query) { const i = rd.getIncoterm(query); return NextResponse.json({ ok: true, incoterm: i }); }
      return NextResponse.json({ ok: true, incoterms: rd.listAllIncoterms(), count: rd.INCOTERMS.length });
    }
    if (dataset === "documents") {
      if (query) { const d = rd.getDocument(query); return NextResponse.json({ ok: true, document: d }); }
      return NextResponse.json({ ok: true, documents: rd.listAllDocuments(), count: rd.DOCUMENTS.length });
    }
    if (dataset === "legal") {
      if (query) { const l = rd.getLegalRef(query); return NextResponse.json({ ok: true, legalRef: l }); }
      return NextResponse.json({ ok: true, legalRefs: rd.listAllLegalRefs(), count: rd.LEGAL_REFS.length });
    }
    if (dataset === "fta") {
      if (query) { const f = rd.getFTARules(query); return NextResponse.json({ ok: true, rules: f }); }
      return NextResponse.json({ ok: true, ftas: rd.listAllFTAs(), count: rd.listAllFTAs().length });
    }
    if (dataset === "sanctions") {
      if (query) { const s = rd.getSanctionsByCountry ? rd.getSanctionsByCountry(query) : rd.isSanctioned(query); return NextResponse.json({ ok: true, sanctions: s }); }
      return NextResponse.json({ ok: true, programs: rd.listAllSanctionsPrograms(), count: rd.SANCTIONS_PROGRAMS.length });
    }
    if (dataset === "eu-vat") {
      if (query) { const v = rd.EU_VAT_RATES[query.toUpperCase()]; return NextResponse.json({ ok: true, vatRate: v }); }
      return NextResponse.json({ ok: true, vatRates: rd.EU_VAT_RATES, count: Object.keys(rd.EU_VAT_RATES).length });
    }
    // Default: return dataset registry
    return NextResponse.json({ ok: true, datasets: rd.listReferenceDatasets() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
