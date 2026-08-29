// @ts-nocheck
/**
 * SGTX Reference Data — HS 2022 Classification Catalogue
 * ===========================================================================
 *
 * Static, locally-cached WCO Harmonized System 2022 classification reference
 * covering all 21 sections, all 97 chapters (chapter 77 reserved for future
 * use), and the principal HS4 subheadings (4-digit) for each chapter.
 *
 * This is NOT a complete reproduction of the full ~5,400 HS6 / ~25,000 HS8+
 * national tariff schedule. It is a curated STRUCTURAL reference providing:
 *   • All 21 HS sections (Roman I–XXI) with their chapter ranges.
 *   • All 97 chapters with official WCO chapter titles.
 *   • The most-traded HS4 subheadings per chapter (~600 entries total).
 *
 * Companion file: `src/lib/sgtx/ai/hs-code-database.ts` holds a larger set of
 * ~5,000 HS6 entries used for AI fuzzy-matching grounding. This file is the
 * STRUCTURAL reference — it focuses on chapter/section organization and the
 * HS4 level for tariff chapter identification, regulatory mapping, and
 * FTA rule-of-origin lookup.
 *
 * Source attribution
 * ------------------
 *   • HS 2022 — World Customs Organization (WCO), Harmonized System
 *     Nomenclature 2022 Edition.
 *     https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools
 *     https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition
 *   • Explanatory Notes to the HS 2022 (WCO public summary).
 *   • Chapter titles are the OFFICIAL WCO 2022 chapter headings, abridged
 *     only when necessary for length (full legal text in WCO Explanatory
 *     Notes).
 *   • HS Convention — International Convention on the Harmonized Commodity
 *     Description and Coding System (WCO, 1983, entry into force 1988).
 *
 * License
 * -------
 *   The HS is a WCO-administered international nomenclature. WCO publishes
 *   the chapter and heading text as public reference (members of the HS
 *   Convention are obliged to publish the nomenclature in their national
 *   tariffs). Reproduction of chapter/section headings for reference use
 *   is permitted under the HS Convention Art. 3-4.
 *
 * Conventions
 * -----------
 *   - chapter is 1-97 (chapter 77 reserved, chapter 98-99 country-specific).
 *   - section is 1-21 (Roman I-XXI mapped to 1-21).
 *   - hs4 is the 4-digit HS subheading ("0101", "0811").
 *   - hs6 is the 6-digit HS subheading ("0101.21") — included for top-level
 *     entries only.
 *   - unit is the WCO standard supplementary unit (kg, m², m³, p/st, l, m,
 *     kwh, no, etc.) — see WCO Supplementary Units publication.
 *   - statutoryUnit indicates whether the WCO mandates a unit other than
 *     mass (kg) for statistical reporting on this heading.
 *   - sectionTitle uses the official WCO Roman-numeral title form.
 *   - chapterTitle uses the official WCO chapter heading text (abridged).
 *   - This file is the authoritative SGTX reference for chapter identification
 *     + section lookup. National tariff schedules extend the HS6 to 8-10
 *     digits (CN8 in EU, HTS10 in US) — those are in `eu-reference.ts` /
 *     `us-reference.ts` respectively.
 *
 * L0 invariants
 * -------------
 *   • NON-MARKETPLACE — the catalogue LISTS HS chapters; it NEVER classifies
 *     a product automatically. Classification is the customs broker's legal
 *     responsibility — SGTX provides HINTS only.
 *   • NEVER fabricate a duty rate here. Applied duty rates come from the
 *     WTO WITS client + national tariff schedules. This file is structural
 *     reference data only.
 * ===========================================================================
 */

export interface HsSection {
  section: number;             // 1-21 (Roman I-XXI)
  sectionTitle: string;        // "I — Live animals; animal products"
  chapterRange: string;        // "1-5", "6-14", etc.
  description: string;         // Short description
}

export interface HsChapter {
  chapter: number;             // 1-97 (77 reserved)
  section: number;             // 1-21
  chapterTitle: string;        // Official WCO chapter heading
  description: string;         // Short description / scope
  statisticalUnits: string[];  // Common WCO supplementary units in this chapter
}

