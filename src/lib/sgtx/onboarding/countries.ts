// SGTX Worldwide Country Registration Data
export interface CountryEntityType { code: string; label: string; description: string; }
export interface CountryRequiredDocument { key: string; label: string; description: string; mandatory: boolean; }
export interface CountryRegistrationData {
  code: string; name: string;
  entityTypes: CountryEntityType[];
  requiredDocuments: CountryRequiredDocument[];
}

const DEFAULT_ENTITIES = [
  { code: 'LLC', label: 'Limited Liability Company', description: 'Standard LLC' },
  { code: 'JSC', label: 'Joint Stock Company', description: 'Share-based company' },
  { code: 'BRANCH', label: 'Foreign Branch', description: 'Branch of a foreign company' },
];
const DEFAULT_DOCS = [
  { key: 'commercial_register', label: 'Commercial Register Certificate', description: 'Official company registration', mandatory: true },
  { key: 'tax_id', label: 'Tax Identification Number', description: 'National tax ID', mandatory: true },
  { key: 'ubo_declaration', label: 'UBO Declaration', description: 'Ultimate Beneficial Owner declaration', mandatory: true },
  { key: 'sanctions_self_declaration', label: 'Sanctions Self-Declaration', description: 'Sanctions compliance', mandatory: true },
  { key: 'articles_of_association', label: 'Articles of Association', description: 'Company charter', mandatory: true },
  { key: 'bank_reference', label: 'Bank Reference Letter', description: 'Bank reference', mandatory: false },
];

const COUNTRY_NAMES: Record<string, string> = {
  EG: 'Egypt', DE: 'Germany', VN: 'Vietnam', AE: 'UAE', SA: 'Saudi Arabia',
  FR: 'France', US: 'United States', GB: 'United Kingdom', IT: 'Italy', NL: 'Netherlands',
  BE: 'Belgium', TR: 'Turkey', CN: 'China', JP: 'Japan', SG: 'Singapore', IN: 'India',
  BR: 'Brazil', AU: 'Australia', CA: 'Canada', ZA: 'South Africa', CH: 'Switzerland',
  // Add all others
  AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AD:'Andorra',AO:'Angola',AR:'Argentina',
  AM:'Armenia',AT:'Austria',AZ:'Azerbaijan',BS:'Bahamas',BH:'Bahrain',BD:'Bangladesh',
  BB:'Barbados',BY:'Belarus',BZ:'Belize',BJ:'Benin',BT:'Bhutan',BO:'Bolivia',
  BA:'Bosnia and Herzegovina',BW:'Botswana',BN:'Brunei',BG:'Bulgaria',BF:'Burkina Faso',
  BI:'Burundi',CV:'Cabo Verde',KH:'Cambodia',CM:'Cameroon',CF:'Central African Republic',
  TD:'Chad',CL:'Chile',CO:'Colombia',KM:'Comoros',CG:'Congo',CD:'Congo (DRC)',
  CR:'Costa Rica',CI:'Cote d Ivoire',HR:'Croatia',CU:'Cuba',CY:'Cyprus',CZ:'Czech Republic',
  DK:'Denmark',DJ:'Djibouti',DM:'Dominica',DO:'Dominican Republic',EC:'Ecuador',
  SV:'El Salvador',GQ:'Equatorial Guinea',ER:'Eritrea',EE:'Estonia',SZ:'Eswatini',
  ET:'Ethiopia',FJ:'Fiji',FI:'Finland',GA:'Gabon',GM:'Gambia',GE:'Georgia',
  GH:'Ghana',GR:'Greece',GD:'Grenada',GT:'Guatemala',GN:'Guinea',GW:'Guinea-Bissau',
  GY:'Guyana',HT:'Haiti',HN:'Honduras',HU:'Hungary',IS:'Iceland',ID:'Indonesia',
  IR:'Iran',IQ:'Iraq',IE:'Ireland',IL:'Israel',JM:'Jamaica',JO:'Jordan',
  KZ:'Kazakhstan',KE:'Kenya',KI:'Kiribati',KP:'North Korea',KR:'South Korea',
  KW:'Kuwait',KG:'Kyrgyzstan',LA:'Laos',LV:'Latvia',LB:'Lebanon',LS:'Lesotho',
  LR:'Liberia',LY:'Libya',LI:'Liechtenstein',LT:'Lithuania',LU:'Luxembourg',
  MG:'Madagascar',MW:'Malawi',MY:'Malaysia',MV:'Maldives',ML:'Mali',MT:'Malta',
  MR:'Mauritania',MU:'Mauritius',MX:'Mexico',MD:'Moldova',MC:'Monaco',MN:'Mongolia',
  ME:'Montenegro',MA:'Morocco',MZ:'Mozambique',MM:'Myanmar',NA:'Namibia',
  NR:'Nauru',NP:'Nepal',NI:'Nicaragua',NE:'Niger',NG:'Nigeria',MK:'North Macedonia',
  NO:'Norway',OM:'Oman',PK:'Pakistan',PW:'Palau',PA:'Panama',PG:'Papua New Guinea',
  PY:'Paraguay',PE:'Peru',PH:'Philippines',PL:'Poland',PT:'Portugal',QA:'Qatar',
  RO:'Romania',RU:'Russia',RW:'Rwanda',KN:'Saint Kitts and Nevis',LC:'Saint Lucia',
  VC:'Saint Vincent',WS:'Samoa',SM:'San Marino',ST:'Sao Tome',SN:'Senegal',
  RS:'Serbia',SC:'Seychelles',SL:'Sierra Leone',SK:'Slovakia',SI:'Slovenia',
  SB:'Solomon Islands',SO:'Somalia',SS:'South Sudan',ES:'Spain',LK:'Sri Lanka',
  SD:'Sudan',SR:'Suriname',SE:'Sweden',SY:'Syria',TW:'Taiwan',TJ:'Tajikistan',
  TZ:'Tanzania',TH:'Thailand',TL:'Timor-Leste',TG:'Togo',TO:'Tonga',TT:'Trinidad',
  TN:'Tunisia',TM:'Turkmenistan',TV:'Tuvalu',UG:'Uganda',UA:'Ukraine',
  UY:'Uruguay',UZ:'Uzbekistan',VU:'Vanuatu',VA:'Vatican City',VE:'Venezuela',
  YE:'Yemen',ZM:'Zambia',ZW:'Zimbabwe',
};

export const COUNTRY_REGISTRATION_DATA: CountryRegistrationData[] = Object.entries(COUNTRY_NAMES).map(([code, name]) => ({
  code, name, entityTypes: DEFAULT_ENTITIES, requiredDocuments: DEFAULT_DOCS,
}));

export function getCountryData(code: string): CountryRegistrationData | undefined {
  return COUNTRY_REGISTRATION_DATA.find(c => c.code === code.toUpperCase());
}
export function getCountryEntityTypes(code: string): CountryEntityType[] {
  return getCountryData(code)?.entityTypes ?? DEFAULT_ENTITIES;
}
export function getCountryRequiredDocuments(code: string): CountryRequiredDocument[] {
  return getCountryData(code)?.requiredDocuments ?? DEFAULT_DOCS;
}
export const ALL_COUNTRY_CODES: { code: string; name: string }[] = COUNTRY_REGISTRATION_DATA.map(c => ({ code: c.code, name: c.name }));
