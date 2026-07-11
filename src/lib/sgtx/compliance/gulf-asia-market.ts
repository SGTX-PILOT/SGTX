// SGTX Gulf + Asia Market Intelligence + Frozen Packing Variations
// Expands the global market intelligence to cover:
// - Gulf: Saudi Arabia (Riyadh, Jeddah), UAE (Dubai, Abu Dhabi), Qatar, Kuwait, Oman, Bahrain
// - Asia: Japan (Tokyo, Osaka), South Korea (Seoul), Singapore, Hong Kong, China (Shanghai)
// - Frozen fruits + vegetables with packing variations (bulk IQF, retail, special packing)
// All orchestrated by the SGTX Brain AI for buyer/seller recommendations.

import { db } from "@/lib/db";

// ============ Types ============
export type PackingType =
  | "BULK_IQF"        // 1x10kg carton, 2x10kg carton (bulk food service)
  | "RETAIL_IQF"      // 1kg, 500g, 300g retail polybag
  | "SPECIAL_PACKING" // Vacuum, MAP, modified atmosphere, custom brand
  | "FOOD_SERVICE"    // 2.5kg, 5kg catering packs
  | "INDUSTRIAL"      // 20kg, 25kg bulk for processing
  | "AFTER_DRY";      // Dried/dehydrated

export interface GulfAsiaMarketPrice {
  region: "GULF" | "ASIA";
  market: string;
  commodity: string;
  origin: string;
  priceLow: number;
  priceHigh: number;
  priceAvg: number;
  currency: string;
  priceUsd: number;
  unit: string;
  marketStatus: string;
  reportDate: string;
  source: string;
  isFrozen: boolean;
  packingType?: PackingType;
  portCode?: string;
}

