// @ts-nocheck
// Consolidated Sanctions Reference
// Sources: OFAC (https://ofac.treasury.gov), EU CFSP (https://www.sanctionsmap.eu),
// UN Security Council (https://www.un.org/securitycouncil/content/un-sc-consolidated-list)
export interface SanctionsProgram { country: string; program: string; authority: string; status: string; restrictions: string; legalRef: string; }
export const SANCTIONS_PROGRAMS: SanctionsProgram[] = [
  {country:"IR",program:"Iran Sanctions",authority:"OFAC/EU/UN",status:"COMPREHENSIVE",restrictions:"Full trade embargo. No imports/exports except humanitarian (food, medicine). Energy, financial, transport sectors restricted.",legalRef:"ITSR (31 CFR 560); EU Reg 267/2012; UNSCR 2231"},
  {country:"SY",program:"Syria Sanctions",authority:"OFAC/EU/UN",status:"COMPREHENSIVE",restrictions:"Full trade embargo. Petroleum sector, financial sector restricted. Humanitarian exceptions.",legalRef:"SySR (31 CFR 542); EU Reg 36/2012; UNSCR 2253"},
  {country:"KP",program:"North Korea Sanctions",authority:"OFAC/EU/UN",status:"COMPREHENSIVE",restrictions:"Full trade embargo. All sectors restricted. Weapons, luxury goods, coal, minerals banned.",legalRef:"NKSR (31 CFR 510); EU Reg 2017/1509; UNSCR 2397"},
  {country:"CU",program:"Cuba Sanctions",authority:"OFAC",status:"COMPREHENSIVE (US only)",restrictions:"US: comprehensive embargo. EU: no sanctions (Helms-Burton blocked). Limited trade possible from non-US.",legalRef:"CACR (31 CFR 515)"},
  {country:"RU",program:"Russia Sanctions",authority:"OFAC/EU/UK",status:"EXTENSIVE",restrictions:"Sectoral sanctions: energy, finance, defense, technology. Export controls on dual-use, advanced tech. Individual/entity sanctions. SWIFT exclusion for selected banks. Oil price cap.",legalRef:"EO 14024; EU Reg 833/2014; UK Russia Regulations"},
  {country:"BY",program:"Belarus Sanctions",authority:"OFAC/EU/UK",status:"EXTENSIVE",restrictions:"Sectoral sanctions: finance, defense, potash. Export controls. Individual/entity sanctions.",legalRef:"BE SR (31 CFR 548); EU Reg 765/2006"},
  {country:"VE",program:"Venezuela Sanctions",authority:"OFAC/EU",status:"SELECTIVE",restrictions:"Government officials, petroleum sector (PDVSA). Gold sector. Individual/entity sanctions.",legalRef:"VSR (31 CFR 591); EO 13884"},
  {country:"MM",program:"Myanmar Sanctions",authority:"OFAC/EU/UK",status:"SELECTIVE",restrictions:"Military officials, military-owned companies. Timber, pearls, gems. Arms embargo.",legalRef:"BMR (31 CFR 525); EU Reg 2021/1110"},
  {country:"SD",program:"Sudan Sanctions",authority:"OFAC/EU",status:"SELECTIVE",restrictions:"Arms embargo. Darfur-related individuals. Most sanctions lifted 2017.",legalRef:"SDR (31 CFR 538); UNSCR 1591"},
  {country:"LY",program:"Libya Sanctions",authority:"OFAC/EU/UN",status:"SELECTIVE",restrictions:"Arms embargo. Individual/entity sanctions (Gaddafi regime). Oil sector monitoring.",legalRef:"LSR (31 CFR 570); EU Reg 2046/2004; UNSCR 1970"},
  {country:"YE",program:"Yemen Sanctions",authority:"OFAC/EU/UN",status:"SELECTIVE",restrictions:"Arms embargo. Individual/entity sanctions (Houthi leaders). Humanitarian exceptions.",legalRef:"YESR (31 CFR 533); UNSCR 2140"},
  {country:"AF",program:"Afghanistan Sanctions",authority:"OFAC/EU/UN",status:"SELECTIVE",restrictions:"Taliban-related individuals/entities. Haqqani network. Narcotics trafficking.",legalRef:"31 CFR 548; UNSCR 1988"},
];
export function getSanctionsByCountry(countryCode: string): SanctionsProgram[] {
  return SANCTIONS_PROGRAMS.filter(s => s.country === countryCode.toUpperCase());
}
export function getComprehensiveSanctions(): SanctionsProgram[] {
  return SANCTIONS_PROGRAMS.filter(s => s.status.includes("COMPREHENSIVE"));
}
export function getSelectiveSanctions(): SanctionsProgram[] {
  return SANCTIONS_PROGRAMS.filter(s => s.status.includes("SELECTIVE"));
}
export function listAllSanctionsPrograms(): SanctionsProgram[] { return SANCTIONS_PROGRAMS; }
export function isSanctioned(countryCode: string): boolean {
  return SANCTIONS_PROGRAMS.some(s => s.country === countryCode.toUpperCase());
}
export function isFullyEmbargoed(countryCode: string): boolean {
  return SANCTIONS_PROGRAMS.some(s => s.country === countryCode.toUpperCase() && s.status === "COMPREHENSIVE");
}
