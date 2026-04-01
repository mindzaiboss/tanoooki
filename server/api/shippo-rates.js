const { Shippo } = require('shippo');

const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY });

// ---------------------------------------------------------------------------
// Carrier accounts by ORIGIN country
// DHL Express is the universal fallback for any unlisted country or route
// ---------------------------------------------------------------------------
const DHL = 'd9a54cc0c85140cfb4773f8516d28915';

const CARRIER_ACCOUNTS_BY_COUNTRY = {
  CA: [
    '593a940031554e009ddf8068a66a6b47', // UPS Canada
    'a7e659b3218c49c182140d682b98f937', // Canada Post
    DHL,
  ],
  US: [
    '670f42fd1c594430926357ee1739c4f1', // UPS US
    'f5fad08c7b1a4576b883398d5a1e8225', // USPS
    DHL,
  ],
  GB: [
    'cf2f0ddf3fb046aaabfdc0f93ec4d487', // Evri UK
    'd7f9e16b7ace4ce09b86a87890e2b521', // DPD UK
    DHL,
  ],
  AU: [
    'd9b161767e45415fa21c05d3c8d7517c', // Sendle
    'b8fe56bc9c6941879c57984b4e5b6fd8', // CouriersPlease
    DHL,
  ],
  DE: [
    '3791410183d24e03a384743f5c883515', // Deutsche Post
    '74d55e3c9d1c4f39b9004776158faf5b', // DPD DE
    DHL,
  ],
  FR: [
    '9567e2c357234436b4a7ab58ba3f5709', // Chronopost
    '8175973efc28499ba6552e6c618e36b3', // Colissimo
    DHL,
  ],
  // Asia-Pacific: DHL only (most reliable for these origins)
  JP: [DHL],
  CN: [DHL],
  KR: [DHL],
  TH: [DHL],
  HK: [DHL],
  SG: [DHL],
};

// Fallback for any unlisted origin country
const DEFAULT_CARRIERS = [DHL];

const PROVINCE_STATE_CODES = {
  'Alberta': 'AB', 'British Columbia': 'BC', 'Manitoba': 'MB',
  'New Brunswick': 'NB', 'Newfoundland and Labrador': 'NL',
  'Northwest Territories': 'NT', 'Nova Scotia': 'NS', 'Nunavut': 'NU',
  'Ontario': 'ON', 'Prince Edward Island': 'PE', 'Quebec': 'QC',
  'Saskatchewan': 'SK', 'Yukon': 'YT',
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
};

const normalizeState = (state) => {
  if (!state) return '';
  if (state.length <= 3) return state.toUpperCase();
  return PROVINCE_STATE_CODES[state] || state;
};

