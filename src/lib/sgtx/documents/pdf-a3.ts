// SGTX Part 5.10 — PDF/A-3 Archival Format
import { createHash } from "crypto";

export function generatePdfA3Html(doc: { ustn: string; docType: string; title: string; htmlContent: string; embeddedXml?: string; }): { htmlContent: string; loomHash: string; xmpMetadata: any } {
  const hash = createHash("sha256").update(doc.htmlContent + (doc.embeddedXml || "")).digest("hex");
  const loomHash = "sha256:" + hash;
  const xmpMetadata = { "xmp:Creator": "SGTX Platform", "xmp:CreateDate": new Date().toISOString(), "pdf:Producer": "SGTX PDF/A-3 Generator v1.0", "pdfaid:part": "3", "pdfaid:conformance": "B", "dc:title": doc.title, "dc:identifier": doc.ustn, "sgtx:ustn": doc.ustn, "sgtx:loomHash": loomHash };
  const html = `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><meta charset="utf-8"/><meta name="pdfaid.part" content="3"/><meta name="pdfaid.conformance" content="B"/><meta name="sgtx.ustn" content="${doc.ustn}"/><meta name="sgtx.loomHash" content="${loomHash}"/>${doc.embeddedXml ? `<!-- AF-Attachment: ${doc.docType}.xml --><script type="application/xml">${doc.embeddedXml}</script>` : ""}<title>${doc.title}</title></head><body>${doc.htmlContent}<div style="position:fixed;bottom:0;left:0;right:0;padding:10px;border-top:1px solid #ccc;font-size:9px;color:#999;">PDF/A-3 (ISO 19005-3) | Loom: ${loomHash.slice(0, 32)}... | SGTX</div></body></html>`;
  return { htmlContent: html, loomHash, xmpMetadata };
}

export function validatePdfA3(doc: { loomHash: string; xmpMetadata: any }): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!doc.loomHash) errors.push("Missing Loom hash");
  if (!doc.xmpMetadata?.["pdfaid:part"]) errors.push("Missing PDF/A part");
  if (!doc.xmpMetadata?.["pdfaid:conformance"]) errors.push("Missing conformance level");
  return { valid: errors.length === 0, errors };
}
