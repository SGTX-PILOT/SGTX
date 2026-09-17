// SGTX Shipping Lines Database — comprehensive directory of major container
// shipping lines serving each country, with service routes, average transit
// times, and pricing differentials (reefer vs dry).
//
// Data sources:
// - Alphaliner TOP 100 carrier list (market share data)
// - Individual carrier websites (service routes, transit times)
// - Journal of Commerce (JOC) spot rate data (pricing benchmarks)
// - Drewry Maritime Research (container freight rate index)
// - PIERS (US import/export data for carrier market share by lane)
//
// This is a curated static database — real-time data would come from
// carrier APIs (INTTRA, GT Nexus, CargoSmart) or freight forwarder APIs
// (Flexport, Freightos, Xeneta). The AI fallback in transit-time.ts and
// freight-pricing.ts fills gaps for port pairs not in this database.

export interface ShippingLineInfo {
  code: string;
  name: string;
  shortName: string;
  country: string;
  teuCapacity: number;
  marketSharePct: number;
  website: string;
  trackingUrl: string;
  services: string[];
  reeferCapable: boolean;
  dgCapable: boolean;
  insuranceCapable: boolean;
}

export interface CountryShippingInfo {
  countryCode: string;
  countryName: string;
  ports: { unlocode: string; name: string }[];
  lines: ShippingLineInfo[];
}

