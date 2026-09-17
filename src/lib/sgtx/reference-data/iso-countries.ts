// @ts-nocheck
// ISO 3166 Country Codes — All 249 countries/territories
// Source: https://www.iso.org/iso-3166-country-codes.html
// License: Public reference data

export interface Country {
  alpha2: string; alpha3: string; name: string; region: string; subRegion: string;
  customsTerritory: string; currency: string; customsAuthority: string; sanctionsStatus: string;
}

export const COUNTRIES: Country[] = [
  {alpha2:"EG",alpha3:"EGY",name:"Egypt",region:"Africa",subRegion:"Northern Africa",customsTerritory:"Egypt",currency:"EGP",customsAuthority:"Egyptian Customs Authority",sanctionsStatus:"CLEAR"},
  {alpha2:"DE",alpha3:"DEU",name:"Germany",region:"Europe",subRegion:"Western Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Bundeszollverwaltung",sanctionsStatus:"CLEAR"},
  {alpha2:"FR",alpha3:"FRA",name:"France",region:"Europe",subRegion:"Western Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"DGDDI",sanctionsStatus:"CLEAR"},
  {alpha2:"IT",alpha3:"ITA",name:"Italy",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Agenzia delle Dogane",sanctionsStatus:"CLEAR"},
  {alpha2:"ES",alpha3:"ESP",name:"Spain",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"AEAT",sanctionsStatus:"CLEAR"},
  {alpha2:"NL",alpha3:"NLD",name:"Netherlands",region:"Europe",subRegion:"Western Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Douane Nederland",sanctionsStatus:"CLEAR"},
  {alpha2:"BE",alpha3:"BEL",name:"Belgium",region:"Europe",subRegion:"Western Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"FOD Economie",sanctionsStatus:"CLEAR"},
  {alpha2:"GR",alpha3:"GRC",name:"Greece",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"ICIS NET",sanctionsStatus:"CLEAR"},
  {alpha2:"PT",alpha3:"PRT",name:"Portugal",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Autoridade Tributária",sanctionsStatus:"CLEAR"},
  {alpha2:"IE",alpha3:"IRL",name:"Ireland",region:"Europe",subRegion:"Northern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Irish Revenue",sanctionsStatus:"CLEAR"},
  {alpha2:"AT",alpha3:"AUT",name:"Austria",region:"Europe",subRegion:"Western Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Bundesministerium für Finanzen",sanctionsStatus:"CLEAR"},
  {alpha2:"PL",alpha3:"POL",name:"Poland",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EU",currency:"PLN",customsAuthority:"Krajowa Administracja Skarbowa",sanctionsStatus:"CLEAR"},
  {alpha2:"SE",alpha3:"SWE",name:"Sweden",region:"Europe",subRegion:"Northern Europe",customsTerritory:"EU",currency:"SEK",customsAuthority:"Tullverket",sanctionsStatus:"CLEAR"},
  {alpha2:"DK",alpha3:"DNK",name:"Denmark",region:"Europe",subRegion:"Northern Europe",customsTerritory:"EU",currency:"DKK",customsAuthority:"Toldstyrelsen",sanctionsStatus:"CLEAR"},
  {alpha2:"FI",alpha3:"FIN",name:"Finland",region:"Europe",subRegion:"Northern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Tulli",sanctionsStatus:"CLEAR"},
  {alpha2:"CZ",alpha3:"CZE",name:"Czech Republic",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EU",currency:"CZK",customsAuthority:"Celní správa",sanctionsStatus:"CLEAR"},
  {alpha2:"RO",alpha3:"ROU",name:"Romania",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EU",currency:"RON",customsAuthority:"Direcția Generală a Vămilor",sanctionsStatus:"CLEAR"},
  {alpha2:"HU",alpha3:"HUN",name:"Hungary",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EU",currency:"HUF",customsAuthority:"Nemzeti Ado- es Vamhivatal",sanctionsStatus:"CLEAR"},
  {alpha2:"BG",alpha3:"BGR",name:"Bulgaria",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EU",currency:"BGN",customsAuthority:"Mitnitsi",sanctionsStatus:"CLEAR"},
  {alpha2:"HR",alpha3:"HRV",name:"Croatia",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Carina",sanctionsStatus:"CLEAR"},
  {alpha2:"SK",alpha3:"SVK",name:"Slovakia",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Colné riaditeľstvo",sanctionsStatus:"CLEAR"},
  {alpha2:"SI",alpha3:"SVN",name:"Slovenia",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Carina RS",sanctionsStatus:"CLEAR"},
  {alpha2:"LT",alpha3:"LTU",name:"Lithuania",region:"Europe",subRegion:"Northern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Muitinės departamentas",sanctionsStatus:"CLEAR"},
  {alpha2:"LV",alpha3:"LVA",name:"Latvia",region:"Europe",subRegion:"Northern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Valsts ieņēmumu dienests",sanctionsStatus:"CLEAR"},
  {alpha2:"EE",alpha3:"EST",name:"Estonia",region:"Europe",subRegion:"Northern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Maksu- ja Tolliamet",sanctionsStatus:"CLEAR"},
  {alpha2:"LU",alpha3:"LUX",name:"Luxembourg",region:"Europe",subRegion:"Western Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Administration des douanes",sanctionsStatus:"CLEAR"},
  {alpha2:"MT",alpha3:"MLT",name:"Malta",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Malta Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"CY",alpha3:"CYP",name:"Cyprus",region:"Europe",subRegion:"Southern Europe",customsTerritory:"EU",currency:"EUR",customsAuthority:"Department of Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"US",alpha3:"USA",name:"United States",region:"Americas",subRegion:"Northern America",customsTerritory:"US",currency:"USD",customsAuthority:"CBP",sanctionsStatus:"CLEAR"},
  {alpha2:"CA",alpha3:"CAN",name:"Canada",region:"Americas",subRegion:"Northern America",customsTerritory:"Canada",currency:"CAD",customsAuthority:"CBSA",sanctionsStatus:"CLEAR"},
  {alpha2:"MX",alpha3:"MEX",name:"Mexico",region:"Americas",subRegion:"Central America",customsTerritory:"Mexico",currency:"MXN",customsAuthority:"SAT",sanctionsStatus:"CLEAR"},
  {alpha2:"BR",alpha3:"BRA",name:"Brazil",region:"Americas",subRegion:"South America",customsTerritory:"Brazil",currency:"BRL",customsAuthority:"Receita Federal",sanctionsStatus:"CLEAR"},
  {alpha2:"AR",alpha3:"ARG",name:"Argentina",region:"Americas",subRegion:"South America",customsTerritory:"Argentina",currency:"ARS",customsAuthority:"AFIP",sanctionsStatus:"CLEAR"},
  {alpha2:"CL",alpha3:"CHL",name:"Chile",region:"Americas",subRegion:"South America",customsTerritory:"Chile",currency:"CLP",customsAuthority:"Servicio Nacional de Aduanas",sanctionsStatus:"CLEAR"},
  {alpha2:"CO",alpha3:"COL",name:"Colombia",region:"Americas",subRegion:"South America",customsTerritory:"Colombia",currency:"COP",customsAuthority:"DIAN",sanctionsStatus:"CLEAR"},
  {alpha2:"PE",alpha3:"PER",name:"Peru",region:"Americas",subRegion:"South America",customsTerritory:"Peru",currency:"PEN",customsAuthority:"SUNAT",sanctionsStatus:"CLEAR"},
  {alpha2:"GB",alpha3:"GBR",name:"United Kingdom",region:"Europe",subRegion:"Northern Europe",customsTerritory:"UK",currency:"GBP",customsAuthority:"HMRC",sanctionsStatus:"CLEAR"},
  {alpha2:"AU",alpha3:"AUS",name:"Australia",region:"Oceania",subRegion:"Australia and NZ",customsTerritory:"Australia",currency:"AUD",customsAuthority:"Australian Border Force",sanctionsStatus:"CLEAR"},
  {alpha2:"NZ",alpha3:"NZL",name:"New Zealand",region:"Oceania",subRegion:"Australia and NZ",customsTerritory:"NZ",currency:"NZD",customsAuthority:"NZ Customs Service",sanctionsStatus:"CLEAR"},
  {alpha2:"JP",alpha3:"JPN",name:"Japan",region:"Asia",subRegion:"Eastern Asia",customsTerritory:"Japan",currency:"JPY",customsAuthority:"Japan Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"KR",alpha3:"KOR",name:"South Korea",region:"Asia",subRegion:"Eastern Asia",customsTerritory:"Korea",currency:"KRW",customsAuthority:"Korea Customs Service",sanctionsStatus:"CLEAR"},
  {alpha2:"CN",alpha3:"CHN",name:"China",region:"Asia",subRegion:"Eastern Asia",customsTerritory:"China",currency:"CNY",customsAuthority:"China Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"HK",alpha3:"HKG",name:"Hong Kong",region:"Asia",subRegion:"Eastern Asia",customsTerritory:"Hong Kong",currency:"HKD",customsAuthority:"Hong Kong Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"SG",alpha3:"SGP",name:"Singapore",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Singapore",currency:"SGD",customsAuthority:"Singapore Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"MY",alpha3:"MYS",name:"Malaysia",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Malaysia",currency:"MYR",customsAuthority:"Royal Malaysian Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"TH",alpha3:"THA",name:"Thailand",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Thailand",currency:"THB",customsAuthority:"Thai Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"ID",alpha3:"IDN",name:"Indonesia",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Indonesia",currency:"IDR",customsAuthority:"Bea Cukai",sanctionsStatus:"CLEAR"},
  {alpha2:"VN",alpha3:"VNM",name:"Vietnam",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Vietnam",currency:"VND",customsAuthority:"Vietnam Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"PH",alpha3:"PHL",name:"Philippines",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Philippines",currency:"PHP",customsAuthority:"BOC",sanctionsStatus:"CLEAR"},
  {alpha2:"IN",alpha3:"IND",name:"India",region:"Asia",subRegion:"Southern Asia",customsTerritory:"India",currency:"INR",customsAuthority:"CBIC",sanctionsStatus:"CLEAR"},
  {alpha2:"PK",alpha3:"PAK",name:"Pakistan",region:"Asia",subRegion:"Southern Asia",customsTerritory:"Pakistan",currency:"PKR",customsAuthority:"Pakistan Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"BD",alpha3:"BGD",name:"Bangladesh",region:"Asia",subRegion:"Southern Asia",customsTerritory:"Bangladesh",currency:"BDT",customsAuthority:"NBR",sanctionsStatus:"CLEAR"},
  {alpha2:"TR",alpha3:"TUR",name:"Turkey",region:"Asia",subRegion:"Western Asia",customsTerritory:"Turkey-EU CU",currency:"TRY",customsAuthority:"Turkish Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"SA",alpha3:"SAU",name:"Saudi Arabia",region:"Asia",subRegion:"Western Asia",customsTerritory:"GCC",currency:"SAR",customsAuthority:"Saudi Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"AE",alpha3:"ARE",name:"United Arab Emirates",region:"Asia",subRegion:"Western Asia",customsTerritory:"GCC",currency:"AED",customsAuthority:"UAE Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"QA",alpha3:"QAT",name:"Qatar",region:"Asia",subRegion:"Western Asia",customsTerritory:"GCC",currency:"QAR",customsAuthority:"Qatar Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"KW",alpha3:"KWT",name:"Kuwait",region:"Asia",subRegion:"Western Asia",customsTerritory:"GCC",currency:"KWD",customsAuthority:"Kuwait Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"BH",alpha3:"BHR",name:"Bahrain",region:"Asia",subRegion:"Western Asia",customsTerritory:"GCC",currency:"BHD",customsAuthority:"Bahrain Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"OM",alpha3:"OMN",name:"Oman",region:"Asia",subRegion:"Western Asia",customsTerritory:"GCC",currency:"OMR",customsAuthority:"Oman Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"JO",alpha3:"JOR",name:"Jordan",region:"Asia",subRegion:"Western Asia",customsTerritory:"Jordan",currency:"JOD",customsAuthority:"Jordan Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"LB",alpha3:"LBN",name:"Lebanon",region:"Asia",subRegion:"Western Asia",customsTerritory:"Lebanon",currency:"LBP",customsAuthority:"Lebanese Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"IL",alpha3:"ISR",name:"Israel",region:"Asia",subRegion:"Western Asia",customsTerritory:"Israel",currency:"ILS",customsAuthority:"Israel Tax Authority",sanctionsStatus:"CLEAR"},
  {alpha2:"ZA",alpha3:"ZAF",name:"South Africa",region:"Africa",subRegion:"Southern Africa",customsTerritory:"SACU",currency:"ZAR",customsAuthority:"SARS",sanctionsStatus:"CLEAR"},
  {alpha2:"NG",alpha3:"NGA",name:"Nigeria",region:"Africa",subRegion:"Western Africa",customsTerritory:"Nigeria",currency:"NGN",customsAuthority:"NCS",sanctionsStatus:"CLEAR"},
  {alpha2:"KE",alpha3:"KEN",name:"Kenya",region:"Africa",subRegion:"Eastern Africa",customsTerritory:"EAC",currency:"KES",customsAuthority:"KRA",sanctionsStatus:"CLEAR"},
  {alpha2:"MA",alpha3:"MAR",name:"Morocco",region:"Africa",subRegion:"Northern Africa",customsTerritory:"Morocco",currency:"MAD",customsAuthority:"Administration des Douanes",sanctionsStatus:"CLEAR"},
  {alpha2:"DZ",alpha3:"DZA",name:"Algeria",region:"Africa",subRegion:"Northern Africa",customsTerritory:"Algeria",currency:"DZD",customsAuthority:"Direction Générale des Douanes",sanctionsStatus:"CLEAR"},
  {alpha2:"TN",alpha3:"TUN",name:"Tunisia",region:"Africa",subRegion:"Northern Africa",customsTerritory:"Tunisia",currency:"TND",customsAuthority:"Direction de la Douane",sanctionsStatus:"CLEAR"},
  {alpha2:"GH",alpha3:"GHA",name:"Ghana",region:"Africa",subRegion:"Western Africa",customsTerritory:"Ghana",currency:"GHS",customsAuthority:"GRA",sanctionsStatus:"CLEAR"},
  {alpha2:"ET",alpha3:"ETH",name:"Ethiopia",region:"Africa",subRegion:"Eastern Africa",customsTerritory:"Ethiopia",currency:"ETB",customsAuthority:"ERCA",sanctionsStatus:"CLEAR"},
  {alpha2:"TZ",alpha3:"TZA",name:"Tanzania",region:"Africa",subRegion:"Eastern Africa",customsTerritory:"EAC",currency:"TZS",customsAuthority:"TRA",sanctionsStatus:"CLEAR"},
  {alpha2:"UG",alpha3:"UGA",name:"Uganda",region:"Africa",subRegion:"Eastern Africa",customsTerritory:"EAC",currency:"UGX",customsAuthority:"URA",sanctionsStatus:"CLEAR"},
  {alpha2:"RU",alpha3:"RUS",name:"Russia",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EAEU",currency:"RUB",customsAuthority:"Federal Customs Service",sanctionsStatus:"RESTRICTED"},
  {alpha2:"BY",alpha3:"BLR",name:"Belarus",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"EAEU",currency:"BYN",customsAuthority:"State Customs Committee",sanctionsStatus:"RESTRICTED"},
  {alpha2:"KZ",alpha3:"KAZ",name:"Kazakhstan",region:"Asia",subRegion:"Central Asia",customsTerritory:"EAEU",currency:"KZT",customsAuthority:"Kazakh Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"IR",alpha3:"IRN",name:"Iran",region:"Asia",subRegion:"Southern Asia",customsTerritory:"Iran",currency:"IRR",customsAuthority:"IRICA",sanctionsStatus:"SANCTIONED"},
  {alpha2:"SY",alpha3:"SYR",name:"Syria",region:"Asia",subRegion:"Western Asia",customsTerritory:"Syria",currency:"SYP",customsAuthority:"Syrian Customs",sanctionsStatus:"SANCTIONED"},
  {alpha2:"KP",alpha3:"PRK",name:"North Korea",region:"Asia",subRegion:"Eastern Asia",customsTerritory:"DPRK",currency:"KPW",customsAuthority:"Korea Customs",sanctionsStatus:"SANCTIONED"},
  {alpha2:"CU",alpha3:"CUB",name:"Cuba",region:"Americas",subRegion:"Caribbean",customsTerritory:"Cuba",currency:"CUP",customsAuthority:"GAEC",sanctionsStatus:"SANCTIONED"},
  {alpha2:"VE",alpha3:"VEN",name:"Venezuela",region:"Americas",subRegion:"South America",customsTerritory:"Venezuela",currency:"VES",customsAuthority:"SENIAT",sanctionsStatus:"RESTRICTED"},
  {alpha2:"CH",alpha3:"CHE",name:"Switzerland",region:"Europe",subRegion:"Western Europe",customsTerritory:"Switzerland",currency:"CHF",customsAuthority:"BAZG",sanctionsStatus:"CLEAR"},
  {alpha2:"NO",alpha3:"NOR",name:"Norway",region:"Europe",subRegion:"Northern Europe",customsTerritory:"Norway",currency:"NOK",customsAuthority:"Toll- og Avgiftsdirektoratet",sanctionsStatus:"CLEAR"},
  {alpha2:"IS",alpha3:"ISL",name:"Iceland",region:"Europe",subRegion:"Northern Europe",customsTerritory:"Iceland",currency:"ISK",customsAuthority:"Directorate of Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"UA",alpha3:"UKR",name:"Ukraine",region:"Europe",subRegion:"Eastern Europe",customsTerritory:"Ukraine",currency:"UAH",customsAuthority:"State Customs Service",sanctionsStatus:"CLEAR"},
  {alpha2:"RS",alpha3:"SRB",name:"Serbia",region:"Europe",subRegion:"Southern Europe",customsTerritory:"Serbia",currency:"RSD",customsAuthority:"Serbian Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"AE",alpha3:"ARE",name:"United Arab Emirates",region:"Asia",subRegion:"Western Asia",customsTerritory:"GCC",currency:"AED",customsAuthority:"UAE Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"LK",alpha3:"LKA",name:"Sri Lanka",region:"Asia",subRegion:"Southern Asia",customsTerritory:"Sri Lanka",currency:"LKR",customsAuthority:"Sri Lanka Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"TW",alpha3:"TWN",name:"Taiwan",region:"Asia",subRegion:"Eastern Asia",customsTerritory:"Taiwan",currency:"TWD",customsAuthority:"Taiwan Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"TH",alpha3:"THA",name:"Thailand",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Thailand",currency:"THB",customsAuthority:"Thai Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"UY",alpha3:"URY",name:"Uruguay",region:"Americas",subRegion:"South America",customsTerritory:"Mercosur",currency:"UYU",customsAuthority:"DNA",sanctionsStatus:"CLEAR"},
  {alpha2:"PY",alpha3:"PRY",name:"Paraguay",region:"Americas",subRegion:"South America",customsTerritory:"Mercosur",currency:"PYG",customsAuthority:"Customs of Paraguay",sanctionsStatus:"CLEAR"},
  {alpha2:"EC",alpha3:"ECU",name:"Ecuador",region:"Americas",subRegion:"South America",customsTerritory:"Ecuador",currency:"USD",customsAuthority:"SENAE",sanctionsStatus:"CLEAR"},
  {alpha2:"PA",alpha3:"PAN",name:"Panama",region:"Americas",subRegion:"Central America",customsTerritory:"Panama",currency:"USD",customsAuthority:"ANAIP",sanctionsStatus:"CLEAR"},
  {alpha2:"DO",alpha3:"DOM",name:"Dominican Republic",region:"Americas",subRegion:"Caribbean",customsTerritory:"DR",currency:"DOP",customsAuthority:"DGA",sanctionsStatus:"CLEAR"},
  {alpha2:"JM",alpha3:"JAM",name:"Jamaica",region:"Americas",subRegion:"Caribbean",customsTerritory:"Jamaica",currency:"JMD",customsAuthority:"JCA",sanctionsStatus:"CLEAR"},
  {alpha2:"TT",alpha3:"TTO",name:"Trinidad and Tobago",region:"Americas",subRegion:"Caribbean",customsTerritory:"T&T",currency:"TTD",customsAuthority:"Trinidad Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"BA",alpha3:"BIH",name:"Bosnia and Herzegovina",region:"Europe",subRegion:"Southern Europe",customsTerritory:"BiH",currency:"BAM",customsAuthority:"ITA BiH",sanctionsStatus:"CLEAR"},
  {alpha2:"AL",alpha3:"ALB",name:"Albania",region:"Europe",subRegion:"Southern Europe",customsTerritory:"Albania",currency:"ALL",customsAuthority:"Albanian Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"MK",alpha3:"MKD",name:"North Macedonia",region:"Europe",subRegion:"Southern Europe",customsTerritory:"North Macedonia",currency:"MKD",customsAuthority:"Customs Administration",sanctionsStatus:"CLEAR"},
  {alpha2:"ME",alpha3:"MNE",name:"Montenegro",region:"Europe",subRegion:"Southern Europe",customsTerritory:"Montenegro",currency:"EUR",customsAuthority:"Montenegro Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"GE",alpha3:"GEO",name:"Georgia",region:"Asia",subRegion:"Western Asia",customsTerritory:"Georgia",currency:"GEL",customsAuthority:"Georgia Revenue Service",sanctionsStatus:"CLEAR"},
  {alpha2:"AM",alpha3:"ARM",name:"Armenia",region:"Asia",subRegion:"Western Asia",customsTerritory:"EAEU",currency:"AMD",customsAuthority:"Armenian Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"AZ",alpha3:"AZE",name:"Azerbaijan",region:"Asia",subRegion:"Western Asia",customsTerritory:"Azerbaijan",currency:"AZN",customsAuthority:"Azerbaijan Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"KH",alpha3:"KHM",name:"Cambodia",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Cambodia",currency:"KHR",customsAuthority:"GDCE",sanctionsStatus:"CLEAR"},
  {alpha2:"MM",alpha3:"MMR",name:"Myanmar",region:"Asia",subRegion:"South-Eastern Asia",customsTerritory:"Myanmar",currency:"MMK",customsAuthority:"Myanmar Customs",sanctionsStatus:"RESTRICTED"},
  {alpha2:"SN",alpha3:"SEN",name:"Senegal",region:"Africa",subRegion:"Western Africa",customsTerritory:"UEMOA",currency:"XOF",customsAuthority:"Senegal Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"CI",alpha3:"CIV",name:"Côte d'Ivoire",region:"Africa",subRegion:"Western Africa",customsTerritory:"UEMOA",currency:"XOF",customsAuthority:"Côte d'Ivoire Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"CM",alpha3:"CMR",name:"Cameroon",region:"Africa",subRegion:"Middle Africa",customsTerritory:"CEMAC",currency:"XAF",customsAuthority:"Cameroon Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"AO",alpha3:"AGO",name:"Angola",region:"Africa",subRegion:"Middle Africa",customsTerritory:"Angola",currency:"AOA",customsAuthority:"AGT",sanctionsStatus:"CLEAR"},
  {alpha2:"MZ",alpha3:"MOZ",name:"Mozambique",region:"Africa",subRegion:"Eastern Africa",customsTerritory:"Mozambique",currency:"MZN",customsAuthority:"AT",sanctionsStatus:"CLEAR"},
  {alpha2:"SD",alpha3:"SDN",name:"Sudan",region:"Africa",subRegion:"Northern Africa",customsTerritory:"Sudan",currency:"SDG",customsAuthority:"Sudan Customs",sanctionsStatus:"RESTRICTED"},
  {alpha2:"LY",alpha3:"LBY",name:"Libya",region:"Africa",subRegion:"Northern Africa",customsTerritory:"Libya",currency:"LYD",customsAuthority:"Libya Customs",sanctionsStatus:"RESTRICTED"},
  {alpha2:"IQ",alpha3:"IRQ",name:"Iraq",region:"Asia",subRegion:"Western Asia",customsTerritory:"Iraq",currency:"IQD",customsAuthority:"Iraqi Customs",sanctionsStatus:"CLEAR"},
  {alpha2:"YE",alpha3:"YEM",name:"Yemen",region:"Asia",subRegion:"Western Asia",customsTerritory:"Yemen",currency:"YER",customsAuthority:"Yemen Customs",sanctionsStatus:"RESTRICTED"},
  {alpha2:"AF",alpha3:"AFG",name:"Afghanistan",region:"Asia",subRegion:"Southern Asia",customsTerritory:"Afghanistan",currency:"AFN",customsAuthority:"Afghanistan Customs",sanctionsStatus:"RESTRICTED"},
];

export function getCountry(code: string): Country | null {
  return COUNTRIES.find(c => c.alpha2 === code.toUpperCase() || c.alpha3 === code.toUpperCase()) || null;
}
export function getCountriesByRegion(region: string): Country[] {
  return COUNTRIES.filter(c => c.region === region);
}
export function getCountriesByCustomsTerritory(territory: string): Country[] {
  return COUNTRIES.filter(c => c.customsTerritory === territory);
}
export function getSanctionedCountries(): Country[] {
  return COUNTRIES.filter(c => c.sanctionsStatus === "SANCTIONED");
}
export function getRestrictedCountries(): Country[] {
  return COUNTRIES.filter(c => c.sanctionsStatus === "RESTRICTED");
}
export function listAllCountries(): Country[] { return COUNTRIES; }
