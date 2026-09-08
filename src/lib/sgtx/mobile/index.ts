// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §16.8.12 — Mobile Companion Apps · API Backends
// ═══════════════════════════════════════════════════════════════════════════════
//
// Three mobile companion apps consume these endpoints:
//
//   1. LSP Driver App (for logistics drivers)
//      - getDriverAssignments  → list of assigned shipments with route + deadline
//      - confirmMilestone       → confirm a pickup / loading / departure / arrival / delivery
//      - getVoiceNavigation     → OSRM-style turn-by-turn navigation for a shipment
//      - reportIssue            → report an issue (damage, delay, weather, …) with photo
//      - syncOfflineQueue       → sync queued actions when back online
//
//   2. QC Inspector App (for field inspectors)
//      - getInspectionJobs      → list of assigned QC inspections
//      - submitInspection       → submit inspection result (pass/fail/conditional + photos)
//      - capturePhoto           → upload a photo + return its content-addressable hash
//      - syncOfflineInspections → sync queued inspections when back online
//
//   3. CBR Document Receipt App (for customs brokers)
//      - getDocumentQueue       → list of documents awaiting the broker's acknowledgement
//      - acknowledgeDocument    → mark a document as received (creates an audit trail)
//      - submitDeclaration      → submit a customs declaration (with tracking ID)
//      - syncOfflineDeclarations → sync queued declarations when back online
//
// All three apps follow the same offline-sync specification (see
// offline-sync-spec.ts). The sync functions are essentially the same algorithm
// applied to different action types:
//   1. Validate every queued action's signature + payloadHash
//   2. For each action: apply server-side; on conflict → push to conflicts[]
//   3. Return { synced, conflicts, stale, remaining, serverTimestamp }
//
// DB models used:
//   - Shipment, Milestone        (driver app)
//   - QcInspection, QcActionPlan (inspector app)
//   - CustomsDeclaration, Document, InboxItem (broker app)
//
// All functions are defensive: failures resolve to safe defaults + an `ok:
// false` flag rather than throwing. The API routes catch any thrown errors
// and return 500s.
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import crypto from "crypto";
import {
  OFFLINE_SYNC_SPEC,
  validateQueuedAction,
  isActionStale,
  type QueuedAction,
  type SyncResult,
  type SyncConflict,
} from "./offline-sync-spec";

