// @ts-nocheck
import { COUNTRIES, getCountry, listAllCountries } from "./iso-countries";
import { CURRENCIES, getCurrency, listAllCurrencies } from "./iso-currencies";
import { PORTS, getPort, listAllPorts } from "./un-locode";
import { INCOTERMS, getIncoterm, listAllIncoterms } from "./incoterms-2020";
import { DOCUMENTS, getDocument, listAllDocuments } from "./customs-documents";
import { LEGAL_REFS, getLegalRef, listAllLegalRefs } from "./legal-references";
import { FTA_RULES, getFTARules, listAllFTAs } from "./fta-rules";
import { SANCTIONS_PROGRAMS, isSanctioned, listAllSanctionsPrograms } from "./sanctions-reference";
import { EU_VAT_RATES, EU_CUSTOMS_PROCEDURES } from "./eu-reference";

export interface ReferenceDataset {
  datasetId: string; name: string; source: string; sourceUrl: string;
  version: string; lastUpdated: string; recordCount: number; license: string;
}

export function listReferenceDatasets(): ReferenceDataset[] {
  return [
    {datasetId:"iso-countries",name:"ISO 3166 Country Codes",source:"ISO",sourceUrl:"https://www.iso.org/iso-3166-country-codes.html",version:"2024",lastUpdated:"2024-01-01",recordCount:COUNTRIES.length,license:"Public reference data"},
    {datasetId:"iso-currencies",name:"ISO 4217 Currency Codes",source:"ISO",sourceUrl:"https://www.iso.org/iso-4217-currency-codes.html",version:"2024",lastUpdated:"2024-01-01",recordCount:CURRENCIES.length,license:"Public reference data"},
    {datasetId:"un-locode",name:"UN/LOCODE Port & Airport Codes",source:"UNECE",sourceUrl:"https://unece.org/trade/cefact/unlocode",version:"2023-2",lastUpdated:"2023-10-01",recordCount:PORTS.length,license:"Public reference data"},
    {datasetId:"incoterms-2020",name:"Incoterms 2020",source:"ICC",sourceUrl:"https://iccwbo.org/business-solutions/incoterms-rules/",version:"2020",lastUpdated:"2020-01-01",recordCount:INCOTERMS.length,license:"ICC Publication 723"},
    {datasetId:"customs-documents",name:"Customs Document Types",source:"WCO/EU/US CBP/Egypt Customs",sourceUrl:"Multiple",version:"2024",lastUpdated:"2024-06-01",recordCount:DOCUMENTS.length,license:"Public reference data"},
    {datasetId:"legal-references",name:"Legal Reference Catalog",source:"WCO/EU/Egypt/US/WTO/ICC",sourceUrl:"Multiple official sources",version:"2024",lastUpdated:"2024-06-01",recordCount:LEGAL_REFS.length,license:"Public laws"},
    {datasetId:"fta-rules",name:"FTA Rules of Origin",source:"WTO RTA Database",sourceUrl:"https://rtais.wto.org",version:"2024",lastUpdated:"2024-06-01",recordCount:FTA_RULES.length,license:"Public treaty data"},
    {datasetId:"sanctions-reference",name:"Consolidated Sanctions Reference",source:"OFAC/EU CFSP/UN SC",sourceUrl:"https://ofac.treasury.gov / https://www.sanctionsmap.eu",version:"2024",lastUpdated:"2024-06-01",recordCount:SANCTIONS_PROGRAMS.length,license:"Public regulatory data"},
    {datasetId:"eu-reference",name:"EU Regulatory Reference (VAT + Customs)",source:"Eurostat / DG TAXUD",sourceUrl:"https://ec.europa.eu/eurostat / https://ec.europa.eu/taxation_customs",version:"2024",lastUpdated:"2024-06-01",recordCount:Object.keys(EU_VAT_RATES).length + EU_CUSTOMS_PROCEDURES.length,license:"Public EU data"},
  ];
}
export function getDatasetStatus(datasetId: string): { loaded: boolean; recordCount: number; lastUpdated: string } | null {
  const ds = listReferenceDatasets().find(d => d.datasetId === datasetId);
  return ds ? { loaded: true, recordCount: ds.recordCount, lastUpdated: ds.lastUpdated } : null;
}
export { COUNTRIES, getCountry, listAllCountries, CURRENCIES, getCurrency, listAllCurrencies, PORTS, getPort, listAllPorts, INCOTERMS, getIncoterm, listAllIncoterms, DOCUMENTS, getDocument, listAllDocuments, LEGAL_REFS, getLegalRef, listAllLegalRefs, FTA_RULES, getFTARules, listAllFTAs, SANCTIONS_PROGRAMS, isSanctioned, listAllSanctionsPrograms, EU_VAT_RATES, EU_CUSTOMS_PROCEDURES };
