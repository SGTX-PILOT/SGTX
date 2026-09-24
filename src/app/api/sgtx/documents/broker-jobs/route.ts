// @ts-nocheck
// SGTX v18 §16.8.9 — CBR Physical Document Jobs & Storage
//
// GET  /api/sgtx/documents/broker-jobs?brokerGtid=<gtid>&kind=physical|storage
//
//   kind=physical — returns trade rows where originalDocsRequired=true OR
//                   the destination country has a CountryPhysicalDocumentRequirement
//                   entry, AND this broker is the assigned buyer or seller
//                   customs broker.
//                   Response shape:
//                   {
//                     ok: true, kind: "physical", count: N,
//                     jobs: [{ jobId, ustn, tradeId, destinationCountry,
//                             documentType, status, brokerRole, receivedAt,
//                             presentedAt, confirmedAt, hashSha256 }]
//                   }
//
//   kind=storage — returns CustomsDeclaration rows where this broker is
//                   assigned AND status=CLEARED, plus the related Trade +
//                   Document. Shelf location and retention are derived
//                   deterministically (sha256 of declaration id) so the
//                   same declaration always lands on the same shelf.
//                   Response shape:
//                   {
//                     ok: true, kind: "storage", count: N,
//                     items: [{ storageId, declarationId, ustn, documentType,
//                              shelfLocation, storedAt, retentionExpiry,
//                              status, brokerGtid }]
//                   }
//
// POST /api/sgtx/documents/broker-jobs
//   body: {
//     jobId: string,                 // physical job ID OR storage ID
//     kind: "physical" | "storage",
//     action: "receive" | "present" | "confirm" | "return" | "destroy",
//     brokerGtid: string,
//     reason?: string,               // required for "destroy"
//     scanHash?: string              // optional hash for "receive"
//   }
//   → 200 { ok, jobId, action, newStatus, activityId }
//
// All state changes are persisted as Activity log rows + Document.status
// updates where applicable (no schema changes).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 5 * 365; // Egyptian customs retention law ~5 years

function shelfLocationFor(declarationId: string): string {
  const h = createHash("sha256").update(`shelf:${declarationId}`).digest("hex");
  const aisle = `A${parseInt(h.slice(0, 2), 16) % 12 + 1}`;
  const rack = `R${parseInt(h.slice(2, 4), 16) % 20 + 1}`;
  const bin = `B${parseInt(h.slice(4, 6), 16) % 50 + 1}`;
  return `${aisle}-${rack}-${bin}`;
}

