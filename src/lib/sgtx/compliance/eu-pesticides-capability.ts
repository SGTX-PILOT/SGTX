// SGTX EU Pesticides Brain Capability
// Wraps the EU Pesticides client for integration with the SGTX Brain AI.
// Registered as a capability in the Brain's compliance gate.

import { checkMrlCompliance, lookupMrl } from "@/lib/sgtx/compliance/eu-pesticides-client";

export const EU_PESTICIDES_CAPABILITY = {
  id: "eu-pesticides-brain",
  name: "EU Pesticides MRL Brain",
  version: "1.0.0",
  authority: "A3" as const,
  description: "EU Pesticides Maximum Residue Limits — daily-synced from ec.europa.eu. 679 residues × 381 products.",
  capabilities: [
    "compliance.pesticides-check",
    "compliance.pesticides-lookup",
  ],
};

/** Invoke the EU Pesticides capability. */
export async function invokeEuPesticicidesCapability(capability: string, input: any): Promise<any> {
  switch (capability) {
    case "compliance.pesticides-check": {
      const { pesticide, productCode, detectedLevelMgKg } = input;
      return checkMrlCompliance(pesticide, productCode, detectedLevelMgKg);
    }
    case "compliance.pesticides-lookup": {
      const { pesticide, productCode } = input;
      return lookupMrl(pesticide, productCode);
    }
    default:
      throw new Error(`Unknown EU Pesticides capability: ${capability}`);
  }
}

/**
 * Batch compliance check for multiple pesticide residues on a single product.
 * Used by the compliance gate when a lab test report is uploaded.
 */
export async function batchMrlCheck(
  productCode: string,
  detectedResidues: { pesticide: string; detectedLevelMgKg: number }[],
): Promise<{
  overallVerdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  results: any[];
  compliantCount: number;
  nonCompliantCount: number;
  summary: string;
}> {
  const results = [];
  let nonCompliant = 0;
  let atLimit = 0;
  let compliant = 0;

  for (const { pesticide, detectedLevelMgKg } of detectedResidues) {
    const result = await checkMrlCompliance(pesticide, productCode, detectedLevelMgKg);
    results.push({ pesticide, ...result });
    if (result.verdict === "NON_COMPLIANT") nonCompliant++;
    else if (result.verdict === "AT_LIMIT") atLimit++;
    else if (result.verdict === "COMPLIANT") compliant++;
  }

  const overallVerdict = nonCompliant > 0 ? "NON_COMPLIANT" : atLimit > 0 ? "AT_LIMIT" : compliant > 0 ? "COMPLIANT" : "UNKNOWN";
  const summary = nonCompliant > 0
    ? `${nonCompliant} residue(s) EXCEED EU MRL limits — cargo NON-COMPLIANT`
    : atLimit > 0
      ? `${atLimit} residue(s) at EU MRL limit — review recommended`
      : `${compliant} residue(s) within EU MRL limits — cargo COMPLIANT`;

  return {
    overallVerdict,
    results,
    compliantCount: compliant,
    nonCompliantCount: nonCompliant,
    summary,
  };
}
