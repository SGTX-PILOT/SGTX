// SGTX Buyer Priority & Trade-Off Profile (CCL-004)
// =============================================================================
// Allows the buyer to prioritize across 6 trade axes. This is DECISION CONTEXT,
// not a recommendation engine. SGTX uses it to EXPLAIN trade-offs — never to
// automatically choose providers, routes, ports, or quotes.
//
// Blueprint Part 4 — Buyer Trade Request § "Priority & Trade-Off Profile"
// Non-marketplace: priorities never generate rankings or recommendations.

export type PriorityLevel = "CRITICAL" | "IMPORTANT" | "NORMAL";
export type ProfilePreset = "BALANCED" | "COST_FOCUSED" | "SPEED_FOCUSED" | "QUALITY_FOCUSED" | "RISK_AVERSE";

export const PRIORITY_AXES = [
  { key: "price", label: "Price", description: "Total commercial cost of the trade" },
  { key: "quality", label: "Quality", description: "Product grade, specification compliance, defect tolerance" },
  { key: "deliveryCertainty", label: "Delivery certainty", description: "Confidence the goods arrive on the promised date" },
  { key: "costCertainty", label: "Cost certainty", description: "Confidence the final price won't drift (surcharges, FX, hidden costs)" },
  { key: "scheduleCertainty", label: "Schedule certainty", description: "Confidence the sailing/transit schedule holds" },
  { key: "reliability", label: "Reliability", description: "Counterparty track record, dispute history, invoice accuracy" },
] as const;

export interface BuyerPriorityProfile {
  price: PriorityLevel;
  quality: PriorityLevel;
  deliveryCertainty: PriorityLevel;
  costCertainty: PriorityLevel;
  scheduleCertainty: PriorityLevel;
  reliability: PriorityLevel;
  profilePreset: ProfilePreset;
}

export const DEFAULT_PROFILE: BuyerPriorityProfile = {
  price: "NORMAL",
  quality: "NORMAL",
  deliveryCertainty: "NORMAL",
  costCertainty: "NORMAL",
  scheduleCertainty: "NORMAL",
  reliability: "NORMAL",
  profilePreset: "BALANCED",
};

// Preset profiles the buyer can apply with one click
export const PROFILE_PRESETS: Record<ProfilePreset, Partial<BuyerPriorityProfile>> = {
  BALANCED: {
    price: "NORMAL", quality: "NORMAL", deliveryCertainty: "NORMAL",
    costCertainty: "NORMAL", scheduleCertainty: "NORMAL", reliability: "NORMAL",
  },
  COST_FOCUSED: {
    price: "CRITICAL", costCertainty: "CRITICAL",
    quality: "IMPORTANT", deliveryCertainty: "NORMAL",
    scheduleCertainty: "NORMAL", reliability: "IMPORTANT",
  },
  SPEED_FOCUSED: {
    deliveryCertainty: "CRITICAL", scheduleCertainty: "CRITICAL",
    price: "IMPORTANT", quality: "NORMAL",
    costCertainty: "NORMAL", reliability: "IMPORTANT",
  },
  QUALITY_FOCUSED: {
    quality: "CRITICAL", reliability: "CRITICAL",
    price: "NORMAL", deliveryCertainty: "IMPORTANT",
    costCertainty: "NORMAL", scheduleCertainty: "NORMAL",
  },
  RISK_AVERSE: {
    reliability: "CRITICAL", costCertainty: "CRITICAL",
    deliveryCertainty: "IMPORTANT", scheduleCertainty: "IMPORTANT",
    price: "NORMAL", quality: "IMPORTANT",
  },
};

/**
 * Apply a preset to a profile. Returns a new profile with the preset's
 * values merged, and the preset name recorded.
 */
export function applyPreset(
  profile: BuyerPriorityProfile,
  preset: ProfilePreset
): BuyerPriorityProfile {
  const presetValues = PROFILE_PRESETS[preset];
  return {
    ...profile,
    ...presetValues,
    profilePreset: preset,
  } as BuyerPriorityProfile;
}

