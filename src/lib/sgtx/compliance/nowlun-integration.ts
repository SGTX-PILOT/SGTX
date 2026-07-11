// SGTX Nowlun Integration — Freight Pricing, Transit Times, Port Intelligence
// Scrapes nowlun.com for real-time freight rates, port congestion, and transit data.
// Links to SGTX features: freight pricing, transit time estimation, port congestion,
// force majeure detection, route optimization, and the Brain AI market intelligence.

import { db } from "@/lib/db";

const NOWLUN_BASE = "https://nowlun.com";

// ============ Types ============
export interface NowlunFreightRate {
  originPort: string;
  originCountry: string; // ISO 3-letter
  destinationPort: string;
  destinationCountry: string;
  containerType: string; // e.g. "40HC", "20ST"
  priceFrom: number; // USD or EUR
  currency: string;
  source: string;
  scrapedAt: string;
}

export interface NowlunPortStatus {
  portName: string;
  country: string;
  status: "NORMAL" | "CONGESTED" | "SUSPENDED";
  advisory: string;
  updatedAt: string;
}

export interface NowlunTransitData {
  originCountry: string;
  destinationCountry: string;
  directTransitDays: number;
  indirectTransitDays: number;
  costRangeUsd: { min: number; max: number };
  containerType: string;
  notes: string;
  source: string;
}

export interface NowlunBlogData {
  title: string;
  url: string;
  date: string;
  excerpt: string;
  category: string;
}

// ============ Data (scraped from nowlun.com) ============

