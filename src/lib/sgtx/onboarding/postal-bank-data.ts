// SGTX Postal/ZIP Code Database + Bank Directory
// Per-country postal code formats + sample postal codes for autocomplete,
// and per-country bank directory with SWIFT/BIC codes for auto-detection.

// ============================================================
// POSTAL CODE FORMATS (per country)
// ============================================================
export interface PostalFormat {
  code: string; // ISO 3166-1 alpha2
  name: string;
  pattern: string; // regex (without anchors)
  placeholder: string; // e.g., "12345"
  samplePostalCodes: string[]; // for autocomplete
  sampleCities: { postal: string; city: string; region?: string }[];
}

// Helper to define a postal format compactly
const pf = (
  code: string,
  name: string,
  pattern: string,
  placeholder: string,
  samplePostalCodes: string[],
  sampleCities: { postal: string; city: string; region?: string }[],
): PostalFormat => ({ code, name, pattern, placeholder, samplePostalCodes, sampleCities });

export const POSTAL_FORMATS: PostalFormat[] = [
  // North America
  pf("US", "United States", "\\d{5}(-\\d{4})?", "12345", ["10001", "90210", "60601", "30301", "75201"], [
    { postal: "10001", city: "New York", region: "NY" },
    { postal: "90210", city: "Beverly Hills", region: "CA" },
    { postal: "60601", city: "Chicago", region: "IL" },
    { postal: "30301", city: "Atlanta", region: "GA" },
    { postal: "75201", city: "Dallas", region: "TX" },
    { postal: "98101", city: "Seattle", region: "WA" },
    { postal: "02101", city: "Boston", region: "MA" },
    { postal: "20001", city: "Washington", region: "DC" },
  ]),
  pf("CA", "Canada", "[A-Z]\\d[A-Z] ?\\d[A-Z]\\d", "A1A 1A1", ["M5H 2N2", "V6B 5K3", "H3A 0G4"], [
    { postal: "M5H 2N2", city: "Toronto", region: "ON" },
    { postal: "V6B 5K3", city: "Vancouver", region: "BC" },
    { postal: "H3A 0G4", city: "Montreal", region: "QC" },
    { postal: "T2P 1J9", city: "Calgary", region: "AB" },
  ]),
  pf("MX", "Mexico", "\\d{5}", "01000", ["01000", "06600", "11510"], [
    { postal: "01000", city: "Mexico City", region: "CDMX" },
    { postal: "06600", city: "Cuauhtémoc", region: "CDMX" },
    { postal: "11510", city: "Polanco", region: "CDMX" },
  ]),

  // Europe
  pf("DE", "Germany", "\\d{5}", "10115", ["10115", "20095", "80331"], [
    { postal: "10115", city: "Berlin", region: "BE" },
    { postal: "20095", city: "Hamburg", region: "HH" },
    { postal: "80331", city: "Munich", region: "BY" },
    { postal: "50667", city: "Cologne", region: "NW" },
    { postal: "60311", city: "Frankfurt", region: "HE" },
    { postal: "70173", city: "Stuttgart", region: "BW" },
    { postal: "44135", city: "Dortmund", region: "NW" },
    { postal: "40210", city: "Düsseldorf", region: "NW" },
  ]),
  pf("FR", "France", "\\d{5}", "75001", ["75001", "69001", "13001"], [
    { postal: "75001", city: "Paris", region: "Île-de-France" },
    { postal: "69001", city: "Lyon", region: "Auvergne-Rhône-Alpes" },
    { postal: "13001", city: "Marseille", region: "PACA" },
    { postal: "33000", city: "Bordeaux", region: "Nouvelle-Aquitaine" },
    { postal: "31000", city: "Toulouse", region: "Occitanie" },
    { postal: "59000", city: "Lille", region: "Hauts-de-France" },
  ]),
  pf("IT", "Italy", "\\d{5}", "00184", ["00184", "20121", "50123"], [
    { postal: "00184", city: "Rome", region: "Lazio" },
    { postal: "20121", city: "Milan", region: "Lombardy" },
    { postal: "50123", city: "Florence", region: "Tuscany" },
    { postal: "80121", city: "Naples", region: "Campania" },
    { postal: "10121", city: "Turin", region: "Piedmont" },
  ]),
  pf("ES", "Spain", "\\d{5}", "28001", ["28001", "08001", "41001"], [
    { postal: "28001", city: "Madrid", region: "Community of Madrid" },
    { postal: "08001", city: "Barcelona", region: "Catalonia" },
    { postal: "41001", city: "Seville", region: "Andalusia" },
    { postal: "46001", city: "Valencia", region: "Valencian Community" },
    { postal: "29001", city: "Málaga", region: "Andalusia" },
  ]),
  pf("NL", "Netherlands", "\\d{4} ?[A-Z]{2}", "1011 AB", ["1011 AB", "1071 AC", "3511 LX"], [
    { postal: "1011 AB", city: "Amsterdam", region: "North Holland" },
    { postal: "1071 AC", city: "Amsterdam (Zuid)", region: "North Holland" },
    { postal: "3511 LX", city: "Utrecht", region: "Utrecht" },
    { postal: "3011 AA", city: "Rotterdam", region: "South Holland" },
    { postal: "2611 JS", city: "Delft", region: "South Holland" },
  ]),
  pf("BE", "Belgium", "\\d{4}", "1000", ["1000", "2000", "9000"], [
    { postal: "1000", city: "Brussels", region: "Brussels-Capital" },
    { postal: "2000", city: "Antwerp", region: "Flanders" },
    { postal: "9000", city: "Ghent", region: "Flanders" },
    { postal: "4000", city: "Liège", region: "Wallonia" },
  ]),
  pf("GB", "United Kingdom", "[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}", "SW1A 1AA", ["SW1A 1AA", "M1 1AE", "B1 1HQ"], [
    { postal: "SW1A 1AA", city: "London", region: "Greater London" },
    { postal: "M1 1AE", city: "Manchester", region: "Greater Manchester" },
    { postal: "B1 1HQ", city: "Birmingham", region: "West Midlands" },
    { postal: "G1 1XW", city: "Glasgow", region: "Scotland" },
    { postal: "EH1 1YZ", city: "Edinburgh", region: "Scotland" },
    { postal: "L1 8JQ", city: "Liverpool", region: "Merseyside" },
    { postal: "LS1 4AY", city: "Leeds", region: "West Yorkshire" },
  ]),
  pf("CH", "Switzerland", "\\d{4}", "3000", ["3000", "8001", "1201"], [
    { postal: "3000", city: "Bern", region: "Bern" },
    { postal: "8001", city: "Zurich", region: "Zurich" },
    { postal: "1201", city: "Geneva", region: "Geneva" },
    { postal: "4001", city: "Basel", region: "Basel-Stadt" },
  ]),
  pf("AT", "Austria", "\\d{4}", "1010", ["1010", "4020", "6020"], [
    { postal: "1010", city: "Vienna", region: "Vienna" },
    { postal: "4020", city: "Linz", region: "Upper Austria" },
    { postal: "6020", city: "Innsbruck", region: "Tyrol" },
  ]),
  pf("PT", "Portugal", "\\d{4}-\\d{3}", "1000-001", ["1000-001", "4000-001", "4150-001"], [
    { postal: "1000-001", city: "Lisbon", region: "Lisbon" },
    { postal: "4000-001", city: "Porto", region: "Porto" },
    { postal: "4150-001", city: "Porto (Foz)", region: "Porto" },
  ]),
  pf("SE", "Sweden", "\\d{3} ?\\d{2}", "111 22", ["111 22", "113 42", "411 10"], [
    { postal: "111 22", city: "Stockholm", region: "Stockholm" },
    { postal: "411 10", city: "Gothenburg", region: "Västra Götaland" },
    { postal: "211 15", city: "Malmö", region: "Skåne" },
  ]),
  pf("NO", "Norway", "\\d{4}", "0150", ["0150", "5006", "7010"], [
    { postal: "0150", city: "Oslo", region: "Oslo" },
    { postal: "5006", city: "Bergen", region: "Vestland" },
    { postal: "7010", city: "Trondheim", region: "Trøndelag" },
  ]),
  pf("DK", "Denmark", "\\d{4}", "1050", ["1050", "1101", "8000"], [
    { postal: "1050", city: "Copenhagen", region: "Capital Region" },
    { postal: "8000", city: "Aarhus", region: "Central Denmark" },
  ]),
  pf("FI", "Finland", "\\d{5}", "00100", ["00100", "20100", "33100"], [
    { postal: "00100", city: "Helsinki", region: "Uusimaa" },
    { postal: "20100", city: "Turku", region: "Southwest Finland" },
    { postal: "33100", city: "Tampere", region: "Pirkanmaa" },
  ]),
  pf("IE", "Ireland", "[A-Z]\\d{2} ?[A-Z0-9]{4}", "D01 F5P2", ["D01 F5P2", "T12 YK86"], [
    { postal: "D01 F5P2", city: "Dublin", region: "Leinster" },
    { postal: "T12 YK86", city: "Cork", region: "Munster" },
  ]),
  pf("PL", "Poland", "\\d{2}-\\d{3}", "00-001", ["00-001", "30-001", "50-001"], [
    { postal: "00-001", city: "Warsaw", region: "Masovian" },
    { postal: "30-001", city: "Kraków", region: "Lesser Poland" },
    { postal: "50-001", city: "Wrocław", region: "Lower Silesian" },
  ]),
  pf("CZ", "Czech Republic", "\\d{3} ?\\d{2}", "110 00", ["110 00", "602 00", "700 00"], [
    { postal: "110 00", city: "Prague", region: "Prague" },
    { postal: "602 00", city: "Brno", region: "South Moravian" },
  ]),
  pf("GR", "Greece", "\\d{3} ?\\d{2}", "104 31", ["104 31", "546 24", "421 00"], [
    { postal: "104 31", city: "Athens", region: "Attica" },
    { postal: "546 24", city: "Thessaloniki", region: "Central Macedonia" },
  ]),
  pf("RU", "Russia", "\\d{6}", "101000", ["101000", "190000", "620000"], [
    { postal: "101000", city: "Moscow", region: "Moscow" },
    { postal: "190000", city: "St. Petersburg", region: "St. Petersburg" },
    { postal: "620000", city: "Yekaterinburg", region: "Sverdlovsk" },
  ]),
  pf("UA", "Ukraine", "\\d{5}", "01001", ["01001", "79000", "61000"], [
    { postal: "01001", city: "Kyiv", region: "Kyiv" },
    { postal: "79000", city: "Lviv", region: "Lviv" },
    { postal: "61000", city: "Kharkiv", region: "Kharkiv" },
  ]),
  pf("TR", "Turkey", "\\d{5}", "06000", ["06000", "34000", "35000"], [
    { postal: "06000", city: "Ankara", region: "Ankara" },
    { postal: "34000", city: "Istanbul", region: "Istanbul" },
    { postal: "35000", city: "Izmir", region: "Izmir" },
  ]),

  // Middle East
  pf("AE", "United Arab Emirates", "", "—", [], [
    { postal: "", city: "Dubai" },
    { postal: "", city: "Abu Dhabi" },
    { postal: "", city: "Sharjah" },
    { postal: "", city: "Ajman" },
    { postal: "", city: "Ras Al Khaimah" },
    { postal: "", city: "Fujairah" },
    { postal: "", city: "Umm Al Quwain" },
  ]),
  pf("SA", "Saudi Arabia", "\\d{5}(-\\d{4})?", "11564", ["11564", "12211", "21441"], [
    { postal: "11564", city: "Riyadh", region: "Riyadh" },
    { postal: "21441", city: "Jeddah", region: "Makkah" },
    { postal: "31952", city: "Dammam", region: "Eastern Province" },
  ]),
  pf("QA", "Qatar", "", "—", [], [
    { postal: "", city: "Doha" },
    { postal: "", city: "Al Rayyan" },
    { postal: "", city: "Al Wakrah" },
  ]),
  pf("KW", "Kuwait", "\\d{5}", "13001", ["13001", "54500", "60000"], [
    { postal: "13001", city: "Safat (Kuwait City)" },
    { postal: "54500", city: "Salmiya" },
    { postal: "60000", city: "Ahmadi" },
  ]),
  pf("BH", "Bahrain", "\\d{3}|\\d{4}", "317", ["317", "1016", "1062"], [
    { postal: "317", city: "Manama" },
    { postal: "1016", city: "Manama (Diplomatic Area)" },
  ]),
  pf("OM", "Oman", "\\d{3}", "112", ["112", "113", "114"], [
    { postal: "112", city: "Muscat (Ruwi)" },
    { postal: "113", city: "Muscat (Muttrah)" },
    { postal: "114", city: "Muscat (Seeb)" },
  ]),
  pf("EG", "Egypt", "\\d{5}", "11511", ["11511", "11865",  "21599"], [
    { postal: "11511", city: "Cairo (Maadi)", region: "Cairo" },
    { postal: "11865", city: "New Cairo", region: "Cairo" },
    { postal: "21599", city: "Alexandria (Sidi Gaber)", region: "Alexandria" },
    { postal: "11351", city: "Cairo (Downtown)", region: "Cairo" },
    { postal: "12111", city: "Giza", region: "Giza" },
    { postal: "44511", city: "Port Said", region: "Port Said" },
    { postal: "82511", city: "Luxor", region: "Luxor" },
    { postal: "83511", city: "Aswan", region: "Aswan" },
  ]),
  pf("JO", "Jordan", "\\d{5}", "11118", ["11118", "11941", "17110"], [
    { postal: "11118", city: "Amman (Abdali)", region: "Amman" },
    { postal: "11941", city: "Amman (Sweifieh)", region: "Amman" },
  ]),
  pf("LB", "Lebanon", "\\d{4}( ?\\d{4})?", "1100 0000", ["1100 2020", "1107 2090"], [
    { postal: "1100 2020", city: "Beirut (Achrafieh)" },
    { postal: "1107 2090", city: "Beirut (Ras Beirut)" },
  ]),

  // Asia
  pf("CN", "China", "\\d{6}", "100000", ["100000", "200000", "518000"], [
    { postal: "100000", city: "Beijing", region: "Beijing" },
    { postal: "200000", city: "Shanghai", region: "Shanghai" },
    { postal: "518000", city: "Shenzhen", region: "Guangdong" },
    { postal: "510000", city: "Guangzhou", region: "Guangdong" },
  ]),
  pf("HK", "Hong Kong", "", "—", [], [
    { postal: "", city: "Central" },
    { postal: "", city: "Wan Chai" },
    { postal: "", city: "Kowloon" },
    { postal: "", city: "Tsim Sha Tsui" },
  ]),
  pf("TW", "Taiwan", "\\d{3}(-\\d{2})?", "100", ["100", "106", "407"], [
    { postal: "100", city: "Taipei (Zhongzheng)", region: "Taipei" },
    { postal: "106", city: "Taipei (Da'an)", region: "Taipei" },
    { postal: "407", city: "Taichung (Xitun)", region: "Taichung" },
  ]),
  pf("JP", "Japan", "\\d{3}-\\d{4}", "100-0001", ["100-0001", "160-0022", "542-0076"], [
    { postal: "100-0001", city: "Tokyo (Chiyoda)", region: "Tokyo" },
    { postal: "160-0022", city: "Tokyo (Shinjuku)", region: "Tokyo" },
    { postal: "542-0076", city: "Osaka (Chuo)", region: "Osaka" },
    { postal: "450-0002", city: "Nagoya", region: "Aichi" },
  ]),
  pf("KR", "South Korea", "\\d{5}", "04524", ["04524", "06236", "04794"], [
    { postal: "04524", city: "Seoul (Jung-gu)", region: "Seoul" },
    { postal: "06236", city: "Seoul (Gangnam)", region: "Seoul" },
    { postal: "04794", city: "Seoul (Songpa)", region: "Seoul" },
    { postal: "21987", city: "Busan", region: "Busan" },
  ]),
  pf("SG", "Singapore", "\\d{6}", "048583", ["048583", "238801", "588177"], [
    { postal: "048583", city: "Singapore (Central)", region: "Central" },
    { postal: "238801", city: "Singapore (Orchard)", region: "Central" },
    { postal: "588177", city: "Singapore (Bukit Timah)", region: "Central" },
    { postal: "639521", city: "Singapore (Jurong)", region: "West" },
  ]),
  pf("MY", "Malaysia", "\\d{5}", "50000", ["50000", "50450", "60000"], [
    { postal: "50000", city: "Kuala Lumpur", region: "Federal Territory of KL" },
    { postal: "50450", city: "Kuala Lumpur (Bukit Bintang)", region: "Federal Territory of KL" },
    { postal: "60000", city: "Putrajaya", region: "Putrajaya" },
    { postal: "10250", city: "Penang (Georgetown)", region: "Penang" },
  ]),
  pf("TH", "Thailand", "\\d{5}", "10100", ["10100", "10200", "10300"], [
    { postal: "10100", city: "Bangkok (Bang Rak)", region: "Bangkok" },
    { postal: "10200", city: "Bangkok (Dusit)", region: "Bangkok" },
    { postal: "10300", city: "Bangkok (Sukhumvit)", region: "Bangkok" },
  ]),
  pf("VN", "Vietnam", "\\d{6}", "700000", ["700000", "100000", "550000"], [
    { postal: "700000", city: "Ho Chi Minh City (District 1)", region: "Ho Chi Minh City" },
    { postal: "100000", city: "Hanoi (Hoan Kiem)", region: "Hanoi" },
    { postal: "550000", city: "Da Nang", region: "Da Nang" },
  ]),
  pf("ID", "Indonesia", "\\d{5}", "10110", ["10110", "40171", "60231"], [
    { postal: "10110", city: "Jakarta (Menteng)", region: "DKI Jakarta" },
    { postal: "40171", city: "Bandung", region: "West Java" },
    { postal: "60231", city: "Surabaya", region: "East Java" },
  ]),
  pf("PH", "Philippines", "\\d{4}", "1000", ["1000", "1200", "6000"], [
    { postal: "1000", city: "Manila (Intramuros)", region: "Metro Manila" },
    { postal: "1200", city: "Makati", region: "Metro Manila" },
    { postal: "6000", city: "Cebu City", region: "Central Visayas" },
  ]),
  pf("IN", "India", "\\d{6}", "110001", ["110001", "400001", "560001"], [
    { postal: "110001", city: "New Delhi", region: "Delhi" },
    { postal: "400001", city: "Mumbai (Fort)", region: "Maharashtra" },
    { postal: "560001", city: "Bengaluru", region: "Karnataka" },
    { postal: "600001", city: "Chennai", region: "Tamil Nadu" },
    { postal: "700001", city: "Kolkata", region: "West Bengal" },
    { postal: "500001", city: "Hyderabad", region: "Telangana" },
  ]),
  pf("PK", "Pakistan", "\\d{5}", "74000", ["74000", "54000", "75500"], [
    { postal: "74000", city: "Karachi (Saddar)", region: "Sindh" },
    { postal: "54000", city: "Lahore", region: "Punjab" },
    { postal: "44000", city: "Islamabad", region: "Islamabad Capital" },
  ]),
  pf("BD", "Bangladesh", "\\d{4}", "1000", ["1000", "1212", "4000"], [
    { postal: "1000", city: "Dhaka (Motijheel)", region: "Dhaka" },
    { postal: "1212", city: "Dhaka (Gulshan)", region: "Dhaka" },
    { postal: "4000", city: "Chittagong", region: "Chittagong" },
  ]),
  pf("LK", "Sri Lanka", "\\d{5}", "00100", ["00100", "00700", "80000"], [
    { postal: "00100", city: "Colombo (Fort)", region: "Western" },
    { postal: "00700", city: "Colombo (Cinnamon Gardens)", region: "Western" },
    { postal: "80000", city: "Galle", region: "Southern" },
  ]),

  // Oceania
  pf("AU", "Australia", "\\d{4}", "2000", ["2000", "3000", "4000"], [
    { postal: "2000", city: "Sydney", region: "NSW" },
    { postal: "3000", city: "Melbourne", region: "VIC" },
    { postal: "4000", city: "Brisbane", region: "QLD" },
    { postal: "6000", city: "Perth", region: "WA" },
    { postal: "5000", city: "Adelaide", region: "SA" },
    { postal: "2001", city: "Sydney (Darlinghurst)", region: "NSW" },
  ]),
  pf("NZ", "New Zealand", "\\d{4}", "1010", ["1010", "6011", "8011"], [
    { postal: "1010", city: "Auckland", region: "Auckland" },
    { postal: "6011", city: "Wellington", region: "Wellington" },
    { postal: "8011", city: "Christchurch", region: "Canterbury" },
  ]),

  // South America
  pf("BR", "Brazil", "\\d{5}-\\d{3}", "01310-100", ["01310-100", "20040-020", "30130-100"], [
    { postal: "01310-100", city: "São Paulo (Av. Paulista)", region: "SP" },
    { postal: "20040-020", city: "Rio de Janeiro", region: "RJ" },
    { postal: "30130-100", city: "Belo Horizonte", region: "MG" },
    { postal: "40060-090", city: "Salvador", region: "BA" },
  ]),
  pf("AR", "Argentina", "([A-HJ-NP-Z])?\\d{4}([A-Z]{3})?", "C1009CAP", ["C1009CAP", "C1416BGD"], [
    { postal: "C1009CAP", city: "Buenos Aires (Microcentro)", region: "Buenos Aires" },
    { postal: "C1416BGD", city: "Buenos Aires (Palermo)", region: "Buenos Aires" },
  ]),
  pf("CL", "Chile", "\\d{7}", "8320000", ["8320000", "7500000", "4470000"], [
    { postal: "8320000", city: "Santiago", region: "Santiago Metropolitan" },
    { postal: "4470000", city: "Concepción", region: "Biobío" },
  ]),
  pf("CO", "Colombia", "\\d{6}", "110111", ["110111", "050030", "760011"], [
    { postal: "110111", city: "Bogotá", region: "Bogotá D.C." },
    { postal: "050030", city: "Medellín", region: "Antioquia" },
    { postal: "760011", city: "Cali", region: "Valle del Cauca" },
  ]),
  pf("PE", "Peru", "\\d{5}", "15001", ["15001", "04001", "20001"], [
    { postal: "15001", city: "Lima", region: "Lima" },
    { postal: "04001", city: "Arequipa", region: "Arequipa" },
  ]),
  pf("VE", "Venezuela", "\\d{4}", "1010", ["1010", "2001", "3001"], [
    { postal: "1010", city: "Caracas", region: "Capital District" },
    { postal: "2001", city: "Maracaibo", region: "Zulia" },
  ]),
  pf("EC", "Ecuador", "\\d{6}", "170101", ["170101", "090101", "010101"], [
    { postal: "170101", city: "Quito", region: "Pichincha" },
    { postal: "090101", city: "Guayaquil", region: "Guayas" },
  ]),

  // Africa (additional)
  pf("ZA", "South Africa", "\\d{4}", "8001", ["8001", "2001", "4001"], [
    { postal: "8001", city: "Cape Town", region: "Western Cape" },
    { postal: "2001", city: "Johannesburg", region: "Gauteng" },
    { postal: "4001", city: "Durban", region: "KwaZulu-Natal" },
    { postal: "0001", city: "Pretoria", region: "Gauteng" },
  ]),
  pf("NG", "Nigeria", "\\d{6}", "100001", ["100001", "101233", "200001"], [
    { postal: "100001", city: "Lagos (Yaba)", region: "Lagos" },
    { postal: "101233", city: "Lagos (Victoria Island)", region: "Lagos" },
    { postal: "200001", city: "Ibadan", region: "Oyo" },
    { postal: "900001", city: "Abuja", region: "FCT" },
  ]),
  pf("KE", "Kenya", "\\d{5}", "00100", ["00100", "00200", "00600"], [
    { postal: "00100", city: "Nairobi (GPO)", region: "Nairobi" },
    { postal: "00200", city: "Nairobi (Embakasi)", region: "Nairobi" },
    { postal: "00600", city: "Nairobi (Mombasa Road)", region: "Nairobi" },
    { postal: "40100", city: "Kisumu", region: "Kisumu" },
  ]),
  pf("GH", "Ghana", "[A-Z]{2}-\\d{3}-\\d{4}", "GA-001-0000", ["GA-001-0000", "GL-001-0000"], [
    { postal: "GA-001-0000", city: "Accra (Central)", region: "Greater Accra" },
    { postal: "GL-001-0000", city: "Accra (Osu)", region: "Greater Accra" },
  ]),
  pf("MA", "Morocco", "\\d{5}", "10000", ["10000", "20000", "40000"], [
    { postal: "10000", city: "Rabat", region: "Rabat-Salé-Kénitra" },
    { postal: "20000", city: "Casablanca", region: "Casablanca-Settat" },
    { postal: "40000", city: "Marrakech", region: "Marrakesh-Safi" },
  ]),
  pf("TN", "Tunisia", "\\d{4}", "1000", ["1000", "2000", "3000"], [
    { postal: "1000", city: "Tunis", region: "Tunis" },
    { postal: "2000", city: "Sfax", region: "Sfax" },
    { postal: "3000", city: "Sousse", region: "Sousse" },
  ]),
];

