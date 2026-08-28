// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export interface CommodityClassification {
  commodityId: string;
  description: string;
  hsVersion: string;
  hs6: string;
  nationalExtension: string | null;
  jurisdiction: string | null;
  classificationStatus: string;
  classificationSource: string;
  classificationConfidence: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reviewer: string | null;
  reviewedAt: Date | null;
}

export async function classifyCommodity(description: string, jurisdiction?: string): Promise<CommodityClassification[]> {
  try {
    const { detectHsCode } = await import("@/lib/sgtx/ai/hs-code-detector");
    const detection = await detectHsCode(description);
    if (!detection || !detection.hsCode) return [];
    return [{
      commodityId: `COMM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      description,
      hsVersion: "HS2022",
      hs6: detection.hsCode.slice(0, 6),
      nationalExtension: jurisdiction === "US" ? `${detection.hsCode}.00.00` : null,
      jurisdiction: jurisdiction || null,
      classificationStatus: "PROPOSED",
      classificationSource: "AI",
      classificationConfidence: detection.confidence || 75,
      effectiveFrom: new Date(),
      effectiveTo: null,
      reviewer: null,
      reviewedAt: null,
    }];
  } catch (e: any) { logger.error("[commodity-model] classifyCommodity error:", e); return []; }
}

export async function getCommodityClassification(hsCode: string, jurisdiction: string): Promise<CommodityClassification | null> {
  return null; // stub — would query DB
}

export async function createCommodityClassification(data: any): Promise<CommodityClassification> {
  return { ...data, commodityId: `COMM-${Date.now()}` };
}

export async function confirmClassification(commodityId: string, reviewerGtid: string): Promise<CommodityClassification> {
  return { commodityId, classificationStatus: "CONFIRMED", reviewer: reviewerGtid, reviewedAt: new Date() } as any;
}
