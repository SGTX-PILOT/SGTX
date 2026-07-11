// SGTX USDA AgMarketNews Integration — USA Produce Market Prices
// Scrapes agmarketnews.com/produce-markets/ for daily wholesale produce prices
// from 6 US terminal markets (Baltimore, New York, Philadelphia — Fruit + Vegetable).
// Links to SGTX Brain AI: market intelligence, price validation, buyer/seller recommendations.

import { db } from "@/lib/db";

const AGM_BASE = "https://agmarketnews.com/produce-markets";

// ============ Types ============
export interface AgMarketPriceEntry {
  market: string;
  commodity: string;
  origin: string;
  gradeSize: string;
  priceLow: number;
  priceHigh: number;
  priceAvg: number;
  marketStatus: string;
  reportDate: string;
  reportCode: string;
  commodityCategory: "FRUIT" | "VEGETABLE";
}

export interface AgMarketSyncResult {
  entriesCount: number;
  marketsCount: number;
  commoditiesCount: number;
  errors: string[];
  durationMs: number;
  syncedAt: string;
}

// ============ Market Definitions ============
const MARKETS = [
  { slug: "baltimore-fruit-terminal-market", name: "Baltimore Fruit Terminal Market", category: "FRUIT" as const },
  { slug: "baltimore-vegetable-terminal-market", name: "Baltimore Vegetable Terminal Market", category: "VEGETABLE" as const },
  { slug: "new-york-fruit-terminal-market", name: "New York Fruit Terminal Market", category: "FRUIT" as const },
  { slug: "new-york-vegetable-terminal-market", name: "New York Vegetable Terminal Market", category: "VEGETABLE" as const },
  { slug: "philadelphia-fruit-terminal-market", name: "Philadelphia Fruit Terminal Market", category: "FRUIT" as const },
  { slug: "philadelphia-vegetable-terminal-market", name: "Philadelphia Vegetable Terminal Market", category: "VEGETABLE" as const },
];

// ============ Scraper ============

