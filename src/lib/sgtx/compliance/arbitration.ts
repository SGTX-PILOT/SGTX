// SGTX Jurisdiction-Specific Arbitration Clause Injection
// Determines the appropriate arbitration forum for a trade contract based on parties' jurisdictions.

export interface ArbitrationClause {
  jurisdiction: string;
  forum: string;
  rules: string;
  seat: string;
  language: string;
  numberOfArbitrators: number;
  clauseText: string;
}

const ARAB_LEAGUE = ["EG", "SA", "AE", "KW", "BH", "QA", "OM", "IQ", "JO", "LB", "LY", "MA", "PS", "SD", "SY", "TN", "YE", "DJ", "MR", "SO", "KM", "DZ", "KM"];
const EU_COUNTRIES = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "FI", "DK", "IE", "PT", "GR", "CZ", "RO", "BG", "HR", "SK", "LT", "SI", "LV", "EE", "LU", "MT", "CY", "HU"];
const GCC_COUNTRIES = ["SA", "AE", "KW", "BH", "QA", "OM"];

// Agricultural/commodity HS chapters that trigger GAFTA
const COMMODITY_HS_CHAPTERS = [10, 11, 12, 23]; // cereals, flour, oilseeds, animal feed

interface ArbitrationInput {
  buyerCountry: string;
  sellerCountry: string;
  contractValueUsd: number;
  commodity: string;
  incoterm: string;
}

export function determineArbitration(input: ArbitrationInput): ArbitrationClause {
  const buyer = (input.buyerCountry || "").toUpperCase();
  const seller = (input.sellerCountry || "").toUpperCase();
  const bothArab = ARAB_LEAGUE.includes(buyer) && ARAB_LEAGUE.includes(seller);
  const eitherEu = EU_COUNTRIES.includes(buyer) || EU_COUNTRIES.includes(seller);
  const eitherUs = buyer === "US" || seller === "US";
  const eitherCn = buyer === "CN" || seller === "CN";
  const sameCountry = buyer === seller;
  const isCommodity = /grain|wheat|corn|rice|soy|feed|barley|oats|sorghum/i.test(input.commodity || "");

  // 1. Same country → domestic arbitration
  if (sameCountry) {
    return domesticArbitration(buyer, input);
  }

  // 2. Agricultural/commodities + GAFTA-relevant → GAFTA London
  if (isCommodity && (ARAB_LEAGUE.includes(buyer) || ARAB_LEAGUE.includes(seller) || eitherEu || eitherUs)) {
    return gaftaClause();
  }

  // 3. Either party is US → AAA
  if (eitherUs && !eitherCn) {
    return aaaClause();
  }

  // 4. Either party is CN → CIETAC
  if (eitherCn && !eitherUs) {
    return cietacClause();
  }

  // 5. Both parties Arab League → CRCICA Cairo
  if (bothArab) {
    return crcicaClause();
  }

  // 6. Either party EU → ICC Paris (default for international trade)
  if (eitherEu) {
    return iccClause();
  }

  // 7. Default → ICC Paris
  return iccClause();
}

function domesticArbitration(country: string, input: ArbitrationInput): ArbitrationClause {
  const forums: Record<string, { forum: string; rules: string; seat: string; language: string }> = {
    EG: { forum: "Cairo Regional Centre for International Commercial Arbitration (CRCICA)", rules: "CRCICA Rules 2024", seat: "Cairo", language: "Arabic/English" },
    SA: { forum: "Saudi Center for Commercial Arbitration (SCCA)", rules: "SCCA Rules 2024", seat: "Riyadh", language: "Arabic" },
    AE: { forum: "Dubai International Arbitration Centre (DIAC)", rules: "DIAC Rules 2022", seat: "Dubai", language: "Arabic/English" },
    US: { forum: "American Arbitration Association (AAA)", rules: "AAA Commercial Rules", seat: "New York", language: "English" },
    CN: { forum: "China International Economic and Trade Arbitration Commission (CIETAC)", rules: "CIETAC Rules 2024", seat: "Beijing", language: "Chinese/English" },
    DE: { forum: "German Institution of Arbitration (DIS)", rules: "DIS Rules 2018", seat: "Frankfurt", language: "German/English" },
  };
  const f = forums[country] || { forum: "ICC International Court of Arbitration", rules: "ICC Rules 2021", seat: "Paris", language: "English" };
  return {
    jurisdiction: country,
    forum: f.forum, rules: f.rules, seat: f.seat, language: f.language,
    numberOfArbitrators: input.contractValueUsd > 1000000 ? 3 : 1,
    clauseText: `Any dispute arising out of or in connection with this contract, including any question regarding its existence, validity, or termination, shall be finally resolved by arbitration administered by the ${f.forum} under the ${f.rules}. The seat of arbitration shall be ${f.seat}. The language of the arbitration shall be ${f.language}. The number of arbitrators shall be ${input.contractValueUsd > 1000000 ? 3 : 1}. The governing law shall be the laws of ${country}. Judgment upon the award rendered may be entered in any court having jurisdiction.`,
  };
}

