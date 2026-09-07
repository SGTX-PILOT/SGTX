// @ts-nocheck
// =============================================================================
// Shared types for the 7 OPA Rego policy TS simulations (v17 §3.5)
// =============================================================================

export interface PolicyCondition {
  condition_id: string;
  label: string;
  status: "met" | "unmet";
  action_url?: string;
}

export interface PolicyResult {
  allow: boolean;
  deny_reason?: string;
  conditions?: PolicyCondition[];
}

// ──────────────────────────────────────────────────────────────────────────
// PolicyInput — superset of all fields any of the 7 policies may consume.
// Each policy only reads the fields it cares about; absent fields are
// treated as "not provided" (i.e. skipped).
// ──────────────────────────────────────────────────────────────────────────
export interface PolicyInput {
  // Common
  action?: string;
  actor_role?: string;
  actor_trader_mode?: "BUY" | "SELL" | "DUAL";
  actor_gtid?: string;
  resource_ustn?: string;
  readiness_score?: number;

  // permissions.rego
  resource_already_signed_by_buyer?: boolean;
  resource_already_signed_by_seller?: boolean;

  // fee.rego
  fee_rate?: number;
  fee_amount?: number;
  fee_payer?: string;
  trade_value?: number;
  feelock_current_state?: "PENDING" | "ACTIVE" | "PARTIALLY_RELEASED" | "DISPUTED" | "CANCELLED";
  feelock_target_state?: "PENDING" | "ACTIVE" | "PARTIALLY_RELEASED" | "DISPUTED" | "CANCELLED";

  // financing.rego
  financier_gtid?: string;
  buyer_financing_toggle?: boolean;
  requested_amount?: number;
  co_financing_sum?: number;
  accepted_bids?: Array<{
    financier_gtid?: string;
    apr?: number;
    tenure_days?: number;
    amount?: number;
  }>;
  trade_tenor_days?: number;

  // distressed.rego
  is_distressed?: boolean;
  dest_country?: string;
  jurisdiction_tier?: "FULL" | "STANDARD" | "LIMITED" | "RESTRICTED" | "BLOCKED";
  privacy_notice_acknowledged?: boolean;
  price_deviation?: number;
  condition_score?: number;
  remaining_shelf_days?: number;

  // multiship.rego
  shipments?: Array<{
    shipment_id: string;
    ustn?: string;
    locked?: boolean;
    feelock_state?: string;
    fee_paid?: boolean;
    schedule_window_start?: string;
    schedule_window_end?: string;
    requested_change?: "add" | "remove" | "modify_date" | "modify_quantity";
  }>;

  // logistics.rego
  logistics_mode?: "A" | "B" | "C";
  incoterm?: string;
  provided_services?: string[];
  addendum_signed?: boolean;
  container_release_confirmed?: boolean;
  carrier_gtid?: string;
  carrier_set_by?: "buyer" | "seller";
  rfq_results?: Array<{
    carrier_gtid: string;
    price_usd: number;
    recommended?: boolean;
    preferred?: boolean;
    kickback_pct?: number;
  }>;

  // broker.rego
  broker_gtid?: string;
  broker_licence_status?: "ACTIVE" | "PROVISIONAL" | "SUSPENDED" | "REVOKED" | "EXPIRED";
  quotation_accepted?: boolean;
  physical_handling_ready?: boolean;
  service_fee?: number;
  cbr_liability_acknowledged?: boolean;
  declaration_hs_code?: string;
  declaration_value?: number;
  declaration_origin_country?: string;

  // Reserve (used by reserve.rego in the legacy policies.ts — kept for compat)
  reserve_ratio?: number;
  quarterly_attestation?: boolean;
}