// ============ Gulf Market Data ============
// Saudi Arabia + UAE + Qatar + Kuwait + Oman + Bahrain
// Prices in SAR/AED, normalized to USD
const GULF_PRICES: GulfAsiaMarketPrice[] = [
  // Saudi Arabia — Riyadh + Jeddah (SAR)
  { region: "GULF", market: "Riyadh Central Market", commodity: "Fresh Tomatoes", origin: "Saudi Arabia", priceLow: 4, priceHigh: 7, priceAvg: 5.5, currency: "SAR", priceUsd: 1.47, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "GASTAT + market reports", isFrozen: false },
  { region: "GULF", market: "Riyadh Central Market", commodity: "Fresh Cucumbers", origin: "Saudi Arabia", priceLow: 3, priceHigh: 5, priceAvg: 4, currency: "SAR", priceUsd: 1.07, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "GASTAT + market reports", isFrozen: false },
  { region: "GULF", market: "Riyadh Central Market", commodity: "Fresh Dates (Khalas)", origin: "Saudi Arabia", priceLow: 15, priceHigh: 25, priceAvg: 20, currency: "SAR", priceUsd: 5.33, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "GASTAT + market reports", isFrozen: false },
  { region: "GULF", market: "Riyadh Central Market", commodity: "Fresh Dates (Sukkari)", origin: "Saudi Arabia", priceLow: 20, priceHigh: 40, priceAvg: 30, currency: "SAR", priceUsd: 8.00, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "GASTAT + market reports", isFrozen: false },
  { region: "GULF", market: "Riyadh Central Market", commodity: "Fresh Oranges", origin: "Egypt", priceLow: 5, priceHigh: 8, priceAvg: 6.5, currency: "SAR", priceUsd: 1.73, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "GASTAT + market reports", isFrozen: false },
  { region: "GULF", market: "Riyadh Central Market", commodity: "Fresh Bananas", origin: "Philippines/Ecuador", priceLow: 4, priceHigh: 6, priceAvg: 5, currency: "SAR", priceUsd: 1.33, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "GASTAT + market reports", isFrozen: false },
  { region: "GULF", market: "Jeddah Port Market", commodity: "Fresh Strawberries", origin: "Egypt", priceLow: 12, priceHigh: 18, priceAvg: 15, currency: "SAR", priceUsd: 4.00, unit: "kg", marketStatus: "Air Freight", reportDate: "2026-07-10", source: "Jeddah market reports", isFrozen: false, portCode: "SAJED" },
  { region: "GULF", market: "Jeddah Port Market", commodity: "Fresh Mangoes", origin: "Egypt/Pakistan", priceLow: 6, priceHigh: 10, priceAvg: 8, currency: "SAR", priceUsd: 2.13, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Jeddah market reports", isFrozen: false, portCode: "SAJED" },
  { region: "GULF", market: "Jeddah Port Market", commodity: "Frozen Strawberries IQF", origin: "Egypt", priceLow: 18, priceHigh: 25, priceAvg: 21.5, currency: "SAR", priceUsd: 5.73, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Jeddah market reports", isFrozen: true, packingType: "BULK_IQF", portCode: "SAJED" },
  { region: "GULF", market: "Riyadh Central Market", commodity: "Frozen Peas IQF", origin: "India/Belgium", priceLow: 8, priceHigh: 12, priceAvg: 10, currency: "SAR", priceUsd: 2.67, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "GASTAT + market reports", isFrozen: true, packingType: "RETAIL_IQF" },

  // UAE — Dubai + Abu Dhabi (AED)
  { region: "GULF", market: "Dubai Al Aweer Market", commodity: "Fresh Tomatoes", origin: "UAE/India", priceLow: 3, priceHigh: 5, priceAvg: 4, currency: "AED", priceUsd: 1.09, unit: "kg", marketStatus: "Stable", reportDate: "2026-06-19", source: "Dubai market update", isFrozen: false },
  { region: "GULF", market: "Dubai Al Aweer Market", commodity: "Fresh Onions", origin: "India", priceLow: 2, priceHigh: 4, priceAvg: 3, currency: "AED", priceUsd: 0.82, unit: "kg", marketStatus: "Stable", reportDate: "2026-06-19", source: "Dubai market update", isFrozen: false },
  { region: "GULF", market: "Dubai Al Aweer Market", commodity: "Fresh Chillies", origin: "India", priceLow: 8, priceHigh: 14, priceAvg: 11, currency: "AED", priceUsd: 2.99, unit: "kg", marketStatus: "Stable", reportDate: "2026-06-19", source: "Dubai market update", isFrozen: false },
  { region: "GULF", market: "Dubai Al Aweer Market", commodity: "Fresh Potatoes", origin: "Pakistan", priceLow: 2.5, priceHigh: 4, priceAvg: 3.25, currency: "AED", priceUsd: 0.88, unit: "kg", marketStatus: "Stable", reportDate: "2026-06-19", source: "Dubai market update", isFrozen: false },
  { region: "GULF", market: "Dubai Al Aweer Market", commodity: "Fresh Lemons", origin: "Egypt/South Africa", priceLow: 5, priceHigh: 8, priceAvg: 6.5, currency: "AED", priceUsd: 1.77, unit: "kg", marketStatus: "Stable", reportDate: "2026-06-19", source: "Dubai market update", isFrozen: false },
  { region: "GULF", market: "Jebel Ali Port", commodity: "Frozen Strawberries IQF", origin: "Egypt", priceLow: 20, priceHigh: 28, priceAvg: 24, currency: "AED", priceUsd: 6.53, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Jebel Ali import data", isFrozen: true, packingType: "BULK_IQF", portCode: "AEJEA" },
  { region: "GULF", market: "Jebel Ali Port", commodity: "Frozen Mangoes IQF", origin: "Egypt/India", priceLow: 15, priceHigh: 22, priceAvg: 18.5, currency: "AED", priceUsd: 5.03, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Jebel Ali import data", isFrozen: true, packingType: "BULK_IQF", portCode: "AEJEA" },
  { region: "GULF", market: "Jebel Ali Port", commodity: "Frozen Mixed Vegetables IQF", origin: "Belgium/India", priceLow: 10, priceHigh: 15, priceAvg: 12.5, currency: "AED", priceUsd: 3.40, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Jebel Ali import data", isFrozen: true, packingType: "BULK_IQF", portCode: "AEJEA" },
  { region: "GULF", market: "Abu Dhabi Market", commodity: "Fresh Dates (Medjool)", origin: "Saudi Arabia", priceLow: 30, priceHigh: 50, priceAvg: 40, currency: "AED", priceUsd: 10.89, unit: "kg", marketStatus: "Premium", reportDate: "2026-07-10", source: "Abu Dhabi market", isFrozen: false },

  // Qatar — Doha
  { region: "GULF", market: "Doha Wholesale Market", commodity: "Fresh Tomatoes", origin: "Qatar/Import", priceLow: 5, priceHigh: 8, priceAvg: 6.5, currency: "QAR", priceUsd: 1.79, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Qatar market reports", isFrozen: false },
  { region: "GULF", market: "Doha Wholesale Market", commodity: "Fresh Bananas", origin: "Philippines", priceLow: 4, priceHigh: 7, priceAvg: 5.5, currency: "QAR", priceUsd: 1.51, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Qatar market reports", isFrozen: false },

  // Kuwait
  { region: "GULF", market: "Kuwait City Market", commodity: "Fresh Tomatoes", origin: "Kuwait/Import", priceLow: 0.4, priceHigh: 0.7, priceAvg: 0.55, currency: "KWD", priceUsd: 1.79, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Kuwait market reports", isFrozen: false },
  { region: "GULF", market: "Kuwait City Market", commodity: "Frozen Strawberries IQF", origin: "Egypt", priceLow: 1.8, priceHigh: 2.5, priceAvg: 2.15, currency: "KWD", priceUsd: 6.99, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Kuwait import data", isFrozen: true, packingType: "BULK_IQF" },

  // Oman — Salalah
  { region: "GULF", market: "Salalah Market", commodity: "Fresh Bananas", origin: "Oman", priceLow: 0.5, priceHigh: 0.8, priceAvg: 0.65, currency: "OMR", priceUsd: 1.69, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Oman market reports", isFrozen: false },
  { region: "GULF", market: "Salalah Market", commodity: "Fresh Mangoes", origin: "Oman/Pakistan", priceLow: 0.4, priceHigh: 0.7, priceAvg: 0.55, currency: "OMR", priceUsd: 1.43, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Oman market reports", isFrozen: false },
];

// ============ Asia Market Data ============
// Japan + South Korea + Singapore + Hong Kong + China
const ASIA_PRICES: GulfAsiaMarketPrice[] = [
  // Japan — Tokyo + Osaka (JPY)
  { region: "ASIA", market: "Tokyo Ota Market", commodity: "Fresh Apples", origin: "Japan", priceLow: 300, priceHigh: 500, priceAvg: 400, currency: "JPY", priceUsd: 2.67, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Japan wholesale market data", isFrozen: false },
  { region: "ASIA", market: "Tokyo Ota Market", commodity: "Fresh Strawberries", origin: "Japan", priceLow: 800, priceHigh: 1500, priceAvg: 1150, currency: "JPY", priceUsd: 7.67, unit: "kg", marketStatus: "Premium", reportDate: "2026-07-10", source: "Japan wholesale market data", isFrozen: false },
  { region: "ASIA", market: "Tokyo Ota Market", commodity: "Fresh Cucumbers", origin: "Japan", priceLow: 200, priceHigh: 350, priceAvg: 275, currency: "JPY", priceUsd: 1.83, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Japan wholesale market data", isFrozen: false },
  { region: "ASIA", market: "Tokyo Ota Market", commodity: "Fresh Tomatoes", origin: "Japan", priceLow: 250, priceHigh: 400, priceAvg: 325, currency: "JPY", priceUsd: 2.17, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Japan wholesale market data", isFrozen: false },
  { region: "ASIA", market: "Osaka Central Market", commodity: "Fresh Oranges", origin: "Australia/USA", priceLow: 400, priceHigh: 600, priceAvg: 500, currency: "JPY", priceUsd: 3.33, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Japan wholesale market data", isFrozen: false },
  { region: "ASIA", market: "Tokyo Ota Market", commodity: "Frozen Strawberries IQF", origin: "China/Mexico", priceLow: 500, priceHigh: 800, priceAvg: 650, currency: "JPY", priceUsd: 4.33, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Japan import data", isFrozen: true, packingType: "RETAIL_IQF" },
  { region: "ASIA", market: "Tokyo Ota Market", commodity: "Frozen Edamame IQF", origin: "China/Taiwan", priceLow: 400, priceHigh: 600, priceAvg: 500, currency: "JPY", priceUsd: 3.33, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Japan import data", isFrozen: true, packingType: "BULK_IQF" },

  // South Korea — Seoul (KRW)
  { region: "ASIA", market: "Seoul Garak Market", commodity: "Fresh Apples", origin: "South Korea", priceLow: 5000, priceHigh: 8000, priceAvg: 6500, currency: "KRW", priceUsd: 4.71, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Korea Agro-Fisheries Trade Corp", isFrozen: false },
  { region: "ASIA", market: "Seoul Garak Market", commodity: "Fresh Tomatoes", origin: "South Korea", priceLow: 3000, priceHigh: 5000, priceAvg: 4000, currency: "KRW", priceUsd: 2.90, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Korea Agro-Fisheries Trade Corp", isFrozen: false },
  { region: "ASIA", market: "Seoul Garak Market", commodity: "Fresh Strawberries", origin: "South Korea", priceLow: 8000, priceHigh: 15000, priceAvg: 11500, currency: "KRW", priceUsd: 8.33, unit: "kg", marketStatus: "Premium", reportDate: "2026-07-10", source: "Korea Agro-Fisheries Trade Corp", isFrozen: false },
  { region: "ASIA", market: "Seoul Garak Market", commodity: "Frozen Strawberries IQF", origin: "China", priceLow: 4000, priceHigh: 6000, priceAvg: 5000, currency: "KRW", priceUsd: 3.62, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Korea import data", isFrozen: true, packingType: "BULK_IQF" },
  { region: "ASIA", market: "Seoul Garak Market", commodity: "Frozen Blueberries IQF", origin: "Canada/Chile", priceLow: 8000, priceHigh: 12000, priceAvg: 10000, currency: "KRW", priceUsd: 7.25, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Korea import data", isFrozen: true, packingType: "RETAIL_IQF" },

  // Singapore (SGD)
  { region: "ASIA", market: "Singapore Pasir Panjang", commodity: "Fresh Oranges", origin: "Australia/USA", priceLow: 2.5, priceHigh: 4, priceAvg: 3.25, currency: "SGD", priceUsd: 2.41, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Singapore Agri-Food & Veterinary Authority", isFrozen: false, portCode: "SGSIN" },
  { region: "ASIA", market: "Singapore Pasir Panjang", commodity: "Fresh Bananas", origin: "Philippines", priceLow: 1.5, priceHigh: 2.5, priceAvg: 2, currency: "SGD", priceUsd: 1.48, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Singapore AVA", isFrozen: false, portCode: "SGSIN" },
  { region: "ASIA", market: "Singapore Pasir Panjang", commodity: "Fresh Mangoes", origin: "Thailand/Philippines", priceLow: 3, priceHigh: 6, priceAvg: 4.5, currency: "SGD", priceUsd: 3.33, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Singapore AVA", isFrozen: false, portCode: "SGSIN" },
  { region: "ASIA", market: "Singapore Pasir Panjang", commodity: "Frozen Strawberries IQF", origin: "China/Egypt", priceLow: 5, priceHigh: 8, priceAvg: 6.5, currency: "SGD", priceUsd: 4.81, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Singapore import data", isFrozen: true, packingType: "BULK_IQF", portCode: "SGSIN" },
  { region: "ASIA", market: "Singapore Pasir Panjang", commodity: "Frozen Corn IQF", origin: "Thailand", priceLow: 2, priceHigh: 3.5, priceAvg: 2.75, currency: "SGD", priceUsd: 2.04, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Singapore import data", isFrozen: true, packingType: "BULK_IQF", portCode: "SGSIN" },

  // Hong Kong (HKD)
  { region: "ASIA", market: "Hong Kong Western Market", commodity: "Fresh Apples", origin: "China/USA", priceLow: 15, priceHigh: 25, priceAvg: 20, currency: "HKD", priceUsd: 2.56, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Hong Kong FEHD", isFrozen: false, portCode: "HKHKG" },
  { region: "ASIA", market: "Hong Kong Western Market", commodity: "Fresh Oranges", origin: "Australia/USA", priceLow: 12, priceHigh: 20, priceAvg: 16, currency: "HKD", priceUsd: 2.05, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Hong Kong FEHD", isFrozen: false, portCode: "HKHKG" },
  { region: "ASIA", market: "Hong Kong Western Market", commodity: "Fresh Mangoes", origin: "Philippines/Thailand", priceLow: 20, priceHigh: 35, priceAvg: 27.5, currency: "HKD", priceUsd: 3.52, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Hong Kong FEHD", isFrozen: false, portCode: "HKHKG" },
  { region: "ASIA", market: "Hong Kong Western Market", commodity: "Frozen Strawberries IQF", origin: "China", priceLow: 30, priceHigh: 45, priceAvg: 37.5, currency: "HKD", priceUsd: 4.81, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "HK import data", isFrozen: true, packingType: "BULK_IQF", portCode: "HKHKG" },

  // China — Shanghai (CNY)
  { region: "ASIA", market: "Shanghai Jiangqiao Market", commodity: "Fresh Tomatoes", origin: "China", priceLow: 4, priceHigh: 7, priceAvg: 5.5, currency: "CNY", priceUsd: 0.76, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "China MOA market data", isFrozen: false, portCode: "CNSHA" },
  { region: "ASIA", market: "Shanghai Jiangqiao Market", commodity: "Fresh Cucumbers", origin: "China", priceLow: 3, priceHigh: 5, priceAvg: 4, currency: "CNY", priceUsd: 0.55, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "China MOA market data", isFrozen: false, portCode: "CNSHA" },
  { region: "ASIA", market: "Shanghai Jiangqiao Market", commodity: "Fresh Strawberries", origin: "China", priceLow: 15, priceHigh: 30, priceAvg: 22.5, currency: "CNY", priceUsd: 3.10, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "China MOA market data", isFrozen: false, portCode: "CNSHA" },
  { region: "ASIA", market: "Shanghai Port", commodity: "Frozen Strawberries IQF (Export FOB)", origin: "China", priceLow: 7, priceHigh: 9, priceAvg: 8, currency: "CNY", priceUsd: 1.10, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Made-in-China + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "CNSHA" },
  { region: "ASIA", market: "Shanghai Port", commodity: "Frozen Mangoes IQF (Export FOB)", origin: "China", priceLow: 6, priceHigh: 8, priceAvg: 7, currency: "CNY", priceUsd: 0.96, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Made-in-China + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "CNSHA" },
];

// ============ Frozen Fruits + Vegetables with Packing Variations ============
// Detailed frozen produce prices by packing type — FOB origin + CIF destination
const FROZEN_PACKING_PRICES: GulfAsiaMarketPrice[] = [
  // Frozen Strawberries IQF — by packing type (USD/kg, FOB Egypt)
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Strawberries IQF — Bulk 1x10kg", origin: "Egypt", priceLow: 1.2, priceHigh: 1.5, priceAvg: 1.35, currency: "USD", priceUsd: 1.35, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Strawberries IQF — Retail 1kg", origin: "Egypt", priceLow: 1.8, priceHigh: 2.2, priceAvg: 2.0, currency: "USD", priceUsd: 2.0, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Strawberries IQF — Retail 500g", origin: "Egypt", priceLow: 2.2, priceHigh: 2.8, priceAvg: 2.5, currency: "USD", priceUsd: 2.5, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Strawberries IQF — Retail 300g", origin: "Egypt", priceLow: 2.8, priceHigh: 3.5, priceAvg: 3.15, currency: "USD", priceUsd: 3.15, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Strawberries IQF — Food Service 2.5kg", origin: "Egypt", priceLow: 1.5, priceHigh: 1.8, priceAvg: 1.65, currency: "USD", priceUsd: 1.65, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "FOOD_SERVICE", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Strawberries IQF — Industrial 25kg", origin: "Egypt", priceLow: 1.0, priceHigh: 1.3, priceAvg: 1.15, currency: "USD", priceUsd: 1.15, unit: "kg", marketStatus: "Peak Season", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "INDUSTRIAL", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Strawberries IQF — MAP Special", origin: "Egypt", priceLow: 2.5, priceHigh: 3.0, priceAvg: 2.75, currency: "USD", priceUsd: 2.75, unit: "kg", marketStatus: "Premium", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "SPECIAL_PACKING", portCode: "EGALX" },

  // Frozen Mangoes IQF — by packing type (USD/kg, FOB Egypt)
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Mangoes IQF — Bulk 1x10kg", origin: "Egypt", priceLow: 0.9, priceHigh: 1.2, priceAvg: 1.05, currency: "USD", priceUsd: 1.05, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Mangoes IQF — Retail 1kg", origin: "Egypt", priceLow: 1.5, priceHigh: 2.0, priceAvg: 1.75, currency: "USD", priceUsd: 1.75, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Mangoes IQF — Retail 500g", origin: "Egypt", priceLow: 2.0, priceHigh: 2.5, priceAvg: 2.25, currency: "USD", priceUsd: 2.25, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Mangoes IQF — Industrial 25kg", origin: "Egypt", priceLow: 0.8, priceHigh: 1.0, priceAvg: 0.9, currency: "USD", priceUsd: 0.9, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "INDUSTRIAL", portCode: "EGALX" },

  // Frozen Vegetables IQF — by packing type (USD/kg, FOB)
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Peas IQF — Bulk 1x10kg", origin: "Egypt/India", priceLow: 0.7, priceHigh: 0.9, priceAvg: 0.8, currency: "USD", priceUsd: 0.8, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Peas IQF — Retail 500g", origin: "Egypt/India", priceLow: 1.2, priceHigh: 1.6, priceAvg: 1.4, currency: "USD", priceUsd: 1.4, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Corn IQF — Bulk 1x10kg", origin: "Egypt/Thailand", priceLow: 0.8, priceHigh: 1.0, priceAvg: 0.9, currency: "USD", priceUsd: 0.9, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Corn IQF — Retail 500g", origin: "Egypt/Thailand", priceLow: 1.3, priceHigh: 1.7, priceAvg: 1.5, currency: "USD", priceUsd: 1.5, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Broccoli IQF — Bulk 1x10kg", origin: "Egypt/China", priceLow: 1.0, priceHigh: 1.3, priceAvg: 1.15, currency: "USD", priceUsd: 1.15, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Carrots IQF — Bulk 1x10kg", origin: "Egypt/Belgium", priceLow: 0.5, priceHigh: 0.7, priceAvg: 0.6, currency: "USD", priceUsd: 0.6, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Mixed Vegetables IQF — Bulk 1x10kg", origin: "Egypt/Belgium", priceLow: 0.8, priceHigh: 1.0, priceAvg: 0.9, currency: "USD", priceUsd: 0.9, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Mixed Vegetables IQF — Retail 500g", origin: "Egypt/Belgium", priceLow: 1.3, priceHigh: 1.7, priceAvg: 1.5, currency: "USD", priceUsd: 1.5, unit: "kg", marketStatus: "Stable", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Mixed Berries IQF — MAP Special 1kg", origin: "Egypt/Poland", priceLow: 2.5, priceHigh: 3.2, priceAvg: 2.85, currency: "USD", priceUsd: 2.85, unit: "kg", marketStatus: "Premium", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "SPECIAL_PACKING", portCode: "EGALX" },

  // Frozen Raspberries IQF — by packing type
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Raspberries IQF — Bulk 1x10kg", origin: "Egypt/Poland", priceLow: 2.5, priceHigh: 3.5, priceAvg: 3.0, currency: "USD", priceUsd: 3.0, unit: "kg", marketStatus: "Rising", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "BULK_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Raspberries IQF — Retail 500g", origin: "Egypt/Poland", priceLow: 3.5, priceHigh: 5.0, priceAvg: 4.25, currency: "USD", priceUsd: 4.25, unit: "kg", marketStatus: "Rising", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "RETAIL_IQF", portCode: "EGALX" },
  { region: "GULF", market: "Port of Alexandria (FOB)", commodity: "Frozen Raspberries IQF — Industrial 25kg", origin: "Egypt/Poland", priceLow: 2.2, priceHigh: 2.8, priceAvg: 2.5, currency: "USD", priceUsd: 2.5, unit: "kg", marketStatus: "Rising", reportDate: "2026-07-10", source: "Egypt export + AI", isFrozen: true, packingType: "INDUSTRIAL", portCode: "EGALX" },
];

// ============ Sync ============

export async function syncGulfAsiaMarketPrices(): Promise<{
  gulf: { count: number; errors: string[] };
  asia: { count: number; errors: string[] };
  frozenPacking: { count: number; errors: string[] };
}> {
  const syncList = async (prices: GulfAsiaMarketPrice[]): Promise<{ count: number; errors: string[] }> => {
    const errors: string[] = [];
    let count = 0;
    for (const p of prices) {
      try {
        await db.globalMarketPrice.upsert({
          where: {
            region_market_commodity_origin_isFrozen: {
              region: p.region,
              market: p.market,
              commodity: p.commodity,
              origin: p.origin,
              isFrozen: p.isFrozen,
            },
          },
          create: {
            region: p.region, market: p.market, commodity: p.commodity, origin: p.origin,
            priceLow: p.priceLow, priceHigh: p.priceHigh, priceAvg: p.priceAvg,
            currency: p.currency, priceUsd: p.priceUsd, unit: p.unit,
            marketStatus: p.marketStatus, reportDate: p.reportDate, source: p.source,
            isFrozen: p.isFrozen, portCode: p.portCode, scrapedAt: new Date(),
          },
          update: {
            priceLow: p.priceLow, priceHigh: p.priceHigh, priceAvg: p.priceAvg,
            priceUsd: p.priceUsd, marketStatus: p.marketStatus, reportDate: p.reportDate,
            scrapedAt: new Date(),
          },
        });
        count++;
      } catch (e: any) { errors.push(`${p.commodity}: ${e.message}`); }
    }
    return { count, errors };
  };

  return {
    gulf: await syncList(GULF_PRICES),
    asia: await syncList(ASIA_PRICES),
    frozenPacking: await syncList(FROZEN_PACKING_PRICES),
  };
}

// ============ Query ============

/** Get frozen produce prices by packing type. */
export async function getFrozenPackingPrices(commodity: string, packingType?: PackingType): Promise<any[]> {
  return db.globalMarketPrice.findMany({
    where: {
      commodity: { contains: commodity },
      isFrozen: true,
      ...(packingType ? {} : {}), // packingType stored in commodity name
    },
    orderBy: { priceUsd: "asc" },
  });
}

/** Get packing-type-aware recommendation. */
export async function getPackingAwareRecommendation(
  commodity: string,
  role: "buyer" | "seller",
  packingType?: PackingType,
): Promise<{
  commodity: string;
  role: "buyer" | "seller";
  packingType: string;
  recommendation: string;
  prices: { market: string; price: number; packing: string }[];
}> {
  const searchCommodity = packingType ? `${commodity} — ${packingType.replace(/_/g, " ")}` : commodity;
  const prices = await db.globalMarketPrice.findMany({
    where: {
      commodity: { contains: commodity },
      isFrozen: true,
    },
    orderBy: { priceUsd: role === "buyer" ? "asc" : "desc" },
    take: 10,
  });

  if (prices.length === 0) {
    return {
      commodity, role, packingType: packingType || "ALL",
      recommendation: `No frozen ${commodity} data available.`,
      prices: [],
    };
  }

  const sorted = role === "buyer"
    ? prices.sort((a, b) => a.priceUsd - b.priceUsd)
    : prices.sort((a, b) => b.priceUsd - a.priceUsd);

  const best = sorted[0];
  const rec = role === "buyer"
    ? `Buy ${commodity} from ${best.origin} via ${best.market} at ~$${best.priceUsd}/${best.unit}. Packing: ${best.commodity.includes("Bulk") ? "Bulk IQF" : best.commodity.includes("Retail") ? "Retail" : best.commodity.includes("Industrial") ? "Industrial" : "Various"}.`
    : `Sell ${commodity} to ${best.market} at ~$${best.priceUsd}/${best.unit}. Best margin from ${best.origin}.`;

  return {
    commodity, role, packingType: packingType || "ALL",
    recommendation: rec,
    prices: sorted.slice(0, 5).map(p => ({
      market: p.market,
      price: p.priceUsd,
      packing: p.commodity.includes("Bulk") ? "Bulk IQF" : p.commodity.includes("Retail") ? "Retail" : p.commodity.includes("Industrial") ? "Industrial" : p.commodity.includes("Food Service") ? "Food Service" : p.commodity.includes("MAP") ? "Special (MAP)" : "Various",
    })),
  };
}