function crcicaClause(): ArbitrationClause {
  return {
    jurisdiction: "ARAB_LEAGUE", forum: "Cairo Regional Centre for International Commercial Arbitration (CRCICA)",
    rules: "CRCICA Arbitration Rules 2024", seat: "Cairo", language: "Arabic/English", numberOfArbitrators: 3,
    clauseText: `Any dispute arising out of or relating to this contract shall be finally settled by arbitration administered by the Cairo Regional Centre for International Commercial Arbitration (CRCICA) in accordance with the CRCICA Arbitration Rules 2024 in effect at the time of the commencement of the arbitration. The seat of arbitration shall be Cairo, Arab Republic of Egypt. The language of the arbitration shall be Arabic and English. The number of arbitrators shall be three (3). The governing law shall be the laws of the Arab Republic of Egypt. The award shall be final and binding on both parties.`,
  };
}

function iccClause(): ArbitrationClause {
  return {
    jurisdiction: "ICC", forum: "ICC International Court of Arbitration",
    rules: "ICC Rules of Arbitration 2021", seat: "Paris", language: "English", numberOfArbitrators: 3,
    clauseText: `Any dispute arising out of or in connection with this contract shall be finally settled under the Rules of Arbitration of the International Chamber of Commerce by one or more arbitrators appointed in accordance with the said Rules. The seat of arbitration shall be Paris, France. The language of the arbitration shall be English. The number of arbitrators shall be three (3). The governing law shall be the laws agreed by the parties or, failing such agreement, the laws determined by the arbitral tribunal.`,
  };
}

function aaaClause(): ArbitrationClause {
  return {
    jurisdiction: "US", forum: "American Arbitration Association (AAA)",
    rules: "AAA Commercial Arbitration Rules", seat: "New York", language: "English", numberOfArbitrators: 3,
    clauseText: `Any controversy or claim arising out of or relating to this contract, or the breach thereof, shall be settled by arbitration administered by the American Arbitration Association in accordance with its Commercial Arbitration Rules, and judgment on the award rendered by the arbitrator(s) may be entered in any court having jurisdiction thereof. The seat of arbitration shall be New York, NY. The language shall be English. The number of arbitrators shall be three (3). The governing law shall be the laws of the State of New York.`,
  };
}

function cietacClause(): ArbitrationClause {
  return {
    jurisdiction: "CN", forum: "China International Economic and Trade Arbitration Commission (CIETAC)",
    rules: "CIETAC Arbitration Rules 2024", seat: "Beijing", language: "Chinese/English", numberOfArbitrators: 3,
    clauseText: `Any dispute arising from or in connection with this contract shall be submitted to the China International Economic and Trade Arbitration Commission (CIETAC) for arbitration which shall be conducted in accordance with the CIETAC's Arbitration Rules in effect at the time of applying for arbitration. The arbitral award is final and binding upon both parties. The seat of arbitration shall be Beijing, People's Republic of China. The language of arbitration shall be Chinese and English. The number of arbitrators shall be three (3).`,
  };
}

function gaftaClause(): ArbitrationClause {
  return {
    jurisdiction: "GAFTA", forum: "GAFTA (Grain and Feed Trade Association)",
    rules: "GAFTA Arbitration Rules No. 126", seat: "London", language: "English", numberOfArbitrators: 3,
    clauseText: `Any dispute arising out of or in connection with this contract, including any question regarding its existence, validity, or termination, shall be referred to and finally resolved by arbitration under the GAFTA Arbitration Rules No. 126, which Rules are deemed to be incorporated by reference into this clause. The seat of arbitration shall be London, England. The language of the arbitration shall be English. The number of arbitrators shall be three (3), appointed in accordance with the GAFTA Rules. The governing law shall be English law. The award shall be final and binding on both parties.`,
  };
}