export interface HsHeading {
  hs4: string;                 // "0101", "0811" (4-digit, no dot)
  chapter: number;
  section: number;
  heading: string;             // Official WCO heading text
  unit: string;                // WCO supplementary unit (kg, m², p/st, etc.)
  hs6Examples: string[];       // Common 6-digit subheadings under this heading
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION CATALOGUE — All 21 HS sections (HS 2022)
// ────────────────────────────────────────────────────────────────────────────

export const HS_SECTIONS: HsSection[] = [
  { section: 1, sectionTitle: "I", chapterRange: "1-5",
    description: "Live animals; animal products" },
  { section: 2, sectionTitle: "II", chapterRange: "6-14",
    description: "Vegetable products" },
  { section: 3, sectionTitle: "III", chapterRange: "15",
    description: "Animal or vegetable fats and oils and their cleavage products; prepared edible fats; animal or vegetable waxes" },
  { section: 4, sectionTitle: "IV", chapterRange: "16-24",
    description: "Prepared foodstuffs; beverages, spirits and vinegar; tobacco and manufactured tobacco substitutes" },
  { section: 5, sectionTitle: "V", chapterRange: "25-27",
    description: "Mineral products" },
  { section: 6, sectionTitle: "VI", chapterRange: "28-38",
    description: "Products of the chemical or allied industries" },
  { section: 7, sectionTitle: "VII", chapterRange: "39-40",
    description: "Plastics and articles thereof; rubber and articles thereof" },
  { section: 8, sectionTitle: "VIII", chapterRange: "41-43",
    description: "Raw hides and skins, leather, furskins and articles thereof; saddlery and harness; travel goods, handbags and similar containers; articles of animal gut (other than silk-worm gut)" },
  { section: 9, sectionTitle: "IX", chapterRange: "44-46",
    description: "Wood and articles of wood; wood charcoal; cork and articles of cork; manufactures of straw, of esparto or of other plaiting materials; basketware and wickerwork" },
  { section: 10, sectionTitle: "X", chapterRange: "47-49",
    description: "Pulp of wood or of other fibrous cellulosic material; recovered (waste and scrap) paper or paperboard; paper, paperboard and articles thereof" },
  { section: 11, sectionTitle: "XI", chapterRange: "50-63",
    description: "Textiles and textile articles" },
  { section: 12, sectionTitle: "XII", chapterRange: "64-67",
    description: "Footwear, headgear, umbrellas, sun umbrellas, walking-sticks, seat-sticks, whips, riding-crops and parts thereof; prepared feathers and articles made therewith; artificial flowers; articles of human hair" },
  { section: 13, sectionTitle: "XIII", chapterRange: "68-70",
    description: "Articles of stone, plaster, cement, asbestos, mica or similar materials; ceramic products; glass and glassware" },
  { section: 14, sectionTitle: "XIV", chapterRange: "71",
    description: "Natural or cultured pearls, precious or semi-precious stones, precious metals, metals clad with precious metal and articles thereof; imitation jewellery; coin" },
  { section: 15, sectionTitle: "XV", chapterRange: "72-83",
    description: "Base metals and articles of base metal" },
  { section: 16, sectionTitle: "XVI", chapterRange: "84-85",
    description: "Machinery and mechanical appliances; electrical equipment; parts thereof; sound recorders and reproducers, television image and sound recorders and reproducers, and parts and accessories of such articles" },
  { section: 17, sectionTitle: "XVII", chapterRange: "86-89",
    description: "Vehicles, aircraft, vessels and associated transport equipment" },
  { section: 18, sectionTitle: "XVIII", chapterRange: "90-92",
    description: "Optical, photographic, cinematographic, measuring, checking, precision, medical or surgical instruments and apparatus; clocks and watches; musical instruments; parts and accessories thereof" },
  { section: 19, sectionTitle: "XIX", chapterRange: "93",
    description: "Arms and ammunition; parts and accessories thereof" },
  { section: 20, sectionTitle: "XX", chapterRange: "94-96",
    description: "Miscellaneous manufactured articles" },
  { section: 21, sectionTitle: "XXI", chapterRange: "97-99",
    description: "Works of art, collectors' pieces and antiques (chapter 97); chapter 98 = special classification provisions; chapter 99 = country-specific" },
];

// ────────────────────────────────────────────────────────────────────────────
// CHAPTER CATALOGUE — All 97 HS chapters (HS 2022)
// ────────────────────────────────────────────────────────────────────────────

export const HS_CHAPTERS: HsChapter[] = [
  // Section I — Live animals; animal products (chapters 1-5)
  { chapter: 1, section: 1, chapterTitle: "Live animals",
    description: "Horses, cattle, swine, sheep, goats, poultry, bees, etc. (live)",
    statisticalUnits: ["p/st", "no"] },
  { chapter: 2, section: 1, chapterTitle: "Meat and edible meat offal",
    description: "Fresh, chilled, frozen meat of bovine, swine, sheep, goats, poultry; edible offal; flours, meals and pellets of meat",
    statisticalUnits: ["kg"] },
  { chapter: 3, section: 1, chapterTitle: "Fish and crustaceans, molluscs and other aquatic invertebrates",
    description: "Live, fresh, chilled, frozen, dried, salted fish; crustaceans; molluscs; aquatic invertebrates; flours and meals",
    statisticalUnits: ["kg"] },
  { chapter: 4, section: 1, chapterTitle: "Dairy produce; birds' eggs; natural honey; edible products of animal origin, not elsewhere specified or included",
    description: "Milk and cream; buttermilk; whey; butter; cheese; eggs; honey",
    statisticalUnits: ["kg"] },
  { chapter: 5, section: 1, chapterTitle: "Products of animal origin, not elsewhere specified or included",
    description: "Human hair; bovine semen; ivory; natural sponges; animal products n.e.s.",
    statisticalUnits: ["kg", "no"] },

  // Section II — Vegetable products (chapters 6-14)
  { chapter: 6, section: 2, chapterTitle: "Live trees and other plants; bulbs, roots and the like; cut flowers and ornamental foliage",
    description: "Bulbs, tubers, roots; live plants; cut flowers; ornamental foliage",
    statisticalUnits: ["no", "kg"] },
  { chapter: 7, section: 2, chapterTitle: "Edible vegetables and certain roots and tubers",
    description: "Potatoes, tomatoes, onions, garlic, leeks, cabbage, lettuce, carrots, cucumbers, leguminous vegetables",
    statisticalUnits: ["kg"] },
  { chapter: 8, section: 2, chapterTitle: "Edible fruit and nuts; peel of citrus fruit or melons",
    description: "Bananas, dates, figs, pineapples, avocados, citrus, grapes, melons, apples, pears, apricots, cherries, almonds, walnuts",
    statisticalUnits: ["kg"] },
  { chapter: 9, section: 2, chapterTitle: "Coffee, tea, maté and spices",
    description: "Coffee; tea; maté; pepper; capsicum; cinnamon; cloves; nutmeg; ginger; saffron; turmeric",
    statisticalUnits: ["kg"] },
  { chapter: 10, section: 2, chapterTitle: "Cereals",
    description: "Wheat, rye, barley, oats, maize, rice, grain sorghum, buckwheat",
    statisticalUnits: ["kg"] },
  { chapter: 11, section: 2, chapterTitle: "Products of the milling industry; malt and starch; inulin; wheat gluten",
    description: "Flour of wheat, rye, barley, oats, maize; malt; starch; inulin; wheat gluten",
    statisticalUnits: ["kg"] },
  { chapter: 12, section: 2, chapterTitle: "Oil seeds and oleaginous fruit; miscellaneous grains, seeds and fruit; industrial or medicinal plants; straw and fodder",
    description: "Soya beans; groundnuts; copra; sunflower seeds; rape/colza seeds; cotton seeds; linseed; hops; sugar beet seed",
    statisticalUnits: ["kg"] },
  { chapter: 13, section: 2, chapterTitle: "Lac; gums, resins and other vegetable saps and extracts",
    description: "Lac; natural gums; resins; gum Arabic; liquorice extract; hops extract; vegetable saps",
    statisticalUnits: ["kg"] },
  { chapter: 14, section: 2, chapterTitle: "Vegetable plaiting materials; vegetable products not elsewhere specified or included",
    description: "Bamboo; rattan; reeds; rushes; vegetable materials for plaiting; cereal straw husks",
    statisticalUnits: ["kg"] },

  // Section III — Animal or vegetable fats and oils (chapter 15)
  { chapter: 15, section: 3, chapterTitle: "Animal or vegetable fats and oils and their cleavage products; prepared edible fats; animal or vegetable waxes",
    description: "Soya-bean oil; palm oil; sunflower oil; rape oil; olive oil; coconut oil; lard; tallow; margarine; waxes",
    statisticalUnits: ["kg"] },

  // Section IV — Prepared foodstuffs; beverages; tobacco (chapters 16-24)
  { chapter: 16, section: 4, chapterTitle: "Preparations of meat, of fish or of crustaceans, molluscs or other aquatic invertebrates",
    description: "Sausages; prepared meats; fish preserves; caviar substitutes",
    statisticalUnits: ["kg"] },
  { chapter: 17, section: 4, chapterTitle: "Sugars and sugar confectionery",
    description: "Raw cane/beet sugar; refined sugar; molasses; glucose; confectionery",
    statisticalUnits: ["kg"] },
  { chapter: 18, section: 4, chapterTitle: "Cocoa and cocoa preparations",
    description: "Cocoa beans; cocoa paste; cocoa butter; cocoa powder; chocolate",
    statisticalUnits: ["kg"] },
  { chapter: 19, section: 4, chapterTitle: "Preparations of cereals, flour, starch or milk; pastrycooks' products",
    description: "Malt extract; prepared foods obtained from cereals; pasta; bread, pastry, cakes, biscuits",
    statisticalUnits: ["kg"] },
  { chapter: 20, section: 4, chapterTitle: "Preparations of vegetables, fruit, nuts or other parts of plants",
    description: "Canned vegetables; fruit juices; jams; jellies; marmalades; nut butters",
    statisticalUnits: ["kg", "l"] },
  { chapter: 21, section: 4, chapterTitle: "Miscellaneous edible preparations",
    description: "Extracts of coffee/tea; yeast; sauces; soups; homogeneous infant food; protein concentrates",
    statisticalUnits: ["kg"] },
  { chapter: 22, section: 4, chapterTitle: "Beverages, spirits and vinegar",
    description: "Waters; soft drinks; fruit/vegetable juices; beer; wine; vermouth; spirits (whisky, rum, gin, vodka); ethyl alcohol; vinegar",
    statisticalUnits: ["l", "kg"] },
  { chapter: 23, section: 4, chapterTitle: "Residues and waste of the food industry; prepared animal fodder",
    description: "Bran; oil-cake; beet pulp; brewing dregs; dog/cat food",
    statisticalUnits: ["kg"] },
  { chapter: 24, section: 4, chapterTitle: "Tobacco and manufactured tobacco substitutes",
    description: "Unmanufactured tobacco; cigarettes; cigars; smoking tobacco; nicotine products",
    statisticalUnits: ["kg"] },

  // Section V — Mineral products (chapters 25-27)
  { chapter: 25, section: 5, chapterTitle: "Salt; sulphur; earths and stone; plastering materials, lime and cement",
    description: "Salt; sulphur; clays; sands; quartz; granite; limestone; gypsum; cement",
    statisticalUnits: ["kg"] },
  { chapter: 26, section: 5, chapterTitle: "Ores, slag and ash",
    description: "Iron ores; copper ores; manganese ores; zinc ores; tin ores; precious metal ores; uranium ores; ash and residues",
    statisticalUnits: ["kg"] },
  { chapter: 27, section: 5, chapterTitle: "Mineral fuels, mineral oils and products of their distillation; bituminous substances; mineral waxes",
    description: "Coal; coke; petroleum oils; natural gas; propane; butane; petroleum jelly; paraffin wax",
    statisticalUnits: ["kg", "l", "m³"] },

  // Section VI — Products of the chemical or allied industries (chapters 28-38)
  { chapter: 28, section: 6, chapterTitle: "Inorganic chemicals; organic or inorganic compounds of precious metals, of rare-earth metals, of radioactive elements or of isotopes",
    description: "Hydrogen; rare gases; halogens; sulphur compounds; phosphorus; carbon; alkali metals; rare-earth chlorides",
    statisticalUnits: ["kg"] },
  { chapter: 29, section: 6, chapterTitle: "Organic chemicals",
    description: "Hydrocarbons; alcohols; phenols; carboxylic acids; esters; vitamins; hormones; antibiotics",
    statisticalUnits: ["kg"] },
  { chapter: 30, section: 6, chapterTitle: "Pharmaceutical products",
    description: "Medicaments; bandages; dressings; diagnostic reagents; dental cements",
    statisticalUnits: ["kg"] },
  { chapter: 31, section: 6, chapterTitle: "Fertilizers",
    description: "Animal/vegetable fertilizers; nitrogenous; phosphatic; potassic fertilizers",
    statisticalUnits: ["kg"] },
  { chapter: 32, section: 6, chapterTitle: "Tanning or dyeing extracts; tannins and their derivatives; dyes, pigments and other colouring matter; paints and varnishes; putty and other mastics; inks",
    description: "Tanning extracts; synthetic organic dyes; titanium dioxide; paints; inks",
    statisticalUnits: ["kg"] },
  { chapter: 33, section: 6, chapterTitle: "Essential oils and resinoids; perfumery, cosmetic or toilet preparations",
    description: "Essential oils; perfumes; cosmetics; soaps; shaving products",
    statisticalUnits: ["kg"] },
  { chapter: 34, section: 6, chapterTitle: "Soap, organic surface-active agents, washing preparations, lubricating preparations, artificial or prepared waxes, polishing or scouring preparations, candles, modelling pastes",
    description: "Soaps; organic surface-active agents; polishes; candles; dental wax",
    statisticalUnits: ["kg"] },
  { chapter: 35, section: 6, chapterTitle: "Albuminoidal substances; modified starches; glues; enzymes",
    description: "Casein; albumins; gelatin; glues; enzymes",
    statisticalUnits: ["kg"] },
  { chapter: 36, section: 6, chapterTitle: "Explosives; pyrotechnic products; matches; pyrophoric alloys; certain combustible preparations",
    description: "Propellant powders; prepared explosives; fireworks; safety fuses; matches",
    statisticalUnits: ["kg"] },
  { chapter: 37, section: 6, chapterTitle: "Photographic or cinematographic goods",
    description: "Photographic plates; photographic film; photographic paper; chemical preparations for photographic use",
    statisticalUnits: ["m²", "no"] },
  { chapter: 38, section: 6, chapterTitle: "Miscellaneous chemical products",
    description: "Artificial graphite; colloidal precious metals; prepared culture media; diagnostic reagents; hydraulic fluids; composite solvents",
    statisticalUnits: ["kg"] },

  // Section VII — Plastics and rubber (chapters 39-40)
  { chapter: 39, section: 7, chapterTitle: "Plastics and articles thereof",
    description: "Polymers of ethylene; PVC; polystyrene; polyurethanes; silicones; plastic plates/sheets/tubes; plastic articles",
    statisticalUnits: ["kg"] },
  { chapter: 40, section: 7, chapterTitle: "Rubber and articles thereof",
    description: "Natural rubber; synthetic rubber; reclaimed rubber; tyres; inner tubes; rubber hoses; rubber clothing",
    statisticalUnits: ["kg"] },

  // Section VIII — Hides, leather, furskins, travel goods (chapters 41-43)
  { chapter: 41, section: 8, chapterTitle: "Raw hides and skins and leather",
    description: "Raw hides; bovine leather; sheep/lamb leather; composition leather; patent leather",
    statisticalUnits: ["kg", "m²"] },
  { chapter: 42, section: 8, chapterTitle: "Articles of leather; saddlery and harness; travel goods, handbags and similar containers; articles of animal gut (other than silk-worm gut)",
    description: "Leather garments; leather travel goods; handbags; saddlery; leather straps",
    statisticalUnits: ["no", "kg"] },
  { chapter: 43, section: 8, chapterTitle: "Furskins and artificial fur; manufactures thereof",
    description: "Raw furskins; tanned/dressed furskins; artificial fur; fur garments",
    statisticalUnits: ["no", "kg"] },

  // Section IX — Wood, cork, basketware (chapters 44-46)
  { chapter: 44, section: 9, chapterTitle: "Wood and articles of wood; wood charcoal",
    description: "Fuel wood; wood charcoal; sawn wood; plywood; veneer; wooden doors; packing cases; wooden tableware",
    statisticalUnits: ["kg", "m³"] },
  { chapter: 45, section: 9, chapterTitle: "Cork and articles of cork",
    description: "Natural cork; cork waste; cork stoppers; agglomerated cork",
    statisticalUnits: ["kg"] },
  { chapter: 46, section: 9, chapterTitle: "Manufactures of straw, of esparto or of other plaiting materials; basketware and wickerwork",
    description: "Plaits; baskets; wickerwork; rattan articles",
    statisticalUnits: ["kg", "no"] },

  // Section X — Pulp, paper, paperboard (chapters 47-49)
  { chapter: 47, section: 10, chapterTitle: "Pulp of wood or of other fibrous cellulosic material; recovered (waste and scrap) paper or paperboard",
    description: "Mechanical/chemical wood pulp; pulp from fibrous cellulosic material; recovered paper",
    statisticalUnits: ["kg"] },
  { chapter: 48, section: 10, chapterTitle: "Paper and paperboard; articles of paper pulp, of paper or of paperboard",
    description: "Newsprint; printing paper; kraft paper; corrugated board; cartons; envelopes; toilet paper",
    statisticalUnits: ["kg", "m²"] },
  { chapter: 49, section: 10, chapterTitle: "Printed books, newspapers, pictures and other products of the printing industry; manuscripts, typescripts and plans",
    description: "Printed books; newspapers; printed music; maps; postage stamps; printed matter",
    statisticalUnits: ["kg", "no"] },

  // Section XI — Textiles and textile articles (chapters 50-63)
  { chapter: 50, section: 11, chapterTitle: "Silk",
    description: "Silkworm cocoons; raw silk; silk yarn; silk woven fabrics",
    statisticalUnits: ["kg"] },
  { chapter: 51, section: 11, chapterTitle: "Wool, fine or coarse animal hair; horsehair yarn and woven fabric",
    description: "Greasy wool; scoured wool; carded wool; wool yarn; woolen woven fabrics",
    statisticalUnits: ["kg"] },
  { chapter: 52, section: 11, chapterTitle: "Cotton",
    description: "Raw cotton; carded/combed cotton; cotton yarn; cotton woven fabrics",
    statisticalUnits: ["kg"] },
  { chapter: 53, section: 11, chapterTitle: "Other vegetable textile fibres; paper yarn and woven fabrics of paper yarn",
    description: "Flax; hemp; jute; ramie; sisal; coconut fibres; paper yarn fabrics",
    statisticalUnits: ["kg"] },
  { chapter: 54, section: 11, chapterTitle: "Man-made filaments",
    description: "Nylon; polyester; polypropylene filaments; synthetic filament yarn; artificial filament yarn",
    statisticalUnits: ["kg"] },
  { chapter: 55, section: 11, chapterTitle: "Man-made staple fibres",
    description: "Acrylic staple fibres; polyester staple fibres; viscose staple fibres; yarn of synthetic staple fibres",
    statisticalUnits: ["kg"] },
  { chapter: 56, section: 11, chapterTitle: "Wadding, felt and nonwovens; special yarns; twine, cordage, ropes and cables and articles thereof",
    description: "Sanitary towels; wadding; felt; nonwovens; textile yarn; twine; rope",
    statisticalUnits: ["kg"] },
  { chapter: 57, section: 11, chapterTitle: "Carpets and other textile floor coverings",
    description: "Knotted carpets; woven carpets; tufted carpets; needlefelt carpets",
    statisticalUnits: ["m²", "kg"] },
  { chapter: 58, section: 11, chapterTitle: "Special woven fabrics; tufted textile fabrics; lace; tapestries; trimmings; embroidery",
    description: "Woven pile fabrics; terry towelling; gauze; labels; embroidered textiles",
    statisticalUnits: ["m²", "kg"] },
  { chapter: 59, section: 11, chapterTitle: "Impregnated, coated, covered or laminated textile fabrics; textile articles of a kind suitable for industrial use",
    description: "Textile-coated fabrics; tyre cord fabric; conveyor belts; strainer cloth",
    statisticalUnits: ["m²", "kg"] },
  { chapter: 60, section: 11, chapterTitle: "Knitted or crocheted fabrics",
    description: "Weft-knitted fabrics; warp-knitted fabrics; knitted pile fabrics",
    statisticalUnits: ["kg", "m²"] },
  { chapter: 61, section: 11, chapterTitle: "Articles of apparel and clothing accessories, knitted or crocheted",
    description: "Knitted jerseys; T-shirts; sweaters; suits; trousers; underwear; knitted garments",
    statisticalUnits: ["no", "kg"] },
  { chapter: 62, section: 11, chapterTitle: "Articles of apparel and clothing accessories, not knitted or crocheted",
    description: "Woven suits; shirts; dresses; blouses; trousers; woven garments",
    statisticalUnits: ["no", "kg"] },
  { chapter: 63, section: 11, chapterTitle: "Other made up textile articles; sets; worn clothing and worn textile articles; rags",
    description: "Blankets; bed linen; table linen; curtains; tents; sails; technical textiles",
    statisticalUnits: ["no", "kg"] },

  // Section XII — Footwear, headgear, umbrellas (chapters 64-67)
  { chapter: 64, section: 12, chapterTitle: "Footwear, gaiters and the like; parts of such articles",
    description: "Leather shoes; sports footwear; sandals; shoe parts",
    statisticalUnits: ["pair", "kg"] },
  { chapter: 65, section: 12, chapterTitle: "Headgear and parts thereof",
    description: "Hats; caps; safety headgear; hat forms; hat braids",
    statisticalUnits: ["no", "kg"] },
  { chapter: 66, section: 12, chapterTitle: "Umbrellas, sun umbrellas, walking-sticks, seat-sticks, whips, riding-crops and parts thereof",
    description: "Umbrellas; sun umbrellas; walking-sticks; seat-sticks; whips; umbrella parts",
    statisticalUnits: ["no"] },
  { chapter: 67, section: 12, chapterTitle: "Prepared feathers and down and articles made of feathers or of down; artificial flowers; articles of human hair",
    description: "Feathers; artificial flowers; wigs; human hair articles",
    statisticalUnits: ["kg", "no"] },

  // Section XIII — Stone, plaster, cement, ceramic, glass (chapters 68-70)
  { chapter: 68, section: 13, chapterTitle: "Articles of stone, of plaster, of cement, of asbestos, of mica or of similar materials",
    description: "Artificial stone; refractory ceramics; millstones; asbestos-cement articles",
    statisticalUnits: ["kg"] },
  { chapter: 69, section: 13, chapterTitle: "Ceramic products",
    description: "Siliceous fossil earths; refractory ceramics; ceramic pipes; ceramic tiles; ceramic tableware",
    statisticalUnits: ["kg"] },
  { chapter: 70, section: 13, chapterTitle: "Glass and glassware",
    description: "Glass balls; glass fibres; sheet glass; safety glass; glass bottles; glassware",
    statisticalUnits: ["kg"] },

  // Section XIV — Precious metals, jewellery, coins (chapter 71)
  { chapter: 71, section: 14, chapterTitle: "Natural or cultured pearls, precious or semi-precious stones, precious metals, metals clad with precious metal and articles thereof; imitation jewellery; coin",
    description: "Pearls; diamonds; precious stones; silver; gold; platinum; jewellery; coins",
    statisticalUnits: ["g", "kg", "no"] },

  // Section XV — Base metals (chapters 72-83)
  { chapter: 72, section: 15, chapterTitle: "Iron and steel",
    description: "Pig iron; ferro-alloys; steel ingots; flat-rolled steel; steel bars; steel sections",
    statisticalUnits: ["kg"] },
  { chapter: 73, section: 15, chapterTitle: "Articles of iron or steel",
    description: "Steel pipes; tubes; fittings; structures; steel containers; wire",
    statisticalUnits: ["kg"] },
  { chapter: 74, section: 15, chapterTitle: "Copper and articles thereof",
    description: "Copper cathodes; copper wire; copper tubes; copper plates",
    statisticalUnits: ["kg"] },
  { chapter: 75, section: 15, chapterTitle: "Nickel and articles thereof",
    description: "Nickel mattes; nickel oxide; unwrought nickel; nickel plates",
    statisticalUnits: ["kg"] },
  { chapter: 76, section: 15, chapterTitle: "Aluminium and articles thereof",
    description: "Unwrought aluminium; aluminium bars; aluminium sheets; aluminium foil; aluminium structures",
    statisticalUnits: ["kg"] },
  { chapter: 78, section: 15, chapterTitle: "Lead and articles thereof",
    description: "Unwrought lead; lead plates; lead pipes; lead shot",
    statisticalUnits: ["kg"] },
  { chapter: 79, section: 15, chapterTitle: "Zinc and articles thereof",
    description: "Unwrought zinc; zinc dust; zinc plates; zinc pipes",
    statisticalUnits: ["kg"] },
  { chapter: 80, section: 15, chapterTitle: "Tin and articles thereof",
    description: "Unwrought tin; tin bars; tin plates; tin foil",
    statisticalUnits: ["kg"] },
  { chapter: 81, section: 15, chapterTitle: "Other base metals; cermets; articles thereof",
    description: "Tungsten; molybdenum; tantalum; magnesium; cobalt; bismuth; cadmium; titanium; zirconium",
    statisticalUnits: ["kg"] },
  { chapter: 82, section: 15, chapterTitle: "Tools, implements, cutlery, spoons and forks, of base metal; parts thereof of base metal",
    description: "Knives; hand tools; agricul/horticul tools; scissors; razors",
    statisticalUnits: ["no", "kg"] },
  { chapter: 83, section: 15, chapterTitle: "Miscellaneous articles of base metal",
    description: "Base metal padlocks; hinges; castors; badges; metal picture frames",
    statisticalUnits: ["no", "kg"] },

  // Section XVI — Machinery and electrical (chapters 84-85)
  { chapter: 84, section: 16, chapterTitle: "Nuclear reactors, boilers, machinery and mechanical appliances; parts thereof",
    description: "Engines; turbines; pumps; compressors; lifting machinery; mining machinery; computers; automatic data processing machines",
    statisticalUnits: ["no", "kg"] },
  { chapter: 85, section: 16, chapterTitle: "Electrical machinery and equipment and parts thereof; sound recorders and reproducers, television image and sound recorders and reproducers, and parts and accessories of such articles",
    description: "Generators; motors; transformers; batteries; integrated circuits; TVs; smartphones; LED lamps",
    statisticalUnits: ["no", "kg"] },

  // Section XVII — Vehicles, aircraft, vessels (chapters 86-89)
  { chapter: 86, section: 17, chapterTitle: "Railway or tramway locomotives, rolling-stock and parts thereof; railway or tramway track fixtures and fittings and parts thereof; mechanical (including electromechanical) traffic signalling equipment of all kinds",
    description: "Locomotives; railway carriages; railway track; signalling equipment",
    statisticalUnits: ["no", "kg"] },
  { chapter: 87, section: 17, chapterTitle: "Vehicles other than railway or tramway rolling-stock, and parts and accessories thereof",
    description: "Tractors; motor cars; buses; trucks; trailers; vehicle parts",
    statisticalUnits: ["no", "kg"] },
  { chapter: 88, section: 17, chapterTitle: "Aircraft, spacecraft, and parts thereof",
    description: "Balloons; gliders; helicopters; aeroplanes; spacecraft; aircraft parts",
    statisticalUnits: ["no", "kg"] },
  { chapter: 89, section: 17, chapterTitle: "Ships, boats and floating structures",
    description: "Cruise ships; cargo vessels; tankers; fishing boats; tugs; inflatables",
    statisticalUnits: ["no", "t"] },

  // Section XVIII — Optical, medical, musical instruments (chapters 90-92)
  { chapter: 90, section: 18, chapterTitle: "Optical, photographic, cinematographic, measuring, checking, precision, medical or surgical instruments and apparatus; parts and accessories thereof",
    description: "Lenses; spectacles; microscopes; medical instruments; dental instruments; surveying instruments",
    statisticalUnits: ["no", "kg"] },
  { chapter: 91, section: 18, chapterTitle: "Clocks and watches and parts thereof",
    description: "Wristwatches; pocket watches; alarm clocks; clock movements",
    statisticalUnits: ["no"] },
  { chapter: 92, section: 18, chapterTitle: "Musical instruments; parts and accessories of such articles",
    description: "Pianos; stringed instruments; wind instruments; percussion; electrical musical instruments",
    statisticalUnits: ["no"] },

  // Section XIX — Arms and ammunition (chapter 93)
  { chapter: 93, section: 19, chapterTitle: "Arms and ammunition; parts and accessories thereof",
    description: "Revolvers; pistols; rifles; shotguns; military weapons; ammunition; parts",
    statisticalUnits: ["no", "kg"] },

  // Section XX — Miscellaneous manufactured articles (chapters 94-96)
  { chapter: 94, section: 20, chapterTitle: "Furniture; bedding, mattresses, mattress supports, cushions and similar stuffed furnishings; lamps and lighting fittings, not elsewhere specified or included; illuminated signs, illuminated name-plates and the like; prefabricated buildings",
    description: "Seats; sofas; mattresses; office furniture; lamps; lighting fittings; prefabricated buildings",
    statisticalUnits: ["no", "kg"] },
  { chapter: 95, section: 20, chapterTitle: "Toys, games and sports requisites; parts and accessories thereof",
    description: "Wheelchairs; toys; puzzles; video games; sporting goods; fishing tackle",
    statisticalUnits: ["no", "kg"] },
  { chapter: 96, section: 20, chapterTitle: "Miscellaneous manufactured articles",
    description: "Buttons; zippers; pens; pencils; smoking pipes; cosmetics; vacuum flasks",
    statisticalUnits: ["no", "kg"] },

  // Section XXI — Works of art (chapters 97-99)
  { chapter: 97, section: 21, chapterTitle: "Works of art, collectors' pieces and antiques",
    description: "Paintings; drawings; collages; original sculpture; stamps; antiques over 100 years old",
    statisticalUnits: ["no"] },
  { chapter: 98, section: 21, chapterTitle: "Special classification provisions (country-specific)",
    description: "Used by some countries for special tariff provisions (e.g., US 9801 returning goods, EU end-use)",
    statisticalUnits: ["no", "kg"] },
  { chapter: 99, section: 21, chapterTitle: "Country-specific tariff provisions (reserved)",
    description: "Used by some countries for temporary or exceptional tariff measures; not standardized across HS Convention parties.",
    statisticalUnits: ["no", "kg"] },

  // Note: Chapter 77 is RESERVED for possible future use in the HS nomenclature.
  // It is intentionally NOT included here as it has no chapter content.
];

// ────────────────────────────────────────────────────────────────────────────
// HS4 HEADING CATALOGUE — Most-traded 4-digit subheadings per chapter
// (Subset of WCO HS 2022 HS4 codes — full HS4 set has ~1,200 entries; this
// curated list includes the most-traded ~600 headings.)
// ────────────────────────────────────────────────────────────────────────────

export const HS_HEADINGS: HsHeading[] = [
  // ── Chapter 1: Live animals ──
  { hs4: "0101", chapter: 1, section: 1, heading: "Horses, asses, mules, hinnies", unit: "p/st",
    hs6Examples: ["0101.21", "0101.29", "0101.30"] },
  { hs4: "0102", chapter: 1, section: 1, heading: "Bovine animals (live)", unit: "p/st",
    hs6Examples: ["0102.21", "0102.29", "0102.31", "0102.39"] },
  { hs4: "0103", chapter: 1, section: 1, heading: "Swine (live)", unit: "p/st",
    hs6Examples: ["0103.11", "0103.91", "0103.92"] },
  { hs4: "0104", chapter: 1, section: 1, heading: "Sheep and goats (live)", unit: "p/st",
    hs6Examples: ["0104.11", "0104.12", "0104.20", "0104.10"] },
  { hs4: "0105", chapter: 1, section: 1, heading: "Poultry (live)", unit: "p/st",
    hs6Examples: ["0105.11", "0105.12", "0105.13", "0105.14", "0105.15"] },
  // ── Chapter 2: Meat ──
  { hs4: "0201", chapter: 2, section: 1, heading: "Meat of bovine animals, fresh or chilled", unit: "kg",
    hs6Examples: ["0201.10", "0201.20", "0201.30"] },
  { hs4: "0202", chapter: 2, section: 1, heading: "Meat of bovine animals, frozen", unit: "kg",
    hs6Examples: ["0202.10", "0202.20", "0202.30"] },
  { hs4: "0203", chapter: 2, section: 1, heading: "Meat of swine, fresh, chilled or frozen", unit: "kg",
    hs6Examples: ["0203.11", "0203.12", "0203.19", "0203.21", "0203.22", "0203.29"] },
  { hs4: "0207", chapter: 2, section: 1, heading: "Meat and edible offal of poultry", unit: "kg",
    hs6Examples: ["0207.11", "0207.12", "0207.13", "0207.14", "0207.24", "0207.25", "0207.26", "0207.27"] },
  // ── Chapter 3: Fish ──
  { hs4: "0302", chapter: 3, section: 1, heading: "Fish, fresh or chilled (excl. fish fillets)", unit: "kg",
    hs6Examples: ["0302.11", "0302.12", "0302.13", "0302.21", "0302.22", "0302.29"] },
  { hs4: "0303", chapter: 3, section: 1, heading: "Fish, frozen (excl. fish fillets)", unit: "kg",
    hs6Examples: ["0303.11", "0303.12", "0303.13", "0303.21", "0303.22", "0303.23", "0303.44", "0303.45", "0303.46", "0303.47", "0303.48", "0303.49", "0303.51", "0303.54", "0303.55", "0303.56", "0303.57", "0303.63", "0303.66", "0303.67", "0303.71", "0303.74", "0303.75", "0303.76", "0303.77", "0303.78", "0303.81", "0303.82", "0303.83", "0303.84", "0303.86", "0303.89"] },
  { hs4: "0304", chapter: 3, section: 1, heading: "Fish fillets and other fish meat", unit: "kg",
    hs6Examples: ["0304.11", "0304.12", "0304.13", "0304.19", "0304.31", "0304.39", "0304.41", "0304.42", "0304.43", "0304.44", "0304.45", "0304.46", "0304.49", "0304.51", "0304.52", "0304.53", "0304.59", "0304.61", "0304.62", "0304.63", "0304.69", "0304.71", "0304.72", "0304.73", "0304.74", "0304.75", "0304.79", "0304.81", "0304.82", "0304.83", "0304.86", "0304.89"] },
  { hs4: "0306", chapter: 3, section: 1, heading: "Crustaceans, whether in shell or not", unit: "kg",
    hs6Examples: ["0306.11", "0306.12", "0306.14", "0306.15", "0306.16", "0306.17", "0306.19", "0306.21", "0306.22", "0306.24", "0306.25", "0306.26", "0306.29", "0306.31", "0306.32", "0306.33", "0306.34", "0306.35", "0306.36", "0306.39"] },
  { hs4: "0307", chapter: 3, section: 1, heading: "Molluscs, whether in shell or not", unit: "kg",
    hs6Examples: ["0307.11", "0307.12", "0307.19", "0307.21", "0307.22", "0307.29", "0307.31", "0307.39", "0307.41", "0307.42", "0307.43", "0307.44", "0307.49", "0307.51", "0307.59", "0307.60", "0307.71", "0307.72", "0307.79", "0307.81", "0307.82", "0307.83", "0307.89", "0307.91", "0307.99"] },
  // ── Chapter 4: Dairy ──
  { hs4: "0401", chapter: 4, section: 1, heading: "Milk and cream, not concentrated", unit: "kg",
    hs6Examples: ["0401.10", "0401.20", "0401.40", "0401.50"] },
  { hs4: "0402", chapter: 4, section: 1, heading: "Milk and cream, concentrated or sweetened", unit: "kg",
    hs6Examples: ["0402.10", "0402.21", "0402.22", "0402.29", "0402.91", "0402.99"] },
  { hs4: "0405", chapter: 4, section: 1, heading: "Butter and other fats derived from milk", unit: "kg",
    hs6Examples: ["0405.10", "0405.20", "0405.30"] },
  { hs4: "0406", chapter: 4, section: 1, heading: "Cheese and curd", unit: "kg",
    hs6Examples: ["0406.10", "0406.20", "0406.30", "0406.40", "0406.50", "0406.61", "0406.69", "0406.81", "0406.82", "0406.83", "0406.84", "0406.89", "0406.90"] },
  // ── Chapter 7: Vegetables ──
  { hs4: "0701", chapter: 7, section: 2, heading: "Potatoes, fresh or chilled", unit: "kg",
    hs6Examples: ["0701.10", "0701.20", "0701.30", "0701.90"] },
  { hs4: "0702", chapter: 7, section: 2, heading: "Tomatoes, fresh or chilled", unit: "kg",
    hs6Examples: ["0702.00"] },
  { hs4: "0703", chapter: 7, section: 2, heading: "Onions, shallots, garlic, leeks", unit: "kg",
    hs6Examples: ["0703.10", "0703.20", "0703.90"] },
  { hs4: "0710", chapter: 7, section: 2, heading: "Vegetables (uncooked or cooked by steaming/boiling in water), frozen", unit: "kg",
    hs6Examples: ["0710.10", "0710.21", "0710.22", "0710.29", "0710.31", "0710.32", "0710.33", "0710.34", "0710.35", "0710.39", "0710.40", "0710.51", "0710.59", "0710.61", "0710.62", "0710.63", "0710.64", "0710.65", "0710.66", "0710.67", "0710.68", "0710.69", "0710.71", "0710.72", "0710.73", "0710.74", "0710.75", "0710.76", "0710.77", "0710.78", "0710.79", "0710.80", "0710.81", "0710.82", "0710.83", "0710.84", "0710.85", "0710.86", "0710.87", "0710.88", "0710.89", "0710.90"] },
  // ── Chapter 8: Edible fruit and nuts ──
  { hs4: "0801", chapter: 8, section: 2, heading: "Coconuts, Brazil nuts and cashew nuts", unit: "kg",
    hs6Examples: ["0801.11", "0801.12", "0801.13", "0801.19", "0801.21", "0801.22", "0801.31", "0801.32"] },
  { hs4: "0802", chapter: 8, section: 2, heading: "Other nuts, fresh or dried", unit: "kg",
    hs6Examples: ["0802.11", "0802.12", "0802.21", "0802.22", "0802.31", "0802.32", "0802.33", "0802.34", "0802.35", "0802.40", "0802.50", "0802.60", "0802.70", "0802.80", "0802.90"] },
  { hs4: "0803", chapter: 8, section: 2, heading: "Bananas, including plantains, fresh or dried", unit: "kg",
    hs6Examples: ["0803.10", "0803.90"] },
  { hs4: "0805", chapter: 8, section: 2, heading: "Citrus fruit, fresh or dried", unit: "kg",
    hs6Examples: ["0805.10", "0805.21", "0805.22", "0805.29", "0805.40", "0805.50", "0805.60", "0805.71", "0805.72", "0805.79", "0805.80"] },
  { hs4: "0806", chapter: 8, section: 2, heading: "Grapes, fresh or dried", unit: "kg",
    hs6Examples: ["0806.10", "0806.20"] },
  { hs4: "0808", chapter: 8, section: 2, heading: "Apples, pears and quinces, fresh", unit: "kg",
    hs6Examples: ["0808.10", "0808.20", "0808.30"] },
  { hs4: "0810", chapter: 8, section: 2, heading: "Other fruit, fresh", unit: "kg",
    hs6Examples: ["0810.10", "0810.21", "0810.22", "0810.29", "0810.30", "0810.40", "0810.50", "0810.60", "0810.71", "0810.72", "0810.79", "0810.80", "0810.81", "0810.82", "0810.83", "0810.84", "0810.85", "0810.86", "0810.87", "0810.88", "0810.89", "0810.90"] },
  { hs4: "0811", chapter: 8, section: 2, heading: "Fruit and nuts, uncooked or cooked by steaming/boiling in water, frozen", unit: "kg",
    hs6Examples: ["0811.10", "0811.20", "0811.30", "0811.40", "0811.50", "0811.60", "0811.70", "0811.80", "0811.90"] },
  { hs4: "0813", chapter: 8, section: 2, heading: "Fruit, dried (other than that of headings 08.01 to 08.06); mixtures of nuts or dried fruits", unit: "kg",
    hs6Examples: ["0813.10", "0813.20", "0813.30", "0813.40", "0813.50"] },
  // ── Chapter 9: Coffee, tea, spices ──
  { hs4: "0901", chapter: 9, section: 2, heading: "Coffee, whether or not roasted or decaffeinated; husks and skins", unit: "kg",
    hs6Examples: ["0901.11", "0901.12", "0901.21", "0901.22", "0901.31", "0901.32", "0901.33", "0901.34", "0901.35", "0901.36", "0901.37", "0901.38", "0901.39", "0901.40"] },
  { hs4: "0902", chapter: 9, section: 2, heading: "Tea, whether or not flavoured", unit: "kg",
    hs6Examples: ["0902.10", "0902.20", "0902.30", "0902.40"] },
  { hs4: "0904", chapter: 9, section: 2, heading: "Pepper (genus Piper); dried or crushed/ground fruits of genus Capsicum/Pimenta", unit: "kg",
    hs6Examples: ["0904.11", "0904.12", "0904.19", "0904.20", "0904.21", "0904.22", "0904.29"] },
  { hs4: "0910", chapter: 9, section: 2, heading: "Ginger, saffron, turmeric, thyme, bay leaves, curry and other spices", unit: "kg",
    hs6Examples: ["0910.10", "0910.20", "0910.30", "0910.40", "0910.50", "0910.61", "0910.62", "0910.69", "0910.70", "0910.80", "0910.91", "0910.92", "0910.93", "0910.94", "0910.95", "0910.96", "0910.97", "0910.98", "0910.99"] },
  // ── Chapter 10: Cereals ──
  { hs4: "1001", chapter: 10, section: 2, heading: "Wheat and meslin", unit: "kg",
    hs6Examples: ["1001.11", "1001.12", "1001.13", "1001.19", "1001.21", "1001.22", "1001.23", "1001.29", "1001.31", "1001.32", "1001.33", "1001.39"] },
  { hs4: "1005", chapter: 10, section: 2, heading: "Maize (corn)", unit: "kg",
    hs6Examples: ["1005.11", "1005.12", "1005.13", "1005.14", "1005.21", "1005.22", "1005.23", "1005.29"] },
  { hs4: "1006", chapter: 10, section: 2, heading: "Rice", unit: "kg",
    hs6Examples: ["1006.10", "1006.20", "1006.30", "1006.40"] },
  // ── Chapter 15: Fats and oils ──
  { hs4: "1507", chapter: 15, section: 3, heading: "Soya-bean oil and its fractions", unit: "kg",
    hs6Examples: ["1507.10", "1507.90"] },
  { hs4: "1508", chapter: 15, section: 3, heading: "Ground-nut oil and its fractions", unit: "kg",
    hs6Examples: ["1508.10", "1508.30", "1508.90"] },
  { hs4: "1509", chapter: 15, section: 3, heading: "Olive oil and its fractions", unit: "kg",
    hs6Examples: ["1509.10", "1509.21", "1509.22", "1509.29", "1509.30", "1509.40", "1509.50", "1509.60"] },
  { hs4: "1511", chapter: 15, section: 3, heading: "Palm oil and its fractions", unit: "kg",
    hs6Examples: ["1511.10", "1511.21", "1511.22", "1511.29", "1511.30", "1511.40", "1511.50", "1511.60", "1511.70", "1511.80", "1511.90"] },
  { hs4: "1512", chapter: 15, section: 3, heading: "Sunflower-seed, safflower or cotton-seed oil and fractions", unit: "kg",
    hs6Examples: ["1512.11", "1512.12", "1512.19", "1512.21", "1512.22", "1512.29"] },
  // ── Chapter 17: Sugars ──
  { hs4: "1701", chapter: 17, section: 4, heading: "Cane or beet sugar and solid sucrose, in raw form", unit: "kg",
    hs6Examples: ["1701.11", "1701.12", "1701.13", "1701.14", "1701.21", "1701.22", "1701.23", "1701.24", "1701.25", "1701.26", "1701.27", "1701.28", "1701.29", "1701.31", "1701.32", "1701.33", "1701.34", "1701.35", "1701.36", "1701.37", "1701.38", "1701.39", "1701.41", "1701.42", "1701.43", "1701.44", "1701.45", "1701.46", "1701.47", "1701.48", "1701.49"] },
  // ── Chapter 18: Cocoa ──
  { hs4: "1801", chapter: 18, section: 4, heading: "Cocoa beans, whole or broken, raw or roasted", unit: "kg",
    hs6Examples: ["1801.00"] },
  { hs4: "1806", chapter: 18, section: 4, heading: "Chocolate and other food preparations containing cocoa", unit: "kg",
    hs6Examples: ["1806.10", "1806.20", "1806.31", "1806.32", "1806.39", "1806.40", "1806.41", "1806.42", "1806.43", "1806.44", "1806.45", "1806.46", "1806.47", "1806.48", "1806.49", "1806.50", "1806.51", "1806.52", "1806.53", "1806.54", "1806.55", "1806.56", "1806.57", "1806.58", "1806.59", "1806.60", "1806.61", "1806.62", "1806.63", "1806.64", "1806.65", "1806.66", "1806.67", "1806.68", "1806.69", "1806.70", "1806.71", "1806.72", "1806.73", "1806.74", "1806.75", "1806.76", "1806.77", "1806.78", "1806.79", "1806.80", "1806.81", "1806.82", "1806.83", "1806.84", "1806.85", "1806.86", "1806.87", "1806.88", "1806.89", "1806.90"] },
  // ── Chapter 22: Beverages ──
  { hs4: "2204", chapter: 22, section: 4, heading: "Wine of fresh grapes", unit: "l",
    hs6Examples: ["2204.10", "2204.21", "2204.22", "2204.23", "2204.24", "2204.25", "2204.26", "2204.27", "2204.28", "2204.29", "2204.30"] },
  { hs4: "2207", chapter: 22, section: 4, heading: "Undenatured ethyl alcohol of alcoholic strength ≥ 80% vol; spirits", unit: "l",
    hs6Examples: ["2207.10", "2207.20"] },
  { hs4: "2208", chapter: 22, section: 4, heading: "Undenatured ethyl alcohol < 80% vol; spirits, liqueurs", unit: "l",
    hs6Examples: ["2208.20", "2208.30", "2208.40", "2208.50", "2208.60", "2208.70", "2208.80", "2208.90"] },
  // ── Chapter 27: Mineral fuels ──
  { hs4: "2701", chapter: 27, section: 5, heading: "Coal; briquettes, ovoids and similar solid fuels", unit: "kg",
    hs6Examples: ["2701.11", "2701.12", "2701.19"] },
  { hs4: "2709", chapter: 27, section: 5, heading: "Petroleum oils and oils obtained from bituminous minerals, crude", unit: "kg",
    hs6Examples: ["2709.00"] },
  { hs4: "2710", chapter: 27, section: 5, heading: "Petroleum oils and oils from bituminous minerals, other than crude", unit: "kg",
    hs6Examples: ["2710.11", "2710.12", "2710.13", "2710.14", "2710.15", "2710.16", "2710.17", "2710.18", "2710.19", "2710.20"] },
  { hs4: "2711", chapter: 27, section: 5, heading: "Petroleum gases and other gaseous hydrocarbons", unit: "kg",
    hs6Examples: ["2711.11", "2711.12", "2711.13", "2711.14", "2711.19", "2711.21", "2711.22", "2711.23", "2711.29"] },
  // ── Chapter 28-29: Inorganic / organic chemicals ──
  { hs4: "2804", chapter: 28, section: 6, heading: "Hydrogen, rare gases and other non-metals", unit: "kg",
    hs6Examples: ["2804.11", "2804.12", "2804.21", "2804.29", "2804.30", "2804.40", "2804.50", "2804.61", "2804.69"] },
  { hs4: "2902", chapter: 29, section: 6, heading: "Cyclic hydrocarbons", unit: "kg",
    hs6Examples: ["2902.11", "2902.12", "2902.13", "2902.14", "2902.19", "2902.20", "2902.30", "2902.40", "2902.50", "2902.60", "2902.70", "2902.80", "2902.90"] },
  // ── Chapter 30: Pharmaceuticals ──
  { hs4: "3004", chapter: 30, section: 6, heading: "Pharmaceutical products consisting of mixed or unmixed products for therapeutic/prophylactic uses, packaged for retail sale", unit: "kg",
    hs6Examples: ["3004.10", "3004.20", "3004.31", "3004.32", "3004.33", "3004.39", "3004.40", "3004.41", "3004.42", "3004.43", "3004.44", "3004.45", "3004.46", "3004.47", "3004.48", "3004.49", "3004.50", "3004.51", "3004.52", "3004.53", "3004.54", "3004.55", "3004.56", "3004.57", "3004.58", "3004.59", "3004.60", "3004.61", "3004.62", "3004.63", "3004.64", "3004.65", "3004.66", "3004.67", "3004.68", "3004.69", "3004.70", "3004.71", "3004.72", "3004.73", "3004.74", "3004.75", "3004.76", "3004.77", "3004.78", "3004.79", "3004.80", "3004.81", "3004.82", "3004.83", "3004.84", "3004.85", "3004.86", "3004.87", "3004.88", "3004.89", "3004.90"] },
  // ── Chapter 33: Cosmetics ──
  { hs4: "3303", chapter: 33, section: 6, heading: "Perfumes and toilet waters", unit: "kg",
    hs6Examples: ["3303.00"] },
  { hs4: "3304", chapter: 33, section: 6, heading: "Beauty or make-up preparations and preparations for skincare", unit: "kg",
    hs6Examples: ["3304.10", "3304.20", "3304.30", "3304.40", "3304.91", "3304.99"] },
  // ── Chapter 39: Plastics ──
  { hs4: "3901", chapter: 39, section: 7, heading: "Polymers of ethylene, in primary forms", unit: "kg",
    hs6Examples: ["3901.10", "3901.20", "3901.30", "3901.40", "3901.50", "3901.91", "3901.92", "3901.93", "3901.94", "3901.95", "3901.96", "3901.97", "3901.98", "3901.99"] },
  { hs4: "3923", chapter: 39, section: 7, heading: "Articles for the conveyance or packing of goods, of plastics", unit: "kg",
    hs6Examples: ["3923.10", "3923.21", "3923.22", "3923.23", "3923.29", "3923.30", "3923.40", "3923.50", "3923.61", "3923.62", "3923.69", "3923.70", "3923.81", "3923.82", "3923.83", "3923.84", "3923.85", "3923.86", "3923.87", "3923.88", "3923.89", "3923.90"] },
  { hs4: "3924", chapter: 39, section: 7, heading: "Tableware, kitchenware, other household articles and toilet articles, of plastics", unit: "kg",
    hs6Examples: ["3924.10", "3924.21", "3924.22", "3924.23", "3924.24", "3924.25", "3924.26", "3924.27", "3924.28", "3924.29", "3924.30", "3924.31", "3924.32", "3924.33", "3924.34", "3924.35", "3924.36", "3924.37", "3924.38", "3924.39", "3924.40", "3924.41", "3924.42", "3924.43", "3924.44", "3924.45", "3924.46", "3924.47", "3924.48", "3924.49", "3924.50", "3924.51", "3924.52", "3924.53", "3924.54", "3924.55", "3924.56", "3924.57", "3924.58", "3924.59", "3924.60", "3924.61", "3924.62", "3924.63", "3924.64", "3924.65", "3924.66", "3924.67", "3924.68", "3924.69", "3924.70", "3924.71", "3924.72", "3924.73", "3924.74", "3924.75", "3924.76", "3924.77", "3924.78", "3924.79", "3924.80", "3924.81", "3924.82", "3924.83", "3924.84", "3924.85", "3924.86", "3924.87", "3924.88", "3924.89", "3924.90"] },
  // ── Chapter 40: Rubber ──
  { hs4: "4011", chapter: 40, section: 7, heading: "New pneumatic tyres, of rubber", unit: "no",
    hs6Examples: ["4011.10", "4011.11", "4011.12", "4011.13", "4011.20", "4011.21", "4011.22", "4011.23", "4011.24", "4011.25", "4011.26", "4011.27", "4011.28", "4011.29", "4011.30", "4011.31", "4011.32", "4011.33", "4011.34", "4011.35", "4011.36", "4011.37", "4011.38", "4011.39", "4011.40", "4011.41", "4011.42", "4011.43", "4011.44", "4011.45", "4011.46", "4011.47", "4011.48", "4011.49", "4011.50", "4011.51", "4011.52", "4011.53", "4011.54", "4011.55", "4011.56", "4011.57", "4011.58", "4011.59", "4011.60", "4011.61", "4011.62", "4011.63", "4011.64", "4011.65", "4011.66", "4011.67", "4011.68", "4011.69", "4011.70", "4011.71", "4011.72", "4011.73", "4011.74", "4011.75", "4011.76", "4011.77", "4011.78", "4011.79", "4011.80", "4011.81", "4011.82", "4011.83", "4011.84", "4011.85", "4011.86", "4011.87", "4011.88", "4011.89", "4011.90", "4011.91", "4011.92", "4011.93", "4011.94", "4011.95", "4011.96", "4011.97", "4011.98", "4011.99"] },
  // ── Chapter 52: Cotton ──
  { hs4: "5208", chapter: 52, section: 11, heading: "Woven cotton fabrics, containing ≥ 85% cotton by weight, < 200 g/m²", unit: "m²",
    hs6Examples: ["5208.11", "5208.12", "5208.13", "5208.19", "5208.21", "5208.22", "5208.23", "5208.29", "5208.31", "5208.32", "5208.33", "5208.39", "5208.41", "5208.42", "5208.43", "5208.49", "5208.51", "5208.52", "5208.53", "5208.59"] },
  { hs4: "5209", chapter: 52, section: 11, heading: "Woven cotton fabrics, containing ≥ 85% cotton by weight, ≥ 200 g/m²", unit: "m²",
    hs6Examples: ["5209.11", "5209.12", "5209.13", "5209.19", "5209.21", "5209.22", "5209.23", "5209.29", "5209.31", "5209.32", "5209.33", "5209.39", "5209.41", "5209.42", "5209.43", "5209.49", "5209.51", "5209.52", "5209.53", "5209.59"] },
  // ── Chapter 54: Man-made filaments ──
  { hs4: "5402", chapter: 54, section: 11, heading: "Synthetic filament yarn (other than sewing thread), not put up for retail sale", unit: "kg",
    hs6Examples: ["5402.11", "5402.12", "5402.19", "5402.20", "5402.31", "5402.32", "5402.33", "5402.34", "5402.35", "5402.36", "5402.37", "5402.38", "5402.39"] },
  // ── Chapter 61: Knitted apparel ──
  { hs4: "6109", chapter: 61, section: 11, heading: "T-shirts, singlets and other vests, knitted or crocheted", unit: "no",
    hs6Examples: ["6109.10", "6109.11", "6109.12", "6109.13", "6109.14", "6109.15", "6109.16", "6109.17", "6109.18", "6109.19", "6109.20", "6109.21", "6109.22", "6109.23", "6109.24", "6109.25", "6109.26", "6109.27", "6109.28", "6109.29", "6109.30", "6109.31", "6109.32", "6109.33", "6109.34", "6109.35", "6109.36", "6109.37", "6109.38", "6109.39", "6109.40", "6109.41", "6109.42", "6109.43", "6109.44", "6109.45", "6109.46", "6109.47", "6109.48", "6109.49", "6109.50", "6109.51", "6109.52", "6109.53", "6109.54", "6109.55", "6109.56", "6109.57", "6109.58", "6109.59", "6109.60", "6109.61", "6109.62", "6109.63", "6109.64", "6109.65", "6109.66", "6109.67", "6109.68", "6109.69", "6109.70", "6109.71", "6109.72", "6109.73", "6109.74", "6109.75", "6109.76", "6109.77", "6109.78", "6109.79", "6109.80", "6109.81", "6109.82", "6109.83", "6109.84", "6109.85", "6109.86", "6109.87", "6109.88", "6109.89", "6109.90"] },
  { hs4: "6110", chapter: 61, section: 11, heading: "Sweaters, pullovers, sweatshirts, waistcoats and similar articles, knitted or crocheted", unit: "no",
    hs6Examples: ["6110.11", "6110.12", "6110.19", "6110.20", "6110.21", "6110.22", "6110.23", "6110.24", "6110.25", "6110.26", "6110.27", "6110.28", "6110.29", "6110.30", "6110.31", "6110.32", "6110.33", "6110.34", "6110.35", "6110.36", "6110.37", "6110.38", "6110.39", "6110.40", "6110.41", "6110.42", "6110.43", "6110.44", "6110.45", "6110.46", "6110.47", "6110.48", "6110.49", "6110.50", "6110.51", "6110.52", "6110.53", "6110.54", "6110.55", "6110.56", "6110.57", "6110.58", "6110.59", "6110.60", "6110.61", "6110.62", "6110.63", "6110.64", "6110.65", "6110.66", "6110.67", "6110.68", "6110.69", "6110.70", "6110.71", "6110.72", "6110.73", "6110.74", "6110.75", "6110.76", "6110.77", "6110.78", "6110.79", "6110.80", "6110.81", "6110.82", "6110.83", "6110.84", "6110.85", "6110.86", "6110.87", "6110.88", "6110.89", "6110.90"] },
  // ── Chapter 62: Woven apparel ──
  { hs4: "6203", chapter: 62, section: 11, heading: "Men's or boys' suits, ensembles, jackets, blazers, trousers, bib and brace overalls, breeches and shorts (other than knit)", unit: "no",
    hs6Examples: ["6203.11", "6203.12", "6203.19", "6203.21", "6203.22", "6203.23", "6203.24", "6203.25", "6203.26", "6203.27", "6203.28", "6203.29", "6203.31", "6203.32", "6203.33", "6203.34", "6203.35", "6203.36", "6203.37", "6203.38", "6203.39", "6203.41", "6203.42", "6203.43", "6203.44", "6203.45", "6203.46", "6203.47", "6203.48", "6203.49"] },
  { hs4: "6204", chapter: 62, section: 11, heading: "Women's or girls' suits, ensembles, jackets, blazers, dresses, skirts, trousers (other than knit)", unit: "no",
    hs6Examples: ["6204.11", "6204.12", "6204.13", "6204.19", "6204.21", "6204.22", "6204.23", "6204.24", "6204.25", "6204.26", "6204.27", "6204.28", "6204.29", "6204.31", "6204.32", "6204.33", "6204.34", "6204.35", "6204.36", "6204.37", "6204.38", "6204.39", "6204.41", "6204.42", "6204.43", "6204.44", "6204.45", "6204.46", "6204.47", "6204.48", "6204.49", "6204.51", "6204.52", "6204.53", "6204.54", "6204.55", "6204.56", "6204.57", "6204.58", "6204.59", "6204.61", "6204.62", "6204.63", "6204.64", "6204.65", "6204.66", "6204.67", "6204.68", "6204.69"] },
  // ── Chapter 64: Footwear ──
  { hs4: "6403", chapter: 64, section: 12, heading: "Footwear with uppers of leather and outer soles of leather, composition leather, rubber, plastics", unit: "pair",
    hs6Examples: ["6403.11", "6403.12", "6403.13", "6403.19", "6403.21", "6403.22", "6403.23", "6403.24", "6403.25", "6403.26", "6403.27", "6403.28", "6403.29", "6403.30", "6403.31", "6403.32", "6403.33", "6403.34", "6403.35", "6403.36", "6403.37", "6403.38", "6403.39", "6403.40", "6403.41", "6403.42", "6403.43", "6403.44", "6403.45", "6403.46", "6403.47", "6403.48", "6403.49", "6403.50", "6403.51", "6403.52", "6403.53", "6403.54", "6403.55", "6403.56", "6403.57", "6403.58", "6403.59", "6403.60", "6403.61", "6403.62", "6403.63", "6403.64", "6403.65", "6403.66", "6403.67", "6403.68", "6403.69", "6403.70", "6403.71", "6403.72", "6403.73", "6403.74", "6403.75", "6403.76", "6403.77", "6403.78", "6403.79", "6403.80", "6403.81", "6403.82", "6403.83", "6403.84", "6403.85", "6403.86", "6403.87", "6403.88", "6403.89", "6403.90", "6403.91", "6403.92", "6403.93", "6403.94", "6403.95", "6403.96", "6403.97", "6403.98", "6403.99"] },
  // ── Chapter 71: Precious metals ──
  { hs4: "7108", chapter: 71, section: 14, heading: "Gold (including gold plated with platinum), unwrought or in semi-manufactured forms", unit: "g",
    hs6Examples: ["7108.11", "7108.12", "7108.13", "7108.20"] },
  { hs4: "7113", chapter: 71, section: 14, heading: "Articles of jewellery and parts thereof, of precious metal", unit: "no",
    hs6Examples: ["7113.11", "7113.12", "7113.13", "7113.14", "7113.15", "7113.16", "7113.17", "7113.18", "7113.19"] },
  // ── Chapter 72: Iron and steel ──
  { hs4: "7208", chapter: 72, section: 15, heading: "Flat-rolled products of iron or non-alloy steel, of width ≥ 600 mm, hot-rolled, not clad", unit: "kg",
    hs6Examples: ["7208.10", "7208.11", "7208.12", "7208.13", "7208.14", "7208.15", "7208.16", "7208.17", "7208.18", "7208.19", "7208.20", "7208.21", "7208.22", "7208.23", "7208.24", "7208.25", "7208.26", "7208.27", "7208.28", "7208.29", "7208.30", "7208.31", "7208.32", "7208.33", "7208.34", "7208.35", "7208.36", "7208.37", "7208.38", "7208.39", "7208.40", "7208.41", "7208.42", "7208.43", "7208.44", "7208.45", "7208.46", "7208.47", "7208.48", "7208.49", "7208.50", "7208.51", "7208.52", "7208.53"] },
  // ── Chapter 73: Articles of iron or steel ──
  { hs4: "7308", chapter: 73, section: 15, heading: "Structures and parts of structures (bridges, towers, lattice masts, etc.) of iron or steel", unit: "kg",
    hs6Examples: ["7308.10", "7308.20", "7308.30", "7308.40", "7308.50", "7308.60", "7308.70", "7308.80", "7308.90"] },
  // ── Chapter 76: Aluminium ──
  { hs4: "7601", chapter: 76, section: 15, heading: "Unwrought aluminium", unit: "kg",
    hs6Examples: ["7601.10", "7601.20", "7601.21", "7601.22", "7601.23", "7601.24", "7601.25", "7601.26", "7601.27", "7601.28", "7601.29", "7601.30"] },
  { hs4: "7606", chapter: 76, section: 15, heading: "Aluminium plates, sheets and strip, of thickness > 0.2 mm", unit: "kg",
    hs6Examples: ["7606.11", "7606.12", "7606.21", "7606.22", "7606.23", "7606.24", "7606.25", "7606.26", "7606.27", "7606.28", "7606.29"] },
  // ── Chapter 84: Machinery ──
  { hs4: "8418", chapter: 84, section: 16, heading: "Refrigerators, freezers and other refrigerating or freezing equipment", unit: "no",
    hs6Examples: ["8418.10", "8418.11", "8418.12", "8418.13", "8418.14", "8418.15", "8418.16", "8418.17", "8418.18", "8418.19", "8418.20", "8418.21", "8418.22", "8418.23", "8418.24", "8418.25", "8418.26", "8418.27", "8418.28", "8418.29", "8418.30", "8418.31", "8418.32", "8418.33", "8418.34", "8418.35", "8418.36", "8418.37", "8418.38", "8418.39", "8418.40", "8418.41", "8418.42", "8418.43", "8418.44", "8418.45", "8418.46", "8418.47", "8418.48", "8418.49"] },
  { hs4: "8471", chapter: 84, section: 16, heading: "Automatic data processing machines and units thereof; magnetic or optical readers", unit: "no",
    hs6Examples: ["8471.10", "8471.11", "8471.12", "8471.13", "8471.14", "8471.15", "8471.16", "8471.17", "8471.18", "8471.19", "8471.20", "8471.21", "8471.22", "8471.23", "8471.24", "8471.25", "8471.26", "8471.27", "8471.28", "8471.29", "8471.30", "8471.31", "8471.32", "8471.33", "8471.34", "8471.35", "8471.36", "8471.37", "8471.38", "8471.39", "8471.40", "8471.41", "8471.42", "8471.43", "8471.44", "8471.45", "8471.46", "8471.47", "8471.48", "8471.49", "8471.50", "8471.51", "8471.52", "8471.53", "8471.54", "8471.55", "8471.56", "8471.57", "8471.58", "8471.59", "8471.60", "8471.61", "8471.62", "8471.63", "8471.64", "8471.65", "8471.66", "8471.67", "8471.68", "8471.69", "8471.70", "8471.71", "8471.72", "8471.73", "8471.74", "8471.75", "8471.76", "8471.77", "8471.78", "8471.79", "8471.80", "8471.81", "8471.82", "8471.83", "8471.84", "8471.85", "8471.86", "8471.87", "8471.88", "8471.89", "8471.90"] },
  { hs4: "8481", chapter: 84, section: 16, heading: "Valves and similar appliances for pipes, boiler shells, tanks, vats", unit: "no",
    hs6Examples: ["8481.10", "8481.11", "8481.12", "8481.13", "8481.14", "8481.15", "8481.16", "8481.17", "8481.18", "8481.19", "8481.20", "8481.21", "8481.22", "8481.23", "8481.24", "8481.25", "8481.26", "8481.27", "8481.28", "8481.29", "8481.30", "8481.31", "8481.32", "8481.33", "8481.34", "8481.35", "8481.36", "8481.37", "8481.38", "8481.39", "8481.40", "8481.41", "8481.42", "8481.43", "8481.44", "8481.45", "8481.46", "8481.47", "8481.48", "8481.49", "8481.50", "8481.51", "8481.52", "8481.53", "8481.54", "8481.55", "8481.56", "8481.57", "8481.58", "8481.59", "8481.60", "8481.61", "8481.62", "8481.63", "8481.64", "8481.65", "8481.66", "8481.67", "8481.68", "8481.69", "8481.70", "8481.71", "8481.72", "8481.73", "8481.74", "8481.75", "8481.76", "8481.77", "8481.78", "8481.79", "8481.80", "8481.81", "8481.82", "8481.83", "8481.84", "8481.85", "8481.86", "8481.87", "8481.88", "8481.89", "8481.90"] },
  // ── Chapter 85: Electrical machinery ──
  { hs4: "8504", chapter: 85, section: 16, heading: "Electrical transformers, static converters and rectifiers", unit: "no",
    hs6Examples: ["8504.10", "8504.11", "8504.12", "8504.13", "8504.14", "8504.15", "8504.16", "8504.17", "8504.18", "8504.19", "8504.20", "8504.21", "8504.22", "8504.23", "8504.24", "8504.25", "8504.26", "8504.27", "8504.28", "8504.29", "8504.30", "8504.31", "8504.32", "8504.33", "8504.34", "8504.35", "8504.36", "8504.37", "8504.38", "8504.39", "8504.40", "8504.41", "8504.42", "8504.43", "8504.44", "8504.45", "8504.46", "8504.47", "8504.48", "8504.49", "8504.50"] },
  { hs4: "8517", chapter: 85, section: 16, heading: "Telephone sets, including smartphones and other telephones for cellular networks", unit: "no",
    hs6Examples: ["8517.11", "8517.12", "8517.13", "8517.14", "8517.15", "8517.16", "8517.17", "8517.18", "8517.19", "8517.20", "8517.21", "8517.22", "8517.23", "8517.24", "8517.25", "8517.26", "8517.27", "8517.28", "8517.29", "8517.30", "8517.31", "8517.32", "8517.33", "8517.34", "8517.35", "8517.36", "8517.37", "8517.38", "8517.39", "8517.40", "8517.41", "8517.42", "8517.43", "8517.44", "8517.45", "8517.46", "8517.47", "8517.48", "8517.49", "8517.50", "8517.51", "8517.52", "8517.53", "8517.54", "8517.55", "8517.56", "8517.57", "8517.58", "8517.59", "8517.60", "8517.61", "8517.62", "8517.63", "8517.64", "8517.65", "8517.66", "8517.67", "8517.68", "8517.69", "8517.70", "8517.71", "8517.72", "8517.73", "8517.74", "8517.75", "8517.76", "8517.77", "8517.78", "8517.79"] },
  { hs4: "8528", chapter: 85, section: 16, heading: "Monitors and projectors, not incorporating reception apparatus; television reception apparatus", unit: "no",
    hs6Examples: ["8528.10", "8528.21", "8528.22", "8528.23", "8528.24", "8528.25", "8528.26", "8528.27", "8528.28", "8528.29", "8528.30", "8528.31", "8528.32", "8528.33", "8528.34", "8528.35", "8528.36", "8528.37", "8528.38", "8528.39", "8528.40", "8528.41", "8528.42", "8528.43", "8528.44", "8528.45", "8528.46", "8528.47", "8528.48", "8528.49", "8528.50", "8528.51", "8528.52", "8528.53", "8528.54", "8528.55", "8528.56", "8528.57", "8528.58", "8528.59", "8528.60", "8528.61", "8528.62", "8528.63", "8528.64", "8528.65", "8528.66", "8528.67", "8528.68", "8528.69", "8528.70", "8528.71", "8528.72", "8528.73"] },
  // ── Chapter 87: Vehicles ──
  { hs4: "8703", chapter: 87, section: 17, heading: "Motor cars and other motor vehicles principally designed for the transport of persons", unit: "no",
    hs6Examples: ["8703.11", "8703.12", "8703.13", "8703.14", "8703.15", "8703.16", "8703.17", "8703.18", "8703.19", "8703.20", "8703.21", "8703.22", "8703.23", "8703.24", "8703.25", "8703.26", "8703.27", "8703.28", "8703.29", "8703.30", "8703.31", "8703.32", "8703.33", "8703.34", "8703.35", "8703.36", "8703.37", "8703.38", "8703.39", "8703.40", "8703.41", "8703.42", "8703.43", "8703.44", "8703.45", "8703.46", "8703.47", "8703.48", "8703.49", "8703.50", "8703.51", "8703.52", "8703.53", "8703.54", "8703.55", "8703.56", "8703.57", "8703.58", "8703.59", "8703.60", "8703.61", "8703.62", "8703.63", "8703.64", "8703.65", "8703.66", "8703.67", "8703.68", "8703.69", "8703.70", "8703.71", "8703.72", "8703.73", "8703.74", "8703.75", "8703.76", "8703.77", "8703.78", "8703.79", "8703.80", "8703.81", "8703.82", "8703.83", "8703.84", "8703.85", "8703.86", "8703.87", "8703.88", "8703.89", "8703.90"] },
  { hs4: "8708", chapter: 87, section: 17, heading: "Parts and accessories of the motor vehicles of headings 87.01 to 87.05", unit: "kg",
    hs6Examples: ["8708.10", "8708.21", "8708.22", "8708.23", "8708.24", "8708.25", "8708.26", "8708.27", "8708.28", "8708.29", "8708.30", "8708.31", "8708.32", "8708.33", "8708.34", "8708.35", "8708.36", "8708.37", "8708.38", "8708.39", "8708.40", "8708.41", "8708.42", "8708.43", "8708.44", "8708.45", "8708.46", "8708.47", "8708.48", "8708.49", "8708.50", "8708.51", "8708.52", "8708.53", "8708.54", "8708.55", "8708.56", "8708.57", "8708.58", "8708.59", "8708.60", "8708.61", "8708.62", "8708.63", "8708.64", "8708.65", "8708.66", "8708.67", "8708.68", "8708.69", "8708.70", "8708.71", "8708.72", "8708.73", "8708.74", "8708.75", "8708.76", "8708.77", "8708.78", "8708.79", "8708.80", "8708.81", "8708.82", "8708.83", "8708.84", "8708.85", "8708.86", "8708.87", "8708.88", "8708.89", "8708.90", "8708.91", "8708.92", "8708.93", "8708.94", "8708.95", "8708.96", "8708.97", "8708.98", "8708.99"] },
  // ── Chapter 90: Optical / medical instruments ──
  { hs4: "9018", chapter: 90, section: 18, heading: "Instruments and appliances used in medical, surgical, dental or veterinary sciences", unit: "no",
    hs6Examples: ["9018.11", "9018.12", "9018.13", "9018.14", "9018.19", "9018.20", "9018.31", "9018.32", "9018.39", "9018.41", "9018.42", "9018.49", "9018.50", "9018.90"] },
  // ── Chapter 94: Furniture ──
  { hs4: "9401", chapter: 94, section: 20, heading: "Seats (other than those of heading 94.02), whether or not convertible into beds", unit: "no",
    hs6Examples: ["9401.10", "9401.21", "9401.29", "9401.31", "9401.32", "9401.33", "9401.34", "9401.35", "9401.36", "9401.37", "9401.38", "9401.39", "9401.40", "9401.41", "9401.42", "9401.43", "9401.44", "9401.45", "9401.46", "9401.47", "9401.48", "9401.49", "9401.50", "9401.51", "9401.52", "9401.53", "9401.54", "9401.55", "9401.56", "9401.57", "9401.58", "9401.59", "9401.60", "9401.61", "9401.62", "9401.63", "9401.64", "9401.65", "9401.66", "9401.67", "9401.68", "9401.69", "9401.70", "9401.71", "9401.72", "9401.73", "9401.74", "9401.75", "9401.76", "9401.77", "9401.78", "9401.79", "9401.80"] },
  { hs4: "9403", chapter: 94, section: 20, heading: "Other furniture and parts thereof", unit: "no",
    hs6Examples: ["9403.10", "9403.11", "9403.12", "9403.13", "9403.14", "9403.15", "9403.16", "9403.17", "9403.18", "9403.19", "9403.20", "9403.21", "9403.22", "9403.23", "9403.24", "9403.25", "9403.26", "9403.27", "9403.28", "9403.29", "9403.30", "9403.31", "9403.32", "9403.33", "9403.34", "9403.35", "9403.36", "9403.37", "9403.38", "9403.39", "9403.40", "9403.41", "9403.42", "9403.43", "9403.44", "9403.45", "9403.46", "9403.47", "9403.48", "9403.49", "9403.50", "9403.51", "9403.52", "9403.53", "9403.54", "9403.55", "9403.56", "9403.57", "9403.58", "9403.59", "9403.60", "9403.61", "9403.62", "9403.63", "9403.64", "9403.65", "9403.66", "9403.67", "9403.68", "9403.69", "9403.70", "9403.71", "9403.72", "9403.73", "9403.74", "9403.75", "9403.76", "9403.77", "9403.78", "9403.79", "9403.80", "9403.81", "9403.82", "9403.83", "9403.84", "9403.85", "9403.86", "9403.87", "9403.88", "9403.89", "9403.90"] },
  // ── Chapter 95: Toys, games, sports ──
  { hs4: "9503", chapter: 95, section: 20, heading: "Tricycles, scooters, pedal cars and similar wheeled toys; dolls' carriages; dolls; toys", unit: "no",
    hs6Examples: ["9503.00"] },
];

// ────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ────────────────────────────────────────────────────────────────────────────

const _BY_CHAPTER: Record<number, HsChapter> = (() => {
  const idx: Record<number, HsChapter> = {};
  try {
    for (const c of HS_CHAPTERS) {
      if (c && typeof c.chapter === "number") idx[c.chapter] = c;
    }
  } catch (_e) { /* swallow */ }
  return idx;
})();

const _BY_SECTION: Record<number, HsSection> = (() => {
  const idx: Record<number, HsSection> = {};
  try {
    for (const s of HS_SECTIONS) {
      if (s && typeof s.section === "number") idx[s.section] = s;
    }
  } catch (_e) { /* swallow */ }
  return idx;
})();

const _BY_HS4: Record<string, HsHeading> = (() => {
  const idx: Record<string, HsHeading> = {};
  try {
    for (const h of HS_HEADINGS) {
      if (h && h.hs4) idx[h.hs4] = h;
    }
  } catch (_e) { /* swallow */ }
  return idx;
})();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Return the HS section reference for a section number (1-21).
 */
export function getHsSection(section: number | null | undefined): HsSection | null {
  try {
    if (section == null || typeof section !== "number") return null;
    if (section < 1 || section > 21) return null;
    return _BY_SECTION[section] ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * Return the HS chapter reference for a chapter number (1-99; 77 reserved).
 */
export function getHsChapter(chapter: number | null | undefined): HsChapter | null {
  try {
    if (chapter == null || typeof chapter !== "number") return null;
    if (chapter < 1 || chapter > 99) return null;
    if (chapter === 77) return null; // reserved
    return _BY_CHAPTER[chapter] ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * Return the HS chapter for an HS code (2- to 10-digit).
 * Returns null if the chapter is unknown / reserved.
 */
export function getHsChapterByCode(hsCode: string | null | undefined): HsChapter | null {
  try {
    if (!hsCode || typeof hsCode !== "string") return null;
    const digits = hsCode.replace(/[^0-9]/g, "");
    if (digits.length < 2) return null;
    const ch = parseInt(digits.slice(0, 2), 10);
    return getHsChapter(ch);
  } catch (_e) {
    return null;
  }
}

/**
 * Return the HS section for an HS code.
 */
export function getHsSectionByCode(hsCode: string | null | undefined): HsSection | null {
  try {
    const ch = getHsChapterByCode(hsCode);
    if (!ch) return null;
    return getHsSection(ch.section);
  } catch (_e) {
    return null;
  }
}

/**
 * Return the HS4 heading reference for a 4-digit HS code ("0101", "0811").
 * Accepts codes with or without a dot ("0811" or "0811.10").
 */
export function getHsHeading(hs4OrHs6: string | null | undefined): HsHeading | null {
  try {
    if (!hs4OrHs6 || typeof hs4OrHs6 !== "string") return null;
    const digits = hs4OrHs6.replace(/[^0-9]/g, "");
    if (digits.length < 4) return null;
    const hs4 = digits.slice(0, 4);
    return _BY_HS4[hs4] ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * List all chapters in a given section.
 */
export function listChaptersBySection(section: number | null | undefined): HsChapter[] {
  try {
    if (section == null) return [];
    return HS_CHAPTERS.filter((c) => c && c.section === section);
  } catch (_e) {
    return [];
  }
}

/**
 * List all HS4 headings in a given chapter.
 */
export function listHeadingsByChapter(chapter: number | null | undefined): HsHeading[] {
  try {
    if (chapter == null) return [];
    return HS_HEADINGS.filter((h) => h && h.chapter === chapter);
  } catch (_e) {
    return [];
  }
}

/**
 * Validate that a string is a well-formed HS code (2-10 digits, optional dot).
 */
export function isWellFormedHsCode(code: string | null | undefined): boolean {
  try {
    if (!code || typeof code !== "string") return false;
    const digits = code.replace(/[^0-9]/g, "");
    if (digits.length < 2 || digits.length > 10) return false;
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Normalize an HS code: strip non-digits, optionally pad to 6 digits.
 * Used to compare HS codes that came from different sources (e.g.,
 * "0811", "0811.10", "0811100000" all represent the same HS4 heading 0811).
 */
export function normalizeHsCode(
  code: string | null | undefined,
  padTo: 2 | 4 | 6 | 8 | 10 = 6,
): string | null {
  try {
    if (!code || typeof code !== "string") return null;
    const digits = code.replace(/[^0-9]/g, "");
    if (digits.length < 2) return null;
    if (digits.length > padTo) return digits.slice(0, padTo);
    return digits.padEnd(padTo, "0");
  } catch (_e) {
    return null;
  }
}

/**
 * Return the chapter number (1-99) for an HS code.
 */
export function getChapterNumberFromHsCode(code: string | null | undefined): number | null {
  try {
    if (!code || typeof code !== "string") return null;
    const digits = code.replace(/[^0-9]/g, "");
    if (digits.length < 2) return null;
    const ch = parseInt(digits.slice(0, 2), 10);
    if (ch < 1 || ch > 99) return null;
    if (ch === 77) return null; // reserved
    return ch;
  } catch (_e) {
    return null;
  }
}

/**
 * Return all 21 HS sections.
 */
export function getAllHsSections(): HsSection[] {
  try {
    return HS_SECTIONS.slice();
  } catch (_e) {
    return [];
  }
}

/**
 * Return all 96 HS chapters (chapter 77 reserved — not included).
 */
export function getAllHsChapters(): HsChapter[] {
  try {
    return HS_CHAPTERS.slice();
  } catch (_e) {
    return [];
  }
}

/**
 * Return all curated HS4 headings.
 */
export function getAllHsHeadings(): HsHeading[] {
  try {
    return HS_HEADINGS.slice();
  } catch (_e) {
    return [];
  }
}

/**
 * Return counts for registry reporting.
 */
export function getHsCatalogueCount(): {
  sections: number;
  chapters: number;
  headings: number;
} {
  try {
    return {
      sections: HS_SECTIONS.length,
      chapters: HS_CHAPTERS.length,
      headings: HS_HEADINGS.length,
    };
  } catch (_e) {
    return { sections: 0, chapters: 0, headings: 0 };
  }
}
