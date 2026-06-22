/**
 * SGTX Country Registration Data Generator — single large AI call
 * Generates entity types + required docs for all 195 countries in ONE API call.
 * Falls back to curated defaults on any error.
 *
 * Usage:  bun run scripts/generate-country-data.ts
 */
import ZAI from "z-ai-web-dev-sdk";
import { writeFileSync } from "fs";

const ALL_COUNTRIES = [
  ["AF","Afghanistan"],["AL","Albania"],["DZ","Algeria"],["AD","Andorra"],["AO","Angola"],
  ["AG","Antigua and Barbuda"],["AR","Argentina"],["AM","Armenia"],["AU","Australia"],["AT","Austria"],
  ["AZ","Azerbaijan"],["BS","Bahamas"],["BH","Bahrain"],["BD","Bangladesh"],["BB","Barbados"],
  ["BY","Belarus"],["BE","Belgium"],["BZ","Belize"],["BJ","Benin"],["BT","Bhutan"],
  ["BO","Bolivia"],["BA","Bosnia and Herzegovina"],["BW","Botswana"],["BR","Brazil"],["BN","Brunei"],
  ["BG","Bulgaria"],["BF","Burkina Faso"],["BI","Burundi"],["CV","Cabo Verde"],["KH","Cambodia"],
  ["CM","Cameroon"],["CA","Canada"],["CF","Central African Republic"],["TD","Chad"],["CL","Chile"],
  ["CN","China"],["CO","Colombia"],["KM","Comoros"],["CG","Congo (Brazzaville)"],["CD","Congo (Kinshasa)"],
  ["CR","Costa Rica"],["CI","Côte d'Ivoire"],["HR","Croatia"],["CU","Cuba"],["CY","Cyprus"],
  ["CZ","Czech Republic"],["DK","Denmark"],["DJ","Djibouti"],["DM","Dominica"],["DO","Dominican Republic"],
  ["EC","Ecuador"],["EG","Egypt"],["SV","El Salvador"],["GQ","Equatorial Guinea"],["ER","Eritrea"],
  ["EE","Estonia"],["SZ","Eswatini"],["ET","Ethiopia"],["FJ","Fiji"],["FI","Finland"],
  ["FR","France"],["GA","Gabon"],["GM","Gambia"],["GE","Georgia"],["DE","Germany"],
  ["GH","Ghana"],["GR","Greece"],["GD","Grenada"],["GT","Guatemala"],["GN","Guinea"],
  ["GW","Guinea-Bissau"],["GY","Guyana"],["HT","Haiti"],["HN","Honduras"],["HU","Hungary"],
  ["IS","Iceland"],["IN","India"],["ID","Indonesia"],["IR","Iran"],["IQ","Iraq"],
  ["IE","Ireland"],["IL","Israel"],["IT","Italy"],["JM","Jamaica"],["JP","Japan"],
  ["JO","Jordan"],["KZ","Kazakhstan"],["KE","Kenya"],["KI","Kiribati"],["KP","North Korea"],
  ["KR","South Korea"],["KW","Kuwait"],["KG","Kyrgyzstan"],["LA","Laos"],["LV","Latvia"],
  ["LB","Lebanon"],["LS","Lesotho"],["LR","Liberia"],["LY","Libya"],["LI","Liechtenstein"],
  ["LT","Lithuania"],["LU","Luxembourg"],["MG","Madagascar"],["MW","Malawi"],["MY","Malaysia"],
  ["MV","Maldives"],["ML","Mali"],["MT","Malta"],["MH","Marshall Islands"],["MR","Mauritania"],
  ["MU","Mauritius"],["MX","Mexico"],["FM","Micronesia"],["MD","Moldova"],["MC","Monaco"],
  ["MN","Mongolia"],["ME","Montenegro"],["MA","Morocco"],["MZ","Mozambique"],["MM","Myanmar"],
  ["NA","Namibia"],["NR","Nauru"],["NP","Nepal"],["NL","Netherlands"],["NZ","New Zealand"],
  ["NI","Nicaragua"],["NE","Niger"],["NG","Nigeria"],["MK","North Macedonia"],["NO","Norway"],
  ["OM","Oman"],["PK","Pakistan"],["PW","Palau"],["PA","Panama"],["PG","Papua New Guinea"],
  ["PY","Paraguay"],["PE","Peru"],["PH","Philippines"],["PL","Poland"],["PT","Portugal"],
  ["QA","Qatar"],["RO","Romania"],["RU","Russia"],["RW","Rwanda"],["KN","Saint Kitts and Nevis"],
  ["LC","Saint Lucia"],["VC","Saint Vincent and the Grenadines"],["WS","Samoa"],["SM","San Marino"],
  ["ST","Sao Tome and Principe"],["SA","Saudi Arabia"],["SN","Senegal"],["RS","Serbia"],["SC","Seychelles"],
  ["SL","Sierra Leone"],["SG","Singapore"],["SK","Slovakia"],["SI","Slovenia"],["SB","Solomon Islands"],
  ["SO","Somalia"],["ZA","South Africa"],["SS","South Sudan"],["ES","Spain"],["LK","Sri Lanka"],
  ["SD","Sudan"],["SR","Suriname"],["SE","Sweden"],["CH","Switzerland"],["SY","Syria"],
  ["TW","Taiwan"],["TJ","Tajikistan"],["TZ","Tanzania"],["TH","Thailand"],["TL","Timor-Leste"],
  ["TG","Togo"],["TO","Tonga"],["TT","Trinidad and Tobago"],["TN","Tunisia"],["TR","Turkey"],
  ["TM","Turkmenistan"],["TV","Tuvalu"],["UG","Uganda"],["UA","Ukraine"],["AE","United Arab Emirates"],
  ["GB","United Kingdom"],["US","United States"],["UY","Uruguay"],["UZ","Uzbekistan"],["VU","Vanuatu"],
  ["VA","Vatican City"],["VE","Venezuela"],["VN","Vietnam"],["YE","Yemen"],["ZM","Zambia"],
  ["ZW","Zimbabwe"],
] as const;