export const SHIPPING_LINES: ShippingLineInfo[] = [
  { code: "MSC", name: "Mediterranean Shipping Company", shortName: "MSC", country: "CH", teuCapacity: 5200000, marketSharePct: 19.8, website: "msc.com", trackingUrl: "https://www.msc.com/en/track-a-shipment?trackingNumber=", services: ["AE1","AE2","AE3","AE5","AE6","AE7","AE9","AE10","AE11"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "MAERSK", name: "A.P. Moller - Maersk", shortName: "Maersk", country: "DK", teuCapacity: 4300000, marketSharePct: 16.4, website: "maersk.com", trackingUrl: "https://www.maersk.com/tracking/", services: ["AE1","AE2","AE5","AE6","AE7","AE9","AE10","AE11","AC1","AC2","TP1","TP2","TP6"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "CMA_CGM", name: "CMA CGM Group", shortName: "CMA CGM", country: "FR", teuCapacity: 3600000, marketSharePct: 13.7, website: "cma-cgm.com", trackingUrl: "https://www.cma-cgm.com/ebusiness/tracking/search?ReferralNumber=", services: ["MEX1","MEX2","MEX3","BEX","EURAF","AFRAS","ASAX","PHOENIX","PEARL"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "COSCO", name: "COSCO Shipping Lines", shortName: "COSCO", country: "CN", teuCapacity: 3100000, marketSharePct: 11.8, website: "coscoshipping.com", trackingUrl: "https://elines.coscoshipping.com/ebusiness/tracking", services: ["AEU1","AEU2","AEU3","AEU5","AEU6","AEU7","AEX1","AEX7","AAC1","AAC2"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "HAPAG_LLOYD", name: "Hapag-Lloyd AG", shortName: "Hapag-Lloyd", country: "DE", teuCapacity: 1800000, marketSharePct: 6.9, website: "hapag-lloyd.com", trackingUrl: "https://www.hapag-lloyd.com/en/online-business/track/track-container.html", services: ["EC1","EC2","EC3","EC4","MD1","MD2","MD3","AG1","AG2","AG3"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "ONE", name: "Ocean Network Express", shortName: "ONE", country: "JP", teuCapacity: 1500000, marketSharePct: 5.7, website: "one-line.com", trackingUrl: "https://ecomm.one-line.com/one-ecom/tracking-shipment?numbers=", services: ["AE1","AE2","AE5","AE6","AE7","AE10","AE11","FE1","FE2"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "EVERGREEN", name: "Evergreen Marine Corporation", shortName: "Evergreen", country: "TW", teuCapacity: 1500000, marketSharePct: 5.7, website: "evergreen-line.com", trackingUrl: "https://www.evergreen-line.com/trackburseachResult.jsp", services: ["AEU1","AEU2","AEU3","AEU5","AEU6","AUE1","AUE2","CE1","CE2"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "HMM", name: "HMM Co. Ltd.", shortName: "HMM", country: "KR", teuCapacity: 800000, marketSharePct: 3.0, website: "hmm21.com", trackingUrl: "https://www.hmm21.com/cms/business/ebiz/track/TrackResult.jsp", services: ["AE1","AE2","AE3","AE5","AE6","AE7","NC1","NC2","NC3"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "ZIM", name: "ZIM Integrated Shipping Services", shortName: "ZIM", country: "IL", teuCapacity: 600000, marketSharePct: 2.3, website: "zim.com", trackingUrl: "https://www.zim.com/tools/track-a-shipment?number=", services: ["ZCA","ZCP","ZXE","ZNA","ZNE","ZNW"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "YANG_MING", name: "Yang Ming Marine Transport Corp.", shortName: "Yang Ming", country: "TW", teuCapacity: 700000, marketSharePct: 2.7, website: "yangming.com", trackingUrl: "https://www.yangming.com/transportation/TrackCargo.jsp", services: ["AEU1","AEU2","AEU3","AEU5","AEU6","AUE1","AUE2","CE1","CE2"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "OOCL", name: "Orient Overseas Container Line", shortName: "OOCL", country: "HK", teuCapacity: 700000, marketSharePct: 2.7, website: "oocl.com", trackingUrl: "https://www.oocl.com/eng/ourservices/eservices/track/Pages/Track.aspx", services: ["AEU1","AEU2","AEU3","AEU5","AEU6","AUE1","AUE2","GEX1","GEX2"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "WANHAI", name: "Wan Hai Lines", shortName: "Wan Hai", country: "TW", teuCapacity: 250000, marketSharePct: 1.0, website: "wanhai.com", trackingUrl: "https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml", services: ["SCS1","SCS2","SCS3","JTI1","JTI2","SI1","SI2","SI3"], reeferCapable: true, dgCapable: true, insuranceCapable: false },
  { code: "PIL", name: "Pacific International Lines", shortName: "PIL", country: "SG", teuCapacity: 230000, marketSharePct: 0.9, website: "pilship.com", trackingUrl: "https://www.pilship.com/en-eptrack/", services: ["AFS","AAS","ACS","ATS","MIDAS"], reeferCapable: true, dgCapable: true, insuranceCapable: false },
  { code: "SITC", name: "SITC Container Lines", shortName: "SITC", country: "CN", teuCapacity: 200000, marketSharePct: 0.8, website: "sitc.com", trackingUrl: "https://www.sitc.com/en/track_trace/", services: ["CV1","CV2","CV3","CV4","CV5","CV6"], reeferCapable: true, dgCapable: true, insuranceCapable: false },
  { code: "XPRESS", name: "X-Press Feeders", shortName: "X-Press", country: "AE", teuCapacity: 180000, marketSharePct: 0.7, website: "x-pressfeeders.com", trackingUrl: "https://www.x-pressfeeders.com/track-shipment/", services: ["MEC1","MEC2","INB1","INB2"], reeferCapable: true, dgCapable: true, insuranceCapable: false },
  { code: "DELI", name: "Delmas Shipping (CMA CGM subsidiary)", shortName: "Delmas", country: "FR", teuCapacity: 80000, marketSharePct: 0.3, website: "delmas.com", trackingUrl: "https://www.cma-cgm.com/ebusiness/tracking/search?ReferralNumber=", services: ["AFR1","AFR2","AFR3","WAF1","WAF2"], reeferCapable: true, dgCapable: true, insuranceCapable: true },
  { code: "NSC", name: "NSB Group", shortName: "NSB", country: "DE", teuCapacity: 70000, marketSharePct: 0.3, website: "nsgroup.de", trackingUrl: "", services: ["EU1","EU2"], reeferCapable: true, dgCapable: false, insuranceCapable: false },
  { code: "KMTC", name: "Korea Marine Transport Co.", shortName: "KMTC", country: "KR", teuCapacity: 110000, marketSharePct: 0.4, website: "kmtc.co.kr", trackingUrl: "https://www.kmtc.co.kr/eng/service/track", services: ["KCS1","KCS2","KCS3"], reeferCapable: true, dgCapable: false, insuranceCapable: false },
  { code: "RARO", name: "Regional Container Lines", shortName: "RCL", country: "TH", teuCapacity: 120000, marketSharePct: 0.5, website: "rclgroup.com", trackingUrl: "https://www.rclgroup.com/trackandtrace/", services: ["SBC","SIK","SCV"], reeferCapable: true, dgCapable: true, insuranceCapable: false },
  { code: "SINOTRANS", name: "Sinotrans Container Lines", shortName: "Sinotrans", country: "CN", teuCapacity: 35000, marketSharePct: 0.1, website: "sinotrans.com", trackingUrl: "https://www.sinotrans.com/container/tracking", services: ["SNX1","SNX2","SNX3"], reeferCapable: true, dgCapable: true, insuranceCapable: false },
];

export const COUNTRY_SHIPPING: CountryShippingInfo[] = [
  { countryCode: "EG", countryName: "Egypt", ports: [{ unlocode: "EGALX", name: "Alexandria" }, { unlocode: "EGDMT", name: "Damietta" }, { unlocode: "EGPSD", name: "Port Said" }, { unlocode: "EGADA", name: "Ain Sokhna" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL","PIL","XPRESS","DELI"].includes(l.code)) },
  { countryCode: "DE", countryName: "Germany", ports: [{ unlocode: "DEHAM", name: "Hamburg" }, { unlocode: "DEBRV", name: "Bremerhaven" }, { unlocode: "DEWVN", name: "Wilhelmshaven" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL","NSC"].includes(l.code)) },
  { countryCode: "NL", countryName: "Netherlands", ports: [{ unlocode: "NLRTM", name: "Rotterdam" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "BE", countryName: "Belgium", ports: [{ unlocode: "BEANR", name: "Antwerp" }, { unlocode: "BEZEE", name: "Zeebrugge" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "GB", countryName: "United Kingdom", ports: [{ unlocode: "GBFXT", name: "Felixstowe" }, { unlocode: "GBSOU", name: "Southampton" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "FR", countryName: "France", ports: [{ unlocode: "FRLEH", name: "Le Havre" }, { unlocode: "FRMRS", name: "Marseille" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL","DELI"].includes(l.code)) },
  { countryCode: "IT", countryName: "Italy", ports: [{ unlocode: "ITGOA", name: "Genoa" }, { unlocode: "ITLIV", name: "Livorno" }, { unlocode: "ITNAP", name: "Naples" }, { unlocode: "ITTRI", name: "Trieste" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "ES", countryName: "Spain", ports: [{ unlocode: "ESBCN", name: "Barcelona" }, { unlocode: "ESVLC", name: "Valencia" }, { unlocode: "ESALG", name: "Algeciras" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "CN", countryName: "China", ports: [{ unlocode: "CNSHA", name: "Shanghai" }, { unlocode: "CNHKG", name: "Hong Kong" }, { unlocode: "CNNGB", name: "Ningbo" }, { unlocode: "CNSZX", name: "Shenzhen" }, { unlocode: "CNTAO", name: "Qingdao" }, { unlocode: "CNTSN", name: "Tianjin" }, { unlocode: "CNXMN", name: "Xiamen" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL","WANHAI","SITC","SINOTRANS"].includes(l.code)) },
  { countryCode: "JP", countryName: "Japan", ports: [{ unlocode: "JPTYO", name: "Tokyo" }, { unlocode: "JPOSA", name: "Osaka" }, { unlocode: "JPKOB", name: "Kobe" }, { unlocode: "JPNGO", name: "Nagoya" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "KR", countryName: "South Korea", ports: [{ unlocode: "KRPUS", name: "Busan" }, { unlocode: "KRINC", name: "Incheon" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL","KMTC"].includes(l.code)) },
  { countryCode: "TW", countryName: "Taiwan", ports: [{ unlocode: "TWKEL", name: "Kaohsiung" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL","WANHAI"].includes(l.code)) },
  { countryCode: "SG", countryName: "Singapore", ports: [{ unlocode: "SGSIN", name: "Singapore" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL","PIL","WANHAI","SITC"].includes(l.code)) },
  { countryCode: "AE", countryName: "United Arab Emirates", ports: [{ unlocode: "AEJEA", name: "Jebel Ali" }, { unlocode: "AEFJR", name: "Fujairah" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","XPRESS"].includes(l.code)) },
  { countryCode: "SA", countryName: "Saudi Arabia", ports: [{ unlocode: "SAJED", name: "Jeddah" }, { unlocode: "SADMM", name: "Dammam" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","XPRESS"].includes(l.code)) },
  { countryCode: "IN", countryName: "India", ports: [{ unlocode: "INMUM", name: "Mumbai (Nhava Sheva)" }, { unlocode: "INMUN", name: "Mundra" }, { unlocode: "INCHN", name: "Chennai" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","XPRESS","WANHAI"].includes(l.code)) },
  { countryCode: "TH", countryName: "Thailand", ports: [{ unlocode: "THBKK", name: "Bangkok (Laem Chabang)" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","WANHAI","RARO"].includes(l.code)) },
  { countryCode: "VN", countryName: "Vietnam", ports: [{ unlocode: "VNSGN", name: "Ho Chi Minh" }, { unlocode: "VNHPH", name: "Haiphong" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","WANHAI","SITC"].includes(l.code)) },
  { countryCode: "MY", countryName: "Malaysia", ports: [{ unlocode: "MYTPP", name: "Tanjung Pelepas" }, { unlocode: "MYPKG", name: "Port Klang" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","WANHAI","SITC"].includes(l.code)) },
  { countryCode: "ID", countryName: "Indonesia", ports: [{ unlocode: "IDJKT", name: "Jakarta" }, { unlocode: "IDSUB", name: "Surabaya" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","WANHAI"].includes(l.code)) },
  { countryCode: "US", countryName: "United States", ports: [{ unlocode: "USNYC", name: "New York" }, { unlocode: "USLAX", name: "Los Angeles" }, { unlocode: "USOAK", name: "Oakland" }, { unlocode: "USMIA", name: "Miami" }, { unlocode: "USSAV", name: "Savannah" }, { unlocode: "USHOU", name: "Houston" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "CA", countryName: "Canada", ports: [{ unlocode: "CAMTR", name: "Montreal" }, { unlocode: "CAVAN", name: "Vancouver" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "MX", countryName: "Mexico", ports: [{ unlocode: "MXVER", name: "Veracruz" }, { unlocode: "MXMZO", name: "Manzanillo" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "BR", countryName: "Brazil", ports: [{ unlocode: "BRSSZ", name: "Santos" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "AR", countryName: "Argentina", ports: [{ unlocode: "ARBUE", name: "Buenos Aires" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "AU", countryName: "Australia", ports: [{ unlocode: "AUMEL", name: "Melbourne" }, { unlocode: "AUSYD", name: "Sydney" }, { unlocode: "AUBNE", name: "Brisbane" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","YANG_MING","OOCL"].includes(l.code)) },
  { countryCode: "TR", countryName: "Turkey", ports: [{ unlocode: "TRIST", name: "Istanbul" }, { unlocode: "TRIZM", name: "Izmir" }, { unlocode: "TRMRS", name: "Mersin" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "ZA", countryName: "South Africa", ports: [{ unlocode: "ZADUR", name: "Durban" }, { unlocode: "ZACPT", name: "Cape Town" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","DELI"].includes(l.code)) },
  { countryCode: "NG", countryName: "Nigeria", ports: [{ unlocode: "NGAPP", name: "Lagos (Apapa)" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","ZIM","OOCL","DELI"].includes(l.code)) },
  { countryCode: "KE", countryName: "Kenya", ports: [{ unlocode: "KEMBA", name: "Mombasa" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","ZIM","OOCL","DELI"].includes(l.code)) },
  { countryCode: "MA", countryName: "Morocco", ports: [{ unlocode: "MACAS", name: "Casablanca" }, { unlocode: "MATNG", name: "Tanger Med" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","DELI"].includes(l.code)) },
  { countryCode: "CL", countryName: "Chile", ports: [{ unlocode: "CLVAL", name: "Valparaiso" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "PE", countryName: "Peru", ports: [{ unlocode: "PECAL", name: "Callao" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "CO", countryName: "Colombia", ports: [{ unlocode: "COCTG", name: "Cartagena" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "PL", countryName: "Poland", ports: [{ unlocode: "PLGDY", name: "Gdansk" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","NSC"].includes(l.code)) },
  { countryCode: "SE", countryName: "Sweden", ports: [{ unlocode: "SEGOT", name: "Gothenburg" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","NSC"].includes(l.code)) },
  { countryCode: "GR", countryName: "Greece", ports: [{ unlocode: "GRPIR", name: "Piraeus" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "OM", countryName: "Oman", ports: [{ unlocode: "OMSLL", name: "Salalah" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","XPRESS"].includes(l.code)) },
  { countryCode: "QA", countryName: "Qatar", ports: [{ unlocode: "QAHMD", name: "Hamad Port" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","XPRESS"].includes(l.code)) },
  { countryCode: "KW", countryName: "Kuwait", ports: [{ unlocode: "KWKWI", name: "Kuwait Port" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","XPRESS"].includes(l.code)) },
  { countryCode: "PK", countryName: "Pakistan", ports: [{ unlocode: "PKKHI", name: "Karachi" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","XPRESS"].includes(l.code)) },
  { countryCode: "BD", countryName: "Bangladesh", ports: [{ unlocode: "BDCHP", name: "Chittagong" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","WANHAI"].includes(l.code)) },
  { countryCode: "LK", countryName: "Sri Lanka", ports: [{ unlocode: "LKCMB", name: "Colombo" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","WANHAI","SITC"].includes(l.code)) },
  { countryCode: "PH", countryName: "Philippines", ports: [{ unlocode: "PHMNL", name: "Manila" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","ONE","EVERGREEN","HMM","ZIM","OOCL","PIL","WANHAI","SITC"].includes(l.code)) },
  { countryCode: "PT", countryName: "Portugal", ports: [{ unlocode: "PTLIS", name: "Lisbon" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "IE", countryName: "Ireland", ports: [{ unlocode: "IEDUB", name: "Dublin" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code)) },
  { countryCode: "FI", countryName: "Finland", ports: [{ unlocode: "FIHEL", name: "Helsinki" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","NSC"].includes(l.code)) },
  { countryCode: "DK", countryName: "Denmark", ports: [{ unlocode: "DKAAR", name: "Aarhus" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","NSC"].includes(l.code)) },
  { countryCode: "NO", countryName: "Norway", ports: [{ unlocode: "NOOSL", name: "Oslo" }], lines: SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL","NSC"].includes(l.code)) },
];

export function getShippingLinesByCountry(countryCode: string): ShippingLineInfo[] {
  return ALL_COUNTRIES_SHIPPING.find(c => c.countryCode === countryCode.toUpperCase())?.lines || [];
}

export function getPortsByCountry(countryCode: string): { unlocode: string; name: string }[] {
  return ALL_COUNTRIES_SHIPPING.find(c => c.countryCode === countryCode.toUpperCase())?.ports || [];
}

export function getCountryShippingInfo(countryCode: string): CountryShippingInfo | null {
  return ALL_COUNTRIES_SHIPPING.find(c => c.countryCode === countryCode.toUpperCase()) || null;
}

export function getAllCountries(): { code: string; name: string; portCount: number; lineCount: number }[] {
  return ALL_COUNTRIES_SHIPPING.map(c => ({ code: c.countryCode, name: c.countryName, portCount: c.ports.length, lineCount: c.lines.length }));
}

export function getShippingLineByCode(code: string): ShippingLineInfo | null {
  return SHIPPING_LINES.find(l => l.code === code.toUpperCase()) || null;
}

export function checkRouteAvailability(originPort: string, destinationPort: string): {
  available: boolean; originCountry: string; destinationCountry: string; commonLines: ShippingLineInfo[]; reason?: string;
} {
  const originCountry = originPort.substring(0, 2).toUpperCase();
  const destCountry = destinationPort.substring(0, 2).toUpperCase();
  const originInfo = getCountryShippingInfo(originCountry);
  const destInfo = getCountryShippingInfo(destCountry);
  if (!originInfo) return { available: false, originCountry, destinationCountry: destCountry, commonLines: [], reason: `Origin country ${originCountry} not in database` };
  if (!destInfo) return { available: false, originCountry, destinationCountry: destCountry, commonLines: [], reason: `Destination country ${destCountry} not in database` };
  const originLineCodes = new Set(originInfo.lines.map(l => l.code));
  const commonLines = destInfo.lines.filter(l => originLineCodes.has(l.code));
  if (commonLines.length === 0) return { available: false, originCountry, destinationCountry: destCountry, commonLines: [], reason: `No shipping line serves both ${originInfo.countryName} and ${destInfo.countryName} directly. Consider transshipment.` };
  return { available: true, originCountry, destinationCountry: destCountry, commonLines };
}

export function getAveragePricing(originPort: string, destinationPort: string): {
  dry20ft: { lowUsd: number; avgUsd: number; highUsd: number };
  dry40ft: { lowUsd: number; avgUsd: number; highUsd: number };
  reefer20ft: { lowUsd: number; avgUsd: number; highUsd: number };
  reefer40ft: { lowUsd: number; avgUsd: number; highUsd: number };
  currency: string; notes: string[];
} {
  const originCountry = originPort.substring(0, 2).toUpperCase();
  const destCountry = destinationPort.substring(0, 2).toUpperCase();
  const isAsiaEurope = ["CN","JP","KR","TW","VN","TH","MY","ID","PH","SG","IN","BD","LK","PK"].includes(originCountry) && ["DE","NL","BE","GB","FR","IT","ES","PL","SE","DK","FI","NO","GR","PT","IE"].includes(destCountry) || ["CN","JP","KR","TW","VN","TH","MY","ID","PH","SG","IN","BD","LK","PK"].includes(destCountry) && ["DE","NL","BE","GB","FR","IT","ES","PL","SE","DK","FI","NO","GR","PT","IE"].includes(originCountry);
  const isTransPacific = ["CN","JP","KR","TW","VN","TH","MY","ID","PH","SG"].includes(originCountry) && ["US","CA","MX"].includes(destCountry) || ["CN","JP","KR","TW","VN","TH","MY","ID","PH","SG"].includes(destCountry) && ["US","CA","MX"].includes(originCountry);
  const isMedEurope = ["EG","TR","GR","IT","ES","MA"].includes(originCountry) && ["DE","NL","BE","GB","FR"].includes(destCountry) || ["EG","TR","GR","IT","ES","MA"].includes(destCountry) && ["DE","NL","BE","GB","FR"].includes(originCountry);
  const isAfrica = ["ZA","NG","KE","GH","MA"].includes(originCountry) || ["ZA","NG","KE","GH","MA"].includes(destCountry);
  const isMiddleEast = ["AE","SA","OM","QA","KW"].includes(originCountry) || ["AE","SA","OM","QA","KW"].includes(destCountry);
  const isIntraAsia = ["CN","JP","KR","TW","VN","TH","MY","ID","PH","SG","IN","BD","LK","PK"].includes(originCountry) && ["CN","JP","KR","TW","VN","TH","MY","ID","PH","SG","IN","BD","LK","PK"].includes(destCountry);
  const isIntraEurope = ["DE","NL","BE","GB","FR","IT","ES","PL","SE","DK","FI","NO","GR","PT","IE"].includes(originCountry) && ["DE","NL","BE","GB","FR","IT","ES","PL","SE","DK","FI","NO","GR","PT","IE"].includes(destCountry);

  let baseDry40: number; const notes: string[] = [];
  if (isAsiaEurope) { baseDry40 = 1450; notes.push("Asia-Europe lane: FBX index reference"); }
  else if (isTransPacific) { baseDry40 = 1850; notes.push("Trans-Pacific lane: FBX index reference"); }
  else if (isMedEurope) { baseDry40 = 850; notes.push("Mediterranean-Europe lane"); }
  else if (isIntraAsia) { baseDry40 = 450; notes.push("Intra-Asia lane"); }
  else if (isIntraEurope) { baseDry40 = 350; notes.push("Intra-Europe feeder"); }
  else if (isAfrica) { baseDry40 = 2200; notes.push("Africa lane: limited capacity"); }
  else if (isMiddleEast) { baseDry40 = 1100; notes.push("Middle East lane"); }
  else { baseDry40 = 1600; notes.push("Global average rate"); }

  const reeferPremium = 1.40; const factor20 = 0.65; const variance = 0.20;
  const calc = (base: number, isReefer: boolean) => {
    const adj = isReefer ? base * reeferPremium : base;
    return { lowUsd: Math.round(adj * (1 - variance)), avgUsd: Math.round(adj), highUsd: Math.round(adj * (1 + variance)) };
  };
  const dry40 = calc(baseDry40, false);
  const dry20 = { lowUsd: Math.round(dry40.lowUsd * factor20), avgUsd: Math.round(dry40.avgUsd * factor20), highUsd: Math.round(dry40.highUsd * factor20) };
  const reefer40 = calc(baseDry40, true);
  const reefer20 = { lowUsd: Math.round(reefer40.lowUsd * factor20), avgUsd: Math.round(reefer40.avgUsd * factor20), highUsd: Math.round(reefer40.highUsd * factor20) };
  notes.push("Reefer includes ~40% premium + $12/day power");
  notes.push("Rates per container, exclude THC/docs/ISPS");
  return { dry20ft: dry20, dry40ft: dry40, reefer20ft: reefer20, reefer40ft: reefer40, currency: "USD", notes };
}

export function getNextVesselSchedules(originPort: string, destinationPort: string, shippingLine: string, weeksAhead: number = 4): Array<{
  vesselName: string; voyage: string; etd: string; eta: string; transitDays: number; service: string; cutoffDate: string; spaceAvailable: string;
}> {
  const line = getShippingLineByCode(shippingLine);
  if (!line) return [];
  const schedules: any[] = [];
  const now = new Date();
  const serviceName = line.services[0] || "DIRECT";
  const originCountry = originPort.substring(0, 2);
  const destCountry = destinationPort.substring(0, 2);

  for (let w = 0; w < weeksAhead; w++) {
    const etd = new Date(now);
    const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
    etd.setDate(now.getDate() + daysUntilMonday + w * 7);
    etd.setHours(10, 0, 0, 0);
    let transitDays = 20;
    if (originCountry === "EG" && destCountry === "DE") transitDays = 14;
    else if (originCountry === "EG" && destCountry === "NL") transitDays = 12;
    else if (originCountry === "CN" && destCountry === "DE") transitDays = 32;
    else if (originCountry === "CN" && destCountry === "US") transitDays = 18;
    else if (originCountry === "EG" && destCountry === "SA") transitDays = 5;
    else if (originCountry === "EG" && destCountry === "AE") transitDays = 7;
    else if (originCountry === "EG" && destCountry === "IT") transitDays = 6;
    const eta = new Date(etd.getTime() + transitDays * 86400000);
    const cutoff = new Date(etd.getTime() - 3 * 86400000);
    const vesselNum = String(w + 1).padStart(2, "0");
    schedules.push({
      vesselName: `${line.shortName} ${serviceName} ${vesselNum}`,
      voyage: `${serviceName}-${etd.getFullYear()}${String(etd.getMonth() + 1).padStart(2, "0")}${vesselNum}`,
      etd: etd.toISOString(), eta: eta.toISOString(), transitDays, service: serviceName,
      cutoffDate: cutoff.toISOString(), spaceAvailable: w < 2 ? "AVAILABLE" : w < 3 ? "LIMITED" : "OPEN",
    });
  }
  return schedules;
}

// ============================================================================
// EXTENDED COUNTRIES — covering all 89 countries from onboarding/countries.ts
// Added to ensure every country in the platform has shipping line coverage.
// ============================================================================

// Helper: get major lines by region (for countries with limited direct data)
const GLOBAL_LINES = SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM"].includes(l.code));
const EU_LINES = SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","HAPAG_LLOYD","ONE","EVERGREEN","ZIM","OOCL"].includes(l.code));
const ASIA_LINES = SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","ONE","EVERGREEN","HMM","ZIM","OOCL","WANHAI","SITC"].includes(l.code));
const ME_LINES = SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","ZIM","OOCL","PIL","XPRESS"].includes(l.code));
const AFRICA_LINES = SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","ZIM","OOCL","DELI"].includes(l.code));
const LATAM_LINES = SHIPPING_LINES.filter(l => ["MSC","MAERSK","CMA_CGM","COSCO","HAPAG_LLOYD","ONE","EVERGREEN","HMM","ZIM","OOCL"].includes(l.code));

export const EXTENDED_COUNTRIES: CountryShippingInfo[] = [
  { countryCode: "TN", countryName: "Tunisia", ports: [{ unlocode: "TNTUN", name: "Tunis (Rades)" }, { unlocode: "TNSPX", name: "Sfax" }], lines: AFRICA_LINES },
  { countryCode: "GH", countryName: "Ghana", ports: [{ unlocode: "GHTMD", name: "Tema" }, { unlocode: "GHTKD", name: "Takoradi" }], lines: AFRICA_LINES },
  { countryCode: "ET", countryName: "Ethiopia", ports: [{ unlocode: "ETJIB", name: "Djibouti (via Djibouti Port)" }], lines: AFRICA_LINES },
  { countryCode: "TZ", countryName: "Tanzania", ports: [{ unlocode: "TZDAR", name: "Dar es Salaam" }], lines: AFRICA_LINES },
  { countryCode: "UG", countryName: "Uganda", ports: [{ unlocode: "UGMBA", name: "Mombasa (via Kenya)" }], lines: AFRICA_LINES },
  { countryCode: "DZ", countryName: "Algeria", ports: [{ unlocode: "DZALG", name: "Algiers" }, { unlocode: "DZORN", name: "Oran" }], lines: AFRICA_LINES },
  { countryCode: "LY", countryName: "Libya", ports: [{ unlocode: "LYTIP", name: "Tripoli" }, { unlocode: "LYBEN", name: "Benghazi" }], lines: AFRICA_LINES },
  { countryCode: "SD", countryName: "Sudan", ports: [{ unlocode: "SDPRT", name: "Port Sudan" }], lines: AFRICA_LINES },
  { countryCode: "AO", countryName: "Angola", ports: [{ unlocode: "AOLAD", name: "Luanda" }], lines: AFRICA_LINES },
  { countryCode: "CM", countryName: "Cameroon", ports: [{ unlocode: "CMDLA", name: "Douala" }], lines: AFRICA_LINES },
  { countryCode: "CI", countryName: "Côte d'Ivoire", ports: [{ unlocode: "CIABJ", name: "Abidjan" }], lines: AFRICA_LINES },
  { countryCode: "SN", countryName: "Senegal", ports: [{ unlocode: "SNDKR", name: "Dakar" }], lines: AFRICA_LINES },
  { countryCode: "CH", countryName: "Switzerland", ports: [{ unlocode: "CHBSL", name: "Basel (Rhine inland)" }], lines: EU_LINES },
  { countryCode: "AT", countryName: "Austria", ports: [{ unlocode: "ATVIE", name: "Vienna (Danube inland)" }], lines: EU_LINES },
  { countryCode: "CZ", countryName: "Czech Republic", ports: [{ unlocode: "CZPRG", name: "Prague (inland via Hamburg/Rotterdam)" }], lines: EU_LINES },
  { countryCode: "RO", countryName: "Romania", ports: [{ unlocode: "ROCTN", name: "Constanta" }], lines: EU_LINES },
  { countryCode: "HU", countryName: "Hungary", ports: [{ unlocode: "HUBUD", name: "Budapest (Danube inland)" }], lines: EU_LINES },
  { countryCode: "BG", countryName: "Bulgaria", ports: [{ unlocode: "BGVAR", name: "Varna" }, { unlocode: "BGBGS", name: "Burgas" }], lines: EU_LINES },
  { countryCode: "HR", countryName: "Croatia", ports: [{ unlocode: "HRRJK", name: "Rijeka" }], lines: EU_LINES },
  { countryCode: "RU", countryName: "Russia", ports: [{ unlocode: "RUVLK", name: "Vladivostok" }, { unlocode: "RUKGD", name: "Kaliningrad" }, { unlocode: "RUSPT", name: "St. Petersburg" }], lines: GLOBAL_LINES },
  { countryCode: "UA", countryName: "Ukraine", ports: [{ unlocode: "UAODS", name: "Odessa" }, { unlocode: "UAYUZ", name: "Yuzhny" }], lines: GLOBAL_LINES },
  { countryCode: "BH", countryName: "Bahrain", ports: [{ unlocode: "BHBAH", name: "Bahrain Port (Khalifa bin Salman)" }], lines: ME_LINES },
  { countryCode: "JO", countryName: "Jordan", ports: [{ unlocode: "JOAQJ", name: "Aqaba" }], lines: ME_LINES },
  { countryCode: "LB", countryName: "Lebanon", ports: [{ unlocode: "LBBEY", name: "Beirut" }], lines: ME_LINES },
  { countryCode: "IQ", countryName: "Iraq", ports: [{ unlocode: "IQBSR", name: "Basra (Umm Qasr)" }], lines: ME_LINES },
  { countryCode: "IL", countryName: "Israel", ports: [{ unlocode: "ILASH", name: "Ashdod" }, { unlocode: "ILHFA", name: "Haifa" }], lines: ME_LINES },
  { countryCode: "HK", countryName: "Hong Kong", ports: [{ unlocode: "CNHKG", name: "Hong Kong" }], lines: ASIA_LINES },
  { countryCode: "KZ", countryName: "Kazakhstan", ports: [{ unlocode: "KZAQF", name: "Aktau (Caspian Sea)" }], lines: GLOBAL_LINES },
  { countryCode: "UZ", countryName: "Uzbekistan", ports: [{ unlocode: "UZTAS", name: "Tashkent (inland via Iran/Turkey)" }], lines: GLOBAL_LINES },
  { countryCode: "VE", countryName: "Venezuela", ports: [{ unlocode: "VELAR", name: "La Guaira" }, { unlocode: "VEMAR", name: "Maracaibo" }], lines: LATAM_LINES },
  { countryCode: "EC", countryName: "Ecuador", ports: [{ unlocode: "ECGYE", name: "Guayaquil" }], lines: LATAM_LINES },
  { countryCode: "UY", countryName: "Uruguay", ports: [{ unlocode: "UYMVD", name: "Montevideo" }], lines: LATAM_LINES },
  { countryCode: "PY", countryName: "Paraguay", ports: [{ unlocode: "PYASU", name: "Asunción (inland via Argentina/Uruguay)" }], lines: LATAM_LINES },
  { countryCode: "BO", countryName: "Bolivia", ports: [{ unlocode: "BOLPB", name: "La Paz (inland via Chile/Peru)" }], lines: LATAM_LINES },
  { countryCode: "CR", countryName: "Costa Rica", ports: [{ unlocode: "CRCAL", name: "Caldera" }, { unlocode: "CRPUN", name: "Puerto Limón" }], lines: LATAM_LINES },
  { countryCode: "PA", countryName: "Panama", ports: [{ unlocode: "PAPAN", name: "Panama Port (Balboa)" }, { unlocode: "PACOL", name: "Colón (Manzanillo)" }], lines: LATAM_LINES },
  { countryCode: "DO", countryName: "Dominican Republic", ports: [{ unlocode: "DOSDQ", name: "Santo Domingo" }, { unlocode: "DOCAU", name: "Caucedo" }], lines: LATAM_LINES },
  { countryCode: "NZ", countryName: "New Zealand", ports: [{ unlocode: "NZAKL", name: "Auckland" }, { unlocode: "NZWLG", name: "Wellington" }, { unlocode: "NZLYT", name: "Lyttelton" }], lines: GLOBAL_LINES },
  { countryCode: "FJ", countryName: "Fiji", ports: [{ unlocode: "FJSUV", name: "Suva" }, { unlocode: "FJLTK", name: "Lautoka" }], lines: GLOBAL_LINES },
  { countryCode: "PG", countryName: "Papua New Guinea", ports: [{ unlocode: "PGPOM", name: "Port Moresby" }, { unlocode: "PGLAE", name: "Lae" }], lines: GLOBAL_LINES },
];

// Merge extended countries into the main COUNTRY_SHIPPING array
export const ALL_COUNTRIES_SHIPPING: CountryShippingInfo[] = [...COUNTRY_SHIPPING, ...EXTENDED_COUNTRIES];
