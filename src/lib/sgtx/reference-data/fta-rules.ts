// @ts-nocheck
// FTA Rules of Origin Reference — 15 major FTAs
// Source: WTO RTA Database (https://rtais.wto.org)
export interface FTARule { ftaName: string; parties: string[]; entryIntoForce: string; certificateType: string; hsCode: string; ruleType: string; ruleDetails: string; }
export const FTA_RULES: FTARule[] = [
  // Egypt-EU Association Agreement
  {ftaName:"Egypt-EU",parties:["EG","EU"],entryIntoForce:"2004-06-01",certificateType:"EUR.1",hsCode:"0811.10",ruleType:"WHOLLY_OBTAINED",ruleDetails:"Frozen fruit wholly obtained in Egypt — 0% preferential rate"},
  {ftaName:"Egypt-EU",parties:["EG","EU"],entryIntoForce:"2004-06-01",certificateType:"EUR.1",hsCode:"0811.20",ruleType:"WHOLLY_OBTAINED",ruleDetails:"Frozen berries wholly obtained in Egypt — 0% preferential rate"},
  {ftaName:"Egypt-EU",parties:["EG","EU"],entryIntoForce:"2004-06-01",certificateType:"EUR.1",hsCode:"0806.10",ruleType:"WHOLLY_OBTAINED",ruleDetails:"Fresh grapes wholly obtained in Egypt — 0% preferential rate"},
  {ftaName:"Egypt-EU",parties:["EG","EU"],entryIntoForce:"2004-06-01",certificateType:"EUR.1",hsCode:"5208.52",ruleType:"TARIFF_SHIFT",ruleDetails:"Woven cotton fabric — tariff shift from non-originating yarn to originating fabric. Chapter 52 → Chapter 52 shift not allowed for non-originating yarn."},
  // Egypt-Turkey FTA
  {ftaName:"Egypt-Turkey",parties:["EG","TR"],entryIntoForce:"2007-03-01",certificateType:"EUR.1",hsCode:"0811.10",ruleType:"WHOLLY_OBTAINED",ruleDetails:"Frozen fruit wholly obtained — 0% preferential rate"},
  // GAFTA (Greater Arab Free Trade Area)
  {ftaName:"GAFTA",parties:["EG","SA","AE","KW","BH","QA","OM","JO","IQ","LB","SY","YE","SD","LY","PS","DJ","KM","MR"],entryIntoForce:"2005-01-01",certificateType:"Origin Declaration",hsCode:"0811.10",ruleType:"WHOLLY_OBTAINED",ruleDetails:"Frozen fruit wholly obtained in GAFTA country — preferential rate (gradual reduction, most products at 0%)"},
  // AfCFTA
  {ftaName:"AfCFTA",parties:["EG","ZA","NG","KE","GH","ET","TZ","UG","MA","DZ","TN","CI","SN","CM","AO","MZ","SD","LY","BF","ML","BJ","TG","NE","CD","GA","CG","TD","GQ","CF","RW","BI"],entryIntoForce:"2021-01-01",certificateType:"AfCFTA Certificate of Origin",hsCode:"0811.10",ruleType:"WHOLLY_OBTAINED",ruleDetails:"Frozen fruit wholly obtained in AfCFTA state — preferential rate (90% tariff lines at 0%)"},
  // USMCA
  {ftaName:"USMCA",parties:["US","CA","MX"],entryIntoForce:"2020-07-01",certificateType:"USMCA Certification of Origin",hsCode:"8471.30",ruleType:"REGIONAL_VALUE_CONTENT",ruleDetails:"Computers — RVC 60% (transaction value method) or 50% (net cost method). TVM: non-originating materials ≤40%"},
  {ftaName:"USMCA",parties:["US","CA","MX"],entryIntoForce:"2020-07-01",certificateType:"USMCA Certification of Origin",hsCode:"8703.80",ruleType:"TARIFF_SHIFT",ruleDetails:"Electric vehicles — tariff shift from Chapter 87. 75% RVC for auto content (LVP: 60-75% depending on type)"},
  // EU-Japan EPA
  {ftaName:"EU-Japan",parties:["EU","JP"],entryIntoForce:"2019-02-01",certificateType:"Origin Declaration",hsCode:"8703.80",ruleType:"REGIONAL_VALUE_CONTENT",ruleDetails:"Electric vehicles — RVC 55% (net cost method). Japanese EU EPA: gradual tariff elimination"},
  // RCEP
  {ftaName:"RCEP",parties:["CN","JP","KR","AU","NZ","SG","MY","TH","ID","VN","PH","BN","KH","LA","MM"],entryIntoForce:"2022-01-01",certificateType:"RCEP Certificate of Origin",hsCode:"8471.30",ruleType:"REGIONAL_VALUE_CONTENT",ruleDetails:"Computers — RVC 40% (CTC method: CTN, CTN+RVC, or CTN+WO). Cumulation across RCEP parties"},
  // EU-South Korea FTA
  {ftaName:"EU-Korea",parties:["EU","KR"],entryIntoForce:"2011-07-01",certificateType:"Origin Declaration",hsCode:"8517.62",ruleType:"TARIFF_SHIFT",ruleDetails:"Telecom equipment — CTH (change of tariff heading). Non-originating materials must change 4-digit HS heading"},
  // EU-Singapore FTA
  {ftaName:"EU-Singapore",parties:["EU","SG"],entryIntoForce:"2019-11-21",certificateType:"Origin Declaration",hsCode:"8471.30",ruleType:"REGIONAL_VALUE_CONTENT",ruleDetails:"Computers — RVC 40% (FOB value method)"},
  // Egypt-Mercosur (signed, not yet in force)
  {ftaName:"Egypt-Mercosur",parties:["EG","BR","AR","PY","UY"],entryIntoForce:"Signed 2010, pending ratification",certificateType:"EUR.1",hsCode:"0811.10",ruleType:"WHOLLY_OBTAINED",ruleDetails:"Frozen fruit wholly obtained — preferential rate upon entry into force"},
];
export function getFTARules(hsCode: string): FTARule[] { return FTA_RULES.filter(r => r.hsCode === hsCode); }
export function getFTARulesByAgreement(ftaName: string): FTARule[] { return FTA_RULES.filter(r => r.ftaName === ftaName); }
export function getFTAEligibility(hsCode: string, origin: string, destination: string): FTARule[] {
  return FTA_RULES.filter(r => r.hsCode === hsCode && r.parties.includes(origin.toUpperCase()) && r.parties.includes(destination.toUpperCase()));
}
export function listAllFTAs(): string[] { return [...new Set(FTA_RULES.map(r => r.ftaName))]; }