// Lookup helpers
export function getPostalFormat(country: string): PostalFormat | undefined {
  return POSTAL_FORMATS.find((p) => p.code === country.toUpperCase());
}
export function searchPostalCodes(country: string, query: string): { postal: string; city: string; region?: string }[] {
  const fmt = getPostalFormat(country);
  if (!fmt) return [];
  const q = query.trim().toLowerCase();
  if (!q) return fmt.sampleCities.slice(0, 10);
  return fmt.sampleCities.filter((c) => c.postal.toLowerCase().includes(q) || c.city.toLowerCase().includes(q)).slice(0, 10);
}
export function isValidPostalCode(country: string, postal: string): boolean {
  const fmt = getPostalFormat(country);
  if (!fmt) return true; // No format known — accept
  if (!fmt.pattern) return true; // No postal system (e.g., AE, HK) — accept any
  return new RegExp(`^${fmt.pattern}$`).test(postal.trim());
}

// ============================================================
// BANK DIRECTORY (per country — major banks with SWIFT/BIC codes)
// ============================================================
export interface BankEntry {
  swift: string;       // SWIFT/BIC code
  bankName: string;
  branch?: string;
  city?: string;
  // For countries with branch-routing codes (sort code, IFSC, BSB, etc.)
  routingCodeLabel?: string; // e.g., "Sort Code", "IFSC", "BSB", "ABA"
  routingCodeExample?: string;
}