/**
 * Generate a trade-off explanation between two options, given the buyer's
 * priority profile. This is EXPLANATION ONLY — it never recommends which
 * option to choose.
 *
 * Example output:
 *   "Option B reduces estimated logistics cost by $510 but adds 2 days transit.
 *    Your trade marks delivery certainty as CRITICAL — this trade-off may affect
 *    your stated priority. The decision remains yours."
 */
export function explainTradeOff(
  profile: BuyerPriorityProfile,
  optionA: { label: string; costDelta?: number; transitDaysDelta?: number; scheduleRiskDelta?: number; costCertaintyDelta?: number },
  optionB: { label: string; costDelta?: number; transitDaysDelta?: number; scheduleRiskDelta?: number; costCertaintyDelta?: number }
): string {
  const parts: string[] = [];

  // Cost comparison
  if (optionA.costDelta != null && optionB.costDelta != null) {
    const diff = (optionB.costDelta ?? 0) - (optionA.costDelta ?? 0);
    if (diff < 0) {
      parts.push(`Option ${optionB.label} reduces estimated cost by $${Math.abs(diff).toLocaleString()}`);
    } else if (diff > 0) {
      parts.push(`Option ${optionB.label} increases estimated cost by $${diff.toLocaleString()}`);
    }
  }

  // Transit time comparison
  if (optionA.transitDaysDelta != null && optionB.transitDaysDelta != null) {
    const diff = (optionB.transitDaysDelta ?? 0) - (optionA.transitDaysDelta ?? 0);
    if (diff > 0) {
      parts.push(`adds ${diff} days transit`);
    } else if (diff < 0) {
      parts.push(`saves ${Math.abs(diff)} days transit`);
    }
  }

  // Schedule risk comparison
  if (optionB.scheduleRiskDelta != null && optionB.scheduleRiskDelta !== 0) {
    parts.push(`${optionB.scheduleRiskDelta > 0 ? "increases" : "reduces"} schedule risk`);
  }

  // Cost certainty comparison
  if (optionB.costCertaintyDelta != null && optionB.costCertaintyDelta !== 0) {
    parts.push(`${optionB.costCertaintyDelta > 0 ? "improves" : "reduces"} cost certainty`);
  }

  if (parts.length === 0) {
    return "No measurable trade-off detected between these options.";
  }

  // Check against buyer's stated priorities
  const affectedPriorities: string[] = [];
  if ((optionB.transitDaysDelta ?? 0) > 0 && profile.deliveryCertainty === "CRITICAL") {
    affectedPriorities.push("delivery certainty (marked CRITICAL)");
  }
  if ((optionB.transitDaysDelta ?? 0) > 0 && profile.scheduleCertainty === "CRITICAL") {
    affectedPriorities.push("schedule certainty (marked CRITICAL)");
  }
  if ((optionB.costDelta ?? 0) > 0 && profile.price === "CRITICAL") {
    affectedPriorities.push("price (marked CRITICAL)");
  }
  if ((optionB.costCertaintyDelta ?? 0) < 0 && profile.costCertainty === "CRITICAL") {
    affectedPriorities.push("cost certainty (marked CRITICAL)");
  }

  let explanation = parts.join(", ") + ".";
  if (affectedPriorities.length > 0) {
    explanation += ` Your trade marks ${affectedPriorities.join(", ")} as a priority — this trade-off may affect your stated priorities.`;
  }
  explanation += " This is explanation only. The decision remains yours.";

  return explanation;
}

/**
 * Validate a priority profile. Returns true if at least one axis is set
 * (not all NORMAL with BALANCED preset is valid as the default).
 */
export function isValidProfile(profile: BuyerPriorityProfile): boolean {
  return PRIORITY_AXES.every((axis) => {
    const val = (profile as any)[axis.key];
    return val === "CRITICAL" || val === "IMPORTANT" || val === "NORMAL";
  });
}

/**
 * Count how many axes are set above NORMAL (for display: "3 priorities set")
 */
export function countActivePriorities(profile: BuyerPriorityProfile): number {
  return PRIORITY_AXES.filter(
    (axis) => (profile as any)[axis.key] !== "NORMAL"
  ).length;
}