// ---------------------------------------------------------------------------
// Tier 1: Exact city match (lowercase key → { street1, zip })
// ---------------------------------------------------------------------------
const CITY_FALLBACK_ADDRESSES = {
  // --- Canada ---
  'calgary':           { street1: '317 7 Ave SW',                   zip: 'T2P 2Y9' },
  'edmonton':          { street1: '1 Sir Winston Churchill Sq',      zip: 'T5J 2R7' },
  'fredericton':       { street1: '397 Queen St',                    zip: 'E3B 1B5' },
  'halifax':           { street1: '1841 Argyle St',                  zip: 'B3J 3X4' },
  'hamilton':          { street1: '71 Main St W',                    zip: 'L8P 4Y5' },
  'iqaluit':           { street1: '4 Commissioner\'s Rd',            zip: 'X0A 0H0' },
  'kelowna':           { street1: '1435 Water St',                   zip: 'V1Y 1J4' },
  'kingston':          { street1: '216 Princess St',                 zip: 'K7L 1B2' },
  'london':            { street1: '300 Dufferin Ave',                zip: 'N6B 1Z2' },
  'mississauga':       { street1: '300 City Centre Dr',              zip: 'L5B 3C1' },
  'montreal':          { street1: '800 Blvd René-Lévesque W',        zip: 'H3B 1X9' },
  'ottawa':            { street1: '110 Laurier Ave W',               zip: 'K1P 1J1' },
  'quebec city':       { street1: '2 Rue des Jardins',               zip: 'G1R 4S9' },
  'regina':            { street1: '2476 Victoria Ave',               zip: 'S4P 3C7' },
  'saskatoon':         { street1: '222 3rd Ave N',                   zip: 'S7K 0J5' },
  'st. john\'s':       { street1: '10 New Gower St',                 zip: 'A1C 5M2' },
  'toronto':           { street1: '220 Yonge St',                    zip: 'M5B 2H1' },
  'vancouver':         { street1: '701 W Georgia St',                zip: 'V7Y 1C6' },
  'victoria':          { street1: '1 Centennial Square',             zip: 'V8W 1P6' },
  'whitehorse':        { street1: '2121 2nd Ave',                    zip: 'Y1A 1C2' },
  'winnipeg':          { street1: '510 Main St',                     zip: 'R3B 1B9' },
  'yellowknife':       { street1: '4807 52 St',                      zip: 'X1A 2P3' },
  // --- United States ---
  'albuquerque':       { street1: '1 Civic Plaza NW',                zip: '87102' },
  'anchorage':         { street1: '632 W 6th Ave',                   zip: '99501' },
  'atlanta':           { street1: '55 Trinity Ave SW',               zip: '30303' },
  'austin':            { street1: '301 W 2nd St',                    zip: '78701' },
  'baltimore':         { street1: '100 N Holliday St',               zip: '21202' },
  'boston':            { street1: '1 City Hall Sq',                  zip: '02201' },
  'brooklyn':          { street1: '209 Joralemon St',                zip: '11201' },
  'charlotte':         { street1: '600 E 4th St',                    zip: '28202' },
  'chicago':           { street1: '121 N LaSalle St',                zip: '60602' },
  'cleveland':         { street1: '601 Lakeside Ave',                zip: '44114' },
  'columbus':          { street1: '90 W Broad St',                   zip: '43215' },
  'dallas':            { street1: '1500 Marilla St',                 zip: '75201' },
  'denver':            { street1: '1437 Bannock St',                 zip: '80202' },
  'detroit':           { street1: '2 Woodward Ave',                  zip: '48226' },
  'el paso':           { street1: '2 Civic Center Plaza',            zip: '79901' },
  'honolulu':          { street1: '530 S King St',                   zip: '96813' },
  'houston':           { street1: '901 Bagby St',                    zip: '77002' },
  'indianapolis':      { street1: '200 E Washington St',             zip: '46204' },
  'jacksonville':      { street1: '117 W Duval St',                  zip: '32202' },
  'kansas city':       { street1: '414 E 12th St',                   zip: '64106' },
  'las vegas':         { street1: '495 S Main St',                   zip: '89101' },
  'los angeles':       { street1: '200 N Spring St',                 zip: '90012' },
  'louisville':        { street1: '527 W Jefferson St',              zip: '40202' },
  'memphis':           { street1: '125 N Main St',                   zip: '38103' },
  'miami':             { street1: '400 NW 2nd Ave',                  zip: '33128' },
  'milwaukee':         { street1: '200 E Wells St',                  zip: '53202' },
  'minneapolis':       { street1: '350 S 5th St',                    zip: '55415' },
  'nashville':         { street1: '1 Public Square',                 zip: '37201' },
  'new orleans':       { street1: '1300 Perdido St',                 zip: '70112' },
  'new york':          { street1: '350 5th Ave',                     zip: '10118' },
  'oklahoma city':     { street1: '200 N Walker Ave',                zip: '73102' },
  'omaha':             { street1: '1819 Farnam St',                  zip: '68183' },
  'philadelphia':      { street1: '1401 John F Kennedy Blvd',        zip: '19102' },
  'phoenix':           { street1: '200 W Washington St',             zip: '85003' },
  'portland':          { street1: '1221 SW 4th Ave',                 zip: '97204' },
  'raleigh':           { street1: '222 W Hargett St',                zip: '27601' },
  'sacramento':        { street1: '915 I St',                        zip: '95814' },
  'salt lake city':    { street1: '451 S State St',                  zip: '84111' },
  'san antonio':       { street1: '100 Military Plaza',              zip: '78205' },
  'san diego':         { street1: '202 C St',                        zip: '92101' },
  'san francisco':     { street1: '1 Dr Carlton B Goodlett Pl',      zip: '94102' },
  'san jose':          { street1: '200 E Santa Clara St',            zip: '95113' },
  'seattle':           { street1: '600 4th Ave',                     zip: '98104' },
  'tucson':            { street1: '255 W Alameda St',                zip: '85701' },
  'virginia beach':    { street1: '2401 Courthouse Dr',              zip: '23456' },
  'washington':        { street1: '1350 Pennsylvania Ave NW',        zip: '20004' },
  // --- Australia ---
  'adelaide':          { street1: '25 Grenfell St',                  zip: '5000' },
  'brisbane':          { street1: '266 George St',                   zip: '4000' },
  'canberra':          { street1: '1 London Circuit',                zip: '2601' },
  'melbourne':         { street1: '90-120 Swanston St',              zip: '3000' },
  'perth':             { street1: '200 St Georges Terrace',          zip: '6000' },
  'sydney':            { street1: '456 Kent St',                     zip: '2000' },
  // --- United Kingdom ---
  'birmingham':        { street1: '1 Victoria Square',               zip: 'B1 1BB' },
  'edinburgh':         { street1: '253 High St',                     zip: 'EH1 1YJ' },
  'glasgow':           { street1: '82 Trongate',                     zip: 'G1 5EZ' },
  'leeds':             { street1: '1 Millennium Square',             zip: 'LS2 3AD' },
  'liverpool':         { street1: '1 Dale St',                       zip: 'L2 2DH' },
  'manchester':        { street1: '1 Albert Square',                 zip: 'M2 5DB' },
  // Note: 'london' key is under GB but conflicts with 'london' ON — the city lookup
  // is only used when we already have a country, so it's safe.
  // --- Japan ---
  'fukuoka':           { street1: '1-8-1 Tenjin, Chuo-ku',          zip: '810-0001' },
  'kyoto':             { street1: '488 Kamimonzen-cho, Higashiyama', zip: '605-0073' },
  'nagoya':            { street1: '3-1-1 Sakae, Naka-ku',            zip: '460-0008' },
  'osaka':             { street1: '1-1-4 Umeda, Kita-ku',            zip: '530-0001' },
  'sapporo':           { street1: '2 Kita 2 Jo Nishi, Chuo-ku',      zip: '060-0002' },
  'tokyo':             { street1: '2-7-1 Marunouchi, Chiyoda-ku',    zip: '100-0005' },
  'yokohama':          { street1: '2-9 Minato Mirai, Nishi-ku',      zip: '220-0012' },
  // --- South Korea ---
  'busan':             { street1: '120 Jungang-daero, Dong-gu',      zip: '48941' },
  'incheon':           { street1: '29 Junghyang-ro, Jung-gu',        zip: '22318' },
  'seoul':             { street1: '110 Sejong-daero, Jung-gu',       zip: '04524' },
  // --- China ---
  'beijing':           { street1: '1 East Chang An Avenue',          zip: '100738' },
  'chengdu':           { street1: '12 Tianfu Square',                zip: '610016' },
  'guangzhou':         { street1: '1 Fuqian Rd, Yuexiu District',    zip: '510030' },
  'shanghai':          { street1: '200 Renmin Dadao',                zip: '200003' },
  'shenzhen':          { street1: '1 Fuzhong 3rd Rd, Futian',        zip: '518048' },
  // --- Thailand ---
  'bangkok':           { street1: '173 Dinso Rd, Phra Nakhon',       zip: '10200' },
  'chiang mai':        { street1: '39 Phra Pokklao Rd',              zip: '50200' },
  'phuket':            { street1: '76 Amphoe Mueang',                zip: '83000' },
  // --- Hong Kong ---
  'hong kong':         { street1: '1 Tim Mei Ave, Tamar',            zip: '' },
  // --- Singapore ---
  'singapore':         { street1: '1 Parliament Place',              zip: '178880' },
};