const b = (swift: string, bankName: string, branch?: string, city?: string, routingCodeLabel?: string, routingCodeExample?: string): BankEntry => ({
  swift, bankName, branch, city, routingCodeLabel, routingCodeExample,
});

export const BANK_DIRECTORY: Record<string, BankEntry[]> = {
  EG: [
    b("NBECEGCX", "National Bank of Egypt (NBE)", "Cairo Main", "Cairo", "Bank Code", "0001"),
    b("CAEGGC", "Banque Misr", "Cairo Main", "Cairo", "Bank Code", "0002"),
    b("CIBEEGCX", "Commercial International Bank (CIB)", "Head Office", "Cairo", "Bank Code", "0005"),
    b("AAEGGC", "Arab African International Bank (AAIB)", "Head Office", "Cairo", "Bank Code", "0010"),
    b("ARABEGC", "Arab Banking Corporation Egypt", "Head Office", "Cairo", "Bank Code", "0011"),
    b("EBKEEGCX", "QNB Alahli (QNB)", "Head Office", "Cairo", "Bank Code", "0013"),
    b("FAIBEKCX", "Faisal Islamic Bank of Egypt", "Head Office", "Cairo", "Bank Code", "0015"),
    b("BMICEGCX", "Banque du Caire", "Head Office", "Cairo", "Bank Code", "0018"),
    b("SCBLEGCX", "SCB Egypt (Standard Chartered)", "Head Office", "Cairo", "Bank Code", "0021"),
    b("HSBKEGCX", "HSBC Egypt", "Head Office", "Cairo", "Bank Code", "0023"),
    b("CITIEGCX", "Citibank Egypt", "Head Office", "Cairo", "Bank Code", "0025"),
    b("CRBAEGC", "Crédit Agricole Egypt", "Head Office", "Cairo", "Bank Code", "0027"),
    b("EBASEGC", "Egyptian Arab Land Bank", "Head Office", "Cairo", "Bank Code", "0030"),
    b("BAFREGC", "Bank of Alexandria", "Head Office", "Cairo", "Bank Code", "0032"),
  ],
  DE: [
    b("DEUTDEFF", "Deutsche Bank AG", "Frankfurt", "Frankfurt", "BLZ", "50070010"),
    b("COBADEFF", "Commerzbank AG", "Frankfurt", "Frankfurt", "BLZ", "50040000"),
    b("DRESDEFF", "Dresdner Bank AG (Commerzbank)", "Frankfurt", "Frankfurt", "BLZ", "50080000"),
    b("VBRSDEHH", "Vereinsbank West AG / Hamburger Volksbank", "Hamburg", "Hamburg", "BLZ", "20090500"),
    b("GENODEFF", "DZ Bank AG", "Frankfurt", "Frankfurt", "BLZ", "50060400"),
    b("GENODEM1", "GLS Gemeinschaftsbank", "Bochum", "Bochum", "BLZ", "43060967"),
    b("BFSWDE33", "Bank für Sozialwirtschaft", "Köln", "Cologne", "BLZ", "37020500"),
    b("POSTDEFF", "Postbank (Deutsche Post)", "Bonn", "Bonn", "BLZ", "37010050"),
    b("SOLADEST", "Solarisbank AG", "Berlin", "Berlin", "BLZ", "10011001"),
    b("NTSBDEB1", "N26 Bank", "Berlin", "Berlin", "BLZ", "10011001"),
    b("KTONDE66", "Comdirect Bank", "Quickborn", "Quickborn", "BLZ", "20041133"),
    b("INGDDEFF", "ING-DiBa AG (ING)", "Frankfurt", "Frankfurt", "BLZ", "50010517"),
    b("DABADEHH", "DKB Deutsche Kreditbank", "Berlin", "Berlin", "BLZ", "12030000"),
    b("BHATDEFF", "Hamburg Commercial Bank (HCOB)", "Hamburg", "Hamburg", "BLZ", "20030000"),
  ],
  FR: [
    b("BNPAFRPP", "BNP Paribas", "Head Office", "Paris", "IBAN Key", "30004"),
    b("SOCGFR2P", "Société Générale", "Head Office", "Paris", "IBAN Key", "30003"),
    b("CRLYFRPP", "Crédit Lyonnais (LCL)", "Head Office", "Paris", "IBAN Key", "30002"),
    b("CCBPFRPP", "Banque Populaire", "Head Office", "Paris", "IBAN Key", "10207"),
    b("CMCIFR2A", "Crédit Mutuel", "Head Office", "Strasbourg", "IBAN Key", "10278"),
    b("CAFRFR", "Crédit Agricole", "Head Office", "Montrouge", "IBAN Key", "18206"),
    b("BPSMFR", "Banque Populaire (Massif Central)", "Clermont-Ferrand", "Clermont-Ferrand", "IBAN Key", "18706"),
    b("CEPAFR", "Caisse d'Épargne", "Head Office", "Paris", "IBAN Key", "18335"),
    b("BFCMFR", "Banque Fédérative du Crédit Mutuel", "Strasbourg", "Strasbourg", "IBAN Key", "10278"),
    b("AXABFR", "AXA Banque", "Paris", "Paris", "IBAN Key", "12414"),
    b("HSBCFR", "HSBC France", "Paris", "Paris", "IBAN Key", "30056"),
  ],
  GB: [
    b("BARCGB22", "Barclays Bank", "Head Office", "London", "Sort Code", "20-00-00"),
    b("HBUKGB4B", "HSBC UK", "Head Office", "Birmingham", "Sort Code", "40-05-15"),
    b("LOYDGB2L", "Lloyds Bank", "Head Office", "London", "Sort Code", "30-00-00"),
    b("NATWGB2L", "NatWest (RBS Group)", "Head Office", "London", "Sort Code", "60-01-01"),
    b("RBOSGB2A", "Royal Bank of Scotland", "Head Office", "Edinburgh", "Sort Code", "83-00-01"),
    b("SANTGB2L", "Santander UK", "Head Office", "London", "Sort Code", "09-01-01"),
    b("TSBSGB2L", "TSB Bank", "Head Office", "Edinburgh", "Sort Code", "77-00-00"),
    b("CPBKGB2L", "Co-operative Bank", "Head Office", "Manchester", "Sort Code", "08-90-09"),
    b("MIDLGB22", "HSBC (Midland Bank)", "Head Office", "London", "Sort Code", "40-05-30"),
    b("ABNAGB2L", "ABN AMRO Bank London", "Branch", "London", "Sort Code", "60-12-09"),
    b("BOFAGB4N", "Bank of America NA London", "Branch", "London", "Sort Code", "30-14-00"),
    b("CHASGB2L", "JPMorgan Chase London", "Branch", "London", "Sort Code", "60-92-43"),
    b("METAGB2L", "Metro Bank", "Head Office", "London", "Sort Code", "23-05-80"),
    b("STBAGB2L", "Starling Bank", "Head Office", "London", "Sort Code", "60-83-71"),
  ],
  AE: [
    b("EBILAEAD", "Emirates NBD Bank", "Head Office", "Dubai", "Bank Code", "014"),
    b("FABAEAD", "First Abu Dhabi Bank (FAB)", "Head Office", "Abu Dhabi", "Bank Code", "001"),
    b("ADCBAEAA", "Abu Dhabi Commercial Bank (ADCB)", "Head Office", "Abu Dhabi", "Bank Code", "003"),
    b("NBADAEAA", "National Bank of Abu Dhabi (NBAD)", "Head Office", "Abu Dhabi", "Bank Code", "002"),
    b("EBIZAEAD", "Dubai Islamic Bank (DIB)", "Head Office", "Dubai", "Bank Code", "024"),
    b("MABVAEAA", "Mashreq Bank", "Head Office", "Dubai", "Bank Code", "020"),
    b("NATIONAL", "Commercial Bank of Dubai (CBD)", "Head Office", "Dubai", "Bank Code", "005"),
    b("AHLIAEAA", "Ahli Bank (Ahli United Bank UAE)", "Head Office", "Dubai", "Bank Code", "017"),
    b("CBDUAE", "CBD (Commercial Bank of Dubai)", "Head Office", "Dubai", "Bank Code", "005"),
    b("ADCBIBUS", "ADCB (Branch)", "Main Branch", "Abu Dhabi", "Bank Code", "003"),
    b("RAKBAEAD", "RAKBANK (National Bank of Ras Al Khaimah)", "Head Office", "Ras Al Khaimah", "Bank Code", "010"),
    b("UNBAAEAD", "Union National Bank", "Head Office", "Abu Dhabi", "Bank Code", "029"),
    b("EIBAEAD", "Emirates Islamic Bank", "Head Office", "Dubai", "Bank Code", "035"),
    b("CITIAEAD", "Citibank N.A. UAE", "Branch", "Dubai", "Bank Code", "044"),
    b("SCBLAEAD", "Standard Chartered Bank UAE", "Branch", "Dubai", "Bank Code", "046"),
    b("HSBCAEAD", "HSBC Bank Middle East UAE", "Branch", "Dubai", "Bank Code", "048"),
    b("BARCAEAD", "Barclays Bank PLC UAE", "Branch", "Dubai", "Bank Code", "050"),
  ],
  SA: [
    b("NCBKSAJE", "NCB (National Commercial Bank / AlAhli)", "Head Office", "Jeddah", "Bank Code", "010000"),
    b("RJBTSARY", "Al Rajhi Bank", "Head Office", "Riyadh", "Bank Code", "020000"),
    b("RISLSARI", "Alinma Bank", "Head Office", "Riyadh", "Bank Code", "030000"),
    b("BSFRSAJE", "Banque Saudi Fransi", "Head Office", "Riyadh", "Bank Code", "040000"),
    b("SAMBSARI", "Samba Financial Group (now SNB)", "Head Office", "Riyadh", "Bank Code", "050000"),
    b("NCBSSARI", "Saudi National Bank (SNB)", "Head Office", "Riyadh", "Bank Code", "060000"),
    b("ARBKSARI", "Arab Bank Saudi Arabia", "Head Office", "Riyadh", "Bank Code", "070000"),
    b("BSBRSAJE", "SABB (Saudi Awwal Bank)", "Head Office", "Riyadh", "Bank Code", "080000"),
    b("RIYDSA8S", "Al Rajhi Bank", "Main Branch", "Riyadh", "Bank Code", "020001"),
    b("ARNBSARI", "Bank AlBilad", "Head Office", "Riyadh", "Bank Code", "090000"),
    b("GULBSARI", "Gulf International Bank Saudi", "Head Office", "Riyadh", "Bank Code", "100000"),
    b("JAZRSARI", "Bank AlJazira", "Head Office", "Jeddah", "Bank Code", "110000"),
  ],
  US: [
    b("CHASUS33", "JPMorgan Chase Bank", "Head Office", "New York", "ABA Routing", "021000021"),
    b("BOFAUS3N", "Bank of America", "Head Office", "Charlotte", "ABA Routing", "026009593"),
    b("CITIUS33", "Citibank N.A.", "Head Office", "New York", "ABA Routing", "021000089"),
    b("WFICUS33", "Wells Fargo Bank", "Head Office", "San Francisco", "ABA Routing", "121000248"),
    b("PNBPUS33", "PNC Bank", "Head Office", "Pittsburgh", "ABA Routing", "043000096"),
    b("USBKUS44", "U.S. Bank", "Head Office", "Minneapolis", "ABA Routing", "091000022"),
    b("TDBKUS33", "TD Bank", "Head Office", "Wilmington", "ABA Routing", "031201360"),
    b("MUITUS44", "M&T Bank", "Head Office", "Buffalo", "ABA Routing", "022000046"),
    b("TRUSUS33", "Truist Bank (BB&T + SunTrust)", "Head Office", "Charlotte", "ABA Routing", "061000104"),
    b("FNASUS55", "Fifth Third Bank", "Head Office", "Cincinnati", "ABA Routing", "042000314"),
    b("KEYBUS3B", "KeyBank", "Head Office", "Cleveland", "ABA Routing", "041001039"),
    b("MIDLUSTR", "BMO Harris (BMO)", "Head Office", "Chicago", "ABA Routing", "071025661"),
    b("BKCHUS33", "Bank of the West (BNP Paribas)", "Head Office", "San Francisco", "ABA Routing", "121100782"),
    b("GSBCUS55", "Goldman Sachs Bank USA", "Head Office", "New York", "ABA Routing", "026013576"),
  ],
  CN: [
    b("BKCHCNBJ", "Bank of China (BOC)", "Head Office", "Beijing", "CNAPS Code", "104100000004"),
    b("ICBKCNBJ", "Industrial and Commercial Bank of China (ICBC)", "Head Office", "Beijing", "CNAPS Code", "102100099996"),
    b("COMMCNSH", "China Construction Bank (CCB)", "Head Office", "Beijing", "CNAPS Code", "105100000017"),
    b("ABOCCNBJ", "Agricultural Bank of China (ABC)", "Head Office", "Beijing", "CNAPS Code", "103100000026"),
    b("PCBCCNBJ", "China Postal Savings Bank (PSBC)", "Head Office", "Beijing", "CNAPS Code", "100000000004"),
    b("SPDBCNSH", "Shanghai Pudong Development Bank (SPDB)", "Head Office", "Shanghai", "CNAPS Code", "310290000011"),
    b("CMBCCNBS", "China Merchants Bank (CMB)", "Head Office", "Shenzhen", "CNAPS Code", "308584000013"),
    b("GZBCCN2A", "China Guangfa Bank (CGB)", "Head Office", "Guangzhou", "CNAPS Code", "306581000003"),
    b("MSBCCNBJ", "China Minsheng Bank (CMBC)", "Head Office", "Beijing", "CNAPS Code", "305100000013"),
    b("CIBKCNBJ", "China Citic Bank (CITIC)", "Head Office", "Beijing", "CNAPS Code", "302100011000"),
    b("EVERCNSH", "China Everbright Bank (CEB)", "Head Office", "Beijing", "CNAPS Code", "303100000006"),
    b("HXBKCNSH", "Hua Xia Bank (HXB)", "Head Office", "Beijing", "CNAPS Code", "304100040003"),
    b("BJBKCNSH", "Bank of Beijing", "Head Office", "Beijing", "CNAPS Code", "313100000019"),
    b("BJICCNBJ", "Bank of Communications (BoCom)", "Head Office", "Shanghai", "CNAPS Code", "301290000007"),
  ],
  JP: [
    b("BOTKJPJT", "Bank of Tokyo-Mitsubishi UFJ (MUFG)", "Head Office", "Tokyo", "Bank Code", "0005"),
    b("MIZUJPJT", "Mizuho Bank", "Head Office", "Tokyo", "Bank Code", "0001"),
    b("SAKIJPJT", "Sumitomo Mitsui Banking Corporation (SMBC)", "Head Office", "Tokyo", "Bank Code", "0009"),
    b("SMTBJPJT", "Sumitomo Trust & Banking (SuMi Trust)", "Head Office", "Tokyo", "Bank Code", "0010"),
    b("RIYBJPJT", "Resona Bank", "Head Office", "Osaka", "Bank Code", "0010"),
    b("CHKOJPJT", "Chiba Bank", "Head Office", "Chiba", "Bank Code", "0121"),
    b("YOKOJPJT", "Bank of Yokohama", "Head Office", "Yokohama", "Bank Code", "0158"),
    b("JPSMJPJT", "Japan Post Bank (Yucho)", "Head Office", "Tokyo", "Bank Code", "9900"),
    b("SHIZJPJT", "Shizuoka Bank", "Head Office", "Shizuoka", "Bank Code", "0179"),
    b("NOSIJPTT", "Norinchukin Bank", "Head Office", "Tokyo", "Bank Code", "0015"),
  ],
  IN: [
    b("SBININBB", "State Bank of India (SBI)", "Head Office", "Mumbai", "IFSC", "SBIN0000001"),
    b("HDFCINBB", "HDFC Bank", "Head Office", "Mumbai", "IFSC", "HDFC0000001"),
    b("ICICINBB", "ICICI Bank", "Head Office", "Mumbai", "IFSC", "ICIC0000001"),
    b("AXISINBB", "Axis Bank", "Head Office", "Mumbai", "IFSC", "UTIB0000001"),
    b("KOTAKINBB", "Kotak Mahindra Bank", "Head Office", "Mumbai", "IFSC", "KKBK0000001"),
    b("PUNBINBB", "Punjab National Bank (PNB)", "Head Office", "New Delhi", "IFSC", "PUNB0000001"),
    b("BARBINBB", "Bank of Baroda (BoB)", "Head Office", "Vadodara", "IFSC", "BARB0000001"),
    b("CNRBINBB", "Canara Bank", "Head Office", "Bengaluru", "IFSC", "CNRB0000001"),
    b("UBININBB", "Union Bank of India", "Head Office", "Mumbai", "IFSC", "UBIN0530001"),
    b("IOBAINBB", "Indian Overseas Bank (IOB)", "Head Office", "Chennai", "IFSC", "IOBA0000001"),
    b("IDIBINBB", "Indian Bank", "Head Office", "Chennai", "IFSC", "IDIB000B001"),
    b("YESBINBB", "Yes Bank", "Head Office", "Mumbai", "IFSC", "YESB0000001"),
    b("INDBINBB", "IndusInd Bank", "Head Office", "Mumbai", "IFSC", "INDB0000001"),
    b("FDBLINBB", "Federal Bank", "Head Office", "Aluva", "IFSC", "FDRL0000001"),
  ],
  AU: [
    b("CTBAAU2S", "Commonwealth Bank of Australia (CBA)", "Head Office", "Sydney", "BSB", "062-000"),
    b("ANZBAU3M", "ANZ Bank", "Head Office", "Melbourne", "BSB", "013-000"),
    b("NABPAU3M", "National Australia Bank (NAB)", "Head Office", "Melbourne", "BSB", "082-000"),
    b("WPACAU2S", "Westpac Banking Corporation", "Head Office", "Sydney", "BSB", "032-000"),
    b("BENDAU2B", "Bendigo and Adelaide Bank", "Head Office", "Bendigo", "BSB", "633-000"),
    b("MACAAU4S", "Macquarie Bank", "Head Office", "Sydney", "BSB", "182-512"),
    b("METWAU4S", "Bank of Queensland (BoQ)", "Head Office", "Brisbane", "BSB", "124-001"),
    b("INGAAU2S", "ING Australia", "Head Office", "Sydney", "BSB", "923-100"),
    b("SUNCAT2S", "Suncorp Bank", "Head Office", "Brisbane", "BSB", "484-799"),
  ],
  CH: [
    b("UBSWCHZH", "UBS Switzerland AG", "Head Office", "Zurich", "BC-Num", "230"),
    b("CRESCHZZ", "Credit Suisse (now UBS)", "Head Office", "Zurich", "BC-Num", "0"),
    b("RAIFCH2E", "Raiffeisen Switzerland", "Head Office", "St. Gallen", "BC-Num", "82000"),
    b("ZKBKCHZZ", "Zürcher Kantonalbank (ZKB)", "Head Office", "Zurich", "BC-Num", "700"),
    b("BCVGCH2G", "Banque Cantonale de Genève (BCGE)", "Head Office", "Geneva", "BC-Num", "300"),
    b("BKBKCH2L", "Basler Kantonalbank (BKB)", "Head Office", "Basel", "BC-Num", "229"),
    b("POSTCHBE", "PostFinance", "Head Office", "Bern", "BC-Num", "9000"),
    b("PIKTCHZZ", "Bank Julius Bär", "Head Office", "Zurich", "BC-Num", "0670"),
    b("VZBCCHZZ", "VZ VermögensZentrum Bank", "Head Office", "Zurich", "BC-Num", "83000"),
  ],
  TR: [
    b("ZKBATR2S", "Ziraat Bank (TC Ziraat Bankası)", "Head Office", "Ankara", "Bank Code", "00010"),
    b("ISBKTRIS", "İş Bank (Türkiye İş Bankası)", "Head Office", "Istanbul", "Bank Code", "00064"),
    b("GARATRIS", "Garanti BBVA (Garanti Bank)", "Head Office", "Istanbul", "Bank Code", "00062"),
    b("YAPITRIS", "Yapı Kredi Bank", "Head Office", "Istanbul", "Bank Code", "00067"),
    b("AKBKTRIS", "Akbank", "Head Office", "Istanbul", "Bank Code", "00046"),
    b("VBTBTR2S", "VakıfBank (Vakıflar Bankası)", "Head Office", "Ankara", "Bank Code", "00015"),
    b("ICBKTRIS", "Halkbank (Türkiye Halk Bankası)", "Head Office", "Ankara", "Bank Code", "00012"),
    b("TEBUTR2A", "Türk Ekonomi Bankası (TEB)", "Head Office", "Istanbul", "Bank Code", "00032"),
    b("DENITRIS", "Denizbank", "Head Office", "Istanbul", "Bank Code", "00134"),
    b("QNBTRIS", "QNB Finansbank", "Head Office", "Istanbul", "Bank Code", "00111"),
  ],
  AE_DUP: [], // placeholder removed below
};
// Clean up placeholder
delete (BANK_DIRECTORY as any).AE_DUP;

