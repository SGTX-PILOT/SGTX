// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function seedDemoCustomsEnvironment(): Promise<{ created: number; details: string[] }> {
  const result = { created: 0, details: [] as string[] };
  try {
    const demoBrokers = [
      { gtid: "DEMO-US-CBR-001", legalName: "Demo US Customs Broker 1", type: "CBR", country: "US", lifecycleState: "VERIFIED", trustScore: 85 },
      { gtid: "DEMO-US-CBR-002", legalName: "Demo US Customs Broker 2", type: "CBR", country: "US", lifecycleState: "VERIFIED", trustScore: 80 },
      { gtid: "DEMO-EG-CBR-001", legalName: "Demo Egypt Customs Broker", type: "CBR", country: "EG", lifecycleState: "VERIFIED", trustScore: 88 },
    ];
    for (const broker of demoBrokers) {
      try {
        const existing = await db.tenant.findUnique({ where: { gtid: broker.gtid } });
        if (!existing) {
          await db.tenant.create({ data: broker });
          result.created++;
          result.details.push(`Created demo broker: ${broker.gtid}`);
        }
      } catch (e) { result.details.push(`Skipped ${broker.gtid}: ${e.message}`); }
    }
    result.details.push("Demo customs environment seeded. No production credentials.");
  } catch (e: any) { logger.error("[demo-env] error:", e); result.details.push(`Error: ${e.message}`); }
  return result;
}

export async function getDemoBrokerProfiles(): Promise<any[]> {
  return [
    { gtid: "DEMO-US-CBR-001", legalName: "Demo US Customs Broker 1", country: "US", portal: "cbr" },
    { gtid: "DEMO-US-CBR-002", legalName: "Demo US Customs Broker 2", country: "US", portal: "cbr" },
    { gtid: "DEMO-EG-CBR-001", legalName: "Demo Egypt Customs Broker", country: "EG", portal: "cbr" },
  ];
}
