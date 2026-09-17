// @ts-nocheck
// UN/LOCODE — Major ports and airports worldwide
// Source: https://unece.org/trade/cefact/unlocode-code-list-country-and-territory
export interface PortLocation { locode: string; name: string; country: string; type: string; lat: number; lon: number; timezone: string; }
export const PORTS: PortLocation[] = [
  // Egypt
  {locode:"EGALY",name:"Alexandria",country:"EG",type:"SEAPORT",lat:31.20,lon:29.92,timezone:"Africa/Cairo"},
  {locode:"EGDMD",name:"Damietta",country:"EG",type:"SEAPORT",lat:31.42,lon:31.82,timezone:"Africa/Cairo"},
  {locode:"EGPSG",name:"Port Said",country:"EG",type:"SEAPORT",lat:31.26,lon:32.37,timezone:"Africa/Cairo"},
  {locode:"EGSOK",name:"Sokhna (Ain Sukhna)",country:"EG",type:"SEAPORT",lat:29.60,lon:32.35,timezone:"Africa/Cairo"},
  {locode:"EGCAI",name:"Cairo",country:"EG",type:"AIRPORT",lat:30.12,lon:31.40,timezone:"Africa/Cairo"},
  // Germany
  {locode:"DEHAM",name:"Hamburg",country:"DE",type:"SEAPORT",lat:53.55,lon:9.93,timezone:"Europe/Berlin"},
  {locode:"DEBRV",name:"Bremerhaven",country:"DE",type:"SEAPORT",lat:53.55,lon:8.58,timezone:"Europe/Berlin"},
  {locode:"DEBRE",name:"Bremen",country:"DE",type:"SEAPORT",lat:53.08,lon:8.80,timezone:"Europe/Berlin"},
  {locode:"DEFRA",name:"Frankfurt",country:"DE",type:"AIRPORT",lat:50.03,lon:8.56,timezone:"Europe/Berlin"},
  {locode:"DEBER",name:"Berlin",country:"DE",type:"AIRPORT",lat:52.36,lon:13.50,timezone:"Europe/Berlin"},
  {locode:"DEMUC",name:"Munich",country:"DE",type:"AIRPORT",lat:48.35,lon:11.78,timezone:"Europe/Berlin"},
  // Netherlands
  {locode:"NLRTM",name:"Rotterdam",country:"NL",type:"SEAPORT",lat:51.95,lon:4.14,timezone:"Europe/Amsterdam"},
  {locode:"NLAMS",name:"Amsterdam",country:"NL",type:"SEAPORT",lat:52.37,lon:4.90,timezone:"Europe/Amsterdam"},
  // Belgium
  {locode:"BEANR",name:"Antwerp",country:"BE",type:"SEAPORT",lat:51.22,lon:4.40,timezone:"Europe/Brussels"},
  {locode:"BEBRU",name:"Brussels",country:"BE",type:"AIRPORT",lat:50.90,lon:4.48,timezone:"Europe/Brussels"},
  // France
  {locode:"FRMRS",name:"Marseille",country:"FR",type:"SEAPORT",lat:43.30,lon:5.37,timezone:"Europe/Paris"},
  {locode:"FRLEH",name:"Le Havre",country:"FR",type:"SEAPORT",lat:49.49,lon:0.12,timezone:"Europe/Paris"},
  {locode:"FRPAR",name:"Paris (CDG)",country:"FR",type:"AIRPORT",lat:49.01,lon:2.55,timezone:"Europe/Paris"},
  // Italy
  {locode:"ITGOA",name:"Genoa",country:"IT",type:"SEAPORT",lat:44.40,lon:8.90,timezone:"Europe/Rome"},
  {locode:"ITNAP",name:"Naples",country:"IT",type:"SEAPORT",lat:40.83,lon:14.25,timezone:"Europe/Rome"},
  {locode:"ITROM",name:"Rome (FCO)",country:"IT",type:"AIRPORT",lat:41.80,lon:12.25,timezone:"Europe/Rome"},
  // Spain
  {locode:"ESBCN",name:"Barcelona",country:"ES",type:"SEAPORT",lat:41.35,lon:2.17,timezone:"Europe/Madrid"},
  {locode:"ESVLC",name:"Valencia",country:"ES",type:"SEAPORT",lat:39.45,lon:0.32,timezone:"Europe/Madrid"},
  {locode:"ESMAD",name:"Madrid",country:"ES",type:"AIRPORT",lat:40.50,lon:3.55,timezone:"Europe/Madrid"},
  // UK
  {locode:"GBFXT",name:"Felixstowe",country:"GB",type:"SEAPORT",lat:51.95,lon:1.35,timezone:"Europe/London"},
  {locode:"GBLON",name:"London",country:"GB",type:"SEAPORT",lat:51.50,lon:0.07,timezone:"Europe/London"},
  {locode:"GBSOU",name:"Southampton",country:"GB",type:"SEAPORT",lat:50.90,lon:1.42,timezone:"Europe/London"},
  {locode:"GBLHR",name:"London Heathrow",country:"GB",type:"AIRPORT",lat:51.47,lon:0.45,timezone:"Europe/London"},
  // US
  {locode:"USLAX",name:"Los Angeles",country:"US",type:"SEAPORT",lat:33.73,lon:118.27,timezone:"America/Los_Angeles"},
  {locode:"USNYC",name:"New York",country:"US",type:"SEAPORT",lat:40.70,lon:74.00,timezone:"America/New_York"},
  {locode:"USOAK",name:"Oakland",country:"US",type:"SEAPORT",lat:37.80,lon:122.30,timezone:"America/Los_Angeles"},
  {locode:"USMIA",name:"Miami",country:"US",type:"SEAPORT",lat:25.77,lon:80.17,timezone:"America/New_York"},
  {locode:"USSEA",name:"Seattle",country:"US",type:"SEAPORT",lat:47.60,lon:122.33,timezone:"America/Los_Angeles"},
  {locode:"USHOU",name:"Houston",country:"US",type:"SEAPORT",lat:29.73,lon:95.20,timezone:"America/Chicago"},
  {locode:"USSFO",name:"San Francisco",country:"US",type:"AIRPORT",lat:37.62,lon:122.38,timezone:"America/Los_Angeles"},
  {locode:"USJFK",name:"New York JFK",country:"US",type:"AIRPORT",lat:40.64,lon:73.78,timezone:"America/New_York"},
  {locode:"USORD",name:"Chicago O'Hare",country:"US",type:"AIRPORT",lat:41.98,lon:87.90,timezone:"America/Chicago"},
  // Asia
  {locode:"CNSHA",name:"Shanghai",country:"CN",type:"SEAPORT",lat:31.23,lon:121.47,timezone:"Asia/Shanghai"},
  {locode:"CNSZN",name:"Shenzhen",country:"CN",type:"SEAPORT",lat:22.55,lon:114.05,timezone:"Asia/Shanghai"},
  {locode:"CNNGB",name:"Ningbo",country:"CN",type:"SEAPORT",lat:29.87,lon:121.55,timezone:"Asia/Shanghai"},
  {locode:"CNGZG",name:"Guangzhou",country:"CN",type:"SEAPORT",lat:23.10,lon:113.27,timezone:"Asia/Shanghai"},
  {locode:"CNQIN",name:"Qingdao",country:"CN",type:"SEAPORT",lat:36.07,lon:120.38,timezone:"Asia/Shanghai"},
  {locode:"CNPEK",name:"Beijing",country:"CN",type:"AIRPORT",lat:40.08,lon:116.58,timezone:"Asia/Shanghai"},
  {locode:"HKHKG",name:"Hong Kong",country:"HK",type:"SEAPORT",lat:22.28,lon:114.13,timezone:"Asia/Hong_Kong"},
  {locode:"SGSIN",name:"Singapore",country:"SG",type:"SEAPORT",lat:1.29,lon:103.85,timezone:"Asia/Singapore"},
  {locode:"KRPUS",name:"Busan",country:"KR",type:"SEAPORT",lat:35.10,lon:129.03,timezone:"Asia/Seoul"},
  {locode:"KRINC",name:"Incheon",country:"KR",type:"SEAPORT",lat:37.45,lon:126.62,timezone:"Asia/Seoul"},
  {locode:"KRICN",name:"Seoul Incheon",country:"KR",type:"AIRPORT",lat:37.47,lon:126.44,timezone:"Asia/Seoul"},
  {locode:"JPTYO",name:"Tokyo",country:"JP",type:"SEAPORT",lat:35.68,lon:139.77,timezone:"Asia/Tokyo"},
  {locode:"JPKOB",name:"Kobe",country:"JP",type:"SEAPORT",lat:34.68,lon:135.20,timezone:"Asia/Tokyo"},
  {locode:"JPYOK",name:"Yokohama",country:"JP",type:"SEAPORT",lat:35.45,lon:139.67,timezone:"Asia/Tokyo"},
  {locode:"JPNRT",name:"Tokyo Narita",country:"JP",type:"AIRPORT",lat:35.77,lon:140.39,timezone:"Asia/Tokyo"},
  {locode:"INMAA",name:"Chennai",country:"IN",type:"SEAPORT",lat:13.08,lon:80.27,timezone:"Asia/Kolkata"},
  {locode:"INBOM",name:"Mumbai",country:"IN",type:"SEAPORT",lat:19.00,lon:72.85,timezone:"Asia/Kolkata"},
  {locode:"INDEL",name:"Delhi",country:"IN",type:"AIRPORT",lat:28.56,lon:77.10,timezone:"Asia/Kolkata"},
  // Middle East
  {locode:"AEJEA",name:"Jebel Ali (Dubai)",country:"AE",type:"SEAPORT",lat:25.01,lon:55.07,timezone:"Asia/Dubai"},
  {locode:"AEDXB",name:"Dubai",country:"AE",type:"AIRPORT",lat:25.25,lon:55.36,timezone:"Asia/Dubai"},
  {locode:"SAJED",name:"Jeddah",country:"SA",type:"SEAPORT",lat:21.48,lon:39.19,timezone:"Asia/Riyadh"},
  {locode:"SADMM",name:"Dammam",country:"SA",type:"SEAPORT",lat:26.42,lon:50.12,timezone:"Asia/Riyadh"},
  {locode:"SARUH",name:"Riyadh",country:"SA",type:"AIRPORT",lat:24.96,lon:46.70,timezone:"Asia/Riyadh"},
  // Australia / Pacific
  {locode:"AUSYD",name:"Sydney",country:"AU",type:"SEAPORT",lat:33.87,lon:151.20,timezone:"Australia/Sydney"},
  {locode:"AUMEL",name:"Melbourne",country:"AU",type:"SEAPORT",lat:37.83,lon:144.95,timezone:"Australia/Melbourne"},
  // Brazil
  {locode:"BRSSZ",name:"Santos",country:"BR",type:"SEAPORT",lat:23.97,lon:46.30,timezone:"America/Sao_Paulo"},
  {locode:"BRGRU",name:"Sao Paulo",country:"BR",type:"AIRPORT",lat:23.43,lon:46.47,timezone:"America/Sao_Paulo"},
  // Turkey
  {locode:"TRIST",name:"Istanbul",country:"TR",type:"SEAPORT",lat:41.01,lon:28.97,timezone:"Europe/Istanbul"},
  {locode:"TRIST",name:"Istanbul Airport",country:"TR",type:"AIRPORT",lat:41.26,lon:28.74,timezone:"Europe/Istanbul"},
  // South Africa
  {locode:"ZADUR",name:"Durban",country:"ZA",type:"SEAPORT",lat:29.87,lon:31.03,timezone:"Africa/Johannesburg"},
  {locode:"ZACTN",name:"Cape Town",country:"ZA",type:"SEAPORT",lat:33.92,lon:18.42,timezone:"Africa/Johannesburg"},
  // Russia
  {locode:"RUMVK",name:"Vladivostok",country:"RU",type:"SEAPORT",lat:43.10,lon:131.87,timezone:"Asia/Vladivostok"},
  // Canada
  {locode:"CAVAN",name:"Vancouver",country:"CA",type:"SEAPORT",lat:49.28,lon:123.12,timezone:"America/Vancouver"},
  {locode:"CAMTR",name:"Montreal",country:"CA",type:"SEAPORT",lat:45.50,lon:73.55,timezone:"America/Montreal"},
  {locode:"CATOR",name:"Toronto",country:"CA",type:"AIRPORT",lat:43.68,lon:79.61,timezone:"America/Toronto"},
  // Vietnam
  {locode:"VNSGN",name:"Ho Chi Minh City",country:"VN",type:"SEAPORT",lat:10.77,lon:106.70,timezone:"Asia/Ho_Chi_Minh"},
  {locode:"VNHPH",name:"Haiphong",country:"VN",type:"SEAPORT",lat:20.86,lon:106.68,timezone:"Asia/Ho_Chi_Minh"},
  // Thailand
  {locode:"THBKK",name:"Bangkok",country:"TH",type:"SEAPORT",lat:13.75,lon:100.50,timezone:"Asia/Bangkok"},
  {locode:"THLCH",name:"Laem Chabang",country:"TH",type:"SEAPORT",lat:13.08,lon:100.88,timezone:"Asia/Bangkok"},
  // Malaysia
  {locode:"MYPKG",name:"Port Klang",country:"MY",type:"SEAPORT",lat:3.00,lon:101.38,timezone:"Asia/Kuala_Lumpur"},
  // Indonesia
  {locode:"IDTPP",name:"Tanjung Priok (Jakarta)",country:"ID",type:"SEAPORT",lat:6.10,lon:106.88,timezone:"Asia/Jakarta"},
  // Philippines
  {locode:"PHMNL",name:"Manila",country:"PH",type:"SEAPORT",lat:14.58,lon:120.97,timezone:"Asia/Manila"},
  // Mexico
  {locode:"MXMEX",name:"Manzanillo",country:"MX",type:"SEAPORT",lat:19.05,lon:104.33,timezone:"America/Mexico_City"},
  {locode:"MXMEX",name:"Mexico City",country:"MX",type:"AIRPORT",lat:19.44,lon:99.07,timezone:"America/Mexico_City"},
  // Chile
  {locode:"CLSAI",name:"San Antonio",country:"CL",type:"SEAPORT",lat:33.60,lon:71.62,timezone:"America/Santiago"},
  {locode:"CLVAL",name:"Valparaiso",country:"CL",type:"SEAPORT",lat:33.05,lon:71.62,timezone:"America/Santiago"},
];
export function getPort(locode: string): PortLocation | null { return PORTS.find(p => p.locode === locode.toUpperCase()) || null; }
export function getPortsByCountry(country: string): PortLocation[] { return PORTS.filter(p => p.country === country.toUpperCase()); }
export function getPortsByType(type: string): PortLocation[] { return PORTS.filter(p => p.type === type.toUpperCase()); }
export function listAllPorts(): PortLocation[] { return PORTS; }
