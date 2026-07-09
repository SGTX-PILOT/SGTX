// SGTX Country-Specific Customs Milestones for Execution Phase
// Generates the full milestone list for a trade lane.

export interface CustomsMilestone {
  milestone: string;
  name: string;
  country: string;
  phase: "PRE_LOADING" | "IN_TRANSIT" | "PRE_ARRIVAL" | "CLEARANCE" | "POST_CLEARANCE";
  mandatory: boolean;
  estimatedDurationHours: number;
  authority: string;
}

export interface CustomsMilestoneResult {
  ustn: string;
  originCountry: string;
  destCountry: string;
  milestones: CustomsMilestone[];
}

interface MilestoneInput {
  originCountry: string;
  destCountry: string;
  transportMode: string;
  hsCode: string;
}

export function getCustomsMilestones(input: MilestoneInput): CustomsMilestoneResult {
  const origin = (input.originCountry || "").toUpperCase();
  const dest = (input.destCountry || "").toUpperCase();
  const transport = (input.transportMode || "SEA").toUpperCase();
  const milestones: CustomsMilestone[] = [];

  // PRE_LOADING (origin country)
  if (origin === "EG") {
    milestones.push({ milestone: "EG_ACID_ISSUED", name: "ACID Issued by Nafeza", country: "EG", phase: "PRE_LOADING", mandatory: true, estimatedDurationHours: 2, authority: "Nafeza" });
  }
  milestones.push({ milestone: "ORIGIN_CUSTOMS_EXPORT", name: "Export Customs Clearance", country: origin, phase: "PRE_LOADING", mandatory: true, estimatedDurationHours: 4, authority: `${origin} Customs` });
  milestones.push({ milestone: "VESSEL_LOADING", name: "Vessel Loading Confirmed", country: origin, phase: "PRE_LOADING", mandatory: true, estimatedDurationHours: 6, authority: "Terminal Operator" });

  // PRE_LOADING (dest — pre-arrival filings)
  const euCountries = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "FI", "DK", "IE", "PT", "GR", "CZ", "RO", "BG", "HR", "SK", "LT", "SI", "LV", "EE", "LU", "MT", "CY", "HU"];
  if (euCountries.includes(dest)) {
    milestones.push({ milestone: "EU_ENS_FILED", name: "ENS Filed (ICS2)", country: dest, phase: "PRE_LOADING", mandatory: true, estimatedDurationHours: 1, authority: "EU ICS2" });
  }
  if (dest === "US" && transport === "SEA") {
    milestones.push({ milestone: "US_ISF_FILED", name: "ISF 10+2 Filed", country: "US", phase: "PRE_LOADING", mandatory: true, estimatedDurationHours: 1, authority: "CBP" });
  }
  if (dest === "CN") {
    milestones.push({ milestone: "CN_PRE_DECL_FILED", name: "China Single Window Pre-Declaration", country: "CN", phase: "PRE_LOADING", mandatory: true, estimatedDurationHours: 2, authority: "GACC" });
  }

  // IN_TRANSIT
  milestones.push({ milestone: "DEPARTURE", name: "Vessel Departed", country: origin, phase: "IN_TRANSIT", mandatory: true, estimatedDurationHours: 0, authority: "Carrier" });
  milestones.push({ milestone: "IN_TRANSIT", name: "In Transit", country: "—", phase: "IN_TRANSIT", mandatory: true, estimatedDurationHours: 336, authority: "Carrier" });

  // PRE_ARRIVAL
  milestones.push({ milestone: "ARRIVAL_NOTICE", name: "Arrival Notice Issued", country: dest, phase: "PRE_ARRIVAL", mandatory: true, estimatedDurationHours: 24, authority: "Carrier" });

  // CLEARANCE
  milestones.push({ milestone: "DEST_CUSTOMS_DECLARATION", name: "Customs Declaration Filed", country: dest, phase: "CLEARANCE", mandatory: true, estimatedDurationHours: 4, authority: `${dest} Customs` });

  if (euCountries.includes(dest)) {
    const chapter = parseInt((input.hsCode || "").substring(0, 2), 10);
    if ([72, 73, 76, 25, 28, 31].includes(chapter)) {
      milestones.push({ milestone: "EU_CBAM_REPORT", name: "CBAM Emissions Report", country: dest, phase: "CLEARANCE", mandatory: true, estimatedDurationHours: 2, authority: "European Commission" });
    }
  }

  if (dest === "US") {
    const chapter = parseInt((input.hsCode || "").substring(0, 2), 10);
    if (chapter >= 1 && chapter <= 23) {
      milestones.push({ milestone: "US_FDA_PRIOR_NOTICE", name: "FDA Prior Notice Confirmed", country: "US", phase: "CLEARANCE", mandatory: true, estimatedDurationHours: 2, authority: "FDA" });
    }
  }

  milestones.push({ milestone: "CUSTOMS_RELEASED", name: "Customs Released", country: dest, phase: "CLEARANCE", mandatory: true, estimatedDurationHours: 12, authority: `${dest} Customs` });

  // POST_CLEARANCE
  milestones.push({ milestone: "DELIVERY_ORDER", name: "Delivery Order Issued", country: dest, phase: "POST_CLEARANCE", mandatory: true, estimatedDurationHours: 2, authority: "Carrier" });
  milestones.push({ milestone: "CARGO_DELIVERED", name: "Cargo Delivered to Consignee", country: dest, phase: "POST_CLEARANCE", mandatory: true, estimatedDurationHours: 8, authority: "LSP" });

  return {
    ustn: "",
    originCountry: origin,
    destCountry: dest,
    milestones,
  };
}
