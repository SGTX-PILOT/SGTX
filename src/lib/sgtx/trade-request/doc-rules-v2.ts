// SGTX AI Document Requirements Resolver (v2)
// Resolves required trade documents by commodity + HS code + origin port + destination port.
// Combines:
//   1. Base document requirements from doc-rules.ts (HS code + incoterm driven)
//   2. RIA port rules (origin + destination port specific)
//   3. RIA treatment requirements (origin country → dest country)
//   4. RIA MRL requirements (HS code specific)
//   5. AI enrichment (z-ai-web-dev-sdk) for port-pair-specific requirements

import { resolveDocumentRequirements, type DocumentRequirementSpec } from "./doc-rules";
import {
  getPortRules,
  getTreatmentRequirements,
  getMrlRequirements,
  checkSpecialProcedures,
  type PortRuleRow,
  type TreatmentRequirementRow,
  type SpecialProcedureWarning,
} from "@/lib/sgtx/ria";

export interface PortPairDocRequirement {
  originPort: string;
  destinationPort: string;
  originCountry: string;
  destinationCountry: string;
  documents: DocumentRequirementSpec[];
  notes: string[];
  aiGenerated: boolean;
  confidence: number;
}

function extractCountryFromPort(portCode: string): string {
  // UN/LOCODE first 2 chars = ISO country code
  if (portCode && portCode.length >= 5) return portCode.slice(0, 2).toUpperCase();
  return "";
}

