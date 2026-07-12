// SGTX HS Code Detection Engine (Blueprint Part 4.3 — AI Product Form Agent)
// Uses a comprehensive local HS code database + multi-provider AI (Gemini →
// OpenAI → Groq → HuggingFace → static) for classification.

export interface HsCodeMatch {
  hsCode: string;
  description: string;
  category: string;
  confidence: number; // 0-1
  source: "exact" | "fuzzy" | "ai";
}

// ============ Comprehensive HS Code Database ============
// Based on WTO Harmonized System 2022 — agricultural & food products
const HS_CODE_DB: { hs: string; desc: string; keywords: string[]; category: string }[] = [
  // Section I: Live Animals & Products (Ch 1-5)
  { hs: "0102.21", desc: "Live cattle", keywords: ["cattle", "cow", "bovine", "bull", "calf"], category: "Live Animals" },
  { hs: "0103.91", desc: "Live swine", keywords: ["pig", "swine", "hog", "pork"], category: "Live Animals" },
  { hs: "0104.20", desc: "Live sheep", keywords: ["sheep", "lamb", "ewe", "ram"], category: "Live Animals" },
  { hs: "0105.11", desc: "Live poultry (fowls)", keywords: ["chicken", "poultry", "fowl", "hen", "rooster"], category: "Live Animals" },
  // Section II: Vegetable Products (Ch 6-14)
  { hs: "0601.20", desc: "Bulbs, tubers, tuberous roots", keywords: ["bulb", "tuber", "tulip", "dahlia"], category: "Plants" },
  { hs: "0602.20", desc: "Fruit trees and shrubs", keywords: ["fruit tree", "sapling", "seedling", "nursery stock"], category: "Plants" },
  { hs: "0701.90", desc: "Potatoes, fresh or chilled", keywords: ["potato", "potatoes"], category: "Fresh Vegetables" },
  { hs: "0702.00", desc: "Tomatoes, fresh or chilled", keywords: ["tomato", "tomatoes"], category: "Fresh Vegetables" },
  { hs: "0703.10", desc: "Onions and shallots, fresh", keywords: ["onion", "onions", "shallot", "shallots"], category: "Fresh Vegetables" },
  { hs: "0703.20", desc: "Garlic, fresh or chilled", keywords: ["garlic"], category: "Fresh Vegetables" },
  { hs: "0704.10", desc: "Cauliflowers and broccoli", keywords: ["cauliflower", "broccoli"], category: "Fresh Vegetables" },
  { hs: "0705.11", desc: "Cabbage, fresh", keywords: ["cabbage"], category: "Fresh Vegetables" },
  { hs: "0705.21", desc: "Lettuce, fresh", keywords: ["lettuce"], category: "Fresh Vegetables" },
  { hs: "0706.10", desc: "Carrots and turnips, fresh", keywords: ["carrot", "carrots", "turnip", "turnips"], category: "Fresh Vegetables" },
  { hs: "0707.00", desc: "Cucumbers and gherkins, fresh", keywords: ["cucumber", "cucumbers", "gherkin", "gherkins"], category: "Fresh Vegetables" },
  { hs: "0708.20", desc: "Beans, fresh", keywords: ["beans", "green beans", "string beans"], category: "Fresh Vegetables" },
  { hs: "0709.30", desc: "Eggplants, fresh", keywords: ["eggplant", "aubergine"], category: "Fresh Vegetables" },
  { hs: "0709.40", desc: "Celery, fresh", keywords: ["celery"], category: "Fresh Vegetables" },
  { hs: "0709.52", desc: "Mushrooms, fresh", keywords: ["mushroom", "mushrooms"], category: "Fresh Vegetables" },
  { hs: "0710.21", desc: "Peas, frozen", keywords: ["peas", "frozen peas", "green peas"], category: "Frozen Vegetables" },
  { hs: "0710.22", desc: "Beans, frozen", keywords: ["frozen beans"], category: "Frozen Vegetables" },
  { hs: "0710.30", desc: "Spinach, frozen", keywords: ["frozen spinach", "spinach frozen"], category: "Frozen Vegetables" },
  { hs: "0710.80", desc: "Other vegetables, frozen", keywords: ["frozen vegetables", "frozen mixed vegetables"], category: "Frozen Vegetables" },
  { hs: "0711.51", desc: "Mushrooms, provisionally preserved", keywords: ["preserved mushrooms"], category: "Preserved Vegetables" },
  { hs: "0712.31", desc: "Dried mushrooms", keywords: ["dried mushrooms", "dried shiitake"], category: "Dried Vegetables" },
  { hs: "0713.33", desc: "Kidney beans, dried", keywords: ["kidney beans", "dried beans"], category: "Dried Legumes" },
  { hs: "0714.20", desc: "Sweet potatoes, fresh", keywords: ["sweet potato", "sweet potatoes", "yam"], category: "Fresh Vegetables" },
  // Fruits (Ch 8)
  { hs: "0803.90", desc: "Bananas, fresh", keywords: ["banana", "bananas", "plantain"], category: "Fresh Fruits" },
  { hs: "0804.50", desc: "Guavas, mangoes, fresh", keywords: ["mango", "mangoes", "guava", "guavas"], category: "Fresh Fruits" },
  { hs: "0805.10", desc: "Oranges, fresh", keywords: ["orange", "oranges", "valencia", "navel"], category: "Fresh Fruits" },
  { hs: "0805.21", desc: "Mandarins, fresh", keywords: ["mandarin", "mandarins", "tangerine", "clementine"], category: "Fresh Fruits" },
  { hs: "0805.50", desc: "Lemons and limes, fresh", keywords: ["lemon", "lemons", "lime", "limes", "eureka"], category: "Fresh Fruits" },
  { hs: "0805.40", desc: "Grapefruit, fresh", keywords: ["grapefruit"], category: "Fresh Fruits" },
  { hs: "0806.10", desc: "Grapes, fresh", keywords: ["grape", "grapes"], category: "Fresh Fruits" },
  { hs: "0807.11", desc: "Watermelons, fresh", keywords: ["watermelon", "watermelons"], category: "Fresh Fruits" },
  { hs: "0807.20", desc: "Papayas, fresh", keywords: ["papaya", "papayas"], category: "Fresh Fruits" },
  { hs: "0808.10", desc: "Apples, fresh", keywords: ["apple", "apples"], category: "Fresh Fruits" },
  { hs: "0808.30", desc: "Pears, fresh", keywords: ["pear", "pears"], category: "Fresh Fruits" },
  { hs: "0809.10", desc: "Apricots, fresh", keywords: ["apricot", "apricots"], category: "Fresh Fruits" },
  { hs: "0809.21", desc: "Cherries, fresh", keywords: ["cherry", "cherries"], category: "Fresh Fruits" },
  { hs: "0809.30", desc: "Peaches, fresh", keywords: ["peach", "peaches", "nectarine"], category: "Fresh Fruits" },
  { hs: "0809.40", desc: "Plums, fresh", keywords: ["plum", "plums", "prune"], category: "Fresh Fruits" },
  { hs: "0810.10", desc: "Strawberries, fresh", keywords: ["strawberry", "strawberries", "fresh strawberry"], category: "Fresh Fruits" },
  { hs: "0810.20", desc: "Raspberries, fresh", keywords: ["raspberry", "raspberries", "fresh raspberry"], category: "Fresh Fruits" },
  { hs: "0810.30", desc: "Blackberries, fresh", keywords: ["blackberry", "blackberries"], category: "Fresh Fruits" },
  { hs: "0810.40", desc: "Cranberries, fresh", keywords: ["cranberry", "cranberries"], category: "Fresh Fruits" },
  { hs: "0810.50", desc: "Kiwifruit, fresh", keywords: ["kiwi", "kiwifruit"], category: "Fresh Fruits" },
  { hs: "0810.60", desc: "Durian, fresh", keywords: ["durian"], category: "Fresh Fruits" },
  { hs: "0810.70", desc: "Figs, fresh", keywords: ["fig", "figs"], category: "Fresh Fruits" },
  { hs: "0811.10", desc: "Strawberries, frozen", keywords: ["frozen strawberry", "frozen strawberries", "iqf strawberry", "iqf strawberries"], category: "Frozen Fruits" },
  { hs: "0811.20", desc: "Raspberries, frozen", keywords: ["frozen raspberry", "frozen raspberries", "iqf raspberry"], category: "Frozen Fruits" },
  { hs: "0811.90", desc: "Other frozen fruit (mangoes, etc.)", keywords: ["frozen mango", "frozen fruit", "iqf mango", "frozen berries"], category: "Frozen Fruits" },
  { hs: "0812.10", desc: "Cherries, provisionally preserved", keywords: ["preserved cherries", "maraschino cherries"], category: "Preserved Fruits" },
  { hs: "0813.10", desc: "Dried apricots", keywords: ["dried apricot", "dried apricots"], category: "Dried Fruits" },
  { hs: "0813.40", desc: "Other dried fruit", keywords: ["dried fruit", "raisins", "dried berries"], category: "Dried Fruits" },
  { hs: "0813.50", desc: "Mixed dried fruit", keywords: ["mixed dried fruit", "fruit mix dried"], category: "Dried Fruits" },
  // Coffee, tea, spices (Ch 9)
  { hs: "0901.21", desc: "Coffee, roasted", keywords: ["coffee", "roasted coffee", "coffee beans"], category: "Coffee & Tea" },
  { hs: "0902.30", desc: "Green tea", keywords: ["green tea", "tea leaves"], category: "Coffee & Tea" },
  { hs: "0904.12", desc: "Pepper, crushed/ground", keywords: ["pepper", "black pepper", "white pepper"], category: "Spices" },
  { hs: "0910.20", desc: "Saffron", keywords: ["saffron"], category: "Spices" },
  // Cereals (Ch 10)
  { hs: "1001.19", desc: "Durum wheat", keywords: ["durum wheat", "wheat durum"], category: "Grains" },
  { hs: "1001.99", desc: "Wheat (other)", keywords: ["wheat", "wheat grain"], category: "Grains" },
  { hs: "1003.90", desc: "Barley", keywords: ["barley"], category: "Grains" },
  { hs: "1004.90", desc: "Oats", keywords: ["oats", "oat"], category: "Grains" },
  { hs: "1005.90", desc: "Maize (corn)", keywords: ["maize", "corn"], category: "Grains" },
  { hs: "1006.30", desc: "Rice, semi-milled/wholly milled", keywords: ["rice", "white rice", "milled rice"], category: "Grains" },
  { hs: "1006.20", desc: "Rice, husked (brown)", keywords: ["brown rice", "husked rice"], category: "Grains" },
  { hs: "1007.00", desc: "Grain sorghum", keywords: ["sorghum"], category: "Grains" },
  { hs: "1008.50", desc: "Quinoa", keywords: ["quinoa"], category: "Grains" },
  // Milling products (Ch 11)
  { hs: "1101.00", desc: "Wheat flour", keywords: ["flour", "wheat flour"], category: "Milling Products" },
  { hs: "1103.13", desc: "Wheat groats/meal", keywords: ["wheat meal", "groats"], category: "Milling Products" },
  { hs: "1104.29", desc: "Cereal flakes", keywords: ["cereal flakes", "oat flakes"], category: "Milling Products" },
  // Oil seeds (Ch 12)
  { hs: "1201.90", desc: "Soybeans", keywords: ["soybean", "soybeans", "soya bean"], category: "Oil Seeds" },
  { hs: "1206.00", desc: "Sunflower seeds", keywords: ["sunflower seeds", "sunflower seed"], category: "Oil Seeds" },
  { hs: "1207.40", desc: "Sesamum seeds", keywords: ["sesame seeds", "sesame seed"], category: "Oil Seeds" },
  // Animal/vegetable fats (Ch 15)
  { hs: "1507.10", desc: "Soybean oil, crude", keywords: ["soybean oil", "soya oil"], category: "Oils & Fats" },
  { hs: "1509.10", desc: "Olive oil, virgin", keywords: ["olive oil", "extra virgin olive oil"], category: "Oils & Fats" },
  { hs: "1511.10", desc: "Palm oil, crude", keywords: ["palm oil"], category: "Oils & Fats" },
  { hs: "1512.11", desc: "Sunflower oil, crude", keywords: ["sunflower oil"], category: "Oils & Fats" },
  // Meat (Ch 2 & 16)
  { hs: "0201.30", desc: "Fresh beef carcasses", keywords: ["fresh beef", "beef carcass"], category: "Meat" },
  { hs: "0202.30", desc: "Frozen beef", keywords: ["frozen beef", "beef frozen"], category: "Meat" },
  { hs: "0203.11", desc: "Fresh pork", keywords: ["fresh pork", "pork"], category: "Meat" },
  { hs: "0207.14", desc: "Frozen chicken cuts", keywords: ["frozen chicken", "chicken frozen", "poultry frozen"], category: "Meat" },
  { hs: "0207.13", desc: "Fresh chicken cuts", keywords: ["fresh chicken", "chicken fresh"], category: "Meat" },
  { hs: "0208.40", desc: "Whale meat", keywords: ["whale meat"], category: "Meat" },
  { hs: "1601.00", desc: "Sausages and similar", keywords: ["sausage", "sausages", "salami"], category: "Processed Meat" },
  { hs: "1602.50", desc: "Prepared meat (beef)", keywords: ["prepared beef", "canned beef"], category: "Processed Meat" },
  // Fish & seafood (Ch 3 & 16)
  { hs: "0302.11", desc: "Fresh salmon", keywords: ["fresh salmon", "salmon fresh"], category: "Seafood" },
  { hs: "0303.11", desc: "Frozen salmon", keywords: ["frozen salmon", "salmon frozen"], category: "Seafood" },
  { hs: "0304.62", desc: "Frozen fish fillets", keywords: ["frozen fish fillet", "fish fillet frozen"], category: "Seafood" },
  { hs: "0306.17", desc: "Frozen shrimp", keywords: ["frozen shrimp", "shrimp frozen", "prawn frozen"], category: "Seafood" },
  { hs: "0306.36", desc: "Fresh shrimp", keywords: ["fresh shrimp", "shrimp fresh", "prawn fresh"], category: "Seafood" },
  { hs: "0307.43", desc: "Frozen cuttlefish/squid", keywords: ["frozen squid", "squid frozen", "cuttlefish frozen"], category: "Seafood" },
  { hs: "1604.11", desc: "Canned salmon", keywords: ["canned salmon"], category: "Processed Seafood" },
  { hs: "1604.13", desc: "Canned sardines", keywords: ["canned sardines", "sardines canned"], category: "Processed Seafood" },
  { hs: "1605.21", desc: "Prepared shrimp", keywords: ["prepared shrimp", "cooked shrimp"], category: "Processed Seafood" },
  // Dairy (Ch 4)
  { hs: "0401.20", desc: "Milk, concentrated", keywords: ["milk", "fresh milk", "liquid milk"], category: "Dairy" },
  { hs: "0402.21", desc: "Milk powder", keywords: ["milk powder", "powdered milk", "skim milk powder"], category: "Dairy" },
  { hs: "0405.10", desc: "Butter", keywords: ["butter"], category: "Dairy" },
  { hs: "0406.30", desc: "Processed cheese", keywords: ["processed cheese", "cheese spread"], category: "Dairy" },
  { hs: "0406.90", desc: "Other cheese", keywords: ["cheese", "cheddar", "mozzarella", "feta", "gouda"], category: "Dairy" },
  { hs: "0407.00", desc: "Birds' eggs, in shell", keywords: ["eggs", "egg", "chicken eggs"], category: "Dairy" },
  { hs: "0408.11", desc: "Egg yolks, dried", keywords: ["egg yolk", "dried egg yolk", "egg powder"], category: "Dairy" },
  // Prepared foods (Ch 17-21)
  { hs: "1701.99", desc: "Refined sugar", keywords: ["sugar", "white sugar", "refined sugar"], category: "Prepared Foods" },
  { hs: "1806.32", desc: "Chocolate", keywords: ["chocolate", "chocolates"], category: "Prepared Foods" },
  { hs: "2005.10", desc: "Canned peas", keywords: ["canned peas", "peas canned"], category: "Prepared Foods" },
  { hs: "2005.70", desc: "Canned tomatoes", keywords: ["canned tomatoes", "tomato sauce", "tomato paste"], category: "Prepared Foods" },
  { hs: "2008.11", desc: "Peanut butter", keywords: ["peanut butter", "groundnut butter"], category: "Prepared Foods" },
  { hs: "2008.30", desc: "Citrus fruit jams", keywords: ["jam", "marmalade", "fruit preserve"], category: "Prepared Foods" },
  { hs: "2009.11", desc: "Orange juice, frozen", keywords: ["orange juice", "frozen orange juice", "oj frozen"], category: "Beverages" },
  { hs: "2009.71", desc: "Apple juice", keywords: ["apple juice"], category: "Beverages" },
  { hs: "2204.10", desc: "Wine", keywords: ["wine", "red wine", "white wine"], category: "Beverages" },
  { hs: "2203.00", desc: "Beer", keywords: ["beer", "ale", "lager"], category: "Beverages" },
  { hs: "2208.30", desc: "Whisky", keywords: ["whisky", "whiskey"], category: "Beverages" },
  // Nuts (Ch 8)
  { hs: "0801.31", desc: "Cashew nuts, fresh", keywords: ["cashew", "cashew nuts"], category: "Nuts" },
  { hs: "0802.11", desc: "Almonds, fresh", keywords: ["almond", "almonds"], category: "Nuts" },
  { hs: "0802.21", desc: "Hazelnuts/filberts", keywords: ["hazelnut", "hazelnuts", "filbert"], category: "Nuts" },
  { hs: "0802.31", desc: "Walnuts, fresh", keywords: ["walnut", "walnuts"], category: "Nuts" },
  { hs: "0802.50", desc: "Pistachios, fresh", keywords: ["pistachio", "pistachios"], category: "Nuts" },
  { hs: "0802.62", desc: "Pecans, shelled", keywords: ["pecan", "pecans"], category: "Nuts" },
];