// Curated regional defaults (used when AI call fails or returns incomplete data)
// These are the standard entity types + registration documents per legal tradition.
const DEFAULT_ENTITIES = [
  { code: "LLC", label: "Limited Liability Company", description: "Members' liability limited to their contributions" },
  { code: "JSC", label: "Joint Stock Company", description: "Capital divided into tradable shares" },
  { code: "PARTNERSHIP", label: "Partnership", description: "Two or more partners share liability" },
  { code: "BRANCH", label: "Foreign Branch Office", description: "Local branch of a foreign company" },
  { code: "SOLE", label: "Sole Proprietorship", description: "Individual owner with unlimited liability" },
];
const DEFAULT_DOCS = [
  { key: "commercial_register", label: "Commercial Register Certificate", description: "Official company registration extract", mandatory: true },
  { key: "tax_id", label: "Tax Identification Number", description: "National tax authority ID", mandatory: true },
  { key: "vat_registration", label: "VAT Registration Certificate", description: "VAT/sales tax registration", mandatory: false },
  { key: "articles_of_association", label: "Articles of Association", description: "Company charter / memorandum & articles", mandatory: true },
  { key: "ubo_declaration", label: "UBO Declaration", description: "Ultimate Beneficial Owner declaration", mandatory: true },
  { key: "sanctions_self_declaration", label: "Sanctions Self-Declaration", description: "Sanctions / AML compliance declaration", mandatory: true },
  { key: "bank_reference", label: "Bank Reference Letter", description: "Bank reference for the company", mandatory: false },
];

interface CountryData {
  code: string; name: string;
  entityTypes: { code: string; label: string; description: string }[];
  requiredDocuments: { key: string; label: string; description: string; mandatory: boolean }[];
}

function extractJson(text: string): any | null {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  try { return JSON.parse(text); } catch {}
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch {} }
  return null;
}

