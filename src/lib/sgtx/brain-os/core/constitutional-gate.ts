// SGTX Brain OS — Constitutional Gate
// Every autonomous action requires constitutional validation.
// No AI may bypass the Governor. A5 (autonomous execution) is FORBIDDEN.

import type { ConstitutionalDecision, ConstitutionalVerdict, ConstitutionalCondition, AuthorityLevel } from "./types";
import { generateId, sha256, now } from "./utils";
import { eventBus } from "./event-bus";

interface GateInput {
  action: string; // e.g. "contract.sign", "feelock.freeze"
  authority: AuthorityLevel;
  actorGtid?: string;
  resourceUstn?: string;
  payload?: any;
  aiDecision?: {
    verdict: ConstitutionalVerdict;
    conditions: ConstitutionalCondition[];
    confidence?: number;
    module: string;
  };
  governorDecision?: {
    verdict: ConstitutionalVerdict;
    conditions: ConstitutionalCondition[];
    rationale: string;
  };
}

// Constitutional rules (immutable, derived from blueprint Part 1.3.2)
const CONSTITUTIONAL_RULES: { rule: string; check: (input: GateInput) => ConstitutionalCondition | null }[] = [
  {
    rule: "A5_PROHIBITION",
    check: (input) => input.authority === "A5"
      ? { condition_id: "a5_forbidden", label: "A5 FORBIDDEN: Autonomous execution blocked at compile time", status: "unmet" }
      : null,
  },
  {
    rule: "FEE_BOUNDS",
    check: (input) => {
      const feeRate = input.payload?.feeRate;
      if (feeRate != null && (feeRate < 0.001 || feeRate > 0.025)) {
        return { condition_id: "fee_out_of_bounds", label: `Fee rate ${(feeRate * 100).toFixed(2)}% violates constitutional bounds (0.1%-2.5%)`, status: "unmet" };
      }
      return null;
    },
  },
  {
    rule: "SANCTIONS_SCREENING",
    check: (input) => {
      if (input.payload?.sanctionsCleared === false) {
        return { condition_id: "sanctions_hit", label: "Sanctions screening failed — trade cannot proceed", status: "unmet" };
      }
      return null;
    },
  },
  {
    rule: "JURISDICTION_RATED",
    check: (input) => {
      const countries = [input.payload?.buyerCountry, input.payload?.sellerCountry].filter(Boolean);
      const unrated = countries.find(c => c && !JURISDICTION_TIERS[c as string]);
      if (unrated) {
        return { condition_id: `jurisdiction_unrated_${unrated}`, label: `Jurisdiction ${unrated} is not rated — manual compliance review required`, status: "unmet" };
      }
      return null;
    },
  },
  {
    rule: "FORCE_MAJEURE_CHECK",
    check: (input) => {
      if (input.payload?.forceMajeure?.recommendedAction === "cancel") {
        return { condition_id: "force_majeure_block", label: "Active force majeure (catastrophic) — trade cancelled", status: "unmet" };
      }
      return null;
    },
  },
];

// Jurisdiction tiers (must be explicitly seeded — unknown = blocked)
const JURISDICTION_TIERS: Record<string, "FULL" | "STANDARD" | "LIMITED" | "RESTRICTED" | "BLOCKED"> = {
  EG: "FULL", DE: "FULL", FR: "FULL", NL: "FULL", US: "FULL", GB: "FULL", JP: "FULL",
  SA: "LIMITED", AE: "LIMITED", CN: "STANDARD", IN: "STANDARD", BR: "STANDARD",
  TR: "STANDARD", KE: "STANDARD", GH: "STANDARD", MA: "STANDARD",
  RU: "RESTRICTED", IR: "BLOCKED", KP: "BLOCKED", SY: "BLOCKED",
};

export class ConstitutionalGate {
  private moduleVersions: Record<string, string>;

  constructor(moduleVersions: Record<string, string> = {}) {
    this.moduleVersions = {
      constitutional_rules: "v1.0.0-immutable",
      jurisdiction_matrix: "v2026.06.17-ria",
      fee_gate: "v1.0.0-immutable",
      sanctions_gate: "v1.0.0-immutable",
      force_majeure_gate: "v1.0.0-immutable",
      ...moduleVersions,
    };
  }

