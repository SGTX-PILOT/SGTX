// SGTX Phase 5 — Physical Execution & Multiparty Tracking (Blueprint 3B.6)
// Pallet-level loading, multisensor consensus, conditional QC pass with action plan,
// reinspection, container release pre-advice, customs submission, cold-chain monitoring,
// delivery confirmation with hold validation, stuck trade SLA-based escalation.

import { db } from "@/lib/db";
import crypto from "crypto";

export const SLA_LEVEL_1_HOURS = 12;  // Smart Inbox reminder
export const SLA_LEVEL_2_HOURS = 24;  // Alert seller/buyer/admin
export const SLA_LEVEL_3_HOURS = 48;  // Escalate to human mediator (A3)

export const MILESTONE_TYPES = [
  "PALLET_LOADED", "CONTAINER_LOADED", "DEPARTED", "IN_TRANSIT",
  "ARRIVED", "GATED_IN", "CUSTOMS_CLEARED", "BL_ISSUED", "DELIVERED",
] as const;

export const MILESTONE_LABELS: Record<string, string> = {
  PALLET_LOADED: "Pallets Loaded",
  CONTAINER_LOADED: "Container Sealed & Loaded",
  DEPARTED: "Vessel Departed",
  IN_TRANSIT: "In Transit",
  ARRIVED: "Vessel Arrived",
  GATED_IN: "Container Gated In",
  CUSTOMS_CLEARED: "Customs Cleared",
  BL_ISSUED: "Bill of Lading Issued",
  DELIVERED: "Delivered to Buyer",
};

// ============ 3B.6.3: Pallet-Level Loading ============
export interface PalletScanResult {
  ok: boolean;
  pallet?: any;
  milestone?: any;
  autoContainerLoaded?: boolean;
  reason?: string;
  code?: string;
}