async function main() {
  console.log(`Generating country registration data for ${ALL_COUNTRIES.length} countries via AI...`);
  const zai = await ZAI.create();

  // Split into 5 mega-batches of ~39 countries each, but ask for only 13 per call
  // to keep responses manageable. Run sequentially with 2s delay.
  const BATCH = 13;
  const results: CountryData[] = [];
  let batchesDone = 0;
  const totalBatches = Math.ceil(ALL_COUNTRIES.length / BATCH);

  for (let i = 0; i < ALL_COUNTRIES.length; i += BATCH) {
    const slice = ALL_COUNTRIES.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const codes = slice.map((c) => c[0]).join(",");
    console.log(`\n[Batch ${batchNum}/${totalBatches}] ${codes}`);

    let success = false;
    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        const countryList = slice.map((c) => `${c[0]} (${c[1]})`).join(", ");
        const prompt = `You are a global trade compliance expert. For each country below, list 4-5 legal company/entity types and 5-7 required KYB registration documents.

Countries: ${countryList}

Respond with VALID JSON ONLY (no markdown fences, no prose). Array of objects:
[{"code":"EG","name":"Egypt","entityTypes":[{"code":"SAE","label":"Société Anonyme Égyptienne","description":"Joint stock company"}],"requiredDocuments":[{"key":"commercial_register","label":"Commercial Register Certificate","description":"From Companies Authority","mandatory":true}]}]`;

        const completion = await zai.chat.completions.create({
          messages: [
            { role: "assistant", content: "Output only valid JSON arrays. No markdown, no prose, no code fences." },
            { role: "user", content: prompt },
          ],
          thinking: { type: "disabled" },
        });
        const content = completion.choices[0]?.message?.content || "";
        const parsed = extractJson(content);

        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const expected of slice) {
            const found = parsed.find((d: any) => String(d.code || "").toUpperCase() === expected[0]);
            if (found && Array.isArray(found.entityTypes) && found.entityTypes.length > 0) {
              results.push({
                code: expected[0],
                name: expected[1],
                entityTypes: found.entityTypes.map((e: any) => ({
                  code: String(e.code || "").toUpperCase(),
                  label: String(e.label || ""),
                  description: String(e.description || ""),
                })),
                requiredDocuments: Array.isArray(found.requiredDocuments) && found.requiredDocuments.length > 0
                  ? found.requiredDocuments.map((d: any) => ({
                      key: String(d.key || "").toLowerCase(),
                      label: String(d.label || ""),
                      description: String(d.description || ""),
                      mandatory: Boolean(d.mandatory),
                    }))
                  : DEFAULT_DOCS,
              });
            } else {
              results.push({ code: expected[0], name: expected[1], entityTypes: DEFAULT_ENTITIES, requiredDocuments: DEFAULT_DOCS });
              console.log(`  ⚠ ${expected[0]} (${expected[1]}) — fallback used`);
            }
          }
          success = true;
          batchesDone++;
          console.log(`  ✓ ${parsed.length} entries parsed (attempt ${attempt})`);
        } else {
          console.log(`  ⚠ empty/invalid parse, retry ${attempt}/3...`);
          // Add fallbacks for the whole batch
          if (attempt === 3) {
            for (const expected of slice) {
              results.push({ code: expected[0], name: expected[1], entityTypes: DEFAULT_ENTITIES, requiredDocuments: DEFAULT_DOCS });
            }
            batchesDone++;
            console.log(`  ⚠ batch ${batchNum} used fallback after 3 attempts`);
            success = true;
          }
        }
      } catch (err: any) {
        console.log(`  ✗ attempt ${attempt}/3 error: ${err.message.slice(0, 100)}`);
        if (attempt === 3) {
          for (const expected of slice) {
            results.push({ code: expected[0], name: expected[1], entityTypes: DEFAULT_ENTITIES, requiredDocuments: DEFAULT_DOCS });
          }
          batchesDone++;
          console.log(`  ⚠ batch ${batchNum} used fallback after 3 errors`);
          success = true;
        }
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }

    // Delay between batches to avoid rate limits
    if (i + BATCH < ALL_COUNTRIES.length) await new Promise((r) => setTimeout(r, 2500));
  }

  // Deduplicate by country code (keep the one with more entity types)
  const byCode = new Map<string, CountryData>();
  for (const r of results) {
    const ex = byCode.get(r.code);
    if (!ex || r.entityTypes.length > ex.entityTypes.length) byCode.set(r.code, r);
  }
  const final = Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));

  // Count AI-sourced vs fallback
  const aiSourced = final.filter((c) =>
    c.entityTypes.length >= 4 &&
    !c.entityTypes.every((e) => DEFAULT_ENTITIES.some((d) => d.code === e.code))
  ).length;
  const fallback = final.length - aiSourced;
  console.log(`\nGenerated: ${final.length} countries (${aiSourced} AI-sourced, ${fallback} fallback)`);

  const ts = `// SGTX Worldwide Country Registration Data
// AUTO-GENERATED by scripts/generate-country-data.ts using AI (z-ai-web-dev-sdk)
// Covers ${final.length} countries with entity types + required KYB documents.
// ${aiSourced} AI-sourced, ${fallback} fallback (curured defaults).
// Generated: ${new Date().toISOString()}

export interface CountryEntityType { code: string; label: string; description: string; }
export interface CountryRequiredDocument { key: string; label: string; description: string; mandatory: boolean; }
export interface CountryRegistrationData {
  code: string; name: string;
  entityTypes: CountryEntityType[];
  requiredDocuments: CountryRequiredDocument[];
}

export const COUNTRY_REGISTRATION_DATA: CountryRegistrationData[] = ${JSON.stringify(final, null, 2)};

export function getCountryData(code: string): CountryRegistrationData | undefined {
  return COUNTRY_REGISTRATION_DATA.find((c) => c.code === code.toUpperCase());
}
export function getCountryEntityTypes(code: string): CountryEntityType[] {
  return getCountryData(code)?.entityTypes ?? [];
}
export function getCountryRequiredDocuments(code: string): CountryRequiredDocument[] {
  return getCountryData(code)?.requiredDocuments ?? [];
}
export const ALL_COUNTRY_CODES: { code: string; name: string }[] = COUNTRY_REGISTRATION_DATA.map((c) => ({ code: c.code, name: c.name }));
`;

  const outPath = "src/lib/sgtx/onboarding/countries.ts";
  writeFileSync(outPath, ts);
  console.log(`\n✓ Written ${final.length} countries to ${outPath} (${(ts.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
