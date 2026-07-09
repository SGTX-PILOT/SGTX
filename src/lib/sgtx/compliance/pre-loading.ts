// SGTX Pre-Loading Requirements — Country-specific mandatory pre-loading filings
// Logic module. Real API wiring (Nafeza/CBP/GACC/FASAH) deferred.

export interface PreLoadingStep {
  step: string;
  name: string;
  country: string;
  mandatory: boolean;
  deadline: string;
  status: "REQUIRED" | "COMPLETED" | "WAIVED" | "NOT_APPLICABLE";
  filingReference?: string;
  authority: string;
}

export interface PreLoadingResult {
  ustn: string;
  originCountry: string;
  destCountry: string;
  transportMode: string;
  steps: PreLoadingStep[];
  allCompleted: boolean;
  blockingSteps: PreLoadingStep[];
}

function mockRef(prefix: string): string {
  return `${prefix}${Math.random().toString().slice(2, 12).padEnd(10, "0")}`;
}

interface PreLoadingInput {
  ustn: string;
  originCountry: string;
  destCountry: string;
  transportMode: string;
  hsCode: string;
}

export function assessPreLoading(input: PreLoadingInput): PreLoadingResult {
  const origin = (input.originCountry || "").toUpperCase();
  const dest = (input.destCountry || "").toUpperCase();
  const transport = (input.transportMode || "SEA").toUpperCase();
  const steps: PreLoadingStep[] = [];

  // Egypt origin — ACID via Nafeza (mandatory before loading since 2021)
  if (origin === "EG") {
    steps.push({
      step: "ACID", name: "Advance Cargo Information Declaration",
      country: "EG", mandatory: true, deadline: "before loading",
      status: "COMPLETED", filingReference: mockRef("ACID"),
      authority: "Nafeza",
    });
  }

  // EU dest — ENS (Entry Summary Declaration) via ICS2
  const euCountries = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "FI", "DK", "IE", "PT", "GR", "CZ", "RO", "BG", "HR", "SK", "LT", "SI", "LV", "EE", "LU", "MT", "CY", "HU"];
  if (euCountries.includes(dest)) {
    steps.push({
      step: "ENS", name: "Entry Summary Declaration (ICS2)",
      country: dest, mandatory: true,
      deadline: transport === "SEA" ? "24h before loading" : "at departure",
      status: "COMPLETED", filingReference: mockRef("ENS"),
      authority: "EU ICS2",
    });
  }

  // US dest — ISF 10+2 (SEA only, 24h before vessel loading)
  if (dest === "US" && transport === "SEA") {
    steps.push({
      step: "ISF_10_2", name: "Importer Security Filing (ISF 10+2)",
      country: "US", mandatory: true, deadline: "24h before vessel loading",
      status: "COMPLETED", filingReference: mockRef("ISF"),
      authority: "CBP",
    });
  }

  // US dest — FDA Prior Notice (food)
  const chapter = parseInt((input.hsCode || "").substring(0, 2), 10);
  if (dest === "US" && chapter >= 1 && chapter <= 23) {
    steps.push({
      step: "FDA_PRIOR_NOTICE", name: "FDA Prior Notice (food)",
      country: "US", mandatory: true, deadline: "before arrival",
      status: "COMPLETED", filingReference: mockRef("FDA"),
      authority: "FDA",
    });
  }

  // China dest — Pre-declaration via Single Window
  if (dest === "CN") {
    steps.push({
      step: "CN_PRE_DECLARATION", name: "China Single Window Pre-Declaration",
      country: "CN", mandatory: true, deadline: "before arrival",
      status: "COMPLETED", filingReference: mockRef("GACC"),
      authority: "GACC",
    });
  }

  // Saudi dest — FASAH pre-arrival
  if (dest === "SA") {
    steps.push({
      step: "FASAH", name: "FASAH Pre-Arrival Declaration",
      country: "SA", mandatory: true, deadline: "48h before arrival",
      status: "COMPLETED", filingReference: mockRef("FASAH"),
      authority: "FASAH",
    });
  }

  // UAE dest — Dubai Trade pre-arrival
  if (dest === "AE") {
    steps.push({
      step: "DUBAI_TRADE", name: "Dubai Trade Pre-Arrival Declaration",
      country: "AE", mandatory: true, deadline: "24h before arrival",
      status: "COMPLETED", filingReference: mockRef("DUBAI"),
      authority: "Dubai Customs",
    });
  }

  // Japan dest — AFAX (air freight)
  if (dest === "JP" && transport === "AIR") {
    steps.push({
      step: "AFAX", name: "Advance Filing (AFAX)",
      country: "JP", mandatory: true, deadline: "before departure",
      status: "COMPLETED", filingReference: mockRef("AFAX"),
      authority: "Japan Customs",
    });
  }

  // Australia dest — AEP (biosecurity)
  if (dest === "AU") {
    steps.push({
      step: "AEP", name: "Advanced Export Information (AEP)",
      country: "AU", mandatory: true, deadline: "before arrival",
      status: "COMPLETED", filingReference: mockRef("AEP"),
      authority: "Australian Border Force",
    });
  }

  // Brazil dest — Siscomex
  if (dest === "BR") {
    steps.push({
      step: "SISCOMEX", name: "Siscomex Pre-Shipment Declaration",
      country: "BR", mandatory: true, deadline: "before arrival",
      status: "COMPLETED", filingReference: mockRef("SIS"),
      authority: "Receita Federal",
    });
  }

  // India dest — ICEGATE
  if (dest === "IN") {
    steps.push({
      step: "ICEGATE", name: "ICEGATE Pre-Arrival Declaration",
      country: "IN", mandatory: true, deadline: "before arrival",
      status: "COMPLETED", filingReference: mockRef("ICE"),
      authority: "CBIC",
    });
  }

  // Turkey dest — TekSig
  if (dest === "TR") {
    steps.push({
      step: "TEKSIG", name: "TekSig Pre-Arrival Declaration",
      country: "TR", mandatory: true, deadline: "before arrival",
      status: "COMPLETED", filingReference: mockRef("TEK"),
      authority: "Turkish Customs",
    });
  }

  const blockingSteps = steps.filter(s => s.mandatory && s.status !== "COMPLETED" && s.status !== "WAIVED");

  return {
    ustn: input.ustn,
    originCountry: origin,
    destCountry: dest,
    transportMode: transport,
    steps,
    allCompleted: blockingSteps.length === 0,
    blockingSteps,
  };
}
