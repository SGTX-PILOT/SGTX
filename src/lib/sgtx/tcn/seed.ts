import { freshDb as db } from "@/lib/db-fresh";

/**
 * Idempotent TCN seed. Uses upsert so re-running PATCHES existing rows
 * (rather than skipping them). This lets us evolve seed data without
 * needing to wipe the DB.
 */
export async function seedTCN() {
  let corridors = 0, passports = 0, govNodes = 0, portTwins = 0, gates = 0, analytics = 0;

  // 3 RoRo corridors
  const corridorData = [
    { code: "EGY-ITA-RORO-001", name: "Egypt–Italy RoRo Corridor", type: "RORO", origin: "EG", dest: "IT", originPorts: JSON.stringify(["EGDMT","EGALX","EGPSD"]), destPorts: JSON.stringify(["ITTRS","ITLIV","ITGOA"]), status: "STRATEGIC" },
    { code: "EGY-KSA-RORO-001", name: "Egypt–Saudi Arabia RoRo Corridor", type: "RORO", origin: "EG", dest: "SA", originPorts: JSON.stringify(["EGSGF","EGPTW"]), destPorts: JSON.stringify(["SAJED","SAYNB","SADMM"]), status: "STRATEGIC" },
    { code: "EGY-UAE-RORO-001", name: "Egypt–UAE RoRo Corridor", type: "RORO", origin: "EG", dest: "AE", originPorts: JSON.stringify(["EGSGF","EGPTW","EGALX"]), destPorts: JSON.stringify(["AEJEA","AEKHL"]), status: "CERTIFIED" },
  ];

  for (const c of corridorData) {
    await db.tradeCorridor.upsert({
      where: { corridorCode: c.code },
      create: { corridorCode: c.code, corridorName: c.name, corridorType: c.type, originCountry: c.origin, destinationCountry: c.dest, originPorts: c.originPorts, destinationPorts: c.destPorts, status: c.status, verificationStatus: "GOVERNMENT_VERIFIED", operationalStatus: "ACTIVE" },
      update: { corridorName: c.name, corridorType: c.type, originCountry: c.origin, destinationCountry: c.dest, originPorts: c.originPorts, destinationPorts: c.destPorts, status: c.status, verificationStatus: "GOVERNMENT_VERIFIED", operationalStatus: "ACTIVE" },
    });
    corridors++;

    // Passport — includes RoRo eligibility, customs pre-clearance, port twin links
    const passportData: Record<string, any> = {
      "EGY-ITA-RORO-001": { incoterms: JSON.stringify(["FOB","CIF","DAP","DDP"]), cargo: JSON.stringify(["Fresh Produce","Vehicles","Industrial Goods","Refrigerated Cargo"]), transit: 6, finance: "HIGH", insurance: 98, certs: JSON.stringify(["COO","HEALTH_CERT","PACKING_LIST","INVOICE","PHYTOSANITARY","COLD_CHAIN_LOG"]) },
      "EGY-KSA-RORO-001": { incoterms: JSON.stringify(["FOB","CFR","DAP"]), cargo: JSON.stringify(["Fresh Produce","Vehicles","Construction Materials","Refrigerated Cargo"]), transit: 3, finance: "MEDIUM", insurance: 95, certs: JSON.stringify(["COO","HEALTH_CERT","PACKING_LIST","INVOICE","SFDA_FOOD_CERT","HALAL","PHYTOSANITARY"]) },
      "EGY-UAE-RORO-001": { incoterms: JSON.stringify(["FOB","CFR","CIF"]), cargo: JSON.stringify(["Vehicles","Machinery","Construction Materials","Perishable Goods"]), transit: 5, finance: "HIGH", insurance: 97, certs: JSON.stringify(["COO","PACKING_LIST","INVOICE","UAE_CUSTOMS_DECLARATION"]) },
    };
    const pd = passportData[c.code];
    // cargoTypeCapabilities carries rich RoRo eligibility + port twin links
    const capabilities = JSON.stringify({
      fresh_produce: true,
      vehicles: true,
      reefer: true,
      roro_eligible: true,
      roro_max_loa_m: 200,
      roro_max_beam_m: 32,
      roro_ramp_capacity_t: 250,
      customs_pre_clearance: true,
      customs_pre_clearance_scheme: c.origin === "EG" ? "NAFEZA_ACI" : "ORIGIN_SINGLE_WINDOW",
      port_digital_twin_links: JSON.parse(c.originPorts).concat(JSON.parse(c.destPorts)),
      isps_compliant: true,
      imdg_class_limit: 9,
    });
    const existingPassport = await db.tradeLanePassport.findFirst({ where: { corridorCode: c.code } });
    if (existingPassport) {
      await db.tradeLanePassport.update({ where: { id: existingPassport.id }, data: { commonIncoterms: pd.incoterms, typicalCargoTypes: pd.cargo, averageTransitDays: pd.transit, cargoTypeCapabilities: capabilities, financeEligibility: pd.finance, insuranceAvailability: pd.insurance, requiredCertificates: pd.certs, passportConfidence: 0.9, sourceRegulations: "TIR Convention 1975; IMDG Code (current ed.); Hamburg Rules 1978; SOLAS Ch. XI-2 (ISM/ISPS); MARPOL Annex VI; ICC Incoterms 2020; CRCICA Arbitration Rules 2024.", lastUpdated: new Date() } });
    } else {
      await db.tradeLanePassport.create({ data: { corridorCode: c.code, passportVersion: 1, commonIncoterms: pd.incoterms, typicalCargoTypes: pd.cargo, averageTransitDays: pd.transit, cargoTypeCapabilities: capabilities, financeEligibility: pd.finance, insuranceAvailability: pd.insurance, requiredCertificates: pd.certs, passportConfidence: 0.9, sourceRegulations: "TIR Convention 1975; IMDG Code (current ed.); Hamburg Rules 1978; SOLAS Ch. XI-2 (ISM/ISPS); MARPOL Annex VI; ICC Incoterms 2020; CRCICA Arbitration Rules 2024." } });
    }
    passports++;

    // Analytics
    const analyticsData: Record<string, any> = {
      "EGY-ITA-RORO-001": { volume: 142, gmv: 8400000, transit: 6.2, onTime: 94, docDelay: 2.4, customs: 4.8, congestion: 8, financing: 68 },
      "EGY-KSA-RORO-001": { volume: 89, gmv: 3200000, transit: 3.1, onTime: 89, docDelay: 5.1, customs: 6.2, congestion: 4, financing: 45 },
      "EGY-UAE-RORO-001": { volume: 45, gmv: 800000, transit: 5.0, onTime: 91, docDelay: 3.0, customs: 3.5, congestion: 5, financing: 50 },
    };
    const ad = analyticsData[c.code];
    const existingAnalytics = await db.corridorAnalytics.findFirst({ where: { corridorCode: c.code } });
    const analyticsPayload = { measurementPeriod: new Date(), volume: ad.volume, gmvUsd: ad.gmv, averageTransitDays: ad.transit, onTimePerformance: ad.onTime, documentDelayRate: ad.docDelay, customsClearanceHours: ad.customs, portCongestionHours: ad.congestion, financingDemand: ad.financing, topProducts: JSON.stringify(["Fresh Produce","Vehicles","Industrial"]) };
    if (existingAnalytics) {
      await db.corridorAnalytics.update({ where: { id: existingAnalytics.id }, data: analyticsPayload });
    } else {
      await db.corridorAnalytics.create({ data: { corridorCode: c.code, ...analyticsPayload } });
    }
    analytics++;
  }

  // Government nodes — all 13 carry a GTID
  const nodeData = [
    { country: "EG", name: "Egyptian Customs Authority",    type: "CUSTOMS",         gtid: "SGTX-EG-GOV-000001-9A0B", port: null },
    { country: "EG", name: "Central Bank of Egypt",         type: "MINISTRY",        gtid: "SGTX-EG-GOV-000004-2D6E", port: null },
    { country: "EG", name: "National Food Safety Authority", type: "MINISTRY",        gtid: "SGTX-EG-GOV-000012-7F3A", port: null },
    { country: "EG", name: "Damietta Port Authority",       type: "PORT_AUTHORITY",  gtid: "SGTX-EG-GOV-000021-3C11", port: "EGDMT" },
    { country: "EG", name: "Alexandria Port Authority",     type: "PORT_AUTHORITY",  gtid: "SGTX-EG-GOV-000022-8B45", port: "EGALX" },
    { country: "EG", name: "Safaga Port Authority",         type: "PORT_AUTHORITY",  gtid: "SGTX-EG-GOV-000023-5E7F", port: "EGSGF" },
    { country: "IT", name: "Italian Customs",               type: "CUSTOMS",         gtid: "SGTX-IT-GOV-000001-4D9A", port: null },
    { country: "IT", name: "Trieste Port Authority",        type: "PORT_AUTHORITY",  gtid: "SGTX-IT-GOV-000011-2A3C", port: "ITTRS" },
    { country: "SA", name: "Saudi Customs Authority",       type: "CUSTOMS",         gtid: "SGTX-SA-GOV-000001-6F8E", port: null },
    { country: "SA", name: "Saudi Food and Drug Authority", type: "MINISTRY",        gtid: "SGTX-SA-GOV-000005-1B4D", port: null },
    { country: "SA", name: "Jeddah Port Authority",         type: "PORT_AUTHORITY",  gtid: "SGTX-SA-GOV-000021-9C2E", port: "SAJED" },
    { country: "AE", name: "UAE Customs Authority",         type: "CUSTOMS",         gtid: "SGTX-AE-GOV-000001-7F1B", port: null },
    { country: "AE", name: "Jebel Ali Port Authority",      type: "PORT_AUTHORITY",  gtid: "SGTX-AE-GOV-000021-3D5A", port: "AEJEA" },
  ];
  for (const n of nodeData) {
    const existing = await db.governmentNode.findFirst({ where: { authorityName: n.name } });
    const payload = { countryCode: n.country, authorityName: n.name, authorityType: n.type, verificationStatus: "VERIFIED", nodeGtid: n.gtid, portUnlocode: n.port, corridorCodes: JSON.stringify(["EGY-ITA-RORO-001","EGY-KSA-RORO-001","EGY-UAE-RORO-001"]), authorityLevel: "NATIONAL" };
    if (existing) {
      await db.governmentNode.update({ where: { id: existing.id }, data: payload });
    } else {
      await db.governmentNode.create({ data: payload });
    }
    govNodes++;
  }

  // Port digital twins — now populated with berths / operating hours / facilities
  const portData = [
    { unlocode: "EGDMT", name: "Damietta Port",      country: "EG", roro: "HIGH",   congestion: "MODERATE", berths: 14, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical","Drug-sniffing"]), customs: JSON.stringify(["ACI","e-invoice","e-CO"]) },
    { unlocode: "EGALX", name: "Alexandria Port",    country: "EG", roro: "HIGH",   congestion: "MODERATE", berths: 22, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical"]), customs: JSON.stringify(["ACI","e-invoice","e-CO"]) },
    { unlocode: "EGPSD", name: "Port Said",          country: "EG", roro: "HIGH",   congestion: "LOW",      berths: 18, ops: "24/7", inspection: JSON.stringify(["X-ray"]), customs: JSON.stringify(["ACI","e-invoice"]) },
    { unlocode: "EGSGF", name: "Safaga Port",        country: "EG", roro: "MEDIUM", congestion: "LOW",      berths: 9,  ops: "06:00-22:00", inspection: JSON.stringify(["Physical"]), customs: JSON.stringify(["ACI","e-invoice"]) },
    { unlocode: "EGPTW", name: "Port Tawfik",        country: "EG", roro: "MEDIUM", congestion: "LOW",      berths: 6,  ops: "06:00-22:00", inspection: JSON.stringify(["Physical"]), customs: JSON.stringify(["ACI","e-invoice"]) },
    { unlocode: "ITTRS", name: "Trieste",            country: "IT", roro: "HIGH",   congestion: "LOW",      berths: 12, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical","Drug-sniffing"]), customs: JSON.stringify(["AIDA","e-CO"]) },
    { unlocode: "ITLIV", name: "Livorno",            country: "IT", roro: "HIGH",   congestion: "MODERATE", berths: 16, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical"]), customs: JSON.stringify(["AIDA","e-CO"]) },
    { unlocode: "ITGOA", name: "Genoa",              country: "IT", roro: "HIGH",   congestion: "MODERATE", berths: 25, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical"]), customs: JSON.stringify(["AIDA","e-CO"]) },
    { unlocode: "SAJED", name: "Jeddah Islamic Port", country: "SA", roro: "HIGH",  congestion: "MODERATE", berths: 58, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical","Drug-sniffing"]), customs: JSON.stringify(["FASAH","e-CO","SFDA"]) },
    { unlocode: "SAYNB", name: "Yanbu",              country: "SA", roro: "MEDIUM", congestion: "LOW",      berths: 7,  ops: "24/7", inspection: JSON.stringify(["Physical"]), customs: JSON.stringify(["FASAH","e-CO"]) },
    { unlocode: "SADMM", name: "Dammam",             country: "SA", roro: "HIGH",   congestion: "MODERATE", berths: 39, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical"]), customs: JSON.stringify(["FASAH","e-CO","SFDA"]) },
    { unlocode: "AEJEA", name: "Jebel Ali",          country: "AE", roro: "HIGH",   congestion: "LOW",      berths: 67, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical","Drug-sniffing"]), customs: JSON.stringify(["Dubai Trade","e-CO","ESMA"]) },
    { unlocode: "AEKHL", name: "Khalifa Port",       country: "AE", roro: "MEDIUM", congestion: "LOW",      berths: 12, ops: "24/7", inspection: JSON.stringify(["X-ray","Physical"]), customs: JSON.stringify(["Abu Dhabi CPC","e-CO","ESMA"]) },
  ];
  for (const p of portData) {
    const payload = {
      portName: p.name, countryCode: p.country, roroCapacity: p.roro, portCongestionLevel: p.congestion,
      portCapacity: String(p.berths), portCapacityCurrent: `${Math.min(p.berths, Math.round(p.berths * 0.75))}/${p.berths} berths occupied`,
      portOperatingHours: p.ops, inspectionFacilities: p.inspection, customsFacilities: p.customs,
      corridorMappings: JSON.stringify(["EGY-ITA-RORO-001","EGY-KSA-RORO-001","EGY-UAE-RORO-001"]),
      coldStorageAvailable: true, inspectionAvailable: true, lastUpdated: new Date(),
    };
    await db.portDigitalTwin.upsert({
      where: { portUnlocode: p.unlocode },
      create: { portUnlocode: p.unlocode, ...payload },
      update: payload,
    });
    portTwins++;
  }

  return { ok: true, corridors, passports, governmentNodes: govNodes, portTwins, complianceGates: gates, analytics };
}
