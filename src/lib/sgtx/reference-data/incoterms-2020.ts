// @ts-nocheck
// Incoterms 2020 — Full responsibility matrix
// Source: ICC (International Chamber of Commerce) Publication 723
export interface Incoterm { code: string; name: string; mode: string; riskTransfer: string; costCarrier: string; insurance: string; exportCustoms: string; importCustoms: string; duty: string; docs: string; }
export const INCOTERMS: Incoterm[] = [
  {code:"EXW",name:"Ex Works",mode:"ANY",riskTransfer:"Seller's premises",costCarrier:"Buyer",insurance:"Buyer",exportCustoms:"Buyer",importCustoms:"Buyer",duty:"Buyer",docs:"Buyer"},
  {code:"FCA",name:"Free Carrier",mode:"ANY",riskTransfer:"Named place (delivery to carrier)",costCarrier:"Buyer",insurance:"Buyer",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export) / Buyer (import)"},
  {code:"CPT",name:"Carriage Paid To",mode:"ANY",riskTransfer:"When goods handed to first carrier",costCarrier:"Seller (to destination)",insurance:"Buyer",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export) / Buyer (import)"},
  {code:"CIP",name:"Carriage and Insurance Paid To",mode:"ANY",riskTransfer:"When goods handed to first carrier",costCarrier:"Seller (to destination)",insurance:"Seller (min Institute Cargo Clauses A)",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export+insurance) / Buyer (import)"},
  {code:"DAP",name:"Delivered at Place",mode:"ANY",riskTransfer:"At named place, ready for unloading",costCarrier:"Seller (to named place)",insurance:"Seller (recommended)",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export) / Buyer (import)"},
  {code:"DPU",name:"Delivered at Place Unloaded",mode:"ANY",riskTransfer:"After unloading at named place",costCarrier:"Seller (to named place + unloading)",insurance:"Seller (recommended)",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export) / Buyer (import)"},
  {code:"DDP",name:"Delivered Duty Paid",mode:"ANY",riskTransfer:"At named place, cleared for import",costCarrier:"Seller (all costs including duty)",insurance:"Seller (recommended)",exportCustoms:"Seller",importCustoms:"Seller",duty:"Seller",docs:"Seller (all)"},
  {code:"FAS",name:"Free Alongside Ship",mode:"SEA",riskTransfer:"Alongside vessel at port of shipment",costCarrier:"Buyer",insurance:"Buyer",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export) / Buyer (import)"},
  {code:"FOB",name:"Free on Board",mode:"SEA",riskTransfer:"On board vessel at port of shipment",costCarrier:"Buyer",insurance:"Buyer",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export) / Buyer (import)"},
  {code:"CFR",name:"Cost and Freight",mode:"SEA",riskTransfer:"On board vessel at port of shipment",costCarrier:"Seller (freight to destination port)",insurance:"Buyer",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export) / Buyer (import)"},
  {code:"CIF",name:"Cost, Insurance and Freight",mode:"SEA",riskTransfer:"On board vessel at port of shipment",costCarrier:"Seller (freight to destination port)",insurance:"Seller (min Institute Cargo Clauses C)",exportCustoms:"Seller",importCustoms:"Buyer",duty:"Buyer",docs:"Seller (export+insurance) / Buyer (import)"},
];
export function getIncoterm(code: string): Incoterm | null { return INCOTERMS.find(i => i.code === code.toUpperCase()) || null; }
export function getIncotermsByMode(mode: string): Incoterm[] { return INCOTERMS.filter(i => i.mode === mode.toUpperCase() || i.mode === "ANY"); }
export function listAllIncoterms(): Incoterm[] { return INCOTERMS; }
