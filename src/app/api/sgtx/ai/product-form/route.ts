import { NextRequest, NextResponse } from "next/server";
import { productFormAgent } from "@/lib/sgtx/ai/orchestrator";
import {
  getCommodityPackingDefaults,
  getTreatmentRequirements,
  getMrlRequirements,
  checkSpecialProcedures,
  getCachedSchema,
  cacheSchema,
} from "@/lib/sgtx/ria";

export async function POST(req: NextRequest) {
  const {
    commodityType,
    productName,
    hsCode,
    originCountry,
    destCountry,
    port,
  } = await req.json();
  if (!commodityType) {
    return NextResponse.json({ error: "commodityType required" }, { status: 400 });
  }

  const hs = hsCode || "";

  // 1. Check RIA cache first (6h TTL)
  const cached = await getCachedSchema(hs, originCountry, destCountry, port);

  // 2. Run RIA lookups in parallel (always needed for merging, even on cache hit)
  const [packingDefaults, treatments, mrls, warnings] = await Promise.all([
    hs ? getCommodityPackingDefaults(hs, originCountry) : Promise.resolve(null),
    hs && originCountry && destCountry
      ? getTreatmentRequirements(hs, originCountry, destCountry)
      : Promise.resolve([]),
    hs && destCountry
      ? getMrlRequirements(destCountry, hs)
      : Promise.resolve([]),
    hs && originCountry && destCountry && port
      ? checkSpecialProcedures(hs, originCountry, destCountry, port)
      : Promise.resolve([]),
  ]);

  // 3. Determine the AI-generated schema (from cache or fresh)
  let aiResult;
  let fromCache = false;
  if (cached) {
    aiResult = {
      content: JSON.stringify(cached.schemaJson),
      provider: "cache" as const,
      model: "ria-cache",
      latencyMs: 0,
      fallbackUsed: false,
      authority: "A2" as const,
    };
    fromCache = true;
  } else {
    aiResult = await productFormAgent(
      commodityType,
      productName || "",
      hs
    );
  }

  // 4. Merge RIA data into the AI-generated schema
  const merged = mergeRiaIntoSchema(
    parseAiSchema(aiResult.content),
    {
      packingDefaults,
      treatments,
      mrls,
      warnings,
    }
  );

  // 5. Cache the merged schema if not from cache
  if (!fromCache && hs) {
    try {
      await cacheSchema(hs, merged, originCountry, destCountry, port);
    } catch {
      // Best-effort caching; ignore failures (e.g. duplicate key).
    }
  }

  return NextResponse.json({
    commodityType,
    productName,
    hsCode: hs,
    originCountry,
    destCountry,
    port,
    cached: fromCache,
    schema: merged,
    ai: aiResult,
  });
}

// ============ Helpers ============

function parseAiSchema(content: string): any {
  try {
    // Extract JSON from possibly-markdown-wrapped response
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(content);
  } catch {
    // If AI returned malformed JSON, return a minimal skeleton so RIA merge still works
    return {
      dynamic_fields: [],
      required_documents: [],
      special_conditions: [],
      treatment_details: {},
      lab_tests_required: [],
    };
  }
}

function mergeRiaIntoSchema(
  schema: any,
  ria: {
    packingDefaults: any | null;
    treatments: any[];
    mrls: any[];
    warnings: any[];
  }
): any {
  const s = {
    dynamic_fields: schema.dynamic_fields || [],
    required_documents: schema.required_documents || [],
    special_conditions: schema.special_conditions || [],
    treatment_details: schema.treatment_details || {},
    lab_tests_required: schema.lab_tests_required || [],
  };

  // 4.3 — Packing defaults → add to dynamic_fields (originating from RIA, authoritative)
  if (ria.packingDefaults) {
    const p = ria.packingDefaults;
    s.dynamic_fields.push(
      {
        name: "default_packaging",
        type: "string",
        mandatory: true,
        default: p.defaultPackaging,
        source: "RIA",
      },
      {
        name: "cartons_per_pallet",
        type: "integer",
        mandatory: true,
        default: p.cartonsPerPallet,
        source: "RIA",
      },
      {
        name: "net_weight_per_carton_kg",
        type: "number",
        mandatory: true,
        default: p.netWeightPerCarton,
        source: "RIA",
      },
      {
        name: "gross_weight_per_carton_kg",
        type: "number",
        mandatory: true,
        default: p.grossWeightPerCarton,
        source: "RIA",
      },
      {
        name: "tare_per_carton_kg",
        type: "number",
        mandatory: true,
        default: p.tarePerCarton,
        source: "RIA",
      },
      {
        name: "pallet_tare_kg",
        type: "number",
        mandatory: false,
        default: p.palletTareKg,
        source: "RIA",
      }
    );
  }

  // 4.4/4.5 — Treatment requirements & special procedures
  if (ria.treatments.length > 0) {
    s.treatment_details = {
      ...s.treatment_details,
      required_treatments: ria.treatments.map((t) => ({
        type: t.treatmentType,
        duration_days: t.durationDays,
        temperature_c: t.temperatureC,
        facility_required: t.facilityRequired,
        certificate_required: t.certificateRequired,
        notes: t.notes,
      })),
      special_procedures_warnings: ria.warnings,
    };

    // Add mandatory treatment certificates to required_documents
    for (const t of ria.treatments) {
      if (t.certificateRequired) {
        const docType = treatmentDocType(t.treatmentType);
        if (!s.required_documents.some((d: any) => d.type === docType)) {
          s.required_documents.push({
            type: docType,
            mandatory: true,
            source: "RIA",
            rationale: `${t.treatmentType.replace(/_/g, " ")} certificate required for ${t.originCountry}→${t.destCountry}.`,
          });
        }
      }
    }
  }

  // 4.6 — MRL requirements → lab_tests_required
  if (ria.mrls.length > 0) {
    s.lab_tests_required = [
      ...(s.lab_tests_required || []),
      ...ria.mrls.map((m) => ({
        type: "PESTICIDE_RESIDUE_PANEL",
        analyte: m.pesticide,
        mrl_mg_kg: m.mrlMgKg,
        destination_country: m.country,
        source: "RIA",
      })),
    ];
  }

  // 4.5 — Port special rules → required_documents
  for (const w of ria.warnings) {
    if (w.certificateRequired && w.treatmentType === "DOCUMENT_ADDITIONAL") {
      s.required_documents.push({
        type: "PORT_ADDITIONAL",
        mandatory: true,
        source: "RIA",
        rationale: w.message,
      });
    }
    s.special_conditions.push({
      severity: w.severity,
      condition: w.message,
      treatment_type: w.treatmentType,
      source: "RIA",
    });
  }

  return s;
}

function treatmentDocType(treatmentType: string): string {
  switch (treatmentType) {
    case "COLD_TREATMENT":
      return "COLD_TREATMENT_CERTIFICATE";
    case "FUMIGATION":
      return "FUMIGATION_CERTIFICATE";
    case "PRE_COOLING":
      return "PRE_COOLING_CERTIFICATE";
    case "ISPM15":
      return "ISPM15_CERTIFICATE";
    case "IRRADIATION":
      return "IRRADIATION_CERTIFICATE";
    default:
      return "TREATMENT_CERTIFICATE";
  }
}