export async function scanPallet(input: {
  shipmentId: string;
  sscc: string;
  loadedBy: string;
  scanMethod: "BARCODE" | "VOICE" | "AR" | "BATCH";
  biometricVerified?: boolean;
  voiceTranscript?: string;
}): Promise<PalletScanResult> {
  const pallet = await db.palletDetail.findUnique({ where: { sscc: input.sscc } });
  if (!pallet) return { ok: false, code: "PALLET_NOT_FOUND", reason: `No pallet found with SSCC ${input.sscc}.` };
  if (pallet.shipmentId !== input.shipmentId) {
    return { ok: false, code: "WRONG_SHIPMENT", reason: `Pallet ${pallet.palletId} belongs to a different shipment (multishipment validation).` };
  }
  if (pallet.loaded) {
    return { ok: false, code: "ALREADY_LOADED", reason: `Pallet ${pallet.palletId} already loaded at ${pallet.loadedAt?.toISOString()}.` };
  }

  // Governor validation (G4U1): device identity, milestone permissions, pallet-shipment match
  // (simulated — in production this calls the Governor service)
  const updated = await db.palletDetail.update({
    where: { id: pallet.id },
    data: {
      loaded: true,
      loadedAt: new Date(),
      loadedBy: input.loadedBy,
      scanMethod: input.scanMethod,
    },
  });

  // Record pallet.loaded milestone event
  const milestone = await db.milestone.create({
    data: {
      shipmentId: input.shipmentId,
      ustn: pallet.ustn,
      sequence: 0, // pallet events don't have a fixed sequence
      type: "PALLET_LOADED",
      label: `Pallet ${pallet.palletId} loaded (layer ${pallet.layerPosition})`,
      status: input.scanMethod === "VOICE" && input.biometricVerified ? "AUTO_CONFIRMED" : "CONFIRMED",
      actorGtid: input.loadedBy,
      confirmedAt: new Date(),
      autoConfirmed: input.scanMethod === "VOICE" && !!input.biometricVerified,
      voiceTranscript: input.voiceTranscript || null,
      biometricVerified: !!input.biometricVerified,
      sensorData: JSON.stringify({ sscc: input.sscc, scan_method: input.scanMethod }),
    },
  });

  // Check multisensor consensus — all pallets loaded?
  const allPallets = await db.palletDetail.findMany({ where: { shipmentId: input.shipmentId } });
  const loadedCount = allPallets.filter(p => p.loaded).length;
  const totalCount = allPallets.length;

  if (loadedCount === totalCount && totalCount > 0) {
    // All pallets scanned — check if container already loaded
    const existingContainer = await db.milestone.findFirst({
      where: { shipmentId: input.shipmentId, type: "CONTAINER_LOADED" },
    });
    if (!existingContainer) {
      // Auto-confirm container loaded (multisensor consensus — zero clicks)
      const containerMilestone = await db.milestone.create({
        data: {
          shipmentId: input.shipmentId,
          ustn: pallet.ustn,
          sequence: 2,
          type: "CONTAINER_LOADED",
          label: `Container sealed & loaded (${loadedCount}/${totalCount} pallets, multisensor consensus)`,
          status: "AUTO_CONFIRMED",
          actorGtid: input.loadedBy,
          confirmedAt: new Date(),
          autoConfirmed: true,
          sensorData: JSON.stringify({ scan_count: loadedCount, multisensor_consensus: true }),
        },
      });
      // Update shipment status to LOADED
      await db.shipment.update({ where: { id: input.shipmentId }, data: { status: "LOADED" } });
      // Inbox notify seller
      const shipment = await db.shipment.findUnique({ where: { id: input.shipmentId }, include: { trade: true } });
      if (shipment) {
        await db.inboxItem.create({
          data: {
            tenantGtid: shipment.trade.sellerGtid, tradeId: shipment.tradeId,
            category: "NEEDS_APPROVAL", priority: 88,
            title: `Container auto-loaded — multisensor consensus reached`,
            description: `All ${loadedCount} pallets scanned. Container ${shipment.containerNo} sealed. Awaiting vessel departure.`,
            ctaLabel: "View Milestones",
          },
        });
      }
      return { ok: true, pallet: updated, milestone, autoContainerLoaded: true };
    }
  }

  return { ok: true, pallet: updated, milestone, autoContainerLoaded: false };
}

// Batch scan — group multiple scans and confirm after short pause
export async function batchScanPallets(input: {
  shipmentId: string;
  ssccs: string[];
  loadedBy: string;
}): Promise<{ ok: boolean; confirmed: number; failed: string[]; autoContainerLoaded?: boolean }> {
  const results = await Promise.all(input.ssccs.map(sscc =>
    scanPallet({ shipmentId: input.shipmentId, sscc, loadedBy: input.loadedBy, scanMethod: "BATCH" })
  ));
  const confirmed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).map((r, i) => `${input.ssccs[i]}: ${r.reason}`);
  const autoContainerLoaded = results.some(r => r.autoContainerLoaded);
  return { ok: true, confirmed, failed, autoContainerLoaded };
}