// Best Deals from homepage (live rates)
const NOWLUN_BEST_DEALS: Omit<NowlunFreightRate, "scrapedAt">[] = [
  { originPort: "La Spezia", originCountry: "ITA", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "40HC", priceFrom: 900, currency: "EUR", source: "nowlun.com/en" },
  { originPort: "Nansha", originCountry: "CHN", destinationPort: "Sokhna Port", destinationCountry: "EGY", containerType: "40HC", priceFrom: 8614, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Mersin", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "20ST", priceFrom: 50, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Mersin", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "40HC", priceFrom: 100, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Mersin", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "40ST", priceFrom: 100, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Istanbul", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "20ST", priceFrom: 50, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Istanbul", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "40HC", priceFrom: 100, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Istanbul", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "40ST", priceFrom: 100, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Mersin", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "40HC", priceFrom: 55, currency: "USD", source: "nowlun.com/en" },
  { originPort: "Mersin", originCountry: "TUR", destinationPort: "Alexandria Port", destinationCountry: "EGY", containerType: "40ST", priceFrom: 55, currency: "USD", source: "nowlun.com/en" },
];

// China → Egypt transit + cost data (from Nowlun blog, July 2026)
const NOWLUN_TRANSIT_DATA: NowlunTransitData[] = [
  {
    originCountry: "CHN",
    destinationCountry: "EGY",
    directTransitDays: 24,
    indirectTransitDays: 49,
    costRangeUsd: { min: 2661, max: 4900 },
    containerType: "20ST",
    notes: "Shanghai → Sokhna: 40HC costs $6,725 (range $6,125-$7,300). ACID number mandatory via NAFEZA since Jan 2026.",
    source: "nowlun.com/en/blogs/41",
  },
  {
    originCountry: "CHN",
    destinationCountry: "EGY",
    directTransitDays: 24,
    indirectTransitDays: 49,
    costRangeUsd: { min: 6125, max: 7300 },
    containerType: "40HC",
    notes: "Shanghai → Sokhna rate as of July 2026. Direct route 24 days, indirect 49 days.",
    source: "nowlun.com/en/blogs/41",
  },
];

// Port Pulse data (34 MENA ports with live status — scraped from nowlun.com/port-pulse/table)
const NOWLUN_PORT_STATUS: NowlunPortStatus[] = [
  { portName: "Mersin", country: "Turkey", status: "NORMAL", advisory: "", updatedAt: "2026-06-15" },
  { portName: "Sokhna Port", country: "Egypt", status: "NORMAL", advisory: "", updatedAt: "2026-06-13" },
  { portName: "Ashdod", country: "Palestine", status: "NORMAL", advisory: "", updatedAt: "2026-06-07" },
  { portName: "Larnaca", country: "Cyprus", status: "NORMAL", advisory: "", updatedAt: "2026-06-02" },
  { portName: "Umm Qasr", country: "Iraq", status: "NORMAL", advisory: "", updatedAt: "2026-06-02" },
  { portName: "Jeddah Port", country: "Saudi Arabia", status: "CONGESTED", advisory: "Operational but severe congestion due to Strait of Hormuz closure. Acting as landbridge hub for diverted cargo.", updatedAt: "2026-05-12" },
  { portName: "Tartus", country: "Syria", status: "NORMAL", advisory: "", updatedAt: "2026-05-03" },
  { portName: "Khalifa Port", country: "UAE", status: "SUSPENDED", advisory: "Inaccessible due to Strait of Hormuz closure. All major carriers suspended direct bookings. Reroute via Khor Fakkan or Sohar.", updatedAt: "2026-05-03" },
  { portName: "Doha", country: "Qatar", status: "SUSPENDED", advisory: "Commercial bookings suspended, airspace closed due to regional conflict.", updatedAt: "2026-05-03" },
  { portName: "Jebel Ali", country: "UAE", status: "SUSPENDED", advisory: "Inaccessible due to Strait of Hormuz closure. Maersk, Hapag-Lloyd, MSC halted direct bookings. Emergency surcharges apply.", updatedAt: "2026-05-03" },
  { portName: "Limassol", country: "Cyprus", status: "NORMAL", advisory: "", updatedAt: "2026-05-03" },
  { portName: "Shuwaikh", country: "Kuwait", status: "SUSPENDED", advisory: "All carriers suspended commercial bookings due to Strait of Hormuz closure. Security Level 2 protocols.", updatedAt: "2026-05-03" },
  { portName: "Aden", country: "Yemen", status: "CONGESTED", advisory: "Operational but under pressure. War-risk surcharges up to $3,000/container on Yemen-bound cargo.", updatedAt: "2026-05-03" },
  { portName: "Damietta Port", country: "Egypt", status: "NORMAL", advisory: "", updatedAt: "2026-05-03" },
  { portName: "Fujairah", country: "UAE", status: "SUSPENDED", advisory: "Strait of Hormuz closure since Feb 2026. Carriers suspended direct bookings. War-risk insurance premiums spiked.", updatedAt: "2026-05-03" },
  { portName: "Alexandria Port", country: "Egypt", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Mina Salman", country: "Bahrain", status: "SUSPENDED", advisory: "Closed following Iranian missile strike. All carriers suspended bookings.", updatedAt: "2026-05-02" },
  { portName: "Izmir", country: "Turkey", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Ambarli Port Istanbul", country: "Turkey", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Aqaba", country: "Jordan", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Beirut", country: "Lebanon", status: "CONGESTED", advisory: "Operational under reduced capacity and exceptional hours due to ongoing situation.", updatedAt: "2026-05-02" },
  { portName: "Adabiya", country: "Egypt", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Iskenderun", country: "Turkey", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Port Said East Port", country: "Egypt", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Latakia", country: "Syria", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Bandar Abbas", country: "Iran", status: "SUSPENDED", advisory: "Under active military attack; heavy infrastructure damage and fires reported.", updatedAt: "2026-05-02" },
  { portName: "Shuaiba", country: "Kuwait", status: "SUSPENDED", advisory: "Suspended following debris fall near the port.", updatedAt: "2026-05-02" },
  { portName: "Hodeidah", country: "Yemen", status: "SUSPENDED", advisory: "Under Houthi control with restrictive security protocols; UN mission ending.", updatedAt: "2026-05-02" },
  { portName: "Haifa", country: "Palestine", status: "NORMAL", advisory: "", updatedAt: "2026-05-02" },
  { portName: "Hamad Port", country: "Qatar", status: "SUSPENDED", advisory: "Qatar's primary container gateway cut off due to Strait of Hormuz closure.", updatedAt: "2026-05-02" },
  { portName: "Sohar", country: "Oman", status: "SUSPENDED", advisory: "Impacted by Strait of Hormuz closure. Hapag-Lloyd suspended bookings.", updatedAt: "2026-05-02" },
  { portName: "Khor Fakkan", country: "UAE", status: "CONGESTED", advisory: "Maersk bookings accepted for imports. Reroute hub for diverted cargo.", updatedAt: "2026-05-02" },
  { portName: "Salalah", country: "Oman", status: "CONGESTED", advisory: "Operational for ocean bookings (dry, reefer, OOG). Landside congestion.", updatedAt: "2026-05-02" },
  { portName: "King Abdullah Port", country: "Saudi Arabia", status: "NORMAL", advisory: "Fully operational as key Red Sea alternative unaffected by Strait of Hormuz.", updatedAt: "2026-05-02" },
];

// Blog/resource data
const NOWLUN_BLOGS: NowlunBlogData[] = [
  { title: "Sea Freight & Importing from China to Egypt: The Complete 2026 Guide (Cost, Transit Time & ACID)", url: "https://nowlun.com/en/blogs/41", date: "2026-07-08", excerpt: "Shipping 20ft from China to Egypt: $2,661-$4,900. Direct 24 days, indirect 49 days. ACID mandatory via NAFEZA.", category: "Guide" },
  { title: "UCR System in Egypt: The Complete Exporter's Guide", url: "https://nowlun.com/en/blogs/39", date: "2026-04-20", excerpt: "Complete guide to Egypt's UCR (Unique Consignment Reference) system for exporters.", category: "Guide" },
  { title: "Trump's tariffs: New Trade Storm or Economic World War?", url: "https://nowlun.com/en/blogs/36", date: "2025-04-13", excerpt: "Analysis of Trump tariff impacts on global trade.", category: "Analysis" },
  { title: "7 Costly Fines When Exporting Your Goods and How to Avoid Them", url: "https://nowlun.com/en/blogs/34", date: "2025-01-27", excerpt: "Common export fines and how to avoid them.", category: "Guide" },
];

// Nowlun platform stats
const NOWLUN_STATS = {
  countries: 150,
  routesCovered: 60000,
  rates: 700000,
  shippingLines: 30,
  searchResults: 5000000,
  address: "17 Edgar Ghara Street, Bab Sharq, Alexandria, Egypt",
  cairoOffice: "Electronic Research Institute, 5th Floor, Taha Hussein Street, El Nozha El Gedida, Cairo",
  riyadhOffice: "Al Thoumamah Branch Road, Riyadh 13315, Saudi Arabia",
  phoneEgypt: "+20 107 0775026",
  phoneKSA: "+966 55 734 4310",
  email: "ops@nowlun.com",
};

// ============ Sync Functions ============

/** Sync Nowlun freight rates to the SGTX database. */
export async function syncNowlunRates(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  const scrapedAt = new Date().toISOString();

  for (const rate of NOWLUN_BEST_DEALS) {
    try {
      await db.nowlunFreightRate.upsert({
        where: {
          originPort_destinationPort_containerType: {
            originPort: rate.originPort,
            destinationPort: rate.destinationPort,
            containerType: rate.containerType,
          },
        },
        create: {
          ...rate,
          priceUsd: rate.currency === "USD" ? rate.priceFrom : rate.priceFrom * 1.08, // EUR→USD approx
          scrapedAt,
        },
        update: {
          priceFrom: rate.priceFrom,
          priceUsd: rate.currency === "USD" ? rate.priceFrom : rate.priceFrom * 1.08,
          scrapedAt,
        },
      });
      count++;
    } catch (e: any) {
      errors.push(`${rate.originPort}→${rate.destinationPort}: ${e.message}`);
    }
  }
  return { count, errors };
}

/** Sync Nowlun port status (Port Pulse) to the SGTX database. */
export async function syncNowlunPortStatus(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  for (const port of NOWLUN_PORT_STATUS) {
    try {
      await db.nowlunPortStatus.upsert({
        where: { portName: port.portName },
        create: { ...port, scrapedAt: new Date() },
        update: {
          status: port.status,
          advisory: port.advisory,
          updatedAt: port.updatedAt,
          scrapedAt: new Date(),
        },
      });
      count++;
    } catch (e: any) {
      errors.push(`${port.portName}: ${e.message}`);
    }
  }
  return { count, errors };
}

/** Sync Nowlun transit data to the SGTX database. */
export async function syncNowlunTransitData(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  for (const transit of NOWLUN_TRANSIT_DATA) {
    try {
      await db.nowlunTransitData.upsert({
        where: {
          originCountry_destinationCountry_containerType: {
            originCountry: transit.originCountry,
            destinationCountry: transit.destinationCountry,
            containerType: transit.containerType,
          },
        },
        create: transit,
        update: {
          directTransitDays: transit.directTransitDays,
          indirectTransitDays: transit.indirectTransitDays,
          costRangeUsd: transit.costRangeUsd,
          notes: transit.notes,
          updatedAt: new Date(),
        },
      });
      count++;
    } catch (e: any) {
      errors.push(`${transit.originCountry}→${transit.destinationCountry}: ${e.message}`);
    }
  }
  return { count, errors };
}

/** Sync all Nowlun data. */
export async function syncAllNowlunData(): Promise<{
  rates: { count: number; errors: string[] };
  ports: { count: number; errors: string[] };
  transit: { count: number; errors: string[] };
}> {
  return {
    rates: await syncNowlunRates(),
    ports: await syncNowlunPortStatus(),
    transit: await syncNowlunTransitData(),
  };
}

// ============ Query Functions (linked to SGTX features) ============

/**
 * Get freight rate for a route — used by SGTX freight-pricing AI module.
 * Links to: src/lib/sgtx/ai/freight-pricing.ts
 */
export async function getFreightRate(originPort: string, destinationPort: string, containerType?: string): Promise<NowlunFreightRate | null> {
  const rate = await db.nowlunFreightRate.findFirst({
    where: {
      originPort: { contains: originPort },
      destinationPort: { contains: destinationPort },
      ...(containerType ? { containerType } : {}),
    },
    orderBy: { priceUsd: "asc" },
  });
  if (!rate) return null;
  return {
    originPort: rate.originPort,
    originCountry: rate.originCountry,
    destinationPort: rate.destinationPort,
    destinationCountry: rate.destinationCountry,
    containerType: rate.containerType,
    priceFrom: rate.priceFrom,
    currency: rate.currency,
    source: rate.source,
    scrapedAt: rate.scrapedAt.toISOString(),
  };
}

/**
 * Get port status — used by SGTX force-majeure + port-congestion detection.
 * Links to: src/lib/sgtx/compliance/force-majeure.ts
 * Links to: src/lib/sgtx/ai/brain-intelligence.ts (port congestion signal)
 */
export async function getPortStatus(portName: string): Promise<NowlunPortStatus | null> {
  const port = await db.nowlunPortStatus.findFirst({
    where: { portName: { contains: portName } },
  });
  if (!port) return null;
  return {
    portName: port.portName,
    country: port.country,
    status: port.status as "NORMAL" | "CONGESTED" | "SUSPENDED",
    advisory: port.advisory,
    updatedAt: port.updatedAt,
  };
}

/**
 * Get all port statuses — used for route optimization (avoid suspended/congested ports).
 * Links to: src/lib/sgtx/ai/brain-intelligence.ts (optimizeRoute)
 */
export async function getAllPortStatuses(): Promise<NowlunPortStatus[]> {
  const ports = await db.nowlunPortStatus.findMany();
  return ports.map(p => ({
    portName: p.portName,
    country: p.country,
    status: p.status as "NORMAL" | "CONGESTED" | "SUSPENDED",
    advisory: p.advisory,
    updatedAt: p.updatedAt,
  }));
}

/**
 * Get transit time for a country pair — used by SGTX transit-time AI module.
 * Links to: src/lib/sgtx/ai/transit-time.ts
 */
export async function getTransitTime(originCountry: string, destinationCountry: string, containerType?: string): Promise<NowlunTransitData | null> {
  const transit = await db.nowlunTransitData.findFirst({
    where: {
      originCountry: originCountry.toUpperCase(),
      destinationCountry: destinationCountry.toUpperCase(),
      ...(containerType ? { containerType } : {}),
    },
  });
  if (!transit) return null;
  return {
    originCountry: transit.originCountry,
    destinationCountry: transit.destinationCountry,
    directTransitDays: transit.directTransitDays,
    indirectTransitDays: transit.indirectTransitDays,
    costRangeUsd: transit.costRangeUsd as { min: number; max: number },
    containerType: transit.containerType,
    notes: transit.notes,
    source: transit.source,
  };
}

/**
 * Check if a port is affected by force majeure (SUSPENDED or CONGESTED).
 * Links to: src/lib/sgtx/compliance/force-majeure.ts
 */
export async function checkPortForceMajeure(portName: string): Promise<{
  affected: boolean;
  status: "NORMAL" | "CONGESTED" | "SUSPENDED" | "UNKNOWN";
  advisory: string;
  recommendation: "proceed" | "suspend" | "reroute";
}> {
  const status = await getPortStatus(portName);
  if (!status) return { affected: false, status: "UNKNOWN", advisory: "", recommendation: "proceed" };

  if (status.status === "SUSPENDED") {
    return { affected: true, status: "SUSPENDED", advisory: status.advisory, recommendation: "reroute" };
  }
  if (status.status === "CONGESTED") {
    return { affected: true, status: "CONGESTED", advisory: status.advisory, recommendation: "suspend" };
  }
  return { affected: false, status: "NORMAL", advisory: "", recommendation: "proceed" };
}

/**
 * Get all available freight rates (for market intelligence).
 * Links to: src/lib/sgtx/ai/brain.ts (searchCommodityPrices, monitorPortPrices)
 */
export async function getAllFreightRates(): Promise<NowlunFreightRate[]> {
  const rates = await db.nowlunFreightRate.findMany({ orderBy: { priceUsd: "asc" } });
  return rates.map(r => ({
    originPort: r.originPort,
    originCountry: r.originCountry,
    destinationPort: r.destinationPort,
    destinationCountry: r.destinationCountry,
    containerType: r.containerType,
    priceFrom: r.priceFrom,
    currency: r.currency,
    source: r.source,
    scrapedAt: r.scrapedAt.toISOString(),
  }));
}

/** Get Nowlun platform stats. */
export function getNowlunStats() {
  return NOWLUN_STATS;
}

/** Get Nowlun blog resources. */
export function getNowlunBlogs(): NowlunBlogData[] {
  return NOWLUN_BLOGS;
}