// ---------------------------------------------------------------------------
// Tier 2: Province / state capital (2-letter code → { city, street1, zip })
// ---------------------------------------------------------------------------
const PROVINCE_STATE_CAPITAL_ADDRESSES = {
  // Canadian provinces and territories
  AB: { city: 'Edmonton',       street1: '1 Sir Winston Churchill Sq',   zip: 'T5J 2R7' },
  BC: { city: 'Victoria',       street1: '1 Centennial Square',          zip: 'V8W 1P6' },
  MB: { city: 'Winnipeg',       street1: '510 Main St',                  zip: 'R3B 1B9' },
  NB: { city: 'Fredericton',    street1: '397 Queen St',                 zip: 'E3B 1B5' },
  NL: { city: 'St. John\'s',    street1: '10 New Gower St',              zip: 'A1C 5M2' },
  NS: { city: 'Halifax',        street1: '1841 Argyle St',               zip: 'B3J 3X4' },
  NT: { city: 'Yellowknife',    street1: '4807 52 St',                   zip: 'X1A 2P3' },
  NU: { city: 'Iqaluit',        street1: '4 Commissioner\'s Rd',         zip: 'X0A 0H0' },
  ON: { city: 'Toronto',        street1: '100 Queen St W',               zip: 'M5H 2N2' },
  PE: { city: 'Charlottetown',  street1: '199 Queen St',                 zip: 'C1A 4B3' },
  QC: { city: 'Quebec City',    street1: '2 Rue des Jardins',            zip: 'G1R 4S9' },
  SK: { city: 'Regina',         street1: '2476 Victoria Ave',            zip: 'S4P 3C7' },
  YT: { city: 'Whitehorse',     street1: '2121 2nd Ave',                 zip: 'Y1A 1C2' },
  // US states, DC, Puerto Rico, Guam
  AL: { city: 'Montgomery',     street1: '103 N Perry St',               zip: '36104' },
  AK: { city: 'Juneau',         street1: '155 S Seward St',              zip: '99801' },
  AZ: { city: 'Phoenix',        street1: '200 W Washington St',          zip: '85003' },
  AR: { city: 'Little Rock',    street1: '500 W Markham St',             zip: '72201' },
  CA: { city: 'Sacramento',     street1: '915 I St',                     zip: '95814' },
  CO: { city: 'Denver',         street1: '1437 Bannock St',              zip: '80202' },
  CT: { city: 'Hartford',       street1: '550 Main St',                  zip: '06103' },
  DC: { city: 'Washington',     street1: '1350 Pennsylvania Ave NW',     zip: '20004' },
  DE: { city: 'Dover',          street1: '15 Loockerman Plaza',          zip: '19901' },
  FL: { city: 'Tallahassee',    street1: '300 S Adams St',               zip: '32301' },
  GA: { city: 'Atlanta',        street1: '55 Trinity Ave SW',            zip: '30303' },
  GU: { city: 'Hagåtña',        street1: '142 Seaton Blvd',              zip: '96910' },
  HI: { city: 'Honolulu',       street1: '530 S King St',                zip: '96813' },
  ID: { city: 'Boise',          street1: '150 N Capitol Blvd',           zip: '83702' },
  IL: { city: 'Springfield',    street1: '300 S 7th St',                 zip: '62701' },
  IN: { city: 'Indianapolis',   street1: '200 E Washington St',          zip: '46204' },
  IA: { city: 'Des Moines',     street1: '400 Robert D Ray Dr',          zip: '50309' },
  KS: { city: 'Topeka',         street1: '215 SE 7th St',                zip: '66603' },
  KY: { city: 'Frankfort',      street1: '321 W Main St',                zip: '40601' },
  LA: { city: 'Baton Rouge',    street1: '222 Saint Louis St',           zip: '70802' },
  ME: { city: 'Augusta',        street1: '16 Cony St',                   zip: '04330' },
  MD: { city: 'Annapolis',      street1: '160 Duke of Gloucester St',    zip: '21401' },
  MA: { city: 'Boston',         street1: '1 City Hall Sq',               zip: '02201' },
  MI: { city: 'Lansing',        street1: '124 W Michigan Ave',           zip: '48933' },
  MN: { city: 'Saint Paul',     street1: '15 W Kellogg Blvd',            zip: '55102' },
  MS: { city: 'Jackson',        street1: '219 S President St',           zip: '39201' },
  MO: { city: 'Jefferson City', street1: '320 E McCarty St',             zip: '65101' },
  MT: { city: 'Helena',         street1: '316 N Park Ave',               zip: '59601' },
  NE: { city: 'Lincoln',        street1: '555 S 10th St',                zip: '68508' },
  NV: { city: 'Carson City',    street1: '201 N Carson St',              zip: '89701' },
  NH: { city: 'Concord',        street1: '41 Green St',                  zip: '03301' },
  NJ: { city: 'Trenton',        street1: '319 E State St',               zip: '08608' },
  NM: { city: 'Santa Fe',       street1: '200 Lincoln Ave',              zip: '87501' },
  NY: { city: 'Albany',         street1: '24 Eagle St',                  zip: '12207' },
  NC: { city: 'Raleigh',        street1: '222 W Hargett St',             zip: '27601' },
  ND: { city: 'Bismarck',       street1: '221 N 5th St',                 zip: '58501' },
  OH: { city: 'Columbus',       street1: '90 W Broad St',                zip: '43215' },
  OK: { city: 'Oklahoma City',  street1: '200 N Walker Ave',             zip: '73102' },
  OR: { city: 'Salem',          street1: '555 Liberty St SE',            zip: '97301' },
  PA: { city: 'Harrisburg',     street1: '10 N 2nd St',                  zip: '17101' },
  PR: { city: 'San Juan',       street1: '153 Calle San Francisco',      zip: '00901' },
  RI: { city: 'Providence',     street1: '25 Dorrance St',               zip: '02903' },
  SC: { city: 'Columbia',       street1: '1737 Main St',                 zip: '29201' },
  SD: { city: 'Pierre',         street1: '222 E Capitol Ave',            zip: '57501' },
  TN: { city: 'Nashville',      street1: '1 Public Square',              zip: '37201' },
  TX: { city: 'Austin',         street1: '301 W 2nd St',                 zip: '78701' },
  UT: { city: 'Salt Lake City', street1: '451 S State St',               zip: '84111' },
  VT: { city: 'Montpelier',     street1: '39 Main St',                   zip: '05602' },
  VA: { city: 'Richmond',       street1: '900 E Broad St',               zip: '23219' },
  WA: { city: 'Olympia',        street1: '601 4th Ave E',                zip: '98501' },
  WV: { city: 'Charleston',     street1: '501 Virginia St E',            zip: '25301' },
  WI: { city: 'Madison',        street1: '210 Martin Luther King Jr Blvd', zip: '53703' },
  WY: { city: 'Cheyenne',       street1: '2101 O\'Neil Ave',             zip: '82001' },
};

