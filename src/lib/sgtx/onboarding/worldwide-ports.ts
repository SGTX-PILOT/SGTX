// SGTX Worldwide Ports Database
// Comprehensive list of major seaports, airports, and inland ports
// organized by ISO 3166-1 alpha2 country code.
// Format: "Port Name (UN/LOCODE)" — UN/LOCODE per UNECE recommendation.

export interface Port {
  name: string;
  locode: string;
  type: "SEA" | "AIR" | "INLAND" | "RIVER";
}

const p = (name: string, locode: string, type: Port["type"] = "SEA"): Port => ({ name, locode, type });

export const PORTS_BY_COUNTRY: Record<string, Port[]> = {
  EG: [p("Alexandria","EGALY"),p("Damietta","EGDAM"),p("Port Said","EGPSD"),p("Cairo (Air)","EGCAI","AIR"),p("Suez","EGSUZ"),p("Safaga","EGSAF"),p("Dekheila","EGDEK"),p("Ain Sokhna","EGASO")],
  NG: [p("Lagos (Apapa)","NGAPP"),p("Lagos (Tin Can Island)","NGTIN"),p("Port Harcourt","NGPHC"),p("Onne","NGONN"),p("Calabar","NGCAL"),p("Abuja (Air)","NGABV","AIR")],
  ZA: [p("Durban","ZADUR"),p("Cape Town","ZACPT"),p("Port Elizabeth","ZAPLZ"),p("Johannesburg (Air)","ZAJNB","AIR"),p("Richards Bay","ZARCB"),p("East London","ZAELS"),p("Saldanha Bay","ZASDB")],
  KE: [p("Mombasa","KEMBA"),p("Nairobi (Air)","KENBO","AIR")],
  MA: [p("Casablanca","MACAS"),p("Tanger Med","MATNG"),p("Agadir","MAAGA")],
  TN: [p("Tunis (Rades)","TNTUN"),p("Sfax","TNSFA"),p("Sousse","TNSUS"),p("Bizerte","TNBIZ")],
  DZ: [p("Algiers","DZALG"),p("Oran","DZORN"),p("Annaba","DZAAE"),p("Skikda","DZSKI"),p("Bejaia","DZGBJ")],
  LY: [p("Tripoli","LYTIP"),p("Benghazi","LYBEN"),p("Misrata","LYMRA")],
  SD: [p("Port Sudan","SDPZU"),p("Suakin","SDSUAK")],
  GH: [p("Tema","GHTEM"),p("Takoradi","GHTKD"),p("Accra (Air)","GHACC","AIR")],
  TZ: [p("Dar es Salaam","TZDAR"),p("Tanga","TZTGT"),p("Zanzibar","TZZNZ"),p("Mtwara","TZMYW")],
  AO: [p("Luanda","AOLAD"),p("Namibe","AOMSZ"),p("Lobito","AOLOB"),p("Cabinda","AOCAB")],
  CM: [p("Douala","CMDLA"),p("Kribi","CMKBI")],
  CI: [p("Abidjan","CIABJ"),p("San Pedro","CISPE")],
  SN: [p("Dakar","SNDKR"),p("Kaolack","SNKLC"),p("Ziguinchor","SNZIG")],
  DE: [p("Hamburg","DEHAM"),p("Bremerhaven","DEBRV"),p("Bremen","DEBRE"),p("Wilhelmshaven","DEWVN"),p("Emden","DEEME"),p("Rostock","DEROL"),p("Kiel","DEKEL"),p("Lübeck","DELBC"),p("Frankfurt (Air)","DEFRA","AIR"),p("Munich (Air)","DEMUC","AIR"),p("Düsseldorf (Air)","DEDUS","AIR"),p("Berlin (Air)","DEBER","AIR"),p("Leipzig (Air)","DELEJ","AIR"),p("Cologne (Air)","DECGN","AIR"),p("Stuttgart (Air)","DESTR","AIR")],
  NL: [p("Rotterdam","NLRTM"),p("Amsterdam","NLAMS"),p("Vlissingen","NLVLI"),p("Terneuzen","NLTRZ"),p("Moerdijk","NLMDK"),p("Amsterdam (Air)","NLAMS","AIR"),p("Eindhoven (Air)","NLEIN","AIR")],
  BE: [p("Antwerp","BEANR"),p("Zeebrugge","BEZEE"),p("Ghent","BEGNE"),p("Ostend","BEOST"),p("Liège","BELGG"),p("Brussels (Air)","BEBRU","AIR")],
  FR: [p("Le Havre","FRLEH"),p("Marseille","FRMRS"),p("Calais","FRCFR"),p("Dunkirk","FRDKK"),p("Bordeaux","FRBOD"),p("Nantes-Saint-Nazaire","FRSNR"),p("Toulon","FRTLN"),p("Sète","FRSSE"),p("Paris (CDG Air)","FRCDG","AIR"),p("Paris (Orly Air)","FRORY","AIR"),p("Lyon (Air)","FRLYS","AIR"),p("Nice (Air)","FRNCE","AIR"),p("Toulouse (Air)","FRTLS","AIR")],
  GB: [p("Felixstowe","GBFXT"),p("Southampton","GBSOU"),p("Liverpool","GBLIV"),p("London Gateway","GBLGP"),p("Tilbury","GBTIL"),p("Belfast","GBBEL"),p("Cardiff","GBCDF"),p("Bristol","GBBRS"),p("Dover","GBDOV"),p("London (Heathrow Air)","GBLHR","AIR"),p("London (Gatwick Air)","GBLGW","AIR"),p("Manchester (Air)","GBMAN","AIR"),p("Birmingham (Air)","GBBHX","AIR"),p("Edinburgh (Air)","GBEDI","AIR"),p("Glasgow (Air)","GBGLA","AIR")],
  IT: [p("Genoa","ITGOA"),p("Gioia Tauro","ITGTA"),p("Naples","ITNAP"),p("Trieste","ITTRS"),p("Venice","ITVCE"),p("La Spezia","ITSPE"),p("Civitavecchia","ITCVV"),p("Palermo","ITPMO"),p("Bari","ITBRI"),p("Rome (FCO Air)","ITFCO","AIR"),p("Milan (MXP Air)","ITMXP","AIR"),p("Venice (Air)","ITVCE","AIR"),p("Bologna (Air)","ITBLQ","AIR")],
  ES: [p("Valencia","ESVLC"),p("Algeciras","ESALG"),p("Barcelona","ESBCN"),p("Bilbao","ESBIO"),p("Málaga","ESAGP"),p("Seville","ESSVQ"),p("Las Palmas","ESLPA"),p("Santa Cruz de Tenerife","ESTFN"),p("Cartagena","ESCRT"),p("Gijón","ESGIJ"),p("Madrid (Air)","ESMAD","AIR"),p("Barcelona (Air)","ESBCN","AIR"),p("Málaga (Air)","ESAGP","AIR")],
  PT: [p("Sines","PTSIE"),p("Lisbon","PTLIS"),p("Leixões","PTLEI"),p("Setúbal","PTSET"),p("Lisbon (Air)","PTLIS","AIR"),p("Porto (Air)","PTOPO","AIR")],
  GR: [p("Piraeus","GRPIR"),p("Thessaloniki","GRTSK"),p("Patras","GRGPA"),p("Heraklion","GRHER"),p("Volos","GRVOL"),p("Athens (Air)","GRATH","AIR")],
  IE: [p("Dublin","IEDUB"),p("Cork","IEORK"),p("Shannon","IESNN"),p("Dublin (Air)","IEDUB","AIR")],
  PL: [p("Gdańsk","PLGDN"),p("Gdynia","PLGDY"),p("Szczecin","PLSZZ"),p("Świnoujście","PLSWI"),p("Warsaw (Air)","PLWAW","AIR"),p("Kraków (Air)","PLKRK","AIR")],
  SE: [p("Gothenburg","SEGOT"),p("Stockholm","SESTO"),p("Malmö","SEMAL"),p("Helsingborg","SEHLS"),p("Norrköping","SENRK"),p("Luleå","SELUL"),p("Stockholm (Air)","SESTO","AIR")],
  NO: [p("Oslo","NOOSL"),p("Bergen","NOBGO"),p("Trondheim","NOTRD"),p("Stavanger","NOSVG"),p("Narvik","NONVK"),p("Oslo (Air)","NOOSL","AIR"),p("Bergen (Air)","NOBGO","AIR")],
  DK: [p("Copenhagen","DKCPH"),p("Aarhus","DKAAR"),p("Aalborg","DKAAL"),p("Esbjerg","DKESB"),p("Fredericia","DKFRC"),p("Copenhagen (Air)","DKCPH","AIR"),p("Billund (Air)","DKBLL","AIR")],
  FI: [p("Helsinki","FIHEL"),p("Turku","FITKU"),p("Hamina","FIHAM"),p("Rauma","FIRAU"),p("Kotka","FIKTK"),p("Helsinki (Air)","FIHEL","AIR")],
  RU: [p("St. Petersburg","RULED"),p("Novorossiysk","RUNVS"),p("Vladivostok","RUVVO"),p("Kaliningrad","RUKGD"),p("Vostochny","RUVYP"),p("Moscow (SVO Air)","RUSVO","AIR")],
  UA: [p("Odessa","UAODS"),p("Chornomorsk","UACNL"),p("Mykolaiv","UANIK"),p("Yuzhny","UAIUY")],
  TR: [p("Istanbul (Ambarlı)","TRAMB"),p("Izmir","TRIZM"),p("Mersin","TRMER"),p("Iskenderun","TRISK"),p("Samsun","TRSSX"),p("Trabzon","TRTZX"),p("Istanbul (IST Air)","TRIST","AIR"),p("Ankara (Air)","TRANB","AIR"),p("Izmir (Air)","TRIZM","AIR"),p("Antalya (Air)","TRAYT","AIR")],
  CH: [p("Basel (Rhine)","CHBSL","RIVER"),p("Geneva (Air)","CHGVA","AIR"),p("Zürich (Air)","CHZRH","AIR")],
  AT: [p("Vienna (Air)","ATVIE","AIR"),p("Linz (Danube)","ATLNZ","RIVER")],
  CZ: [p("Prague (Air)","CZPRG","AIR")],
  HU: [p("Budapest (Air)","HUBUD","AIR"),p("Budapest (Danube)","HUBUD","RIVER")],
  RO: [p("Constanța","ROCND"),p("Bucharest (Air)","ROBUH","AIR")],
  BG: [p("Varna","BGVAR"),p("Burgas","BGBUR"),p("Sofia (Air)","BGSOF","AIR")],
  HR: [p("Rijeka","HRRJK"),p("Split","HRSPU"),p("Zadar","HRZAD"),p("Dubrovnik","HRDBV"),p("Zagreb (Air)","HRZAG","AIR")],
  SI: [p("Koper","SIKOP"),p("Ljubljana (Air)","SILJU","AIR")],
  AE: [p("Jebel Ali (Dubai)","AEJEA"),p("Khalifa (Abu Dhabi)","AEKHL"),p("Sharjah","AESHJ"),p("Abu Dhabi (Zayed)","AEAED"),p("Ras Al Khaimah","AERKT"),p("Fujairah","AEFJR"),p("Dubai (DXB Air)","AEDXB","AIR"),p("Abu Dhabi (AUH Air)","AEAUH","AIR")],
  SA: [p("Jeddah (JIP)","SAJED"),p("King Abdullah (KAEC)","SAKAC"),p("Dammam (King Abdulaziz)","SADMM"),p("Yanbu","SAYNB"),p("Jubail","SAJUB"),p("Riyadh (Air)","SARUH","AIR"),p("Jeddah (Air)","SAJED","AIR"),p("Dammam (Air)","SADMM","AIR")],
  QA: [p("Hamad (Doha)","QAHMD"),p("Doha (Air)","QADOH","AIR")],
  KW: [p("Shuwaikh","KWKWI"),p("Shuaiba","KWKAA"),p("Mina Al Ahmadi","KWMAA"),p("Kuwait (Air)","KWKWI","AIR")],
  BH: [p("Bahrain (Khalifa Bin Salman)","BHBAP"),p("Bahrain (Air)","BHBAH","AIR")],
  OM: [p("Sultan Qaboos (Muscat)","OMMCT"),p("Sohar","OMSOH"),p("Salalah","OMSLL"),p("Duqm","OMDOQ"),p("Muscat (Air)","OMMCT","AIR")],
  JO: [p("Aqaba","JOAQJ"),p("Amman (Air)","JOAMM","AIR")],
  LB: [p("Beirut","LBBEY"),p("Beirut (Air)","LBBEY","AIR")],
  IL: [p("Haifa","ILHFA"),p("Ashdod","ILASD"),p("Eilat","ILETH"),p("Tel Aviv (Air)","ILTLV","AIR")],
  IQ: [p("Umm Qasr","IQUQR"),p("Basra (Oil Terminal)","IQBSR"),p("Baghdad (Air)","IQBGW","AIR")],
  IR: [p("Bandar Abbas","IRBND"),p("Imam Khomeini","IRBKM"),p("Bushehr","IRBUZ"),p("Chabahar","IRZBR"),p("Tehran (Air)","IRTHR","AIR")],
  YE: [p("Aden","YEADE"),p("Hodeidah","YEHOD")],
  CN: [p("Shanghai","CNSHA"),p("Shenzhen","CNSZX"),p("Ningbo-Zhoushan","CNNGB"),p("Guangzhou","CNCAN"),p("Qingdao","CNTAO"),p("Tianjin","CNTSN"),p("Dalian","CNDLC"),p("Xiamen","CNXMN"),p("Lianyungang","CNLYG"),p("Beijing (PEK Air)","CNPEK","AIR"),p("Shanghai (PVG Air)","CNPVG","AIR"),p("Guangzhou (CAN Air)","CNCAN","AIR"),p("Shenzhen (SZX Air)","CNSZX","AIR"),p("Chengdu (Air)","CNCTU","AIR")],
  HK: [p("Hong Kong","HKHKG"),p("Hong Kong (Air)","HKHKG","AIR")],
  TW: [p("Kaohsiung","TWKHH"),p("Taipei (Keelung)","TWKEL"),p("Taichung","TWTXG"),p("Taipei (TPE Air)","TWTPE","AIR")],
  JP: [p("Tokyo (Yokohama)","JPYOK"),p("Nagoya","JPNGO"),p("Osaka","JPOSA"),p("Kobe","JPUKB"),p("Hakata","JPHKT"),p("Chiba","JPCHB"),p("Tokyo (NRT Air)","JPNRT","AIR"),p("Tokyo (HND Air)","JPHND","AIR"),p("Osaka (KIX Air)","JPKIX","AIR"),p("Nagoya (NGO Air)","JPNGO","AIR"),p("Fukuoka (Air)","JPFUK","AIR"),p("Sapporo (Air)","JPCTS","AIR")],
  KR: [p("Busan","KRPUS"),p("Incheon","KRINC"),p("Gwangyang","KRKAN"),p("Pyeongtaek","KRPTK"),p("Ulsan","KRUSN"),p("Seoul (Incheon Air)","KRINC","AIR"),p("Busan (Air)","KRPUS","AIR")],
  VN: [p("Ho Chi Minh (Cat Lai)","VNSGN"),p("Hai Phong","VNHPH"),p("Cai Mep","VNCMP"),p("Da Nang","VNDAD"),p("Hanoi (Air)","VRHAN","AIR"),p("Ho Chi Minh (Air)","VNSGN","AIR")],
  TH: [p("Bangkok (Klong Toey)","THBKK"),p("Laem Chabang","THLCH"),p("Map Ta Phut","THMAP"),p("Songkhla","THSGZ"),p("Phuket","THHKT"),p("Bangkok (BKK Air)","THBKK","AIR"),p("Phuket (Air)","THHKT","AIR"),p("Chiang Mai (Air)","THCNX","AIR")],
  SG: [p("Singapore (PSA)","SGSIN"),p("Jurong","SGJUR"),p("Singapore (Changi Air)","SGSIN","AIR")],
  MY: [p("Port Klang","MYPKG"),p("Tanjung Pelepas","MYTPP"),p("Penang","MYPEN"),p("Johor","MYJHB"),p("Bintulu","MYBTU"),p("Kuantan","MYKUA"),p("Kuala Lumpur (Air)","MYKUL","AIR"),p("Penang (Air)","MYPEN","AIR")],
  ID: [p("Tanjung Priok (Jakarta)","IDTPP"),p("Tanjung Perak (Surabaya)","IDTPK"),p("Belawan (Medan)","IDBLW"),p("Makassar","IDMAK"),p("Semarang","IDSRG"),p("Jakarta (CGK Air)","IDCGK","AIR"),p("Surabaya (Air)","IDSUB","AIR"),p("Denpasar (Bali Air)","IDDPS","AIR")],
  PH: [p("Manila (MNI)","PHMNL"),p("Cebu","PHCEB"),p("Davao","PHDVO"),p("Subic Bay","PHSFS"),p("Batangas","PHBTG"),p("Manila (MNL Air)","PHMNL","AIR"),p("Cebu (Air)","PHCEB","AIR"),p("Clark (Air)","PHCRK","AIR")],
  IN: [p("Nhava Sheva (Mumbai)","INNSA"),p("Mumbai","INBOM"),p("Chennai","INMAA"),p("Kolkata","INCCU"),p("Cochin","INCOK"),p("Visakhapatnam","INVTZ"),p("Mundra","INMUN"),p("Delhi (DEL Air)","INDEL","AIR"),p("Mumbai (BOM Air)","INBOM","AIR"),p("Chennai (MAA Air)","INMAA","AIR"),p("Bengaluru (BLR Air)","INBLR","AIR"),p("Hyderabad (HYD Air)","INHYD","AIR"),p("Kolkata (CCU Air)","INCCU","AIR")],
  PK: [p("Karachi","PKKHI"),p("Port Qasim","PKQAS"),p("Gwadar","PKGWD"),p("Karachi (Air)","PKKHI","AIR"),p("Lahore (Air)","PKLHE","AIR"),p("Islamabad (Air)","PKISB","AIR")],
  BD: [p("Chittagong","BDCTG"),p("Mongla","BDMGL"),p("Payra","BDPYR"),p("Dhaka (Air)","BDDAC","AIR")],
  LK: [p("Colombo","LKCOL"),p("Hambantota","LKHBA"),p("Colombo (Air)","LKCOL","AIR")],
  AU: [p("Sydney","AUSYD"),p("Melbourne","AUMEL"),p("Brisbane","AUBNE"),p("Fremantle (Perth)","AUFRE"),p("Adelaide","AUADL"),p("Newcastle","AUNTL"),p("Hedland","AUPHE"),p("Gladstone","AUGLT"),p("Townsville","AUTSV"),p("Darwin","AUDRW"),p("Sydney (SYD Air)","AUSYD","AIR"),p("Melbourne (MEL Air)","AUMEL","AIR"),p("Brisbane (BNE Air)","AUBNE","AIR"),p("Perth (PER Air)","AUPER","AIR"),p("Adelaide (ADL Air)","AUADL","AIR")],
  NZ: [p("Auckland","NZAKL"),p("Tauranga","NZTRG"),p("Lyttelton (Christchurch)","NZLYT"),p("Wellington","NZWLG"),p("Napier","NZNPE"),p("Auckland (AKL Air)","NZAKL","AIR"),p("Christchurch (CHC Air)","NZCHC","AIR"),p("Wellington (WLG Air)","NZWLG","AIR")],
  US: [p("Los Angeles","USLAX"),p("Long Beach","USLGB"),p("New York/Newark","USNYC"),p("Savannah","USSAV"),p("Houston","USHOU"),p("Charleston","USCHS"),p("Norfolk","USORF"),p("Seattle","USSEA"),p("Tacoma","USTIW"),p("Oakland","USOAK"),p("Miami","USMIA"),p("New Orleans","USMSY"),p("Baltimore","USBWI"),p("Boston","USBOS"),p("Philadelphia","USPHL"),p("Tampa","USTPA"),p("San Francisco","USSFO"),p("Honolulu","USHNL"),p("Portland (OR)","USPDX"),p("Chicago (Air)","USCHI","AIR"),p("Atlanta (Air)","USATL","AIR"),p("Dallas/Fort Worth (Air)","USDFW","AIR"),p("Denver (Air)","USDEN","AIR"),p("Los Angeles (LAX Air)","USLAX","AIR"),p("New York (JFK Air)","USJFK","AIR"),p("Miami (MIA Air)","USMIA","AIR")],
  CA: [p("Vancouver","CAVAN"),p("Prince Rupert","CAPRU"),p("Montreal","CAMTR"),p("Toronto","CATOR"),p("Halifax","CAHFX"),p("Toronto (YYZ Air)","CAYYZ","AIR"),p("Vancouver (YVR Air)","CAYVR","AIR"),p("Montreal (YUL Air)","CAYUL","AIR"),p("Calgary (YYC Air)","CAYYC","AIR")],
  MX: [p("Manzanillo","MXMZO"),p("Lázaro Cárdenas","MXLZC"),p("Veracruz","MXVER"),p("Altamira","MXATM"),p("Mexico City (MEX Air)","MXMEX","AIR"),p("Guadalajara (Air)","MXGDL","AIR"),p("Cancún (Air)","MXCUN","AIR")],
  BR: [p("Santos","BRSSZ"),p("Itajaí","BRITJ"),p("Paranaguá","BRPNG"),p("Rio de Janeiro","BRRIO"),p("Salvador","BRSSA"),p("Suape","BRSPE"),p("Manaus","BRMAO"),p("São Paulo (GRU Air)","BRGRU","AIR"),p("Rio de Janeiro (GIG Air)","BRGIG","AIR")],
  AR: [p("Buenos Aires","ARBUE"),p("Rosario","ARROS"),p("Bahía Blanca","ARBHI"),p("Buenos Aires (EZE Air)","AREZE","AIR")],
  CL: [p("San Antonio","CLSAI"),p("Valparaíso","CLVAP"),p("Antofagasta","CLANF"),p("Arica","CLARI"),p("Santiago (SCL Air)","CLSCL","AIR")],
  CO: [p("Cartagena","COCTG"),p("Buenaventura","COBUN"),p("Santa Marta","COSMR"),p("Barranquilla","COBAQ"),p("Bogotá (Air)","COBOG","AIR")],
  PE: [p("Callao","PECLL"),p("Paita","PEPIU"),p("Lima (LIM Air)","PELIM","AIR")],
  VE: [p("La Guaira","VELGU"),p("Puerto Cabello","VEPCZ"),p("Caracas (Air)","VECCS","AIR")],
  EC: [p("Guayaquil","ECGYE"),p("Manta","ECMEC"),p("Quito (UIO Air)","ECUIO","AIR")],
  UY: [p("Montevideo","UYMVD"),p("Nueva Palmira","UYNVP")],
  PY: [p("Asunción (Air)","PYASU","AIR")],
  BO: [p("La Paz (Air)","BOLPB","AIR")],
  CR: [p("Limón (Moín)","CRLIO"),p("Caldera","CRDCA"),p("San José (Air)","CRSJO","AIR")],
  PA: [p("Balboa","PABLB"),p("Colón","PACOL"),p("Manzanillo","PAMIT"),p("Cristóbal","PACTB"),p("Panama City (PTY Air)","PAPTY","AIR")],
  DO: [p("Caucedo","DOCAU"),p("Rio Haina","DOHAI"),p("Santo Domingo","DOSDQ"),p("Santo Domingo (Air)","DOSDQ","AIR"),p("Punta Cana (Air)","DOPUJ","AIR")],
  GT: [p("Puerto Quetzal","GTPRQ"),p("Guatemala City (Air)","GUGUA","AIR")],
  HN: [p("Puerto Cortés","HNPLC"),p("Tegucigalpa (Air)","HNTGU","AIR")],
  SV: [p("Acajutla","SVAQJ"),p("San Salvador (Air)","SVSAL","AIR")],
  NI: [p("Corinto","NICIO"),p("Managua (Air)","NIMGA","AIR")],
  CU: [p("Havana","CUHAV"),p("Mariel","CUMAR"),p("Havana (Air)","CUHAV","AIR")],
  JM: [p("Kingston","JMKIN"),p("Montego Bay","JMMBJ"),p("Kingston (Air)","JMKIN","AIR")],
  BS: [p("Nassau","BSNAS"),p("Freeport","BSFPO")],
  TT: [p("Port of Spain","TTPOS"),p("Point Lisas","TTPTR")],
  FJ: [p("Suva","FJSUV"),p("Lautoka","FJLTK"),p("Nadi (Air)","FJNAN","AIR")],
  PG: [p("Port Moresby","PGPOM"),p("Lae","PGLAE")],
};

export function getPortsForCountry(country: string): Port[] {
  return PORTS_BY_COUNTRY[country.toUpperCase()] || [];
}
export function formatPort(port: Port): string {
  return `${port.name} (${port.locode})`;
}
export function getPortStringsForCountry(country: string): string[] {
  return getPortsForCountry(country).map(formatPort);
}