// ============ 3B.6.4: QC Conditional Pass + Action Plan ============
export async function submitConditionalQcPass(input: {
  inspectionId: string;
  ustn: string;
  shipmentId: string;
  actionPlan: string;
  deadlineHours: number;
  escalationTerms?: string;
  inspectorGtid: string;
}): Promise<{ ok: true; actionPlanId: string; holdId: string } | { ok: false; reason: string }> {
  if (!input.actionPlan || input.actionPlan.trim().length < 10) {
    return { ok: false, reason: "Action plan must be at least 10 characters." };
  }
  const deadline = new Date(Date.now() + input.deadlineHours * 3600 * 1000);
  const plan = await db.qcActionPlan.create({
    data: {
      inspectionId: input.inspectionId, ustn: input.ustn,
      actionPlan: input.actionPlan, deadline,
      escalationTerms: input.escalationTerms || null,
      status: "PENDING",
    },
  });
  // Place hold on shipment (blocks settlement but allows loading)
  const hold = await db.shipmentHold.create({
    data: {
      shipmentId: input.shipmentId, ustn: input.ustn,
      holdType: "QC_CONDITIONAL",
      reason: `Conditional QC pass — action plan: ${input.actionPlan.slice(0, 80)}…`,
      actionPlanId: plan.id,
      blocksSettlement: true, blocksDelivery: false,
    },
  });
  // Notify buyer + seller
  const shipment = await db.shipment.findUnique({ where: { id: input.shipmentId }, include: { trade: true } });
  if (shipment) {
    for (const gtid of [shipment.trade.buyerGtid, shipment.trade.sellerGtid]) {
      await db.inboxItem.create({
        data: {
          tenantGtid: gtid, tradeId: shipment.tradeId,
          category: "NEEDS_APPROVAL", priority: 92,
          title: `Conditional QC pass — action plan required within ${input.deadlineHours}h`,
          description: `Inspector submitted CONDITIONAL pass. Action: ${input.actionPlan.slice(0, 100)}… Deadline: ${deadline.toLocaleString()}. ${input.escalationTerms || ""}`,
          ctaLabel: "View Action Plan",
          deadline,
        },
      });
    }
  }
  return { ok: true, actionPlanId: plan.id, holdId: hold.id };
}

export async function completeActionPlan(input: {
  actionPlanId: string;
  completedBy: string;
}): Promise<{ ok: true; holdReleased: boolean } | { ok: false; reason: string }> {
  const plan = await db.qcActionPlan.findUnique({ where: { id: input.actionPlanId } });
  if (!plan) return { ok: false, reason: "Action plan not found." };
  if (plan.status === "COMPLETED") return { ok: false, reason: "Already completed." };

  await db.qcActionPlan.update({
    where: { id: input.actionPlanId },
    data: { status: "COMPLETED", completedAt: new Date(), completedBy: input.completedBy },
  });

  // Inspector or buyer must verify before hold release (simulated — auto-release on completion for demo)
  // In production: requires separate verification click
  await db.qcActionPlan.update({
    where: { id: input.actionPlanId },
    data: { verifiedBy: input.completedBy, verifiedAt: new Date(), holdReleasedAt: new Date() },
  });

  // Release the hold
  await db.shipmentHold.updateMany({
    where: { actionPlanId: input.actionPlanId, released: false },
    data: { released: true, releasedAt: new Date(), releasedBy: input.completedBy },
  });

  return { ok: true, holdReleased: true };
}

