// SGTX Part 5 — Packing List generator (HTML + JSON).
// 5.3 Packing list auto-generation: pallet IDs, SSCC-18 barcodes, USTN QR codes, treatment details.
//
// Since this project has no PDF library installed, we emit print-ready HTML
// (CSS @page A4) that any browser can save as PDF via Ctrl+P. The HTML includes
// a SHA-256 hash and is metadata-rich for downstream archival (Part 5.10 PDF/A-3).

import { createHash } from "crypto";

// ============ Types ============
export interface PackingListTradeData {
  ustn: string;
  tradeId?: string;
  buyer?: { gtid: string; legalName: string; country: string; address?: string };
  seller?: { gtid: string; legalName: string; country: string; address?: string };
  commodity: string;
  commodityHs?: string;
  incoterm: string;
  originPort?: string;
  destPort?: string;
  originCountry?: string;
  destCountry?: string;
  currency?: string;
  packingDate?: string;
}

export interface PackingListPallet {
  sequence: number;
  sscc: string; // SSCC-18
  product: string;
  lotNumber?: string;
  cartons: number;
  netWeightKg: number;
  grossWeightKg: number;
  treatmentStatus?: string; // e.g. "COLD_TREATMENT_PENDING", "FUMIGATED", "NONE"
  treatmentCertRef?: string;
  layerBreakdown?: { cartonsPerLayer: number; numLayers: number }[];
}

export interface PackingListContainer {
  containerNo: string;
  containerType?: string; // 40HC REEFER, 40DV, etc.
  vesselName?: string;
  vesselImo?: string;
  pallets: PackingListPallet[];
  temperatureSetpointC?: number;
  ventSettingCbh?: number;
  humidityPct?: number;
}

export interface PackingPlan {
  containers: PackingListContainer[];
  totalCartons: number;
  totalPallets: number;
  totalNetKg: number;
  totalGrossKg: number;
  coldChain?: boolean;
  treatmentRequirements?: { type: string; durationDays?: number | null; temperatureC?: number | null; notes?: string | null }[];
  loomHash?: string;
}

export interface PackingListResult {
  html: string;
  hash: string;
  json: any;
}

