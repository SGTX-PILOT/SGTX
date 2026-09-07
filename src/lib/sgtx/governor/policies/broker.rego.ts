// @ts-nocheck
// =============================================================================
// broker.rego — TS simulation (v17 Section 3.5 — OPA Rego #7)
// -----------------------------------------------------------------------------
// Broker policy: Customs Broker Liability (CBR), declaration validation,
// broker licence status, service-fee bounds.
//
// Original Rego:
//   package sgtx.broker
//   default allow = false
//   allow {
//     input.quotation_accepted == true
//     input.physical_handling_ready == true
//     input.broker_gtid != ""
//     input.service_fee > 0
//   }
//   deny[msg] { input.quotation_accepted == false; msg := "Service quotation must be accepted before broker engagement" }
//
// v17 §10 — CBR (Customs Broker Liability):
//   • A broker's GTID is bound to every customs declaration they submit.
//   • The broker carries joint & several liability for the declaration
//     (with the importer of record) for 5 years (Egypt Customs Law).
//   • Broker licence must be ACTIVE and not suspended/revoked.
//   • A suspended broker's in-flight declarations are paused pending
//     re-licensing; new declarations are DENIED.
//
// Service-fee bounds (v17 §10):
//   • Broker service fee must be > 0 and within a transparent range.
//   • No kickbacks, no referral fees, no volume-based commission paid by SGTX.
// =============================================================================

import type { PolicyInput, PolicyResult } from "./types";

const BROKER_LICENCE_VALID_STATES = new Set(["ACTIVE", "PROVISIONAL"]);
const MAX_BROKER_SERVICE_FEE_USD = 2500; // transparency ceiling per declaration
const CBR_LIABILITY_YEARS = 5;

export function evaluate(input: PolicyInput): PolicyResult {
  // 1) Broker GTID mandatory
  if (!input.broker_gtid) {
    return {
      allow: false,
      deny_reason: "A broker GTID is required for broker engagement.",
      conditions: [
        {
          condition_id: "no_broker_gtid",
          label: "Broker engagement requires a broker GTID — select an onboarded broker.",
          status: "unmet",
          action_url: "/brokers",
        },
      ],
    };
  }

  // 2) Broker licence status
  if (input.broker_licence_status && !BROKER_LICENCE_VALID_STATES.has(input.broker_licence_status)) {
    return {
      allow: false,
      deny_reason: `Broker ${input.broker_gtid} licence is "${input.broker_licence_status}".`,
      conditions: [
        {
          condition_id: "broker_licence_invalid",
          label: `Broker ${input.broker_gtid} licence is "${input.broker_licence_status}" — only ACTIVE or PROVISIONAL brokers may submit declarations. In-flight declarations are paused pending re-licensing.`,
          status: "unmet",
          action_url: "/compliance/brokers",
        },
      ],
    };
  }

  // 3) Quotation accepted
  if (input.action === "broker.declaration.submit" && input.quotation_accepted === false) {
    return {
      allow: false,
      deny_reason: "Broker service quotation must be accepted before declaration submission.",
      conditions: [
        {
          condition_id: "quotation_not_accepted",
          label: "The broker service quotation must be accepted before a customs declaration can be submitted.",
          status: "unmet",
          action_url: "/brokers/quote",
        },
      ],
    };
  }

  // 4) Physical handling ready
  if (input.action === "broker.declaration.submit" && input.physical_handling_ready === false) {
    return {
      allow: false,
      deny_reason: "Physical handling prerequisites not ready.",
      conditions: [
        {
          condition_id: "physical_handling_not_ready",
          label: "Physical handling prerequisites (loading, packing list, container seal) must be ready before declaration submission.",
          status: "unmet",
        },
      ],
    };
  }

  // 5) Service-fee bounds
  if (typeof input.service_fee === "number") {
    if (input.service_fee <= 0) {
      return {
        allow: false,
        deny_reason: "Broker service fee must be greater than zero.",
        conditions: [
          {
            condition_id: "zero_service_fee",
            label: "Broker service fee must be > 0 — zero-fee arrangements are not permitted (anti-evasion).",
            status: "unmet",
          },
        ],
      };
    }
    if (input.service_fee > MAX_BROKER_SERVICE_FEE_USD) {
      return {
        allow: false,
        deny_reason: `Broker service fee ${input.service_fee} exceeds the ${MAX_BROKER_SERVICE_FEE_USD} USD transparency ceiling.`,
        conditions: [
          {
            condition_id: "service_fee_too_high",
            label: `Broker service fee ${input.service_fee} USD exceeds the ${MAX_BROKER_SERVICE_FEE_USD} USD transparency ceiling per declaration.`,
            status: "unmet",
          },
        ],
      };
    }
  }

  // 6) CBR liability — broker must have acknowledged the joint-and-several
  //    liability for the declaration (5 years under Egypt Customs Law).
  if (input.action === "broker.declaration.submit" && input.cbr_liability_acknowledged === false) {
    return {
      allow: false,
      deny_reason: "Broker must acknowledge the 5-year joint & several liability (CBR).",
      conditions: [
        {
          condition_id: "cbr_liability_not_acknowledged",
          label: `Broker ${input.broker_gtid} must acknowledge the 5-year joint & several liability (CBR §10) before submitting a customs declaration.`,
          status: "unmet",
          action_url: "/brokers/cbr",
        },
      ],
    };
  }

  // 7) Declaration validation — HS code + value + origin must be present
  if (input.action === "broker.declaration.submit") {
    const missing: string[] = [];
    if (!input.declaration_hs_code) missing.push("HS code");
    if (typeof input.declaration_value !== "number" || input.declaration_value <= 0) missing.push("declared value");
    if (!input.declaration_origin_country) missing.push("origin country");
    if (missing.length > 0) {
      return {
        allow: false,
        deny_reason: `Declaration missing required fields: ${missing.join(", ")}.`,
        conditions: [
          {
            condition_id: "declaration_fields_missing",
            label: `Customs declaration is missing required fields: ${missing.join(", ")}.`,
            status: "unmet",
          },
        ],
      };
    }
  }

  return {
    allow: true,
    conditions: [
      {
        condition_id: "cbr_liability_period",
        label: `Broker ${input.broker_gtid} carries joint & several liability for this declaration for ${CBR_LIABILITY_YEARS} years (Egypt Customs Law).`,
        status: "met",
      },
    ],
  };
}
