"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// PORTAL BUNDLE — single lazy chunk containing all 24 portal experiences.
// ═══════════════════════════════════════════════════════════════════════════════
// Instead of 24 separate dynamic imports (which spikes compile memory),
// this file statically imports all 12 dashboards + 12 workflows into ONE chunk.
// The launcher dynamically imports THIS file — a single chunk load — and pulls
// the component it needs from the registry by portal number + mode.

import type { ComponentType } from "react";
import { BuyerPortalDashboard } from "../landing/portal-dashboard-buyer";
import { BuyerPortalWorkflow } from "../landing/portal-workflow-buyer";
import { SellerPortalDashboard } from "../landing/portal-dashboard-seller";
import { SellerPortalWorkflow } from "../landing/portal-workflow-seller";
import { LspPortalDashboard } from "../landing/portal-dashboard-lsp";
import { LspPortalWorkflow } from "../landing/portal-workflow-lsp";
import { ShipPortalDashboard } from "../landing/portal-dashboard-ship";
import { ShipPortalWorkflow } from "../landing/portal-workflow-ship";
import { LabPortalDashboard } from "../landing/portal-dashboard-lab";
import { LabPortalWorkflow } from "../landing/portal-workflow-lab";
import { QcPortalDashboard } from "../landing/portal-dashboard-qc";
import { QcPortalWorkflow } from "../landing/portal-workflow-qc";
import { CbrPortalDashboard } from "../landing/portal-dashboard-cbr";
import { CbrPortalWorkflow } from "../landing/portal-workflow-cbr";
import { FinPortalDashboard } from "../landing/portal-dashboard-fin";
import { FinPortalWorkflow } from "../landing/portal-workflow-fin";
import { PfiPortalDashboard } from "../landing/portal-dashboard-pfi";
import { PfiPortalWorkflow } from "../landing/portal-workflow-pfi";
import { GovPortalDashboard } from "../landing/portal-dashboard-gov";
import { GovPortalWorkflow } from "../landing/portal-workflow-gov";
import { AdmPortalDashboard } from "../landing/portal-dashboard-adm";
import { AdmPortalWorkflow } from "../landing/portal-workflow-adm";
import { MpPortalDashboard } from "../landing/portal-dashboard-mp";
import { MpPortalWorkflow } from "../landing/portal-workflow-mp";

export interface PortalBundleEntry {
  dashboard: ComponentType;
  workflow: ComponentType;
}

export const PORTAL_BUNDLE: Record<number, PortalBundleEntry> = {
  1:  { dashboard: BuyerPortalDashboard,  workflow: BuyerPortalWorkflow },
  2:  { dashboard: SellerPortalDashboard, workflow: SellerPortalWorkflow },
  3:  { dashboard: LspPortalDashboard,    workflow: LspPortalWorkflow },
  4:  { dashboard: ShipPortalDashboard,   workflow: ShipPortalWorkflow },
  5:  { dashboard: LabPortalDashboard,     workflow: LabPortalWorkflow },
  6:  { dashboard: QcPortalDashboard,      workflow: QcPortalWorkflow },
  7:  { dashboard: CbrPortalDashboard,     workflow: CbrPortalWorkflow },
  8:  { dashboard: FinPortalDashboard,     workflow: FinPortalWorkflow },
  9:  { dashboard: PfiPortalDashboard,      workflow: PfiPortalWorkflow },
  10: { dashboard: GovPortalDashboard,     workflow: GovPortalWorkflow },
  11: { dashboard: AdmPortalDashboard,     workflow: AdmPortalWorkflow },
  12: { dashboard: MpPortalDashboard,      workflow: MpPortalWorkflow },
};

export default PORTAL_BUNDLE;