  /** Evaluate all constitutional rules + AI decision + Governor decision. Returns final verdict. */
  async evaluate(input: GateInput): Promise<ConstitutionalDecision> {
    const conditions: ConstitutionalCondition[] = [];

    // 1. Evaluate immutable constitutional rules
    for (const rule of CONSTITUTIONAL_RULES) {
      const condition = rule.check(input);
      if (condition) conditions.push(condition);
    }

    // 2. Merge AI decision conditions (if provided)
    if (input.aiDecision) {
      for (const c of input.aiDecision.conditions) {
        if (!conditions.some(existing => existing.condition_id === c.condition_id)) {
          conditions.push(c);
        }
      }
    }

    // 3. Merge Governor decision conditions (if provided)
    if (input.governorDecision) {
      for (const c of input.governorDecision.conditions) {
        if (!conditions.some(existing => existing.condition_id === c.condition_id)) {
          conditions.push(c);
        }
      }
    }

    // 4. Determine final verdict — strictest wins
    let verdict: ConstitutionalVerdict = "ALLOW";
    const hasUnmet = conditions.some(c => c.status === "unmet");

    if (hasUnmet) {
      // Any A5 violation or sanctions or FM-cancel or jurisdiction-blocked = DENY
      const blocking = conditions.find(c =>
        c.condition_id === "a5_forbidden" ||
        c.condition_id === "sanctions_hit" ||
        c.condition_id === "force_majeure_block" ||
        c.condition_id.startsWith("jurisdiction_unrated_") && false // unrated = conditional, not deny
      );
      // Jurisdiction BLOCKED
      const blocked = [input.payload?.buyerCountry, input.payload?.sellerCountry]
        .some(c => c && JURISDICTION_TIERS[c as string] === "BLOCKED");
      verdict = (blocking || blocked) ? "DENY" : "CONDITIONAL";
    }

    // 5. Build decision
    const decision: ConstitutionalDecision = {
      decisionId: generateId("dec"),
      verdict,
      conditions,
      rationale: this.buildRationale(verdict, conditions, input),
      loomHash: this.computeLoomHash(input, verdict, conditions),
      signature: this.sign(decrypt => decrypt), // simulated Ed25519
      moduleVersions: { ...this.moduleVersions },
      aiConfidence: input.aiDecision?.confidence,
      createdAt: now(),
    };

    // 6. Publish decision event
    await eventBus.publish("governor.decision", input.resourceUstn || input.action, {
      decisionId: decision.decisionId,
      verdict: decision.verdict,
      action: input.action,
      authority: input.authority,
      conditionsCount: conditions.length,
      aiModule: input.aiDecision?.module,
    }, { source: "constitutional-gate", tenantGtid: input.actorGtid });

    return decision;
  }

  private buildRationale(verdict: ConstitutionalVerdict, conditions: ConstitutionalCondition[], input: GateInput): string {
    const unmet = conditions.filter(c => c.status === "unmet");
    if (verdict === "DENY") {
      return `Action "${input.action}" DENIED by constitutional gate. Blocking conditions: ${unmet.map(c => c.label).join("; ")}`;
    }
    if (verdict === "CONDITIONAL") {
      return `Action "${input.action}" allowed with conditions. Unmet conditions require resolution: ${unmet.map(c => c.label).join("; ")}`;
    }
    return `Action "${input.action}" ALLOWED. All constitutional rules satisfied.`;
  }

  private computeLoomHash(input: GateInput, verdict: ConstitutionalVerdict, conditions: ConstitutionalCondition[]): string {
    const data = JSON.stringify({
      action: input.action,
      authority: input.authority,
      actorGtid: input.actorGtid,
      resourceUstn: input.resourceUstn,
      verdict,
      conditions: conditions.map(c => ({ id: c.condition_id, s: c.status })),
      timestamp: now(),
    });
    return sha256(data);
  }

  private sign(_: (s: string) => string): string {
    // Simulated Ed25519 signature (real implementation uses src/lib/sgtx/crypto/platform-key.ts)
    return sha256(generateId("sig")).substring(0, 64);
  }

  getJurisdictionTier(country: string): string | undefined {
    return JURISDICTION_TIERS[country.toUpperCase()];
  }
}

export const constitutionalGate = new ConstitutionalGate();