async function getPhysicalJobs(brokerGtid: string) {
  // Find trades where this broker is assigned.
  const trades = await db.trade.findMany({
    where: {
      OR: [
        { buyerCustomsBrokerGtid: brokerGtid },
        { sellerCustomsBrokerGtid: brokerGtid },
      ],
    },
    select: {
      id: true, ustn: true, destCountry: true, commodity: true,
      originalDocsRequired: true,
      buyerCustomsBrokerGtid: true, sellerCustomsBrokerGtid: true,
      documents: {
        select: { id: true, type: true, title: true, status: true, hashSha256: true, verifiedAt: true, createdAt: true, updatedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Find destination countries requiring physical documents.
  const destCountries = Array.from(new Set(trades.map((t: any) => t.destCountry).filter(Boolean)));
  const countryReqs: { countryCode: string; documentType: string }[] = [];
  if (destCountries.length > 0) {
    try {
      const reqs = await db.countryPhysicalDocumentRequirement.findMany({
        where: { countryCode: { in: destCountries }, required: true },
        select: { countryCode: true, documentType: true },
      });
      countryReqs.push(...reqs.map((r: any) => ({ countryCode: r.countryCode, documentType: r.documentType })));
    } catch { /* ignore */ }
  }
  const countryReqsMap = new Map<string, string[]>();
  for (const r of countryReqs) {
    const arr = countryReqsMap.get(r.countryCode) || [];
    arr.push(r.documentType);
    countryReqsMap.set(r.countryCode, arr);
  }

  // Build physical jobs: include trades where originalDocsRequired=true OR
  // destination country requires physical documents.
  const jobs = trades
    .filter((t: any) => t.originalDocsRequired || countryReqsMap.has(t.destCountry))
    .map((t: any) => {
      const docTypes = countryReqsMap.get(t.destCountry) || [];
      const primaryDoc = t.documents?.find((d: any) => d.type === "ORIGINAL_DOCUMENT" || d.type === "PHYSICAL_PACKAGE")
        || t.documents?.[0];
      const brokerRole = t.buyerCustomsBrokerGtid === brokerGtid ? "BUYER" : "SELLER";
      // Derive status from the primary document's status.
      let status = "PENDING";
      if (primaryDoc) {
        const s = String(primaryDoc.status || "").toUpperCase();
        if (s === "VERIFIED") status = "CONFIRMED";
        else if (s === "PRESENTED") status = "PRESENTED";
        else if (s === "RECEIVED" || s === "SUBMITTED") status = "RECEIVED";
      }
      return {
        jobId: `PDJ-${t.id.slice(-10)}`,
        tradeId: t.id,
        ustn: t.ustn,
        destinationCountry: t.destCountry,
        commodity: t.commodity,
        documentType: docTypes[0] || (primaryDoc?.title || "Original Documents"),
        status,
        brokerRole,
        receivedAt: primaryDoc?.updatedAt || null,
        presentedAt: primaryDoc?.updatedAt || null,
        confirmedAt: primaryDoc?.verifiedAt || null,
        hashSha256: primaryDoc?.hashSha256 || null,
        docId: primaryDoc?.id || null,
      };
    });

  return { ok: true, kind: "physical", count: jobs.length, jobs };
}

async function getStorageItems(brokerGtid: string) {
  // Find customs declarations handled by this broker that are CLEARED.
  const decls = await db.customsDeclaration.findMany({
    where: {
      brokerGtid,
      status: { in: ["CLEARED", "RELEASED"] },
    },
    select: {
      id: true, declarationNo: true, regime: true, status: true,
      clearedAt: true, createdAt: true,
      trade: {
        select: {
          id: true, ustn: true, commodity: true, destCountry: true,
          originalDocsRequired: true,
          documents: { select: { id: true, type: true, title: true, status: true, hashSha256: true } },
        },
      },
    },
    orderBy: { clearedAt: "desc" },
    take: 100,
  });

  const items = decls.map((d: any) => {
    const storedAt = d.clearedAt || d.createdAt;
    const retentionExpiry = storedAt
      ? new Date(new Date(storedAt).getTime() + RETENTION_DAYS * 86_400_000)
      : null;
    const doc = d.trade?.documents?.find((dd: any) => dd.type === "ORIGINAL_DOCUMENT" || dd.type === "CUSTOMS_PACKAGE")
      || d.trade?.documents?.[0];
    return {
      storageId: `STG-${d.id.slice(-10)}`,
      declarationId: d.id,
      declarationNo: d.declarationNo,
      ustn: d.trade?.ustn,
      commodity: d.trade?.commodity,
      destinationCountry: d.trade?.destCountry,
      documentType: doc?.title || "Customs Cleared Package",
      shelfLocation: shelfLocationFor(d.id),
      storedAt: storedAt ? new Date(storedAt).toISOString() : null,
      retentionExpiry: retentionExpiry ? retentionExpiry.toISOString() : null,
      status: "STORED",
      brokerGtid,
      hashSha256: doc?.hashSha256 || null,
    };
  });

  return { ok: true, kind: "storage", count: items.length, items };
}

async function actOnPhysicalJob(jobId: string, action: string, brokerGtid: string, reason?: string, scanHash?: string) {
  // Resolve the trade id from the jobId.
  const tradeSuffix = jobId.replace(/^PDJ-/, "");
  // The jobId encodes the last 10 chars of the trade id (cuid). Reverse lookup:
  const trades = await db.trade.findMany({
    where: {
      OR: [
        { buyerCustomsBrokerGtid: brokerGtid },
        { sellerCustomsBrokerGtid: brokerGtid },
      ],
    },
    select: { id: true, ustn: true, documents: { select: { id: true, type: true, title: true, status: true, hashSha256: true } } },
  });
  const trade = trades.find((t: any) => t.id.endsWith(tradeSuffix));
  if (!trade) {
    return { ok: false, error: "physical job not found for this broker", status: 404 };
  }

  // Determine new status based on action.
  let newStatus = "PENDING";
  let docStatus = "REQUIRED";
  let actionLabel = "";
  switch (action) {
    case "receive":
      newStatus = "RECEIVED"; docStatus = "RECEIVED"; actionLabel = "PACKAGE_RECEIVED"; break;
    case "present":
      newStatus = "PRESENTED"; docStatus = "PRESENTED"; actionLabel = "PACKAGE_PRESENTED"; break;
    case "confirm":
      newStatus = "CONFIRMED"; docStatus = "VERIFIED"; actionLabel = "PACKAGE_CONFIRMED"; break;
    default:
      return { ok: false, error: `unsupported action: ${action}`, status: 400 };
  }

  // Update the first ORIGINAL/PHYSICAL_PACKAGE doc if one exists; otherwise
  // upsert a placeholder ORIGINAL_DOCUMENT row.
  let doc = trade.documents?.find((d: any) => d.type === "ORIGINAL_DOCUMENT" || d.type === "PHYSICAL_PACKAGE");
  if (!doc) {
    try {
      doc = await db.document.create({
        data: {
          tradeId: trade.id,
          type: "ORIGINAL_DOCUMENT",
          title: `Physical package — USTN ${trade.ustn}`,
          status: docStatus,
          uploadedBy: brokerGtid,
          hashSha256: scanHash || null,
        },
      });
    } catch (err) {
      logger.warn("[broker-jobs/POST] doc create failed", { err: String(err) });
    }
  } else {
    try {
      await db.document.update({
        where: { id: doc.id },
        data: {
          status: docStatus,
          verifiedAt: action === "confirm" ? new Date() : undefined,
          hashSha256: scanHash || doc.hashSha256 || undefined,
        },
      });
    } catch (err) {
      logger.warn("[broker-jobs/POST] doc update failed", { err: String(err) });
    }
  }

  let activityId: string | undefined;
  try {
    const a = await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: brokerGtid,
        action: actionLabel,
        description: `Broker ${brokerGtid} ${action}ed physical package for USTN ${trade.ustn}${reason ? ` — reason: ${reason}` : ""}`,
        type: "INFO",
      },
    });
    activityId = a.id;
  } catch { /* best-effort */ }

  return { ok: true, jobId, action, newStatus, activityId };
}

async function actOnStorageItem(storageId: string, action: string, brokerGtid: string, reason?: string) {
  const declSuffix = storageId.replace(/^STG-/, "");
  const decls = await db.customsDeclaration.findMany({
    where: { brokerGtid },
    select: { id: true, tradeId: true, status: true, declarationNo: true, trade: { select: { ustn: true } } },
  });
  const decl = decls.find((d: any) => d.id.endsWith(declSuffix));
  if (!decl) {
    return { ok: false, error: "storage item not found for this broker", status: 404 };
  }

  if (action === "destroy" && (!reason || reason.length < 10)) {
    return { ok: false, error: "destroy requires a reason (>=10 chars)", status: 400 };
  }

  let newStatus = "STORED";
  let actionLabel = "";
  switch (action) {
    case "return":
      newStatus = "RETURNED"; actionLabel = "STORAGE_RETURNED"; break;
    case "destroy":
      newStatus = "DESTROYED"; actionLabel = "STORAGE_DESTROYED"; break;
    default:
      return { ok: false, error: `unsupported action: ${action}`, status: 400 };
  }

  // Update the declaration status to reflect the storage action (no schema change).
  try {
    await db.customsDeclaration.update({
      where: { id: decl.id },
      data: { status: newStatus === "RETURNED" ? "RETURNED" : "DESTROYED" },
    });
  } catch (err) {
    logger.warn("[broker-jobs/POST] decl update failed", { err: String(err) });
  }

  let activityId: string | undefined;
  try {
    const a = await db.activity.create({
      data: {
        tradeId: decl.tradeId,
        actorGtid: brokerGtid,
        action: actionLabel,
        description: `Broker ${brokerGtid} ${action}ed stored package for USTN ${decl.trade?.ustn || "—"} (decl ${decl.declarationNo || decl.id})${reason ? ` — reason: ${reason}` : ""}`,
        type: action === "destroy" ? "WARNING" : "INFO",
      },
    });
    activityId = a.id;
  } catch { /* best-effort */ }

  return { ok: true, storageId, action, newStatus, activityId };
}

export async function GET(req: NextRequest) {
  try {
    const brokerGtid = req.nextUrl.searchParams.get("brokerGtid");
    const kind = (req.nextUrl.searchParams.get("kind") || "physical").toLowerCase();
    if (!brokerGtid) {
      return NextResponse.json({ ok: false, error: "brokerGtid required" }, { status: 400 });
    }
    if (kind === "physical") {
      const result = await getPhysicalJobs(brokerGtid);
      return NextResponse.json(result);
    }
    if (kind === "storage") {
      const result = await getStorageItems(brokerGtid);
      return NextResponse.json(result);
    }
    return NextResponse.json(
      { ok: false, error: `unsupported kind: ${kind}. Use 'physical' or 'storage'.` },
      { status: 400 },
    );
  } catch (e: any) {
    logger.error("[broker-jobs/GET] error:", e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const jobId = String(body.jobId || body.storageId || "");
    const kind = String(body.kind || "physical").toLowerCase();
    const action = String(body.action || "").toLowerCase();
    const brokerGtid = String(body.brokerGtid || "");
    const reason = body.reason ? String(body.reason) : undefined;
    const scanHash = body.scanHash ? String(body.scanHash) : undefined;

    if (!jobId || !action || !brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "jobId, action, brokerGtid required" },
        { status: 400 },
      );
    }

    let result: any;
    if (kind === "physical") {
      result = await actOnPhysicalJob(jobId, action, brokerGtid, reason, scanHash);
    } else if (kind === "storage") {
      result = await actOnStorageItem(jobId, action, brokerGtid, reason);
    } else {
      return NextResponse.json(
        { ok: false, error: `unsupported kind: ${kind}` },
        { status: 400 },
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[broker-jobs/POST] error:", e);
    return NextResponse.json({ error: e?.message || "action failed" }, { status: 500 });
  }
}