// ============ Fuzzy Matching (Levenshtein-based) ============
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ============ Local Database Search ============
export function searchHsCodeLocal(query: string): HsCodeMatch[] {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 2) return [];

  // Detect state keywords for better matching
  const isFrozen = q.includes("frozen") || q.includes("iqf");
  const isFresh = q.includes("fresh") && !isFrozen;
  const isDried = q.includes("dried") || q.includes("dry");

  const results: { match: typeof HS_CODE_DB[0]; score: number; matchCount: number }[] = [];

  for (const entry of HS_CODE_DB) {
    let bestScore = 0;
    let matchCount = 0;
    const descLower = entry.desc.toLowerCase();
    const keywordsLower = entry.keywords.map(k => k.toLowerCase());

    // Check if the entry category matches the detected state
    const entryIsFrozen = entry.category.includes("Frozen");
    const entryIsFresh = entry.category.includes("Fresh");
    const entryIsDried = entry.category.includes("Dried");

    // State mismatch penalty
    let stateBonus = 0;
    if (isFrozen && entryIsFrozen) stateBonus = 0.15;
    if (isFresh && entryIsFresh) stateBonus = 0.15;
    if (isDried && entryIsDried) stateBonus = 0.15;
    // Penalize state mismatch
    if (isFrozen && entryIsFresh && !entryIsFrozen) stateBonus = -0.3;
    if (isFresh && entryIsFrozen && !entryIsFresh) stateBonus = -0.3;

    // Exact product name match
    if (q === descLower) {
      bestScore = Math.max(bestScore, 1.0 + stateBonus);
      matchCount++;
    }

    // Keyword matches — prefer longer (more specific) keywords
    for (const kw of keywordsLower) {
      if (q === kw) {
        bestScore = Math.max(bestScore, 0.95 + stateBonus + (kw.length / 100));
        matchCount++;
      } else if (q.includes(kw)) {
        // Longer keyword match = higher score (more specific)
        const specificityBonus = (kw.length / q.length) * 0.1;
        bestScore = Math.max(bestScore, 0.85 + stateBonus + specificityBonus);
        matchCount++;
      } else if (kw.includes(q)) {
        bestScore = Math.max(bestScore, 0.75 + stateBonus);
        matchCount++;
      } else {
        const sim = similarity(q, kw);
        if (sim > 0.7) {
          bestScore = Math.max(bestScore, sim * 0.8 + stateBonus);
          matchCount++;
        }
      }
    }

    // Multiple keyword matches boost score
    if (matchCount >= 2) bestScore += 0.05;
    if (matchCount >= 3) bestScore += 0.05;

    // Description fuzzy match
    const descSim = similarity(q, descLower);
    if (descSim > 0.6) {
      bestScore = Math.max(bestScore, descSim * 0.75 + stateBonus);
    }

    // Cap score at 1.0
    bestScore = Math.min(1.0, bestScore);

    if (bestScore > 0.3) {
      results.push({ match: entry, score: bestScore, matchCount });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, 5).map(r => ({
    hsCode: r.match.hs,
    description: r.match.desc,
    category: r.match.category,
    confidence: Math.round(r.score * 100) / 100,
    source: r.score >= 0.95 ? "exact" : "fuzzy",
  }));
}