export function getBanksForCountry(country: string): BankEntry[] {
  return BANK_DIRECTORY[country.toUpperCase()] || [];
}
export function searchBanks(country: string, query: string): BankEntry[] {
  const banks = getBanksForCountry(country);
  if (!banks.length) return [];
  const q = query.trim().toLowerCase();
  if (!q) return banks.slice(0, 15);
  return banks.filter((b) =>
    b.bankName.toLowerCase().includes(q) ||
    b.swift.toLowerCase().includes(q) ||
    (b.city?.toLowerCase().includes(q) ?? false),
  ).slice(0, 15);
}
export function getBankBySwift(country: string, swift: string): BankEntry | undefined {
  return BANK_DIRECTORY[country.toUpperCase()]?.find((b) => b.swift === swift.toUpperCase());
}

// IBAN formats per country (length + structure)
export const IBAN_FORMATS: Record<string, { length: number; structure: string; example: string }> = {
  EG: { length: 29, structure: "EG2!n4!a4!n16!c", example: "EG380019000500000000263180002" },
  DE: { length: 22, structure: "DE2!n8!n10!n", example: "DE89370400440532013000" },
  FR: { length: 27, structure: "FR2!n5!n5!n11!n2!n", example: "FR1420041010050500013M02606" },
  GB: { length: 22, structure: "GB2!n4!a6!n8!n", example: "GB29NWBK60161331926819" },
  AE: { length: 23, structure: "AE2!n3!n16!n", example: "AE070331234567890123456" },
  SA: { length: 24, structure: "SA2!n2!n18!c", example: "SA0380000000608010167519" },
  IT: { length: 27, structure: "IT2!n1!a5!n5!n12!c", example: "IT60X0542811101000000123456" },
  ES: { length: 24, structure: "ES2!n4!n4!n1!n1!n10!n", example: "ES9121000418450200051332" },
  NL: { length: 18, structure: "NL2!n4!a10!n", example: "NL91ABNA0417164300" },
  BE: { length: 16, structure: "BE2!n3!n7!n2!n", example: "BE68539007547034" },
  CH: { length: 21, structure: "CH2!n5!n12!c", example: "CH9300762011623852957" },
  AT: { length: 20, structure: "AT2!n5!n11!n", example: "AT611904300234573201" },
  PT: { length: 25, structure: "PT2!n4!n4!n11!n2!n", example: "PT50000201231234567890154" },
  PL: { length: 28, structure: "PL2!n8!n16!n", example: "PL61109010140000071219812874" },
  SE: { length: 24, structure: "SE2!n3!n16!n1!n", example: "SE4550000000058398257466" },
  NO: { length: 15, structure: "NO2!n4!n6!n1!n", example: "NO9386011117947" },
  DK: { length: 18, structure: "DK2!n4!n9!n1!n", example: "DK5000400440116243" },
  FI: { length: 18, structure: "FI2!n6!n7!n1!n", example: "FI2112345600000785" },
  TR: { length: 26, structure: "TR2!n5!n1!c16!c", example: "TR330006100000000012345678" },
  RU: { length: 33, structure: "RU2!n9!n5!n15!c", example: "RU0204452520040709810000000000000" },
  CN: { length: 0, structure: "n/a (China uses CNAPS, not IBAN)", example: "" },
  JP: { length: 0, structure: "n/a (Japan uses Zengin, not IBAN)", example: "" },
  US: { length: 0, structure: "n/a (US uses ABA + Account, not IBAN)", example: "" },
  CA: { length: 0, structure: "n/a (Canada uses Transit + Account, not IBAN)", example: "" },
  AU: { length: 0, structure: "n/a (Australia uses BSB + Account, not IBAN)", example: "" },
  IN: { length: 0, structure: "n/a (India uses IFSC + Account, not IBAN)", example: "" },
  BR: { length: 29, structure: "BR2!n8!n5!n10!n1!a1!c", example: "BR1800000000141455123924100062209" },
};

export function getIbanFormat(country: string): { length: number; structure: string; example: string } | undefined {
  return IBAN_FORMATS[country.toUpperCase()];
}