// ============ SSCC-18 generation (mirrors /api/sgtx/barcodes/generate) ============
function gs1CheckDigit(sscc17: string): number {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const digit = parseInt(sscc17[i], 10);
    if (Number.isNaN(digit)) throw new Error(`Invalid digit at position ${i}`);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

function companyPrefixFromGtid(gtid?: string): string {
  if (gtid) {
    const parts = gtid.split("-");
    const seq = parts[3];
    if (seq && /^\d+$/.test(seq)) return seq.padStart(6, "0").slice(-6);
  }
  return createHash("sha256").update(gtid || "SGTX-DEFAULT").digest("hex").slice(0, 6).replace(/\D/g, "").padStart(6, "0").slice(-6);
}

export function buildSscc(gtid: string | undefined, sequence: number): string {
  // SSCC-18 = 1 (extension digit) + 7 (company prefix, padded) + 9 (serial ref) + 1 (check digit)
  const companyPrefix = companyPrefixFromGtid(gtid).padStart(7, "0").slice(-7);
  const serial = String(sequence).padStart(9, "0").slice(-9);
  const prefix17 = "0" + companyPrefix + serial; // 1 + 7 + 9 = 17
  return prefix17 + String(gs1CheckDigit(prefix17));
}

// ============ Hash ============
function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// ============ Public API ============

/**
 * 5.3 — Generate the packing list (HTML + JSON + hash).
 * Pallet SSCCs are auto-generated if not already supplied on the packing plan.
 */
export function generatePackingListPdf(
  tradeData: PackingListTradeData,
  packingPlan: PackingPlan
): { pdfBase64: string; hash: string } {
  // Ensure SSCCs are populated
  const enriched = enrichPlanWithSscCs(packingPlan, tradeData.seller?.gtid);
  const html = renderPackingListHtml(tradeData, enriched);
  const hash = sha256Hex(html);
  return { pdfBase64: Buffer.from(html, "utf8").toString("base64"), hash };
}

export function generatePackingListJson(
  tradeData: PackingListTradeData,
  packingPlan: PackingPlan
): any {
  const enriched = enrichPlanWithSscCs(packingPlan, tradeData.seller?.gtid);
  const hash = sha256Hex(JSON.stringify({ tradeData, plan: enriched }));
  return {
    documentType: "PACKING_LIST",
    schema: "SGTX-PL-1.0",
    ustn: tradeData.ustn,
    hash,
    generatedAt: new Date().toISOString(),
    trade: {
      tradeId: tradeData.tradeId ?? null,
      commodity: tradeData.commodity,
      commodityHs: tradeData.commodityHs ?? null,
      incoterm: tradeData.incoterm,
      originPort: tradeData.originPort ?? null,
      destPort: tradeData.destPort ?? null,
      originCountry: tradeData.originCountry ?? null,
      destCountry: tradeData.destCountry ?? null,
      currency: tradeData.currency ?? "USD",
      packingDate: tradeData.packingDate ?? new Date().toISOString().slice(0, 10),
    },
    buyer: tradeData.buyer ?? null,
    seller: tradeData.seller ?? null,
    containers: enriched.containers.map((c) => ({
      containerNo: c.containerNo,
      containerType: c.containerType ?? null,
      vesselName: c.vesselName ?? null,
      vesselImo: c.vesselImo ?? null,
      temperatureSetpointC: c.temperatureSetpointC ?? null,
      ventSettingCbh: c.ventSettingCbh ?? null,
      humidityPct: c.humidityPct ?? null,
      pallets: c.pallets.map((p) => ({
        sequence: p.sequence,
        sscc: p.sscc,
        product: p.product,
        lotNumber: p.lotNumber ?? null,
        cartons: p.cartons,
        netWeightKg: p.netWeightKg,
        grossWeightKg: p.grossWeightKg,
        treatmentStatus: p.treatmentStatus ?? null,
        treatmentCertRef: p.treatmentCertRef ?? null,
        layerBreakdown: p.layerBreakdown ?? null,
      })),
    })),
    totals: {
      totalCartons: enriched.totalCartons,
      totalPallets: enriched.totalPallets,
      totalNetKg: enriched.totalNetKg,
      totalGrossKg: enriched.totalGrossKg,
    },
    coldChain: enriched.coldChain ?? false,
    treatmentRequirements: enriched.treatmentRequirements ?? [],
    loomHash: enriched.loomHash ?? null,
  };
}

// ============ Internal: HTML render ============

function enrichPlanWithSscCs(plan: PackingPlan, sellerGtid?: string): PackingPlan {
  let ssccCounter = 0;
  const containers = plan.containers.map((c) => ({
    ...c,
    pallets: c.pallets.map((p) => {
      ssccCounter += 1;
      return {
        ...p,
        sscc: p.sscc || buildSscc(sellerGtid, ssccCounter),
      };
    }),
  }));
  // Recompute totals if missing/zero
  const totalCartons = containers.reduce((acc, c) => acc + c.pallets.reduce((a, p) => a + p.cartons, 0), 0) || plan.totalCartons;
  const totalPallets = containers.reduce((acc, c) => acc + c.pallets.length, 0) || plan.totalPallets;
  const totalNetKg = containers.reduce((acc, c) => acc + c.pallets.reduce((a, p) => a + p.netWeightKg, 0), 0) || plan.totalNetKg;
  const totalGrossKg = containers.reduce((acc, c) => acc + c.pallets.reduce((a, p) => a + p.grossWeightKg, 0), 0) || plan.totalGrossKg;
  return { ...plan, containers, totalCartons, totalPallets, totalNetKg, totalGrossKg };
}

function renderPackingListHtml(t: PackingListTradeData, p: PackingPlan): string {
  const generatedAt = new Date().toISOString();
  const packingDate = t.packingDate || generatedAt.slice(0, 10);
  const esc = (s: any): string =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const containerRows = p.containers
    .map((c) => {
      const palletRows = c.pallets
        .map(
          (pal) => `
        <tr>
          <td class="num">${pal.sequence}</td>
          <td class="mono sscc">${esc(pal.sscc)}</td>
          <td>${esc(pal.product)}</td>
          <td>${esc(pal.lotNumber || "—")}</td>
          <td class="num">${pal.cartons}</td>
          <td class="num">${pal.netWeightKg.toFixed(2)}</td>
          <td class="num">${pal.grossWeightKg.toFixed(2)}</td>
          <td>${esc(treatmentBadge(pal.treatmentStatus))}</td>
          <td>${esc(pal.treatmentCertRef || "—")}</td>
        </tr>`
        )
        .join("");
      const layerInfo = c.pallets
        .filter((pal) => pal.layerBreakdown && pal.layerBreakdown.length)
        .map(
          (pal) =>
            `<div class="layer-info">Pallet ${pal.sequence}: ${pal
              .layerBreakdown!.map((l) => `${l.cartonsPerLayer}×${l.numLayers}`)
              .join(", ")}</div>`
        )
        .join("");
      return `
      <section class="container-block">
        <header>
          <h3>Container ${esc(c.containerNo)}${c.containerType ? ` <span class="muted">· ${esc(c.containerType)}</span>` : ""}</h3>
          <div class="container-meta">
            ${c.vesselName ? `<span>Vessel: ${esc(c.vesselName)}</span>` : ""}
            ${c.vesselImo ? `<span>IMO: ${esc(c.vesselImo)}</span>` : ""}
            ${c.temperatureSetpointC != null ? `<span>Setpoint: ${c.temperatureSetpointC}°C</span>` : ""}
            ${c.ventSettingCbh != null ? `<span>Vent: ${c.ventSettingCbh} CBH</span>` : ""}
            ${c.humidityPct != null ? `<span>RH: ${c.humidityPct}%</span>` : ""}
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>#</th><th>SSCC-18</th><th>Product</th><th>Lot</th>
              <th>Cartons</th><th>Net (kg)</th><th>Gross (kg)</th>
              <th>Treatment</th><th>Cert Ref</th>
            </tr>
          </thead>
          <tbody>${palletRows}</tbody>
        </table>
        ${layerInfo ? `<div class="layer-breakdown"><strong>Layer breakdown (cartons×layers):</strong>${layerInfo}</div>` : ""}
      </section>`;
    })
    .join("");

  const treatments = p.treatmentRequirements && p.treatmentRequirements.length
    ? `<section class="treatments">
         <h3>Treatment Requirements</h3>
         <ul>${p.treatmentRequirements
           .map(
             (tr) =>
               `<li><strong>${esc(tr.type.replace(/_/g, " "))}</strong>${
                 tr.durationDays != null ? ` · ${tr.durationDays} days` : ""
               }${tr.temperatureC != null ? ` · ${tr.temperatureC}°C` : ""}${
                 tr.notes ? ` · ${esc(tr.notes)}` : ""
               }</li>`
           )
           .join("")}</ul>
       </section>`
    : "";

  const coldChainBanner = p.coldChain
    ? `<div class="banner cold">COLD CHAIN · Maintain temperature throughout transit</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Packing List · ${esc(t.ustn)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; font-size: 11px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #d4af37; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .hex { width: 36px; height: 36px; background: #d4af37; clip-path: polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%); display: inline-flex; align-items: center; justify-content: center; color: #1a1a1a; font-weight: 800; font-size: 16px; }
  .brand-name { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
  .brand-sub { font-size: 9px; color: #666; letter-spacing: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 18px; }
  .doc-title .ustn { font-family: "Courier New", monospace; font-size: 10px; color: #d4af37; font-weight: 700; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .party { border: 1px solid #e5e5e5; padding: 8px 10px; border-radius: 4px; }
  .party h4 { margin: 0 0 4px 0; font-size: 9px; letter-spacing: 1px; color: #888; text-transform: uppercase; }
  .party .name { font-weight: 700; font-size: 12px; }
  .party .meta { font-size: 10px; color: #555; margin-top: 2px; }
  .trade-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; font-size: 10px; }
  .meta-cell { background: #fafafa; border: 1px solid #eee; padding: 6px 8px; border-radius: 3px; }
  .meta-cell .k { color: #888; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; }
  .meta-cell .v { font-weight: 600; }
  .banner { padding: 6px 10px; border-radius: 3px; margin-bottom: 10px; font-weight: 700; font-size: 10px; }
  .banner.cold { background: #dbeafe; color: #1e40af; border-left: 4px solid #1e40af; }
  .container-block { margin-bottom: 16px; page-break-inside: avoid; }
  .container-block header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 6px; }
  .container-block h3 { margin: 0; font-size: 12px; }
  .container-meta { font-size: 9px; color: #555; display: flex; gap: 10px; }
  .muted { color: #888; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #1a1a1a; color: #fff; text-align: left; padding: 4px 6px; font-size: 9px; letter-spacing: 0.5px; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee; }
  td.num, th.num { text-align: right; }
  td.mono, .mono { font-family: "Courier New", monospace; }
  td.sscc { font-weight: 700; color: #d4af37; }
  .layer-breakdown { font-size: 9px; color: #555; margin-top: 4px; padding: 4px 6px; background: #fafafa; border-radius: 3px; }
  .layer-info { display: inline-block; margin-right: 10px; }
  .treatments { margin-bottom: 14px; }
  .treatments h3 { font-size: 11px; margin: 0 0 4px 0; }
  .treatments ul { margin: 0; padding-left: 16px; font-size: 10px; }
  .totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 12px; border: 2px solid #d4af37; border-radius: 4px; }
  .totals div { padding: 10px; text-align: center; border-right: 1px solid #f0d875; }
  .totals div:last-child { border-right: none; }
  .totals .k { font-size: 8px; color: #888; letter-spacing: 1px; text-transform: uppercase; }
  .totals .v { font-size: 16px; font-weight: 800; color: #1a1a1a; }
  .footer { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; padding-top: 10px; border-top: 1px solid #eee; font-size: 9px; }
  .qr-placeholder { width: 70px; height: 70px; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; color: #999; font-size: 7px; text-align: center; }
  .sign-block { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
  .sign { border-top: 1px solid #1a1a1a; padding-top: 4px; font-size: 9px; color: #555; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <span class="hex">S</span>
      <div>
        <div class="brand-name">SGTX</div>
        <div class="brand-sub">SOVEREIGN GOVERNED TRADE EXECUTION</div>
      </div>
    </div>
    <div class="doc-title">
      <h1>Packing List</h1>
      <div class="ustn">USTN: ${esc(t.ustn)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h4>Seller / Shipper</h4>
      <div class="name">${esc(t.seller?.legalName || "—")}</div>
      <div class="meta">
        GTID: ${esc(t.seller?.gtid || "—")}<br/>
        Country: ${esc(t.seller?.country || "—")}${t.seller?.address ? `<br/>${esc(t.seller.address)}` : ""}
      </div>
    </div>
    <div class="party">
      <h4>Buyer / Consignee</h4>
      <div class="name">${esc(t.buyer?.legalName || "—")}</div>
      <div class="meta">
        GTID: ${esc(t.buyer?.gtid || "—")}<br/>
        Country: ${esc(t.buyer?.country || "—")}${t.buyer?.address ? `<br/>${esc(t.buyer.address)}` : ""}
      </div>
    </div>
  </div>

  <div class="trade-meta">
    <div class="meta-cell"><div class="k">Commodity</div><div class="v">${esc(t.commodity)}</div></div>
    <div class="meta-cell"><div class="k">HS Code</div><div class="v">${esc(t.commodityHs || "—")}</div></div>
    <div class="meta-cell"><div class="k">Incoterm</div><div class="v">${esc(t.incoterm)}</div></div>
    <div class="meta-cell"><div class="k">Packing Date</div><div class="v">${esc(packingDate)}</div></div>
    <div class="meta-cell"><div class="k">Origin Port</div><div class="v">${esc(t.originPort || "—")}</div></div>
    <div class="meta-cell"><div class="k">Destination Port</div><div class="v">${esc(t.destPort || "—")}</div></div>
    <div class="meta-cell"><div class="k">Origin Country</div><div class="v">${esc(t.originCountry || "—")}</div></div>
    <div class="meta-cell"><div class="k">Destination Country</div><div class="v">${esc(t.destCountry || "—")}</div></div>
  </div>

  ${coldChainBanner}
  ${treatments}

  ${containerRows}

  <div class="totals">
    <div><div class="k">Total Cartons</div><div class="v">${p.totalCartons.toLocaleString()}</div></div>
    <div><div class="k">Total Pallets</div><div class="v">${p.totalPallets.toLocaleString()}</div></div>
    <div><div class="k">Total Net (kg)</div><div class="v">${p.totalNetKg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
    <div><div class="k">Total Gross (kg)</div><div class="v">${p.totalGrossKg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
  </div>

  <div class="footer">
    <div>
      <strong>Loom hash:</strong> <span class="mono">${esc(p.loomHash || sha256Hex(t.ustn + "|" + p.totalGrossKg))}</span><br/>
      <strong>Generated at:</strong> ${esc(generatedAt)}<br/>
      <strong>Schema:</strong> SGTX-PL-1.0 · ISO 19005-3 (PDF/A-3) archival-ready
    </div>
    <div style="display:flex; align-items:center; gap:10px; justify-content:flex-end;">
      <div class="qr-placeholder">QR (USTN)<br/>scan to verify</div>
      <div style="text-align:right; font-size: 9px;">
        Document is verifiable via<br/>
        <span class="mono">/api/sgtx/ustn/resolve?ustn=${encodeURIComponent(t.ustn)}</span>
      </div>
    </div>
  </div>

  <div class="sign-block">
    <div class="sign">Seller / Shipper signature &amp; stamp</div>
    <div class="sign">Carrier signature &amp; stamp</div>
  </div>
</body>
</html>`;
}

function treatmentBadge(status?: string): string {
  if (!status || status === "NONE") return "—";
  return status.replace(/_/g, " ");
}