// ---------------------------------------------------------------------------
// Tier 3: Country capital (country code → { city, state, street1, zip })
// ---------------------------------------------------------------------------
const COUNTRY_CAPITAL_ADDRESSES = {
  US: { city: 'Chicago',      state: 'IL',  street1: '121 N LaSalle St',             zip: '60602' },
  CA: { city: 'Toronto',      state: 'ON',  street1: '220 Yonge St',                 zip: 'M5B 2H1' },
  JP: { city: 'Tokyo',        state: '',    street1: '2-7-1 Marunouchi, Chiyoda-ku', zip: '100-0005' },
  CN: { city: 'Beijing',      state: '',    street1: '1 East Chang An Avenue',        zip: '100738' },
  KR: { city: 'Seoul',        state: '',    street1: '110 Sejong-daero, Jung-gu',     zip: '04524' },
  TH: { city: 'Bangkok',      state: '',    street1: '173 Dinso Rd, Phra Nakhon',    zip: '10200' },
  AU: { city: 'Sydney',       state: 'NSW', street1: '456 Kent St',                  zip: '2000' },
  GB: { city: 'London',       state: '',    street1: '10 Downing St',                zip: 'SW1A 2AA' },
  HK: { city: 'Hong Kong',    state: '',    street1: '1 Tim Mei Ave, Tamar',         zip: '' },
  SG: { city: 'Singapore',    state: '',    street1: '1 Parliament Place',           zip: '178880' },
  DE: { city: 'Berlin',       state: '',    street1: 'Unter den Linden 77',          zip: '10117' },
  FR: { city: 'Paris',        state: '',    street1: '29 Rue de Rivoli',             zip: '75004' },
  NL: { city: 'Amsterdam',    state: '',    street1: 'Amstel 1',                     zip: '1011 PN' },
  IT: { city: 'Rome',         state: '',    street1: 'Piazza del Campidoglio 1',     zip: '00186' },
  ES: { city: 'Madrid',       state: '',    street1: 'Plaza de la Villa 1',          zip: '28005' },
  MX: { city: 'Mexico City',  state: '',    street1: 'Plaza de la Constitución 1',   zip: '06010' },
  BR: { city: 'Brasilia',     state: '',    street1: 'Praça dos Três Poderes',       zip: '70150-900' },
  IN: { city: 'New Delhi',    state: '',    street1: '1 Rajpath',                    zip: '110001' },
};