// ============ AI-Powered HS Code Detection ============
export async function detectHsCode(productDescription: string): Promise<HsCodeMatch> {
  // Step 1: Try local database first
  const localMatches = searchHsCodeLocal(productDescription);
  if (localMatches.length > 0 && localMatches[0].confidence >= 0.85) {
    return localMatches[0];
  }

  // Step 2: Use AI for classification
  try {
    const { runAI } = await import("@/lib/sgtx/ai/orchestrator");
    const aiRes = await runAI({
      agent_name: "hs_code_detector",
      authority_level: "A1",
      system_prompt: `You are an HS Code classification expert for international trade. Given a product description, return the most likely WTO Harmonized System (HS) 6-digit code.

Rules:
1. Return JSON only: {"hs_code": "XXXX.XX", "description": "product description", "category": "category name", "confidence": 0.0-1.0}
2. Use the standard HS 2022 classification
3. For agricultural products, use chapters 01-24
4. If uncertain, provide your best guess with lower confidence
5. Common categories: Fresh Fruits, Frozen Fruits, Fresh Vegetables, Frozen Vegetables, Grains, Dairy, Meat, Seafood, Nuts, Spices, Coffee & Tea, Oils & Fats, Beverages, Prepared Foods

Example:
Input: "IQF frozen strawberries"
Output: {"hs_code": "0811.10", "description": "Strawberries, frozen", "category": "Frozen Fruits", "confidence": 0.98}

Input: "fresh valencia oranges"
Output: {"hs_code": "0805.10", "description": "Oranges, fresh", "category": "Fresh Fruits", "confidence": 0.95}`,
      user_prompt: `Product description: "${productDescription}"`,
      max_tokens: 200,
      temperature: 0.2,
    });

    // Try to parse AI response
    const m = aiRes.content.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      return {
        hsCode: parsed.hs_code || parsed.hsCode || "Unknown",
        description: parsed.description || productDescription,
        category: parsed.category || "Other",
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        source: "ai",
      };
    }
  } catch (err) {
    console.error("[HS Code Detection] AI error:", err);
  }

  // Step 3: Return best local match or unknown
  if (localMatches.length > 0) {
    return localMatches[0];
  }

  return {
    hsCode: "Unknown",
    description: productDescription,
    category: "Other",
    confidence: 0,
    source: "ai",
  };
}

// ============ Batch detection for multiple products ============
export async function detectHsCodesBatch(products: string[]): Promise<HsCodeMatch[]> {
  return Promise.all(products.map(p => detectHsCode(p)));
}

// ============ Get all HS codes for a category ============
export function getHsCodesByCategory(category: string): { hs: string; desc: string }[] {
  return HS_CODE_DB.filter(e => e.category === category).map(e => ({ hs: e.hs, desc: e.desc }));
}

// ============ Get all categories ============
export function getAllCategories(): string[] {
  return [...new Set(HS_CODE_DB.map(e => e.category))].sort();
}