export async function resolveDocumentsByPortPair(input: {
  commodity: string;
  hsCode?: string;
  originPort: string;       // UN/LOCODE
  destinationPort: string;  // UN/LOCODE
  incoterm?: string;
  transportMode?: string;
  coldChain?: boolean;
  lcSelected?: boolean;
  financingRequested?: boolean;
  preferenceAgreement?: boolean;
}): Promise<PortPairDocRequirement> {
  const originCountry = extractCountryFromPort(input.originPort);
  const destinationCountry = extractCountryFromPort(input.destinationPort);
  const notes: string[] = [];
  const documents: DocumentRequirementSpec[] = [];
  const seenKeys = new Set<string>();

  const addDoc = (doc: DocumentRequirementSpec) => {
    const key = `${doc.docType}:${doc.trigger}`;
    if (seenKeys.has(key)) return; // dedupe
    seenKeys.add(key);
    documents.push(doc);
  };

  // 1. Base document requirements (HS code + incoterm driven)
  const baseDocs = resolveDocumentRequirements({
    hsCode: input.hsCode,
    originCountry,
    destCountry: destinationCountry,
    incoterm: input.incoterm,
    transportMode: input.transportMode,
    coldChain: input.coldChain,
    lcSelected: input.lcSelected,
    financingRequested: input.financingRequested,
    preferenceAgreement: input.preferenceAgreement,
  });
  for (const d of baseDocs) addDoc(d);

  // 2. RIA port rules (origin + destination port specific)
  try {
    const [originRules, destRules] = await Promise.all([
      getPortRules(input.originPort).catch(() => [] as PortRuleRow[]),
      getPortRules(input.destinationPort).catch(() => [] as PortRuleRow[]),
    ]);

    for (const rule of originRules) {
      notes.push(`Origin port ${input.originPort} (${rule.ruleType}): ${rule.description}`);
      // Port rules may require inspection certificate
      if (rule.ruleType === "INSPECTION_REQUIRED") {
        addDoc({
          docType: "PORT_INSPECTION_CERTIFICATE",
          docName: `Port Inspection Certificate — ${input.originPort}`,
          trigger: "CUSTOMS",
          mandatory: true,
          issuingAuthority: `${input.originPort} Port Authority`,
          format: "PDF",
          notes: `Required by ${input.originPort} port authority: ${rule.description}`,
        });
      }
      if (rule.ruleType === "COLD_CHAIN_VERIFICATION") {
        addDoc({
          docType: "ORIGIN_COLD_CHAIN_VERIFICATION",
          docName: `Cold Chain Verification — ${input.originPort}`,
          trigger: "CUSTOMS",
          mandatory: true,
          issuingAuthority: `${input.originPort} Port Authority`,
          format: "PDF",
          notes: rule.description,
        });
      }
    }

    for (const rule of destRules) {
      notes.push(`Destination port ${input.destinationPort} (${rule.ruleType}): ${rule.description}`);
      if (rule.ruleType === "INSPECTION_REQUIRED") {
        addDoc({
          docType: "DEST_PORT_INSPECTION_CERTIFICATE",
          docName: `Destination Port Inspection Certificate — ${input.destinationPort}`,
          trigger: "CUSTOMS",
          mandatory: true,
          issuingAuthority: `${input.destinationPort} Port Authority`,
          format: "PDF",
          notes: `Required by ${input.destinationPort} port authority: ${rule.description}`,
        });
      }
      if (rule.ruleType === "COLD_CHAIN_VERIFICATION") {
        addDoc({
          docType: "COLD_CHAIN_VERIFICATION_CERTIFICATE",
          docName: `Cold Chain Verification Certificate — ${input.destinationPort}`,
          trigger: "CUSTOMS",
          mandatory: true,
          issuingAuthority: `${input.destinationPort} Port Health Authority`,
          format: "PDF",
          notes: `Cold chain verification required at destination port ${input.destinationPort}: ${rule.description}`,
        });
      }
    }
  } catch (err) {
    notes.push(`Port rules lookup failed: ${(err as any).message}`);
  }

  // 3. RIA treatment requirements (origin → dest country)
  try {
    const treatments: TreatmentRequirementRow[] = input.hsCode
      ? await getTreatmentRequirements(input.hsCode, originCountry, destinationCountry).catch(() => [])
      : [];

    for (const t of treatments) {
      if (t.treatmentType && t.certificateRequired) {
        addDoc({
          docType: `${t.treatmentType}_CERTIFICATE`,
          docName: `${t.treatmentType.replace(/_/g, " ")} Certificate`,
          trigger: "CUSTOMS",
          mandatory: true,
          issuingAuthority: "Approved treatment facility",
          format: "PDF",
          notes: t.notes || `${t.treatmentType} required for ${originCountry} → ${destinationCountry}${t.durationDays ? ` (${t.durationDays} days${t.temperatureC !== null ? ` @ ${t.temperatureC}°C` : ""})` : ""}`,
        });
      }
    }
  } catch (err) {
    notes.push(`Treatment requirements lookup failed: ${(err as any).message}`);
  }

  // 4. RIA special procedures (treatments + port rules combined warnings)
  try {
    const specialProcedures: SpecialProcedureWarning[] = input.hsCode
      ? await checkSpecialProcedures(input.hsCode, originCountry, destinationCountry, input.destinationPort).catch(() => [] as SpecialProcedureWarning[])
      : [];

    for (const sp of specialProcedures) {
      if (sp.severity === "BLOCK" || sp.severity === "WARN") {
        notes.push(`${sp.severity}: ${sp.message}`);
      }
      // Treatment-required documents
      if (sp.certificateRequired && sp.treatmentType) {
        addDoc({
          docType: `${sp.treatmentType}_CERTIFICATE`,
          docName: `${sp.treatmentType.replace(/_/g, " ")} Certificate`,
          trigger: "CUSTOMS",
          mandatory: sp.severity === "BLOCK",
          issuingAuthority: "Approved treatment facility",
          format: "PDF",
          notes: sp.message,
        });
      }
    }
  } catch (err) {
    notes.push(`Special procedures lookup failed: ${(err as any).message}`);
  }

  // 5. RIA MRL requirements (HS code specific)
  try {
    const mrls = input.hsCode
      ? await getMrlRequirements(destinationCountry, input.hsCode).catch(() => [])
      : [];

    if (mrls.length > 0) {
      addDoc({
        docType: "MRL_LAB_TEST_REPORT",
        docName: `MRL Lab Test Report (${destinationCountry})`,
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "ISO 17025 accredited laboratory",
        format: "PDF",
        notes: `MRL compliance test required by ${destinationCountry}. ${mrls.length} maximum residue limits apply.`,
      });
    }
  } catch (err) {
    // MRL lookup is best-effort
  }

  // 6. Country-pair specific hardcoded rules (high-confidence)
  const countryPairRules = getCountryPairDocumentRules(originCountry, destinationCountry, input);
  for (const d of countryPairRules.docs) addDoc(d);
  for (const n of countryPairRules.notes) notes.push(n);

  // 7. AI enrichment — ask AI for any additional port-pair-specific documents
  let aiGenerated = false;
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: "You are a global trade compliance expert. List any ADDITIONAL documents required for this specific trade route that are not in the standard list. Respond with VALID JSON ONLY.",
        },
        {
          role: "user",
          content: `Trade route: ${input.commodity} (HS ${input.hsCode || "unknown"}) from ${input.originPort} (${originCountry}) to ${input.destinationPort} (${destinationCountry}).
Incoterm: ${input.incoterm || "CIF"}. Cold chain: ${input.coldChain ? "yes" : "no"}. Transport: ${input.transportMode || "OCEAN"}.

Already-required documents: ${documents.map((d) => d.docType).join(", ")}

List ONLY additional documents specific to this port pair / commodity that are NOT in the list above. Respond with VALID JSON only:
{"additional_documents": [{"doc_type": "FDA_PRIOR_NOTICE", "doc_name": "FDA Prior Notice", "trigger": "CUSTOMS", "mandatory": true, "issuing_authority": "US FDA", "notes": "Required for food imports to US"}], "notes": ["Additional port-pair-specific note"]}

If no additional documents are needed, return {"additional_documents": [], "notes": []}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.additional_documents)) {
        for (const ad of parsed.additional_documents) {
          if (!ad.doc_type) continue;
          addDoc({
            docType: String(ad.doc_type).toUpperCase(),
            docName: String(ad.doc_name || ad.doc_type),
            trigger: (["SHIPMENT", "SETTLEMENT", "CUSTOMS", "FINANCING"].includes(String(ad.trigger || "CUSTOMS").toUpperCase()) ? String(ad.trigger || "CUSTOMS").toUpperCase() : "CUSTOMS") as any,
            mandatory: Boolean(ad.mandatory),
            issuingAuthority: String(ad.issuing_authority || ""),
            format: "PDF",
            notes: String(ad.notes || ""),
          });
          aiGenerated = true;
        }
      }
      if (Array.isArray(parsed.notes)) {
        for (const n of parsed.notes) notes.push(`AI: ${n}`);
      }
    }
  } catch (err) {
    // AI enrichment is best-effort
    notes.push("AI enrichment skipped (API unavailable)");
  }

  return {
    originPort: input.originPort,
    destinationPort: input.destinationPort,
    originCountry,
    destinationCountry,
    documents,
    notes,
    aiGenerated,
    confidence: aiGenerated ? 0.85 : 0.95,
  };
}

// Country-pair specific hardcoded rules (well-known high-confidence requirements)
function getCountryPairDocumentRules(
  originCountry: string,
  destinationCountry: string,
  input: { commodity?: string; hsCode?: string; coldChain?: boolean }
): { docs: DocumentRequirementSpec[]; notes: string[] } {
  const docs: DocumentRequirementSpec[] = [];
  const notes: string[] = [];
  const o = originCountry.toUpperCase();
  const d = destinationCountry.toUpperCase();
  const isFood = isFoodCommodity(input.hsCode);

  // ── EU imports ──
  if (d === "DE" || d === "FR" || d === "NL" || d === "BE" || d === "IT" || d === "ES" || d === "GB") {
    if (isFood) {
      docs.push({
        docType: "EU_HEALTH_CERTIFICATE",
        docName: "EU Health Certificate (Common Health Entry Document - CHED)",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "Origin country competent authority",
        format: "PDF",
        notes: "Required for all animal-origin food imports to EU per Regulation 2017/625",
      });
      docs.push({
        docType: "EU_MRL_COMPLIANCE",
        docName: "EU MRL Compliance Certificate",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "ISO 17025 accredited laboratory",
        format: "PDF",
        notes: "Pesticide residue test per EU Regulation 396/2005",
      });
    }
    docs.push({
      docType: "EUR1_MOVEMENT_CERTIFICATE",
      docName: "EUR.1 Movement Certificate",
      trigger: "SETTLEMENT",
      mandatory: false,
      issuingAuthority: "Origin country customs authority",
      format: "PDF",
      notes: "Required for preferential origin claims (preference agreement)",
    });
  }

  // ── US imports ──
  if (d === "US") {
    if (isFood) {
      docs.push({
        docType: "FDA_PRIOR_NOTICE",
        docName: "FDA Prior Notice",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "US FDA",
        format: "ELECTRONIC",
        notes: "Must be filed via FDA Prior Notice System Interface before arrival",
      });
      docs.push({
        docType: "FSMA_FACILITY_REGISTRATION",
        docName: "FSMA Facility Registration",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "US FDA",
        format: "ELECTRONIC",
        notes: "Foreign supplier facility registration per Food Safety Modernization Act",
      });
    }
    docs.push({
      docType: "ISF_10_2",
      docName: "Importer Security Filing (ISF 10+2)",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "US CBP",
      format: "ELECTRONIC",
      notes: "Must be filed 24 hours before vessel loading at origin port",
    });
    docs.push({
      docType: "CBP_FORM_7501",
      docName: "CBP Form 7501 (Entry Summary)",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "US CBP",
      format: "ELECTRONIC",
      notes: "Required for all formal entries",
    });
  }

  // ── Egypt imports ──
  if (d === "EG") {
    if (isFood) {
      docs.push({
        docType: "NFSA_APPROVAL",
        docName: "NFSA Import Approval",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "National Food Safety Authority (NFSA) Egypt",
        format: "PDF",
        notes: "Pre-import approval required for all food products",
      });
    }
    docs.push({
      docType: "GOEIC_REGISTRATION",
      docName: "GOEIC Importer Registration",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "General Organization for Export and Import Control (GOEIC)",
      format: "ELECTRONIC",
      notes: "Importer must be registered with GOEIC",
    });
    docs.push({
      docType: "ACID_NUMBER",
      docName: "ACI Number (Advance Cargo Information)",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "Egyptian Customs",
      format: "ELECTRONIC",
      notes: "ACI registration required 48 hours before vessel loading",
    });
  }

  // ── Saudi Arabia / UAE imports (GCC) ──
  if (d === "SA" || d === "AE" || d === "KW" || d === "QA" || d === "BH" || d === "OM") {
    if (isFood) {
      docs.push({
        docType: "HALAL_CERTIFICATE",
        docName: "Halal Certificate",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "Recognized Islamic authority",
        format: "PDF",
        notes: "Required for all food products imported to GCC countries",
      });
      docs.push({
        docType: "SASO_COC",
        docName: "SASO Certificate of Conformity (CoC)",
        trigger: "CUSTOMS",
        mandatory: d === "SA",
        issuingAuthority: "Saudi Standards, Metrology and Quality Organization (SASO)",
        format: "PDF",
        notes: "Required for Saudi imports via SABER platform",
      });
    }
    docs.push({
      docType: "GCC_FTA_ORIGIN",
      docName: "GCC FTA Origin Certificate",
      trigger: "SETTLEMENT",
      mandatory: false,
      issuingAuthority: "Origin country chamber of commerce",
      format: "PDF",
      notes: "Required for preferential tariff claims under GCC FTAs",
    });
  }

  // ── Japan imports ──
  if (d === "JP") {
    if (isFood) {
      docs.push({
        docType: "JAPAN_MAFF_NOTIFICATION",
        docName: "Japan MAFF Import Notification",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "Ministry of Agriculture, Forestry and Fisheries (MAFF)",
        format: "ELECTRONIC",
        notes: "Import notification via NALPS system required for all food",
      });
      // Cold treatment for citrus from certain origins
      if (input.coldChain && (input.hsCode?.startsWith("0805"))) {
        docs.push({
          docType: "COLD_TREATMENT_CERTIFICATE",
          docName: "Cold Treatment Certificate (Citrus → Japan)",
          trigger: "CUSTOMS",
          mandatory: true,
          issuingAuthority: "Origin country plant protection organization",
          format: "PDF",
          notes: "14-day cold treatment at 1°C required for citrus to Japan (Ceratitis capitata)",
        });
      }
    }
  }

  // ── Australia / New Zealand imports ──
  if (d === "AU" || d === "NZ") {
    docs.push({
      docType: "BIOSECURITY_IMPORT_PERMIT",
      docName: "Biosecurity Import Permit",
      trigger: "CUSTOMS",
      mandatory: isFood || isPlantMaterial(input.hsCode),
      issuingAuthority: "Department of Agriculture (AU) / MPI (NZ)",
      format: "PDF",
      notes: "Strict biosecurity requirements — most plant/animal products need permit",
    });
    if (isFood) {
      docs.push({
        docType: "FSANZ_COMPLIANCE",
        docName: "FSANZ Compliance Declaration",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "Importer",
        format: "PDF",
        notes: "Food Standards Australia New Zealand compliance declaration",
      });
    }
  }

  // ── China imports ──
  if (d === "CN") {
    if (isFood) {
      docs.push({
        docType: "GACC_REGISTRATION",
        docName: "GACC Overseas Supplier Registration",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "General Administration of Customs of China (GACC)",
        format: "ELECTRONIC",
        notes: "Overseas supplier must be registered with GACC before import",
      });
      docs.push({
        docType: "CHINA_HEALTH_CERTIFICATE",
        docName: "China Health Certificate",
        trigger: "CUSTOMS",
        mandatory: true,
        issuingAuthority: "Origin country competent authority",
        format: "PDF",
        notes: "Health certificate in Chinese/English bilingual format",
      });
    }
    docs.push({
      docType: "CCC_CERTIFICATION",
      docName: "China Compulsory Certification (CCC)",
      trigger: "CUSTOMS",
      mandatory: isCCCRequired(input.hsCode),
      issuingAuthority: "Designated CCC certification body",
      format: "PDF",
      notes: "Required for electronics, electrical products, automotive parts",
    });
  }

  // ── Egypt as origin (phytosanitary for agricultural exports) ──
  if (o === "EG" && isFood) {
    docs.push({
      docType: "PHYTOSANITARY_CERTIFICATE",
      docName: "Phytosanitary Certificate (Egypt origin)",
      trigger: "CUSTOMS",
      mandatory: true,
      issuingAuthority: "Central Administration of Plant Quarantine (CAPQ) Egypt",
      format: "PDF",
      notes: "Required for all plant-origin exports from Egypt",
    });
  }

  return { docs, notes };
}

function isFoodCommodity(hsCode?: string): boolean {
  if (!hsCode) return false;
  const chapter = parseInt(hsCode.replace(".", "").slice(0, 2), 10);
  return (chapter >= 1 && chapter <= 24); // HS chapters 1-24 = food/agricultural
}

function isPlantMaterial(hsCode?: string): boolean {
  if (!hsCode) return false;
  const chapter = parseInt(hsCode.replace(".", "").slice(0, 2), 10);
  return (chapter >= 6 && chapter <= 14); // HS chapters 6-14 = plant products
}

function isCCCRequired(hsCode?: string): boolean {
  if (!hsCode) return false;
  const chapter = parseInt(hsCode.replace(".", "").slice(0, 2), 10);
  return (chapter >= 84 && chapter <= 85) || chapter === 87 || chapter === 94; // machinery, electrical, vehicles, lighting
}