// ---------------------------------------------------------------------------
// 4-tier lookup: city → state capital → country capital → empty
// ---------------------------------------------------------------------------
const resolveCityAddress = (city, state, country) => {
  // Tier 1: exact city match
  if (city) {
    const tier1 = CITY_FALLBACK_ADDRESSES[city.toLowerCase()];
    if (tier1) return { city, state, street1: tier1.street1, zip: tier1.zip };
  }
  // Tier 2: province/state capital
  if (state) {
    const tier2 = PROVINCE_STATE_CAPITAL_ADDRESSES[state.toUpperCase()];
    if (tier2) return { city: tier2.city, state, street1: tier2.street1, zip: tier2.zip };
  }
  // Tier 3: country capital
  const tier3 = COUNTRY_CAPITAL_ADDRESSES[country];
  if (tier3) return { city: tier3.city, state: tier3.state || state, street1: tier3.street1, zip: tier3.zip };
  // Tier 4: nothing found
  return { city: city || '', state: state || '', street1: '', zip: '' };
};

module.exports = async (req, res) => {
  try {
    const { addressFrom, addressTo, parcel, fromAddress, weight, weightUnit, length, width, height, distanceUnit } = req.body;

    const resolvedAddressFrom = addressFrom || (fromAddress ? {
      name: fromAddress.name || 'Seller',
      street1: fromAddress.streetAddress,
      street2: fromAddress.streetAddress2 || '',
      city: fromAddress.city,
      state: normalizeState(fromAddress.stateProvince),
      zip: fromAddress.postalCode,
      country: fromAddress.country,
    } : null);

    const resolvedParcel = parcel || (weight ? {
      length: String(length),
      width: String(width),
      height: String(height),
      distance_unit: distanceUnit,
      weight: String(weight),
      mass_unit: weightUnit,
    } : null);

    if (!resolvedAddressFrom || !resolvedParcel) {
      return res.status(400).json({ error: 'Missing required fields: addressFrom/fromAddress, parcel/dimensions' });
    }

    const rawAddressTo = addressTo || {
      name: 'Buyer',
      street1: '',
      city: 'Chicago',
      state: 'IL',
      zip: '60602',
      country: 'US',
    };

    // When street1 is empty, look up a real address for the city so Shippo can validate it
    const needsStreet = !rawAddressTo.street1;
    const cityResolved = needsStreet
      ? resolveCityAddress(rawAddressTo.city, rawAddressTo.state, rawAddressTo.country)
      : { city: rawAddressTo.city, state: rawAddressTo.state, street1: rawAddressTo.street1, zip: rawAddressTo.zip };

    const resolvedAddressTo = {
      ...rawAddressTo,
      street1: cityResolved.street1,
      city: cityResolved.city,
      state: cityResolved.state,
      zip: cityResolved.zip,
    };

    if (!resolvedAddressTo.street1) {
      console.warn(
        'shippo-rates: addressTo.street1 still empty after city resolution —',
        'city:', rawAddressTo.city,
        'state:', rawAddressTo.state,
        'country:', rawAddressTo.country,
        '— add this city to CITY_FALLBACK_ADDRESSES or PROVINCE_STATE_CAPITAL_ADDRESSES'
      );
    }

    const originCountry = resolvedAddressFrom.country;
    const destCountry = resolvedAddressTo.country;
    const isCaToUs = originCountry === 'CA' && destCountry === 'US';
    const isUsToUs = originCountry === 'US' && destCountry === 'US';
    const isCaToCa = originCountry === 'CA' && destCountry === 'CA';
    const isDomestic = originCountry === destCountry;
    const carrierAccounts = CARRIER_ACCOUNTS_BY_COUNTRY[originCountry] || DEFAULT_CARRIERS;

    const shipment = await shippo.shipments.create({
      addressFrom: {
        name: resolvedAddressFrom.name || 'Seller',
        street1: resolvedAddressFrom.street1,
        street2: resolvedAddressFrom.street2 || '',
        city: resolvedAddressFrom.city,
        state: resolvedAddressFrom.state,
        zip: resolvedAddressFrom.zip,
        country: originCountry,
      },
      addressTo: {
        name: resolvedAddressTo.name || 'Buyer',
        street1: resolvedAddressTo.street1,
        street2: resolvedAddressTo.street2 || '',
        city: resolvedAddressTo.city,
        state: resolvedAddressTo.state,
        zip: resolvedAddressTo.zip,
        country: destCountry,
      },
      parcels: [{
        length: String(resolvedParcel.length),
        width: String(resolvedParcel.width),
        height: String(resolvedParcel.height),
        distanceUnit: resolvedParcel.distance_unit || resolvedParcel.distanceUnit,
        weight: String(resolvedParcel.weight),
        massUnit: resolvedParcel.mass_unit || resolvedParcel.massUnit,
      }],
      async: false,
      carrierAccounts,
      ...(!isDomestic ? {
        customsDeclaration: {
          contentsType: 'MERCHANDISE',
          contentsExplanation: 'Collectible toy figure',
          nonDeliveryOption: 'RETURN',
          certify: true,
          certifySigner: 'Seller',
          items: [{
            description: 'Collectible toy figure',
            quantity: 1,
            netWeight: String(resolvedParcel.weight),
            massUnit: resolvedParcel.massUnit || resolvedParcel.mass_unit || 'lb',
            valueAmount: '50',
            valueCurrency: 'USD',
            originCountry,
          }],
        },
      } : {}),
    });

    console.log('Shipment status:', shipment.status);
    console.log('Shipment messages:', JSON.stringify(shipment.messages, null, 2));
    console.log('Rates count:', shipment.rates?.length);
    console.log('Route:', `${originCountry} → ${destCountry}`, '| Carriers:', carrierAccounts.length);

    // ---------------------------------------------------------------------------
    // Route-specific blocklist
    // ---------------------------------------------------------------------------
    const isBlocked = rate => {
      const carrier = rate.provider;
      const service = rate.servicelevel?.name || '';

      // Always block lettermail / untracked services
      if (carrier === 'Canada Post' && service.includes('Lettermail')) return true;
      if (carrier === 'Canada Post' && service.includes('Regular Parcel')) return true;

      // Always block UPS Ground Saver (no reliable ETA)
      if (carrier === 'UPS' && service.includes('Ground Saver')) return true;

      // Block ALL Canada Post on CA→US (tariff/DDU non-compliance)
      if (isCaToUs && carrier === 'Canada Post') return true;

      // Block UPS Ground on international routes only — fine for domestic
      if (!isDomestic && carrier === 'UPS' && service === 'Ground') return true;

      return false;
    };

    const rates = shipment.rates
      .filter(rate => !isBlocked(rate))
      .map(rate => ({
        rateId: rate.objectId,
        carrier: rate.provider,
        service: rate.servicelevel.name,
        amount: rate.amount,
        currency: rate.currency,
        estimatedDays: rate.estimatedDays,
        durationTerms: rate.durationTerms,
      }));

    res.json({ success: true, rates, shipmentId: shipment.objectId });
  } catch (error) {
    console.error('Shippo rates error:', error.message);
    res.status(500).json({ error: 'Failed to fetch shipping rates', details: error.message });
  }
};