// ────────────────────────────────────────────────────────────────────────────
// Common helpers
// ────────────────────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function contentHash(payload: string | Buffer): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// Milestone type sequence for a typical shipment lifecycle
const MILESTONE_SEQUENCE = [
  "PICKUP",
  "LOADING",
  "DEPARTURE",
  "IN_TRANSIT",
  "ARRIVAL",
  "CUSTOMS_CLEARANCE",
  "DELIVERY",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// LSP DRIVER APP
// ────────────────────────────────────────────────────────────────────────────

export interface DriverAssignment {
  shipmentId: string;
  tradeId: string;
  ustn: string;
  commodity: string;
  origin: { port: string; address?: string; lat?: number; lng?: number };
  destination: { port: string; address?: string; lat?: number; lng?: number };
  containerNo?: string;
  vesselName?: string;
  transportMode: string;
  status: string;
  etd?: string;
  eta?: string;
  deadline?: string;
  driverName?: string;
  truckNumber?: string;
  nextMilestone?: { type: string; label: string; sequence: number; blocksDelivery: boolean };
  legSequence?: number;
}

/**
 * Get all shipments assigned to a driver (by truckNumber or driverName match,
 * or all shipments on the carrier's most recent active trade).
 *
 * In production this would filter by `driverGtid` mapped via a driver-tenant
 * table; for the demo env we use a tenant-type check (LSP / CARRIER) and
 * return all in-progress shipments.
 */
export async function getDriverAssignments(
  driverGtid: string,
): Promise<{ assignments: DriverAssignment[] }> {
  try {
    if (!driverGtid) return { assignments: [] };

    // Find shipments where the carrier is this driver's tenant OR where the
    // driverName field matches. We also include all PLANNED / IN_TRANSIT
    // shipments as a fallback so the demo env returns something.
    const shipments = await (db as any).shipment.findMany({
      where: {
        OR: [
          { carrierGtid: driverGtid },
          { status: { in: ["PLANNED", "IN_TRANSIT", "AT_PORT", "DEPARTED"] } },
        ],
      },
      include: {
        trade: {
          select: {
            ustn: true,
            commodity: true,
            originPort: true,
            destPort: true,
            latestDeliveryDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const assignments: DriverAssignment[] = [];
    for (const s of shipments) {
      // Find next pending milestone for this shipment
      const nextMilestone = await (db as any).milestone.findFirst({
        where: { shipmentId: s.id, status: "PENDING" },
        orderBy: { sequence: "asc" },
      });
      assignments.push({
        shipmentId: s.id,
        tradeId: s.tradeId,
        ustn: s.ustn,
        commodity: s.trade?.commodity ?? "",
        origin: { port: s.originPort },
        destination: { port: s.destPort },
        containerNo: s.containerNo ?? undefined,
        vesselName: s.vesselName ?? undefined,
        transportMode: s.transportMode,
        status: s.status,
        etd: s.etd?.toISOString() ?? undefined,
        eta: s.eta?.toISOString() ?? undefined,
        deadline: s.trade?.latestDeliveryDate?.toISOString() ?? undefined,
        driverName: s.driverName ?? undefined,
        truckNumber: s.truckNumber ?? undefined,
        nextMilestone: nextMilestone
          ? {
              type: nextMilestone.type,
              label: nextMilestone.label ?? nextMilestone.type,
              sequence: nextMilestone.sequence,
              blocksDelivery: nextMilestone.blocksDelivery,
            }
          : undefined,
        legSequence: s.legSequence,
      });
    }

    return { assignments };
  } catch (err) {
    logger.error("mobile.driver.assignments.failed", { driverGtid, err: String(err) });
    return { assignments: [] };
  }
}

/**
 * Confirm a milestone for a shipment. Updates the next PENDING Milestone row
 * of the given type to CONFIRMED, records the GPS location + photo hash
 * (if provided), and returns the next milestone due.
 */
export async function confirmMilestone(
  shipmentId: string,
  milestone: string,
  location: { lat: number; lng: number; accuracy?: number },
  photoHash?: string,
  confirmedByGtid?: string,
): Promise<{
  confirmed: boolean;
  nextMilestone?: { type: string; label: string; sequence: number };
  reason?: string;
}> {
  try {
    const shipment = await (db as any).shipment.findUnique({
      where: { id: shipmentId },
      select: { ustn: true, status: true },
    });
    if (!shipment) {
      return { confirmed: false, reason: "shipment not found" };
    }
    const nextPending = await (db as any).milestone.findFirst({
      where: {
        shipmentId,
        type: milestone,
        status: "PENDING",
      },
      orderBy: { sequence: "asc" },
    });
    if (!nextPending) {
      return {
        confirmed: false,
        reason: `no pending ${milestone} milestone`,
      };
    }

    // Evidence hash: GPS + photo + timestamp
    const evidenceHash = contentHash(
      JSON.stringify({
        shipmentId,
        milestone,
        location,
        photoHash: photoHash ?? null,
        timestamp: new Date().toISOString(),
      }),
    );

    await (db as any).milestone.update({
      where: { id: nextPending.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedByGtid: confirmedByGtid ?? null,
        actorGtid: confirmedByGtid ?? null,
        evidenceHash,
      },
    });

    // Find the next pending milestone after this one
    const after = await (db as any).milestone.findFirst({
      where: { shipmentId, status: "PENDING", sequence: { gt: nextPending.sequence } },
      orderBy: { sequence: "asc" },
    });

    logger.info("mobile.driver.milestone.confirmed", {
      shipmentId,
      milestone,
      evidenceHash,
    });

    return {
      confirmed: true,
      nextMilestone: after
        ? { type: after.type, label: after.label ?? after.type, sequence: after.sequence }
        : undefined,
    };
  } catch (err) {
    logger.error("mobile.driver.confirm_milestone.failed", {
      shipmentId,
      milestone,
      err: String(err),
    });
    return { confirmed: false, reason: "db error" };
  }
}

/**
 * Get OSRM-style turn-by-turn navigation for a shipment.
 *
 * Real OSRM would return a full polyline + 50-200 turn instructions. Here
 * we return a deterministic simplified route with 4-8 turns based on the
 * origin / destination port pair. The `offlineAvailable` flag indicates
 * that the device can cache this route for offline use (always true for
 * routes < 500 km in the demo env).
 */
export async function getVoiceNavigation(shipmentId: string): Promise<{
  turnByTurn: Array<{
    instruction: string;
    distanceMeters: number;
    durationSeconds: number;
    modifier?: "left" | "right" | "straight" | "uturn";
    lng: number;
    lat: number;
  }>;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  offlineAvailable: boolean;
  polylineGeoJson?: string;
  simulated: boolean;
}> {
  try {
    const shipment = await (db as any).shipment.findUnique({
      where: { id: shipmentId },
      select: { originPort: true, destPort: true, transportMode: true },
    });
    if (!shipment) {
      return { turnByTurn: [], totalDistanceMeters: 0, totalDurationSeconds: 0, offlineAvailable: false, simulated: true };
    }

    // Deterministic pseudo-route — 6 turns between origin + destination
    const seed = contentHash(`${shipment.originPort}|${shipment.destPort}`);
    const seedVal = parseInt(seed.slice(0, 8), 16);
    const totalDistanceMeters = 50_000 + (seedVal % 1_500_000); // 50-1550 km
    const totalDurationSeconds = Math.floor(totalDistanceMeters / 13.9); // ~50 km/h avg
    const turnCount = 4 + (seedVal % 5); // 4-8 turns

    const turnByTurn = Array.from({ length: turnCount }).map((_, i) => {
      const modifiers: ("left" | "right" | "straight" | "uturn")[] = [
        "straight",
        "left",
        "right",
        "straight",
        "uturn",
      ];
      const modifier = modifiers[(seedVal + i) % modifiers.length];
      const instruction =
        modifier === "left"
          ? `Turn left in ${(i + 1) * 50} meters`
          : modifier === "right"
            ? `Turn right in ${(i + 1) * 50} meters`
            : modifier === "uturn"
              ? "Make a U-turn at the next junction"
              : `Continue straight for ${(i + 1) * 100} meters`;
      return {
        instruction,
        distanceMeters: Math.floor(totalDistanceMeters / turnCount),
        durationSeconds: Math.floor(totalDurationSeconds / turnCount),
        modifier,
        lng: (seedVal % 360) - 180,
        lat: ((seedVal + i * 17) % 180) - 90,
      };
    });

    const polylineGeoJson = `{"type":"LineString","coordinates":[[${(seedVal % 360) - 180},${(seedVal % 180) - 90}],[${(seedVal % 360) - 179},${(seedVal % 180) - 89}]]}`;

    return {
      turnByTurn,
      totalDistanceMeters,
      totalDurationSeconds,
      offlineAvailable: true,
      polylineGeoJson,
      simulated: true,
    };
  } catch (err) {
    logger.error("mobile.driver.navigation.failed", {
      shipmentId,
      err: String(err),
    });
    return { turnByTurn: [], totalDistanceMeters: 0, totalDurationSeconds: 0, offlineAvailable: false, simulated: true };
  }
}

/**
 * Report an issue from the driver (damage, delay, weather, accident, etc.).
 * Creates an InboxItem so the back-office can review + an Activity log entry.
 */
export async function reportIssue(
  shipmentId: string,
  issue: {
    type: string;
    description: string;
    photoHash?: string;
    location?: { lat: number; lng: number };
    driverGtid?: string;
  },
): Promise<{ issueId: string }> {
  try {
    const issueId = genId("ISSUE");
    const shipment = await (db as any).shipment.findUnique({
      where: { id: shipmentId },
      select: { ustn: true, tradeId: true, carrierGtid: true },
    });
    if (!shipment) return { issueId: "" };

    // Create an InboxItem for the back-office
    await (db as any).inboxItem.create({
      data: {
        tenantGtid: shipment.carrierGtid ?? issue.driverGtid ?? "GTID-LSP-DEFAULT",
        tradeId: shipment.tradeId,
        category: "DRIVER_ISSUE",
        priority: issue.type === "ACCIDENT" ? 95 : issue.type === "DAMAGE" ? 80 : 60,
        title: `Driver issue: ${issue.type} on shipment ${shipment.ustn}`,
        description: `${issue.description}${issue.photoHash ? ` | Photo: ${issue.photoHash}` : ""}${issue.location ? ` | GPS: ${issue.location.lat},${issue.location.lng}` : ""}`,
        ctaLabel: "Review",
      },
    });

    // Activity log entry
    try {
      await (db as any).activity.create({
        data: {
          tradeId: shipment.tradeId,
          actorGtid: issue.driverGtid ?? null,
          action: "DRIVER_ISSUE_REPORTED",
          description: `${issue.type}: ${issue.description}`,
          type: "WARN",
          metadata: JSON.stringify({ issueId, photoHash: issue.photoHash, location: issue.location }),
        },
      });
    } catch {
      // activity log is best-effort
    }

    logger.info("mobile.driver.issue.reported", {
      issueId,
      shipmentId,
      type: issue.type,
    });
    return { issueId };
  } catch (err) {
    logger.error("mobile.driver.report_issue.failed", {
      shipmentId,
      err: String(err),
    });
    return { issueId: "" };
  }
}

/**
 * Sync the driver's offline action queue when back online. Server-wins
 * conflict resolution: if a queued action's shipment state has changed
 * server-side (e.g. another user already confirmed the milestone), the
 * action is rejected + pushed to the conflicts array.
 */
export async function syncOfflineQueue(
  driverGtid: string,
  queuedActions: QueuedAction[],
): Promise<SyncResult> {
  return runSyncLoop(driverGtid, queuedActions, "driver");
}

// ────────────────────────────────────────────────────────────────────────────
// QC INSPECTOR APP
// ────────────────────────────────────────────────────────────────────────────

export interface InspectionJob {
  inspectionId: string;
  tradeId: string;
  ustn: string;
  inspectionType: string;
  status: string;
  requirements: string[];
  deadline: string | null;
  inspectorName?: string;
  location?: string;
}

/**
 * Get all QC inspections assigned to an inspector. Returns the inspection
 * rows plus derived `requirements` (from the inspection type + trade's QC
 * requirements).
 */
export async function getInspectionJobs(
  inspectorGtid: string,
): Promise<{ jobs: InspectionJob[] }> {
  try {
    if (!inspectorGtid) return { jobs: [] };
    const inspections = await (db as any).qcInspection.findMany({
      where: {
        OR: [
          { qcGtid: inspectorGtid },
          { status: "SCHEDULED" },
        ],
      },
      include: { trade: { select: { ustn: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const jobs: InspectionJob[] = inspections.map((i: any) => ({
      inspectionId: i.id,
      tradeId: i.tradeId,
      ustn: i.trade?.ustn ?? "",
      inspectionType: i.inspectionType,
      status: i.status,
      requirements: inspectionRequirements(i.inspectionType),
      deadline: i.actionPlanDeadline?.toISOString() ?? null,
      inspectorName: i.inspectorName ?? undefined,
    }));
    return { jobs };
  } catch (err) {
    logger.error("mobile.inspector.jobs.failed", { inspectorGtid, err: String(err) });
    return { jobs: [] };
  }
}

function inspectionRequirements(type: string): string[] {
  const base = ["PHOTOGRAPH_EVIDENCE", "WEIGHT_VERIFICATION", "PACKAGING_INSPECTION"];
  const t = (type || "").toUpperCase();
  if (t.includes("PRE_SHIPMENT")) return [...base, "QUANTITY_COUNT", "LABEL_CHECK"];
  if (t.includes("COLD_CHAIN")) return [...base, "TEMPERATURE_LOG", "REEFER_CHECK"];
  if (t.includes("LAB")) return ["SAMPLE_COLLECTION", "LAB_TEST_ORDER"];
  if (t.includes("LOADING")) return [...base, "CONTAINER_SEAL", "VGM_CHECK"];
  return base;
}

export interface InspectionSubmission {
  pass: boolean;
  deficiencies: string[];
  photos: Array<{ hash: string; label?: string }>;
  sensorData?: Record<string, unknown>;
  conditionalPass?: boolean;
}

/**
 * Submit a QC inspection result. Updates the QcInspection row with the
 * result (PASS / FAIL / CONDITIONAL_PASS), defects JSON, sensor data, and
 * creates a QcActionPlan if the result is a FAIL / CONDITIONAL_PASS.
 */
export async function submitInspection(
  inspectionId: string,
  result: InspectionSubmission,
  inspectorGtid?: string,
): Promise<{
  submitted: boolean;
  actionPlanRequired: boolean;
  actionPlanId?: string;
  reason?: string;
}> {
  try {
    const inspection = await (db as any).qcInspection.findUnique({
      where: { id: inspectionId },
      select: { id: true, tradeId: true, qcGtid: true },
    });
    if (!inspection) {
      return { submitted: false, actionPlanRequired: false, reason: "inspection not found" };
    }

    const finalResult = result.pass ? "PASS" : result.conditionalPass ? "CONDITIONAL_PASS" : "FAIL";
    const defectsJson = JSON.stringify({
      deficiencies: result.deficiencies,
      photos: result.photos,
      sensorData: result.sensorData ?? null,
    });

    await (db as any).qcInspection.update({
      where: { id: inspectionId },
      data: {
        result: finalResult,
        status: "COMPLETED",
        defectCount: result.deficiencies.length,
        defectsJson,
        completedAt: new Date(),
        conditionalPassStatus: result.conditionalPass ? "PENDING" : null,
        notes: `Inspector ${inspectorGtid ?? "unknown"} submitted via mobile app`,
      },
    });

    let actionPlanId: string | undefined;
    const actionPlanRequired = finalResult !== "PASS";
    if (actionPlanRequired) {
      // Create a QcActionPlan that blocks settlement
      const ustn = `mobile-insp-${inspectionId}`;
      actionPlanId = genId("QCAP");
      try {
        await (db as any).qcActionPlan.create({
          data: {
            planId: actionPlanId,
            inspectionId,
            ustn,
            actionPlan: `Mobile-submitted inspection ${finalResult}: ${result.deficiencies.join("; ")}`,
            actions: JSON.stringify(
              result.deficiencies.map((d, idx) => ({
                code: `CORRECT_${idx + 1}`,
                label: d,
                reason: `Inspector found: ${d}`,
                complete: false,
              })),
            ),
            status: "PENDING",
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            createdByGtid: inspectorGtid ?? inspection.qcGtid,
          },
        });
      } catch (err) {
        logger.warn("mobile.inspector.action_plan.create_failed", { err: String(err) });
        actionPlanId = undefined;
      }
    }

    logger.info("mobile.inspector.submitted", {
      inspectionId,
      result: finalResult,
      actionPlanRequired,
    });

    return {
      submitted: true,
      actionPlanRequired,
      actionPlanId,
    };
  } catch (err) {
    logger.error("mobile.inspector.submit.failed", { inspectionId, err: String(err) });
    return { submitted: false, actionPlanRequired: false, reason: "db error" };
  }
}

/**
 * Capture a photo from the inspector's mobile device. Returns the photo's
 * content-addressable hash (SHA-256) which is referenced in subsequent
 * inspection submissions.
 *
 * In production, the photo bytes would be stored in S3 / R2 with the hash
 * as the key. For the demo env we just compute + return the hash — the
 * photo bytes are NOT persisted (the broker's QC photos live in Document
 * rows, separately uploaded via the standard document API).
 */
export function capturePhoto(
  _inspectionId: string,
  photoBase64: string,
  metadata?: { lat?: number; lng?: number; capturedAt?: string; label?: string },
): { photoId: string; hash: string; persisted: boolean } {
  const photoId = genId("PHOTO");
  try {
    const hash = contentHash(photoBase64 + JSON.stringify(metadata ?? {}));
    return { photoId, hash, persisted: false };
  } catch (err) {
    logger.error("mobile.inspector.capture_photo.failed", { err: String(err) });
    return { photoId, hash: "", persisted: false };
  }
}

/**
 * Sync the inspector's offline inspection queue.
 */
export async function syncOfflineInspections(
  inspectorGtid: string,
  queued: QueuedAction[],
): Promise<SyncResult> {
  return runSyncLoop(inspectorGtid, queued, "inspector");
}

// ────────────────────────────────────────────────────────────────────────────
// CBR DOCUMENT RECEIPT APP
// ────────────────────────────────────────────────────────────────────────────

export interface BrokerDocumentQueueItem {
  docId: string;
  tradeId: string;
  ustn: string;
  type: string;
  title: string;
  status: string;
  uploadedBy: string | null;
  deadline: string | null;
  acknowledged: boolean;
}

/**
 * Get the broker's document queue — all documents on trades where the
 * broker is assigned (buyerCustomsBrokerGtid or sellerCustomsBrokerGtid),
 * filtered to those that are REQUIRED or PENDING.
 */
export async function getDocumentQueue(brokerGtid: string): Promise<{
  documents: BrokerDocumentQueueItem[];
}> {
  try {
    if (!brokerGtid) return { documents: [] };
    const trades = await (db as any).trade.findMany({
      where: {
        OR: [{ buyerCustomsBrokerGtid: brokerGtid }, { sellerCustomsBrokerGtid: brokerGtid }],
      },
      select: {
        id: true,
        ustn: true,
        latestDeliveryDate: true,
        documents: { select: { id: true, type: true, title: true, status: true, uploadedBy: true } },
      },
      take: 200,
    });
    const documents: BrokerDocumentQueueItem[] = [];
    for (const t of trades) {
      for (const d of t.documents) {
        documents.push({
          docId: d.id,
          tradeId: t.id,
          ustn: t.ustn,
          type: d.type,
          title: d.title,
          status: d.status,
          uploadedBy: d.uploadedBy,
          deadline: t.latestDeliveryDate?.toISOString() ?? null,
          acknowledged: d.status === "VERIFIED",
        });
      }
    }
    return { documents };
  } catch (err) {
    logger.error("mobile.broker.queue.failed", { brokerGtid, err: String(err) });
    return { documents: [] };
  }
}

/**
 * Acknowledge receipt of a document. Updates the Document's status from
 * REQUIRED / PENDING to VERIFIED (broker has received it). Creates an
 * activity log entry as an audit trail.
 */
export async function acknowledgeDocument(
  docId: string,
  brokerGtid: string,
): Promise<{ acknowledged: boolean; reason?: string }> {
  try {
    const doc = await (db as any).document.findUnique({
      where: { id: docId },
      select: { id: true, tradeId: true, status: true, title: true },
    });
    if (!doc) return { acknowledged: false, reason: "document not found" };
    if (doc.status === "VERIFIED") return { acknowledged: false, reason: "already acknowledged" };
    await (db as any).document.update({
      where: { id: docId },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
    });
    try {
      await (db as any).activity.create({
        data: {
          tradeId: doc.tradeId,
          actorGtid: brokerGtid,
          action: "DOCUMENT_ACKNOWLEDGED",
          description: `Broker ${brokerGtid} acknowledged document "${doc.title}" via CBR mobile app`,
          type: "INFO",
        },
      });
    } catch {
      // activity log is best-effort
    }
    logger.info("mobile.broker.document.acknowledged", { docId, brokerGtid });
    return { acknowledged: true };
  } catch (err) {
    logger.error("mobile.broker.acknowledge.failed", { docId, brokerGtid, err: String(err) });
    return { acknowledged: false, reason: "db error" };
  }
}

/**
 * Submit a customs declaration from the broker's mobile app. Creates a
 * CustomsDeclaration row with a generated declarationNo + trackingId.
 */
export async function submitDeclaration(
  declarationId: string,
  data: {
    tradeId: string;
    brokerGtid: string;
    regime?: string;
    etaXml?: string;
  },
): Promise<{ submitted: boolean; trackingId: string; declarationNo?: string; reason?: string }> {
  try {
    if (!data.tradeId) return { submitted: false, trackingId: "", reason: "tradeId required" };
    const trackingId = genId("DECL-TRACK");
    const declarationNo = declarationId || `EG-${Date.now().toString(36).toUpperCase()}`;
    await (db as any).customsDeclaration.create({
      data: {
        tradeId: data.tradeId,
        brokerGtid: data.brokerGtid,
        declarationNo,
        regime: data.regime || "IMPORT",
        status: "SUBMITTED",
        etaXml: data.etaXml ?? null,
      },
    });
    logger.info("mobile.broker.declaration.submitted", {
      trackingId,
      declarationNo,
      tradeId: data.tradeId,
    });
    return { submitted: true, trackingId, declarationNo };
  } catch (err) {
    logger.error("mobile.broker.submit_declaration.failed", {
      declarationId,
      tradeId: data.tradeId,
      err: String(err),
    });
    return { submitted: false, trackingId: "", reason: "db error" };
  }
}

/**
 * Sync the broker's offline declaration queue.
 */
export async function syncOfflineDeclarations(
  brokerGtid: string,
  queued: QueuedAction[],
): Promise<SyncResult> {
  return runSyncLoop(brokerGtid, queued, "broker");
}

// ────────────────────────────────────────────────────────────────────────────
// Common sync loop — applies the OFFLINE_SYNC_SPEC to any action type
// ────────────────────────────────────────────────────────────────────────────

async function runSyncLoop(
  userGtid: string,
  queuedActions: QueuedAction[],
  app: "driver" | "inspector" | "broker",
): Promise<SyncResult> {
  const result: SyncResult = {
    synced: 0,
    conflicts: [],
    stale: 0,
    remaining: 0,
    serverTimestamp: new Date().toISOString(),
  };

  if (!Array.isArray(queuedActions)) return result;
  if (queuedActions.length > OFFLINE_SYNC_SPEC.queueMaxSize) {
    // Cap to queueMaxSize (FIFO — drop oldest)
    queuedActions = queuedActions.slice(-OFFLINE_SYNC_SPEC.queueMaxSize);
  }

  for (const action of queuedActions) {
    // Validate
    const v = validateQueuedAction(action);
    if (!v.valid) {
      result.conflicts.push({
        action,
        reason: `invalid action: missing fields ${v.missing.join(", ") || "payload hash mismatch"}`,
        serverState: {},
      });
      continue;
    }
    // Stale check
    if (isActionStale(action.timestamp)) {
      result.stale++;
      continue;
    }

    // Apply the action server-side. The dispatch table maps
    // actionType → handler. Server-wins policy: if the server-side state
    // doesn't match what the client expected, the action is rejected and
    // pushed to conflicts.
    try {
      const applied = await applyQueuedAction(action, userGtid, app);
      if (applied.applied) {
        result.synced++;
      } else {
        result.conflicts.push({
          action,
          reason: applied.reason ?? "server rejected action",
          serverState: applied.serverState ?? {},
        });
      }
    } catch (err) {
      logger.error("mobile.sync.apply_action.failed", {
        app,
        actionType: action.actionType,
        err: String(err),
      });
      result.conflicts.push({
        action,
        reason: `server error: ${String(err)}`,
        serverState: {},
      });
    }
  }
  result.remaining = queuedActions.length - result.synced - result.stale - result.conflicts.length;
  return result;
}

async function applyQueuedAction(
  action: QueuedAction,
  userGtid: string,
  app: "driver" | "inspector" | "broker",
): Promise<{ applied: boolean; reason?: string; serverState?: Record<string, unknown> }> {
  const p = action.payload || {};
  switch (action.actionType) {
    case "confirm_milestone": {
      const r = await confirmMilestone(
        String(p.shipmentId ?? ""),
        String(p.milestone ?? "PICKUP"),
        (p.location as any) ?? { lat: 0, lng: 0 },
        String(p.photoHash ?? undefined),
        userGtid,
      );
      return {
        applied: r.confirmed,
        reason: r.reason,
        serverState: r.nextMilestone ? ({ nextMilestone: r.nextMilestone } as any) : {},
      };
    }
    case "report_issue": {
      const r = await reportIssue(String(p.shipmentId ?? ""), {
        type: String(p.type ?? "OTHER"),
        description: String(p.description ?? ""),
        photoHash: String(p.photoHash ?? undefined),
        location: p.location as any,
        driverGtid: userGtid,
      });
      return { applied: Boolean(r.issueId), reason: r.issueId ? undefined : "report failed" };
    }
    case "submit_inspection": {
      const r = await submitInspection(
        String(p.inspectionId ?? ""),
        {
          pass: Boolean(p.pass),
          deficiencies: (p.deficiencies as string[]) ?? [],
          photos: (p.photos as any[]) ?? [],
          sensorData: p.sensorData as any,
          conditionalPass: Boolean(p.conditionalPass),
        },
        userGtid,
      );
      return {
        applied: r.submitted,
        reason: r.reason,
        serverState: { actionPlanRequired: r.actionPlanRequired, actionPlanId: r.actionPlanId },
      };
    }
    case "acknowledge_document": {
      const r = await acknowledgeDocument(String(p.docId ?? ""), userGtid);
      return { applied: r.acknowledged, reason: r.reason };
    }
    case "submit_declaration": {
      const r = await submitDeclaration(String(p.declarationId ?? genId("DECL")), {
        tradeId: String(p.tradeId ?? ""),
        brokerGtid: userGtid,
        regime: String(p.regime ?? "IMPORT"),
        etaXml: String(p.etaXml ?? ""),
      });
      return { applied: r.submitted, reason: r.reason, serverState: { trackingId: r.trackingId } };
    }
    default:
      return { applied: false, reason: `unknown actionType: ${action.actionType}` };
  }
}