// ============ 3B.6.4.3: Reinspection Request ============
export async function requestReinspection(input: {
  ustn: string;
  originalInspectionId: string;
  requestedByGtid: string;
  reason: string;
  sameProvider: boolean;
  newQcProviderGtid?: string;
  evidenceNote?: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; reason: string }> {
  const reqId = `REINSP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const req = await db.reInspectionRequest.create({
    data: {
      requestId: reqId,
      originalInspectionId: input.originalInspectionId,
      ustn: input.ustn,
      requestedByGtid: input.requestedByGtid,
      reason: input.reason,
      sameProvider: input.sameProvider,
      newQcProviderGtid: input.newQcProviderGtid || null,
      evidenceNote: input.evidenceNote || null,
      status: "REQUESTED",
      feeUsd: 350,
    },
  });
  // Notify QC provider
  const targetQc = input.newQcProviderGtid || (await db.qcInspection.findUnique({ where: { id: input.originalInspectionId } }))?.qcGtid;
  if (targetQc) {
    await db.inboxItem.create({
      data: {
        tenantGtid: targetQc, tradeId: null,
        category: "NEEDS_APPROVAL", priority: 85,
        title: `Reinspection request ${reqId}`,
        description: `${input.sameProvider ? "Same provider" : "New provider"} reinspection requested. Reason: ${input.reason}`,
        ctaLabel: "Accept Reinspection",
      },
    });
  }
  return { ok: true, requestId: reqId };
}

export async function acceptReinspection(input: {
  requestId: string;
  qcProviderGtid: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const req = await db.reInspectionRequest.findUnique({ where: { id: input.requestId } });
  if (!req) return { ok: false, reason: "Request not found." };
  if (req.status !== "REQUESTED") return { ok: false, reason: `Request is ${req.status}.` };

  await db.reInspectionRequest.update({
    where: { id: input.requestId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  // Notify requester
  await db.inboxItem.create({
    data: {
      tenantGtid: req.requestedByGtid, tradeId: null,
      category: "NEW_OFFER", priority: 80,
      title: `Reinspection accepted — ${req.requestId}`,
      description: `QC provider accepted. Second inspection will be scheduled. Fee: $${350}.`,
      ctaLabel: "View Details",
    },
  });
  return { ok: true };
}

// ============ 3B.6.2: Container Release Pre-Advice ============
export async function sendContainerReleasePreadvice(input: {
  shipmentId: string;
  terminalCode?: string;
}): Promise<{ ok: true; releaseToken: string; webhookStatus: string } | { ok: false; reason: string }> {
  const shipment = await db.shipment.findUnique({ where: { id: input.shipmentId } });
  if (!shipment) return { ok: false, reason: "Shipment not found." };
  if (!shipment.containerNo) return { ok: false, reason: "Shipment has no container number." };

  // Estimate gate-in time (24h before ETA by default)
  const eta = shipment.eta || new Date(Date.now() + 7 * 86400 * 1000);
  const estimatedGateIn = new Date(eta.getTime() - 24 * 3600 * 1000);
  const validUntil = new Date(estimatedGateIn.getTime() + 30 * 60000); // valid 30 min after gate-in

  const releaseToken = `REL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}`;

  // Send webhook (simulated — in production this calls terminal API)
  const webhookPayload = {
    event: "RELEASE_PREADVICE",
    ustn: shipment.ustn,
    container: shipment.containerNo,
    estimated_gate_in: estimatedGateIn.toISOString(),
    release_token: releaseToken,
    valid_until: validUntil.toISOString(),
  };

  const preadvice = await db.containerReleasePreadvice.create({
    data: {
      shipmentId: input.shipmentId,
      ustn: shipment.ustn,
      containerNo: shipment.containerNo,
      releaseToken,
      estimatedGateIn,
      validUntil,
      terminalCode: input.terminalCode || null,
      webhookStatus: "ACKED",
      webhookResponse: "ACK",
    },
  });

  return { ok: true, releaseToken, webhookStatus: preadvice.webhookStatus };
}

// ============ 3B.6.5: Customs Declaration Submission ============
export async function submitCustomsDeclaration(input: {
  declarationId: string; // existing CustomsDeclaration.id
  brokerGtid: string;
}): Promise<{ ok: true; nafezaStatus: string } | { ok: false; reason: string }> {
  const decl = await db.customsDeclaration.findUnique({ where: { id: input.declarationId }, include: { trade: true } });
  if (!decl) return { ok: false, reason: "Declaration not found." };
  if (decl.brokerGtid !== input.brokerGtid) return { ok: false, reason: "Not the assigned broker." };

  // Simulate Nafeza API call
  const nafezaStatus = "ACCEPTED";
  await db.customsDeclaration.update({
    where: { id: input.declarationId },
    data: {
      status: "CLEARED",
      nafezaStatus,
      clearedAt: new Date(),
    },
  });

  // Record milestone
  await db.milestone.create({
    data: {
      shipmentId: (await db.shipment.findFirst({ where: { tradeId: decl.tradeId } }))?.id || "",
      ustn: decl.trade?.ustn || "",
      sequence: 6,
      type: "CUSTOMS_CLEARED",
      label: `Customs cleared (${decl.regime}) — Nafeza ${nafezaStatus}`,
      status: "AUTO_CONFIRMED",
      actorGtid: input.brokerGtid,
      confirmedAt: new Date(),
      autoConfirmed: true,
      sensorData: JSON.stringify({ declaration_no: decl.declarationNo, nafeza_status: nafezaStatus }),
    },
  });

  // Notify trade parties
  if (decl.trade) {
    for (const gtid of [decl.trade.buyerGtid, decl.trade.sellerGtid]) {
      await db.inboxItem.create({
        data: {
          tenantGtid: gtid, tradeId: decl.tradeId,
          category: "NEW_OFFER", priority: 78,
          title: `Customs cleared — ${decl.declarationNo}`,
          description: `${decl.regime} declaration accepted by Nafeza. Container ready for next milestone.`,
          ctaLabel: "View Status",
        },
      });
    }
  }
  return { ok: true, nafezaStatus };
}

// ============ 3B.6.6: Cold-Chain Monitoring ============
export async function recordColdChainAlert(input: {
  shipmentId: string;
  excursionTemp: number;
  durationMin: number;
  originalShelfLifeDays: number;
  aiNarrative: string;
}): Promise<{ ok: true; alertId: string; predictedShelfLifeDays: number; severity: string }> {
  // LSTM-style prediction: shelf life reduction based on excursion magnitude & duration
  const targetTemp = -18; // standard frozen
  const deviation = Math.abs(input.excursionTemp - targetTemp);
  // Each degree of deviation for `duration` minutes reduces shelf life proportionally
  const reductionDays = Math.ceil((deviation * input.durationMin) / 60 * 0.3);
  const predictedShelfLifeDays = Math.max(1, input.originalShelfLifeDays - reductionDays);

  let severity = "INFO";
  if (deviation > 5 || reductionDays >= 3) severity = "CRITICAL";
  else if (deviation > 2 || reductionDays >= 1) severity = "WARNING";

  const alert = await db.coldChainAlert.create({
    data: {
      shipmentId: input.shipmentId,
      ustn: (await db.shipment.findUnique({ where: { id: input.shipmentId } }))?.ustn || "",
      containerNo: (await db.shipment.findUnique({ where: { id: input.shipmentId } }))?.containerNo || "",
      excursionTemp: input.excursionTemp,
      durationMin: input.durationMin,
      originalShelfLifeDays: input.originalShelfLifeDays,
      predictedShelfLifeDays,
      severity,
      aiNarrative: input.aiNarrative,
    },
  });

  // Smart Inbox alert to all parties (priority 65 per spec)
  const shipment = await db.shipment.findUnique({ where: { id: input.shipmentId }, include: { trade: true } });
  if (shipment) {
    for (const gtid of [shipment.trade.buyerGtid, shipment.trade.sellerGtid]) {
      await db.inboxItem.create({
        data: {
          tenantGtid: gtid, tradeId: shipment.tradeId,
          category: "SHIPMENT_ALERT", priority: 65,
          title: `Cold-chain excursion — ${shipment.containerNo} (${severity})`,
          description: input.aiNarrative,
          ctaLabel: severity === "CRITICAL" ? "Accelerate Customs" : "View Details",
        },
      });
    }
  }

  return { ok: true, alertId: alert.id, predictedShelfLifeDays, severity };
}

// ============ 3B.6.7: Delivery Confirmation ============
export async function confirmDelivery(input: {
  shipmentId: string;
  buyerGtid: string;
  voiceTranscript?: string;
  biometricVerified?: boolean;
}): Promise<{ ok: true; milestoneId: string; settlementTriggered: boolean } | { ok: false; reason: string; code?: string }> {
  const shipment = await db.shipment.findUnique({
    where: { id: input.shipmentId },
    include: { trade: true },
  });
  if (!shipment) return { ok: false, code: "NOT_FOUND", reason: "Shipment not found." };

  // Governor validation: buyer must be the trade's buyer
  if (shipment.trade.buyerGtid !== input.buyerGtid) {
    return { ok: false, code: "NOT_BUYER", reason: "Only the buyer can confirm delivery." };
  }

  // Fetch holds separately
  const holds = await db.shipmentHold.findMany({ where: { shipmentId: input.shipmentId, released: false } });

  // Check all prior milestones confirmed
  const milestones = await db.milestone.findMany({ where: { shipmentId: input.shipmentId }, orderBy: { sequence: "asc" } });
  const requiredPrior = ["CONTAINER_LOADED", "DEPARTED", "ARRIVED"];
  for (const req of requiredPrior) {
    const found = milestones.find(m => m.type === req && (m.status === "CONFIRMED" || m.status === "AUTO_CONFIRMED"));
    if (!found) {
      return { ok: false, code: "PRIOR_PENDING", reason: `Cannot confirm delivery — milestone "${MILESTONE_LABELS[req]}" is not yet confirmed.` };
    }
  }

  // Check holds — blocksDelivery holds block delivery; blocksSettlement holds allow delivery but block settlement
  const blockingHolds = holds.filter(h => h.blocksDelivery);
  if (blockingHolds.length > 0) {
    return {
      ok: false, code: "HOLD_ACTIVE",
      reason: `Conditional QC hold active — action plan not yet completed. Please verify remediation before confirming delivery. Holds: ${blockingHolds.map(h => h.reason).join("; ")}`,
    };
  }

  // Confirm delivery
  const milestone = await db.milestone.create({
    data: {
      shipmentId: input.shipmentId,
      ustn: shipment.ustn,
      sequence: 8,
      type: "DELIVERED",
      label: "Buyer confirmed delivery",
      status: input.biometricVerified ? "AUTO_CONFIRMED" : "CONFIRMED",
      actorGtid: input.buyerGtid,
      confirmedAt: new Date(),
      autoConfirmed: !!input.biometricVerified,
      voiceTranscript: input.voiceTranscript || null,
      biometricVerified: !!input.biometricVerified,
    },
  });

  // Update shipment status
  await db.shipment.update({ where: { id: input.shipmentId }, data: { status: "DELIVERED", arrivedAt: shipment.arrivedAt || new Date() } });

  // Check if any holds block settlement
  const settlementHolds = holds.filter(h => h.blocksSettlement);
  const settlementTriggered = settlementHolds.length === 0;

  // Notify seller
  await db.inboxItem.create({
    data: {
      tenantGtid: shipment.trade.sellerGtid, tradeId: shipment.tradeId,
      category: "NEW_OFFER", priority: 95,
      title: `Delivery confirmed — ${shipment.ustn.slice(0, 28)}…`,
      description: settlementTriggered
        ? `Buyer confirmed delivery. Settlement instruction generation triggered (Phase 6).`
        : `Buyer confirmed delivery, but settlement is blocked by ${settlementHolds.length} hold(s). Resolve action plans to release.`,
      ctaLabel: settlementTriggered ? "View Settlement" : "Resolve Holds",
    },
  });

  return { ok: true, milestoneId: milestone.id, settlementTriggered };
}

// ============ 3B.6.8: Stuck Trade Recovery ============
export async function checkStuckTrades(): Promise<{ checked: number; escalated: number; newAlerts: any[] }> {
  // Find all PENDING milestones with SLA deadlines
  const pendingMilestones = await db.milestone.findMany({
    where: {
      status: "PENDING",
      slaDeadline: { not: null, lt: new Date() },
    },
    include: { shipment: { include: { trade: true } } },
  });

  const newAlerts: any[] = [];
  for (const m of pendingMilestones) {
    if (!m.slaDeadline || !m.shipment) continue;
    const hoursOverdue = Math.floor((Date.now() - m.slaDeadline.getTime()) / 3600000);

    let escalationLevel = "LEVEL_1";
    if (hoursOverdue >= SLA_LEVEL_3_HOURS) escalationLevel = "LEVEL_3";
    else if (hoursOverdue >= SLA_LEVEL_2_HOURS) escalationLevel = "LEVEL_2";

    // Check if alert already exists
    const existing = await db.stuckTradeAlert.findFirst({
      where: { shipmentId: m.shipmentId, milestoneType: m.type },
    });

    if (existing) {
      // Update escalation level if increased
      if (existing.escalationLevel !== escalationLevel) {
        await db.stuckTradeAlert.update({
          where: { id: existing.id },
          data: { escalationLevel, hoursOverdue },
        });
        // Notify based on new level
        await notifyStuckTrade(m, escalationLevel, hoursOverdue);
      }
    } else {
      const alert = await db.stuckTradeAlert.create({
        data: {
          shipmentId: m.shipmentId,
          ustn: m.ustn,
          milestoneType: m.type,
          slaDeadline: m.slaDeadline,
          hoursOverdue,
          escalationLevel,
          responsibleGtid: m.shipment.trade?.sellerGtid || null,
          notifiedParties: JSON.stringify([m.shipment.trade?.buyerGtid, m.shipment.trade?.sellerGtid].filter(Boolean)),
        },
      });
      newAlerts.push(alert);
      await notifyStuckTrade(m, escalationLevel, hoursOverdue);
    }
  }

  return { checked: pendingMilestones.length, escalated: newAlerts.length, newAlerts };
}

async function notifyStuckTrade(milestone: any, level: string, hoursOverdue: number) {
  const trade = milestone.shipment?.trade;
  if (!trade) return;
  const parties = [trade.buyerGtid, trade.sellerGtid].filter(Boolean);
  let priority = 70;
  let title = `Stuck trade reminder — ${milestone.type} ${hoursOverdue}h overdue`;
  let desc = `Milestone "${MILESTONE_LABELS[milestone.type] || milestone.type}" is ${hoursOverdue}h past SLA.`;
  if (level === "LEVEL_2") {
    priority = 85;
    title = `Stuck trade alert — ${hoursOverdue}h overdue`;
    desc += ` All parties notified. Admin Portal alerted.`;
  } else if (level === "LEVEL_3") {
    priority = 95;
    title = `Stuck trade escalated to human mediator`;
    desc += ` Escalated to A3 human mediator. Support ticket created.`;
  }
  for (const gtid of parties) {
    await db.inboxItem.create({
      data: {
        tenantGtid: gtid, tradeId: trade.id,
        category: "SHIPMENT_ALERT", priority,
        title, description: desc,
        ctaLabel: "Escalate",
      },
    });
  }
}

// ============ 3B.6.1: Pre-Execution — Document Requirements Check ============
export async function checkDocumentRequirements(ustn: string): Promise<{
  allSatisfied: boolean;
  required: { type: string; status: string; mandatory: boolean }[];
  blockingCount: number;
}> {
  const trade = await db.trade.findUnique({ where: { ustn }, include: { documents: true } });
  if (!trade) return { allSatisfied: false, required: [], blockingCount: 0 };

  // RIA-driven checklist based on commodity + jurisdictions
  const required: { type: string; status: string; mandatory: boolean }[] = [];
  const addReq = (type: string, mandatory: boolean) => {
    const doc = trade.documents.find(d => d.type === type);
    required.push({ type, status: doc?.status || "MISSING", mandatory });
  };

  addReq("COMMERCIAL_INVOICE", true);
  addReq("PACKING_LIST", true);
  addReq("BILL_LADING", true);
  if (trade.originCountry === "EG" || trade.destCountry === "EG") addReq("CUSTOMS_DECL", true);
  if (trade.commodityHs?.startsWith("08")) { // fresh/frozen fruit
    addReq("PHYTO", true);
    addReq("HEALTH_CERT", true);
  }
  addReq("CERTIFICATE_ORIGIN", false);
  addReq("QC_REPORT", false);

  const blockingCount = required.filter(r => r.mandatory && !["VERIFIED", "UPLOADED"].includes(r.status)).length;
  return { allSatisfied: blockingCount === 0, required, blockingCount };
}

// ============ Helpers ============
export function generateReleaseToken(): string {
  const d = new Date();
  return `REL-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function generateReinspectionId(): string {
  const d = new Date();
  return `REINSP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 900 + 100)}`;
}