/** Fetch and parse a terminal market page. */
async function fetchMarketPage(slug: string): Promise<{ text: string; title: string }> {
  const res = await fetch(`${AGM_BASE}/${slug}/`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SGTX-Brain-OS/1.0; USDA Market Scraper)",
      "Accept": "text/html",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${slug}`);
  const html = await res.text();
  // Strip scripts/styles/tags
  const clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  const text = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return { text, title: titleMatch?.[1]?.trim() || slug };
}

/** Parse market text to extract commodity price entries. */
export function parseMarketPrices(text: string, marketName: string, category: "FRUIT" | "VEGETABLE"): AgMarketPriceEntry[] {
  const entries: AgMarketPriceEntry[] = [];

  // Extract report date
  const dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+,\s+\d{4}/);
  const reportDate = dateMatch?.[0] || "Unknown";

  // Extract report code (e.g. BP_FV010, NX_FV020)
  const codeMatch = text.match(/\b([A-Z]{2,3}_FV\d{3})\b/);
  const reportCode = codeMatch?.[1] || "";

  // Split by --- to get commodity sections
  const sections = text.split(/---/);
  let currentCommodity = "";
  let currentStatus = "";

  for (const section of sections) {
    const s = section.trim();
    if (!s) continue;

    // Check if section starts with commodity name + MARKET status
    // Also capture sub-commodities (e.g. BERRIES---BLACKBERRIES: MARKET STEADY)
    const commodMatch = s.match(/^([A-Z][A-Z\s,]+?):\s*MARKET\s+(\w+(?:\s\w+)*)/);
    if (commodMatch) {
      // If the commodity name contains a parent category (like BERRIES), check for sub-commodity
      const name = commodMatch[1].trim();
      // Common parent categories that have sub-commodities
      const parentCats = ["BERRIES", "CITRUS", "MELONS", "OTHER FRUIT", "OTHER", "TROPIAL", "TROPICAL", "HERBS", "GREENS", "SQUASH", "PEPPERS", "TOMATOES", "ONIONS", "BEANS", "PEAS", "LETTUCE", "ROOT"];
      const isParent = parentCats.some(c => name.includes(c));
      if (isParent && s.length > 50) {
        // This is a parent category — try to find sub-commodity name in the text
        // Pattern: PARENT---SUBCOMMODITY: MARKET STATUS
        const subMatch = s.match(/^([A-Z][A-Z\s,]+?):\s*MARKET\s+\w+(?:\s\w+)*\.\s*(?:flats|cartons|containers|bushel|kg|lb|cases|bags|bins)?\s+(?:[A-Z][A-Z\s]+)?([A-Z][A-Z]+)\s/);
        if (subMatch) {
          currentCommodity = subMatch[2].trim();
        } else {
          currentCommodity = name;
        }
      } else {
        currentCommodity = name;
      }
      currentStatus = commodMatch[2].trim();
    }

    if (!currentCommodity || !currentStatus) continue;

    // Extract price entries: ORIGIN [grade/size] price[-price]
    // Pattern: UPPERCASE ORIGIN + mixed grade/size + number[-number]
    const pricePattern = /([A-Z][A-Z\s]+?)\s+([A-Z][A-Z\s\d/"\'.]+?)\s+(\d+\.?\d*)(?:\s*-\s*(\d+\.?\d*))?(?:\s+few\s+(?:higher|lower))?/g;
    let match;
    while ((match = pricePattern.exec(s)) !== null) {
      const origin = match[1].trim();
      const gradeSize = match[2].trim();
      const priceLow = parseFloat(match[3]);
      const priceHigh = match[4] ? parseFloat(match[4]) : priceLow;

      // Filter: prices should be reasonable ($0.50 - $10,000)
      if (priceLow < 0.5 || priceLow > 10000) continue;
      // Filter: origin should be a known location (uppercase, 2+ chars)
      if (origin.length < 2 || origin.length > 40) continue;

      entries.push({
        market: marketName,
        commodity: currentCommodity,
        origin,
        gradeSize,
        priceLow,
        priceHigh,
        priceAvg: Math.round(((priceLow + priceHigh) / 2) * 100) / 100,
        marketStatus: currentStatus,
        reportDate,
        reportCode,
        commodityCategory: category,
      });
    }
  }

  return entries;
}

// ============ Sync ============

/** Sync all 6 US terminal market prices. */
export async function syncAgMarketPrices(): Promise<AgMarketSyncResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  let entriesCount = 0;
  const commoditiesSet = new Set<string>();
  const marketsSet = new Set<string>();
  const scrapedAt = new Date();

  for (const market of MARKETS) {
    try {
      const { text } = await fetchMarketPage(market.slug);
      const entries = parseMarketPrices(text, market.name, market.category);

      for (const entry of entries) {
        try {
          await db.agMarketPrice.create({
            data: {
              market: entry.market,
              commodity: entry.commodity,
              origin: entry.origin,
              gradeSize: entry.gradeSize,
              priceLow: entry.priceLow,
              priceHigh: entry.priceHigh,
              priceAvg: entry.priceAvg,
              marketStatus: entry.marketStatus,
              reportDate: entry.reportDate,
              reportCode: entry.reportCode,
              commodityCategory: entry.commodityCategory,
              scrapedAt,
            },
          });
          entriesCount++;
          commoditiesSet.add(entry.commodity);
          marketsSet.add(entry.market);
        } catch (e: any) {
          // Duplicate or DB error — skip
        }
      }
    } catch (e: any) {
      errors.push(`${market.slug}: ${e.message}`);
    }
  }

  // Record sync log
  await db.agMarketSyncLog.create({
    data: {
      syncedAt: new Date(),
      entriesCount,
      marketsCount: marketsSet.size,
      commoditiesCount: commoditiesSet.size,
      errorCount: errors.length,
      errors: JSON.stringify(errors.slice(0, 50)),
      durationMs: Date.now() - startedAt,
    },
  }).catch(() => {});

  return {
    entriesCount,
    marketsCount: marketsSet.size,
    commoditiesCount: commoditiesSet.size,
    errors,
    durationMs: Date.now() - startedAt,
    syncedAt: new Date().toISOString(),
  };
}

// ============ Query Functions ============

/**
 * Get current market price for a commodity — used by Brain AI market intelligence.
 * Returns the average price across all US terminal markets.
 */
export async function getCommodityPrice(commodity: string): Promise<{
  commodity: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  marketStatus: string;
  markets: string[];
  origins: string[];
  reportDate: string;
  entries: number;
} | null> {
  const entries = await db.agMarketPrice.findMany({
    where: { commodity: { contains: commodity.toUpperCase() } },
    orderBy: { scrapedAt: "desc" },
    take: 100,
  });

  if (entries.length === 0) return null;

  const prices = entries.map(e => e.priceAvg);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const markets = [...new Set(entries.map(e => e.market))];
  const origins = [...new Set(entries.map(e => e.origin))];
  const statuses = [...new Set(entries.map(e => e.marketStatus))];

  return {
    commodity: entries[0].commodity,
    avgPrice: Math.round(avgPrice * 100) / 100,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    marketStatus: statuses.join(", "),
    markets,
    origins,
    reportDate: entries[0].reportDate,
    entries: entries.length,
  };
}

/**
 * Get market average recommendation for buyers/sellers.
 * The Brain AI uses this to advise SGTX traders on US market pricing.
 */
export async function getMarketRecommendation(commodity: string, role: "buyer" | "seller"): Promise<{
  commodity: string;
  role: "buyer" | "seller";
  marketAvg: number;
  marketMin: number;
  marketMax: number;
  recommendation: string;
  priceRange: string;
  marketTrend: string;
  bestMarket: string;
  bestOrigin: string;
  reportDate: string;
}> {
  const price = await getCommodityPrice(commodity);
  if (!price) {
    return {
      commodity,
      role,
      marketAvg: 0,
      marketMin: 0,
      marketMax: 0,
      recommendation: `No market data available for ${commodity}. Check back after the next daily sync.`,
      priceRange: "N/A",
      marketTrend: "Unknown",
      bestMarket: "N/A",
      bestOrigin: "N/A",
      reportDate: "N/A",
    };
  }

  // Find cheapest market (for buyers) or most expensive (for sellers)
  const entries = await db.agMarketPrice.findMany({
    where: { commodity: { contains: commodity.toUpperCase() } },
    orderBy: { scrapedAt: "desc" },
    take: 100,
  });

  const byMarket = new Map<string, number[]>();
  const byOrigin = new Map<string, number[]>();
  for (const e of entries) {
    if (!byMarket.has(e.market)) byMarket.set(e.market, []);
    byMarket.get(e.market)!.push(e.priceAvg);
    if (!byOrigin.has(e.origin)) byOrigin.set(e.origin, []);
    byOrigin.get(e.origin)!.push(e.priceAvg);
  }

  const marketAvgs = Array.from(byMarket.entries()).map(([m, ps]) => ({ market: m, avg: ps.reduce((a, b) => a + b, 0) / ps.length }));
  const originAvgs = Array.from(byOrigin.entries()).map(([o, ps]) => ({ origin: o, avg: ps.reduce((a, b) => a + b, 0) / ps.length }));

  const sortedMarkets = marketAvgs.sort((a, b) => a.avg - b.avg);
  const sortedOrigins = originAvgs.sort((a, b) => a.avg - b.avg);

  const bestMarket = role === "buyer" ? sortedMarkets[0]?.market : sortedMarkets[sortedMarkets.length - 1]?.market;
  const bestOrigin = role === "buyer" ? sortedOrigins[0]?.origin : sortedOrigins[sortedOrigins.length - 1]?.origin;

  const trend = price.marketStatus.includes("HIGHER") ? "Rising" : price.marketStatus.includes("LOWER") ? "Falling" : "Stable";

  const recommendation = role === "buyer"
    ? `Buy ${commodity} from ${bestOrigin} via ${bestMarket} at ~$${Math.round(sortedMarkets[0]?.avg || price.marketAvg)}/unit. Market is ${trend.toLowerCase()}. Average across US markets: $${price.avgPrice}/unit (range $${price.minPrice}-$${price.maxPrice}).`
    : `Sell ${commodity} to ${bestMarket} at ~$${Math.round(sortedMarkets[sortedMarkets.length - 1]?.avg || price.marketAvg)}/unit. Market is ${trend.toLowerCase()}. Average across US markets: $${price.avgPrice}/unit (range $${price.minPrice}-$${price.maxPrice}). Best origin to source from: ${bestOrigin}.`;

  return {
    commodity,
    role,
    marketAvg: price.avgPrice,
    marketMin: price.minPrice,
    marketMax: price.maxPrice,
    recommendation,
    priceRange: `$${price.minPrice} - $${price.maxPrice}`,
    marketTrend: trend,
    bestMarket: bestMarket || "N/A",
    bestOrigin: bestOrigin || "N/A",
    reportDate: price.reportDate,
  };
}

/** Get all commodities with current prices. */
export async function getAllCommodities(): Promise<{ commodity: string; category: string; avgPrice: number; entries: number }[]> {
  const result = await db.agMarketPrice.groupBy({
    by: ["commodity", "commodityCategory"],
    _avg: { priceAvg: true },
    _count: true,
    orderBy: { commodity: "asc" },
  });
  return result.map(r => ({
    commodity: r.commodity,
    category: r.commodityCategory,
    avgPrice: Math.round((r._avg.priceAvg || 0) * 100) / 100,
    entries: r._count,
  }));
}

/** Get database stats. */
export async function getAgMarketStats() {
  const [total, lastSync, commodities, markets] = await Promise.all([
    db.agMarketPrice.count(),
    db.agMarketSyncLog.findFirst({ orderBy: { syncedAt: "desc" } }),
    db.agMarketPrice.groupBy({ by: ["commodity"], _count: true }),
    db.agMarketPrice.groupBy({ by: ["market"], _count: true }),
  ]);
  return {
    totalEntries: total,
    uniqueCommodities: commodities.length,
    uniqueMarkets: markets.length,
    lastSync: lastSync ? {
      syncedAt: lastSync.syncedAt,
      entriesCount: lastSync.entriesCount,
      commoditiesCount: lastSync.commoditiesCount,
      marketsCount: lastSync.marketsCount,
      durationMs: lastSync.durationMs,
    } : null,
    markets: markets.map(m => ({ name: m.market, count: m._count })),
  };
}
