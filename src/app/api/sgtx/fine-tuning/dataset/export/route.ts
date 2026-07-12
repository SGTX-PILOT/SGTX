// POST /api/sgtx/fine-tuning/dataset/export — export the dataset as JSONL
// or as a framework-specific training config.
//
// Body:
//   format:   "alpaca" | "chatml" | "sharegpt"
//   framework?: "unsloth" | "axolotl" | "llama-factory" | "trl" | "all"
//   filters?: { capability?, minQuality?, limit? }
//
// When `framework` is omitted, returns the JSONL string only.
// When `framework` is one of the four, returns the framework-specific
// artifact (Python script / YAML config) plus the matching JSONL.
// When `framework: "all"`, returns every framework config + all 3 JSONL
// formats + train/val split.
import { NextRequest, NextResponse } from "next/server";
import {
  datasetCollector,
  exportToJSONL,
  exportForUnsloth,
  exportForAxolotl,
  exportForLlamaFactory,
  exportForHuggingFaceTRL,
  exportAllFormats,
  logger,
} from "@/lib/sgtx/brain-os";
import type { JsonlFormat } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

const DEFAULT_EXPORT_LIMIT = 5000;
const MAX_EXPORT_LIMIT = 20000;

interface ExportRequestBody {
  format?: JsonlFormat;
  framework?: "unsloth" | "axolotl" | "llama-factory" | "trl" | "all";
  filters?: {
    capability?: string;
    minQuality?: number;
    limit?: number;
  };
  baseModel?: string;
}

/**
 * POST — export the dataset as JSONL + framework configs.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as ExportRequestBody;
    if (!body || !body.format) {
      return NextResponse.json(
        { ok: false, error: "format is required (alpaca | chatml | sharegpt)" },
        { status: 400 },
      );
    }
    const format = body.format;
    const framework = body.framework;
    const filters = body.filters ?? {};
    const limit = Math.min(
      MAX_EXPORT_LIMIT,
      Math.max(1, filters.limit ?? DEFAULT_EXPORT_LIMIT),
    );

    // Fetch the (filtered) dataset from the collector.
    const page = await datasetCollector.getDataset({
      capability: filters.capability,
      minQuality: filters.minQuality,
      limit,
      offset: 0,
    });
    const examples = page.examples;

    // Branch on framework.
    if (!framework) {
      const jsonl = exportToJSONL(examples, { format });
      return NextResponse.json({
        ok: true,
        format,
        exampleCount: examples.length,
        jsonl,
      });
    }

    if (framework === "all") {
      const all = exportAllFormats(examples, { baseModel: body.baseModel });
      return NextResponse.json({
        ok: true,
        framework: "all",
        format,
        exampleCount: examples.length,
        totalAvailable: page.total,
        artifacts: {
          unslothScript: all.unslothScript,
          axolotlYaml: all.axolotlYaml,
          llamaFactoryDatasetInfo: all.llamaFactoryDatasetInfo,
          llamaFactoryYaml: all.llamaFactoryYaml,
          trlScript: all.trlScript,
          alpacaJsonl: all.alpacaJsonl,
          chatmlJsonl: all.chatmlJsonl,
          sharegptJsonl: all.sharegptJsonl,
          trainSplit: all.trainSplit,
          valSplit: all.valSplit,
          manifests: all.manifests,
        },
      });
    }

    // Single framework.
    if (framework === "unsloth") {
      const script = exportForUnsloth(examples, { baseModel: body.baseModel });
      const jsonl = exportToJSONL(examples, { format });
      return NextResponse.json({
        ok: true,
        framework: "unsloth",
        format,
        exampleCount: examples.length,
        totalAvailable: page.total,
        script,
        jsonl,
      });
    }
    if (framework === "axolotl") {
      const yaml = exportForAxolotl(examples, { baseModel: body.baseModel });
      const jsonl = exportToJSONL(examples, { format });
      return NextResponse.json({
        ok: true,
        framework: "axolotl",
        format,
        exampleCount: examples.length,
        totalAvailable: page.total,
        yaml,
        jsonl,
      });
    }
    if (framework === "llama-factory") {
      const lf = exportForLlamaFactory(examples, { baseModel: body.baseModel });
      const jsonl = exportToJSONL(examples, { format });
      return NextResponse.json({
        ok: true,
        framework: "llama-factory",
        format,
        exampleCount: examples.length,
        totalAvailable: page.total,
        datasetInfoJson: lf.datasetInfoJson,
        yaml: lf.yamlConfig,
        manifest: lf.manifest,
        jsonl,
      });
    }
    if (framework === "trl") {
      const script = exportForHuggingFaceTRL(examples, { baseModel: body.baseModel });
      const jsonl = exportToJSONL(examples, { format });
      return NextResponse.json({
        ok: true,
        framework: "trl",
        format,
        exampleCount: examples.length,
        totalAvailable: page.total,
        script,
        jsonl,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: `Unknown framework: ${framework}. Expected one of: unsloth | axolotl | llama-factory | trl | all`,
      },
      { status: 400 },
    );
  } catch (e) {
    const err = e as { message?: string };
    logger.error("fine-tuning export: POST failed", {
      component: "fine-tuning-export",
      error: err?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(e) },
      { status: 500 },
    );
  }
}
