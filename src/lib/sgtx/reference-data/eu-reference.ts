// @ts-nocheck
// EU Regulatory Reference Data
// Sources: Eurostat, EU TARIC, DG TAXUD
export const EU_VAT_RATES: Record<string, { standard: number; reduced: number[]; superReduced: number | null; parking: number | null }> = {
  "AT": {standard:20,reduced:[10,13],superReduced:null,parking:13}, "BE": {standard:21,reduced:[6,12],superReduced:0,parking:12},
  "BG": {standard:20,reduced:[9],superReduced:null,parking:null}, "HR": {standard:25,reduced:[5,13],superReduced:null,parking:13},
  "CY": {standard:19,reduced:[5,9],superReduced:null,parking:null}, "CZ": {standard:21,reduced:[12,15],superReduced:null,parking:null},
  "DK": {standard:25,reduced:[],superReduced:0,parking:null}, "EE": {standard:22,reduced:[9,13],superReduced:null,parking:null},
  "FI": {standard:25.5,reduced:[10,14],superReduced:null,parking:14}, "FR": {standard:20,reduced:[5.5,10],superReduced:2.1,parking:null},
  "DE": {standard:19,reduced:[7],superReduced:null,parking:null}, "GR": {standard:24,reduced:[6,13],superReduced:null,parking:13},
  "HU": {standard:27,reduced:[5,18],superReduced:null,parking:null}, "IE": {standard:23,reduced:[9,13.5],superReduced:4.8,parking:13.5},
  "IT": {standard:22,reduced:[5,10],superReduced:4,parking:null}, "LV": {standard:21,reduced:[5,12],superReduced:null,parking:12},
  "LT": {standard:21,reduced:[5,9],superReduced:null,parking:null}, "LU": {standard:17,reduced:[8,14],superReduced:3,parking:14},
  "MT": {standard:18,reduced:[5,7],superReduced:null,parking:null}, "NL": {standard:21,reduced:[9],superReduced:null,parking:null},
  "PL": {standard:23,reduced:[5,8],superReduced:null,parking:null}, "PT": {standard:23,reduced:[6,13],superReduced:null,parking:13},
  "RO": {standard:19,reduced:[5,9],superReduced:null,parking:9}, "SK": {standard:23,reduced:[5,19],superReduced:null,parking:null},
  "SI": {standard:22,reduced:[5,9.5],superReduced:null,parking:9.5}, "ES": {standard:21,reduced:[4,10],superReduced:null,parking:null},
  "SE": {standard:25,reduced:[6,12],superReduced:null,parking:null},
};
export const EU_CUSTOMS_PROCEDURES = [
  {code:"40",name:"Release for free circulation",description:"Goods enter EU customs territory for home use"},
  {code:"51",name:"Customs warehouse",description:"Goods stored under customs supervision"},
  {code:"53",name:"Inward processing",description:"Goods imported for processing and re-export"},
  {code:"21",name:"Outward processing",description:"Goods exported for processing and re-import"},
  {code:"07",name:"Transit",description:"Goods move through EU under customs supervision (T1/T2)"},
  {code:"23",name:"Temporary import",description:"Goods imported temporarily without paying duty"},
  {code:"31",name:"Free zone",description:"Goods stored in designated free zone area"},
  {code:"71",name:"Re-export",description:"Goods previously imported are exported"},
  {code:"91",name:"Re-import",description:"Goods previously exported are returned"},
];
export function getEUVATRate(countryCode: string): { standard: number; reduced: number[] } | null {
  return EU_VAT_RATES[countryCode.toUpperCase()] || null;
}
export function getEUCustomsProcedure(code: string): { code: string; name: string; description: string } | null {
  return EU_CUSTOMS_PROCEDURES.find(p => p.code === code) || null;
}
